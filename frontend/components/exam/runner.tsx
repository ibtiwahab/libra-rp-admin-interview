'use client';

import { ArrowRight, Check, CheckCircle2, CloudOff, Loader2, Lock, Maximize, ShieldAlert, Wifi } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LibraMark } from '@/components/brand/libra-mark';
import { Button } from '@/components/ui/button';
import { useExamGuard, type ViolationDetails } from '@/hooks/use-exam-guard';
import { ApiError } from '@/lib/api';
import { cn, fmtTimer } from '@/lib/utils';
import { examApi, isTerminal, sendExitBeacon, type AnswerPayload, type ClientSignal, type ExamState, type QuestionState, type TerminalState } from '@/services/exam';
import { DigitalTimer } from './countdown';
import { Watermark } from './watermark';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'closed';
export type RunnerExit = { kind: 'terminal'; state: TerminalState } | { kind: 'violation'; state: TerminalState | null } | { kind: 'session-ended' };

interface Draft {
  answerText: string;
  selectedOptionKeys: string[];
  booleanAnswer: boolean | null;
}

const draftFrom = (q: QuestionState): Draft => ({ answerText: q.saved.answerText ?? '', selectedOptionKeys: q.saved.selectedOptionKeys ?? [], booleanAnswer: q.saved.booleanAnswer ?? null });

function payloadFor(q: QuestionState, d: Draft): AnswerPayload {
  if (q.question.type === 'MULTIPLE_CHOICE') return { selectedOptionKeys: d.selectedOptionKeys };
  if (q.question.type === 'TRUE_FALSE') return { booleanAnswer: d.booleanAnswer };
  return { answerText: d.answerText };
}

const MAX_CHARS: Record<string, number> = { SHORT_TEXT: 1000, LONG_TEXT: 5000, SCENARIO: 5000 };

export function ExamRunner({ initial, fullscreenSupported, onExit }: { initial: QuestionState; fullscreenSupported: boolean; onExit: (e: RunnerExit) => void }) {
  const [q, setQ] = useState<QuestionState>(initial);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [remaining, setRemaining] = useState(initial.timing.remainingMs);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<null | 'violation'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connection, setConnection] = useState<'online' | 'unstable'>('online');
  const [armed, setArmed] = useState(false);
  const [fsLost, setFsLost] = useState(false);

  const qRef = useRef(q);
  const draftRef = useRef(draft);
  const seqRef = useRef(initial.saved.saveSeq);
  const ackSeqRef = useRef(initial.saved.saveSeq);
  const anchorRef = useRef({ at: performance.now(), remaining: initial.timing.remainingMs });
  const submittingRef = useRef(false);
  const endedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hbFails = useRef(0);
  const lastWarn = useRef<Record<string, number>>({});
  qRef.current = q;
  draftRef.current = draft;

  const finish = useCallback(
    (e: RunnerExit) => {
      if (endedRef.current) return;
      endedRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      onExit(e);
    },
    [onExit],
  );

  const handleError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          finish({ kind: 'session-ended' });
          return true;
        }
        if (err.status === 410 && err.details && typeof err.details === 'object') {
          const d = err.details as TerminalState;
          finish(d.state === 'DISQUALIFIED' ? { kind: 'violation', state: d } : { kind: 'terminal', state: d });
          return true;
        }
      }
      return false;
    },
    [finish],
  );

  const load = useCallback(
    (s: ExamState) => {
      if (isTerminal(s)) {
        finish(s.state === 'DISQUALIFIED' ? { kind: 'violation', state: s } : { kind: 'terminal', state: s });
        return;
      }
      const changed = s.question.index !== qRef.current.question.index;
      setQ(s);
      anchorRef.current = { at: performance.now(), remaining: s.timing.remainingMs };
      setRemaining(s.timing.remainingMs);
      seqRef.current = Math.max(seqRef.current, s.saved.saveSeq);
      ackSeqRef.current = Math.max(ackSeqRef.current, s.saved.saveSeq);
      if (changed) {
        setDraft(draftFrom(s));
        setSaveState('idle');
      }
    },
    [finish],
  );

  const refresh = useCallback(async () => {
    try {
      load(await examApi.current());
    } catch (err) {
      if (!handleError(err)) setConnection('unstable');
    }
  }, [handleError, load]);

  // ── Autosave ──
  const save = useCallback(async () => {
    if (endedRef.current || submittingRef.current || frozen) return;
    const current = qRef.current;
    const seq = ++seqRef.current;
    setSaveState('saving');
    try {
      const r = await examApi.save(current.question.index, seq, payloadFor(current, draftRef.current));
      if (current.question.index !== qRef.current.question.index) return;
      ackSeqRef.current = Math.max(ackSeqRef.current, r.seq);
      setSaveState(seqRef.current === seq || r.stale ? 'saved' : 'dirty');
      setConnection('online');
    } catch (err) {
      if (handleError(err)) return;
      if (err instanceof ApiError && err.code === 'QUESTION_CLOSED') {
        setSaveState('closed');
        void refresh();
        return;
      }
      setSaveState('offline');
      setConnection('unstable');
      // retry with a fresh (higher) sequence number
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), 2000);
    }
  }, [frozen, handleError, refresh]);

  const edit = (patch: Partial<Draft>) => {
    if (frozen || busy) return;
    setDraft((d) => ({ ...d, ...patch }));
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 650);
  };

  // ── Submission (manual or timer) ──
  const submit = useCallback(
    async (reason: 'MANUAL' | 'TIMEOUT') => {
      if (submittingRef.current || endedRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const current = qRef.current;
      const seq = ++seqRef.current;
      for (let attempt = 0; attempt < 6 && !endedRef.current; attempt++) {
        try {
          const r = await examApi.submit(current.question.index, seq, payloadFor(current, draftRef.current), reason);
          if (r.submission === 'REJECTED_LATE') setNotice('Time expired — your last saved answer was recorded.');
          else if (r.submission === 'ACCEPTED_AT_DEADLINE') setNotice('Time expired — your answer was recorded.');
          else setNotice(null);
          setConnection('online');
          load(r.next);
          break;
        } catch (err) {
          if (handleError(err)) break;
          setConnection('unstable');
          await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
          if (attempt >= 2) {
            // The server will have closed the question; fetch the authoritative state.
            await refresh();
            break;
          }
        }
      }
      submittingRef.current = false;
      setBusy(false);
    },
    [handleError, load, refresh],
  );

  // ── Server-anchored countdown (immune to device clock changes) ──
  useEffect(() => {
    const t = setInterval(() => {
      const r = anchorRef.current.remaining - (performance.now() - anchorRef.current.at);
      setRemaining(r);
      if (r <= 0 && !submittingRef.current && !endedRef.current) void submit('TIMEOUT');
    }, 200);
    return () => clearInterval(t);
  }, [submit]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // ── Heartbeat ──
  useEffect(() => {
    const ms = (initial.heartbeatIntervalSeconds || 5) * 1000;
    const t = setInterval(async () => {
      if (endedRef.current) return;
      try {
        const r = await examApi.heartbeat(qRef.current.question.index);
        hbFails.current = 0;
        setConnection('online');
        if (r.state !== 'IN_PROGRESS') {
          const term = (r as { terminal: TerminalState }).terminal;
          finish(term.state === 'DISQUALIFIED' ? { kind: 'violation', state: term } : { kind: 'terminal', state: term });
          return;
        }
        if (r.currentQuestionIndex !== qRef.current.question.index && !submittingRef.current) {
          void refresh();
        } else if (r.remainingMs !== null) {
          const local = anchorRef.current.remaining - (performance.now() - anchorRef.current.at);
          if (Math.abs(local - r.remainingMs) > 1200) anchorRef.current = { at: performance.now(), remaining: r.remainingMs };
        }
      } catch (err) {
        if (handleError(err)) return;
        hbFails.current += 1;
        if (hbFails.current >= 1) setConnection('unstable');
      }
    }, ms);
    return () => clearInterval(t);
  }, [finish, handleError, initial.heartbeatIntervalSeconds, refresh]);

  // ── Focus / visibility enforcement ──
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 500);
    return () => clearTimeout(t);
  }, []);

  const onViolation = useCallback(
    async (type: ClientSignal, details: ViolationDetails, unloading: boolean) => {
      if (endedRef.current) return;
      setFrozen('violation');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const qi = qRef.current.question.index;
      if (unloading) {
        sendExitBeacon(type, qi, { ...details });
        return;
      }
      let state: TerminalState | null = null;
      for (let i = 0; i < 4; i++) {
        try {
          const r = await examApi.signal(type, qi, { ...details }, true);
          state = r.state && isTerminal(r.state as ExamState) ? (r.state as TerminalState) : null;
          break;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) break;
          await new Promise((res) => setTimeout(res, 600 * (i + 1)));
        }
      }
      finish({ kind: 'violation', state });
    },
    [finish],
  );
  useExamGuard({ armed: armed && !frozen, onViolation });

  // ── Fullscreen (warning-level; leaving fullscreen is logged, not disqualifying) ──
  useEffect(() => {
    if (!fullscreenSupported) return;
    const onFs = () => {
      if (!document.fullscreenElement && !endedRef.current) {
        setFsLost(true);
        void warn('FULLSCREEN_EXITED', 'fullscreenchange');
      } else setFsLost(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreenSupported]);

  const warn = async (type: ClientSignal, trigger: string) => {
    const now = Date.now();
    if ((lastWarn.current[type] ?? 0) > now - 10_000) return;
    lastWarn.current[type] = now;
    try {
      await examApi.signal(type, qRef.current.question.index, { trigger });
    } catch (err) {
      handleError(err);
    }
  };

  const block = (type: ClientSignal) => (e: React.SyntheticEvent) => {
    e.preventDefault();
    void warn(type, e.type);
  };

  const { question, attempt, watermark } = q;
  const isLast = question.index + 1 >= attempt.totalQuestions;
  const max = MAX_CHARS[question.type];
  const canSubmit = !busy && !frozen && remaining > 0;
  const progress = Math.round((question.index / attempt.totalQuestions) * 100);

  return (
    <div
      className="exam-protected relative flex min-h-dvh select-none flex-col bg-ink"
      onCopy={block('CLIPBOARD_BLOCKED')}
      onCut={block('CLIPBOARD_BLOCKED')}
      onContextMenu={block('CONTEXT_MENU_BLOCKED')}
      onDragStart={(e) => e.preventDefault()}
    >
      <Watermark candidateCode={watermark.candidateCode} candidateRef={watermark.candidateRef} referenceCode={watermark.referenceCode} />

      {/* ── Top bar: question number, connection, timer ── */}
      <header className="relative z-40 border-b border-line bg-ink">
        <div className="mx-auto flex h-14 max-w-[900px] items-center gap-4 px-4 sm:px-6">
          <LibraMark className="h-7 w-7" />
          <p className="text-[14px] text-fg-2">
            Question <span className="font-semibold text-fg">{question.index + 1}</span> of {attempt.totalQuestions}
          </p>
          <div className="ml-auto flex items-center gap-3">
            {connection !== 'online' && (
              <span className="flex items-center gap-1.5 text-[12.5px] text-[#F0C47A]">
                <Wifi className="h-3.5 w-3.5" /> Reconnecting…
              </span>
            )}
            <DigitalTimer remainingMs={remaining} />
          </div>
        </div>
        <div className="h-0.5 bg-white/[0.06]" aria-hidden>
          <div className="h-full bg-gold/70" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* ── Question ── */}
      <main className="relative z-10 mx-auto flex w-full max-w-[900px] flex-1 flex-col px-4 py-6 sm:px-6">
        <section key={question.index} className="panel flex flex-1 flex-col rounded-[10px]">
          <div className="border-b border-line px-5 py-5 sm:px-6">
            <p className="text-[12.5px] text-fg-4">
              {question.category} · {fmtTimer(question.timeLimitSeconds)}
            </p>
            <h1 className="mt-1.5 text-[19px] font-semibold leading-snug text-fg">{question.prompt}</h1>
            {question.scenario && <p className="mt-3 whitespace-pre-wrap rounded-[8px] bg-white/[0.03] px-4 py-3 text-[14px] leading-relaxed text-fg-2">{question.scenario}</p>}
          </div>

          <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
            {question.type === 'MULTIPLE_CHOICE' ? (
              <div className="grid gap-2" role={question.allowMultiple ? 'group' : 'radiogroup'}>
                {question.allowMultiple && <p className="text-[13px] text-fg-3">Select all that apply.</p>}
                {question.options.map((o) => {
                  const on = draft.selectedOptionKeys.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role={question.allowMultiple ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      disabled={!!frozen || busy}
                      onClick={() =>
                        edit({
                          selectedOptionKeys: question.allowMultiple ? (on ? draft.selectedOptionKeys.filter((k) => k !== o.key) : [...draft.selectedOptionKeys, o.key]) : [o.key],
                        })
                      }
                      className={cn('flex items-center gap-3 rounded-[8px] border px-4 py-3 text-left text-[14.5px]', on ? 'border-gold/60 bg-gold/[0.08] text-fg' : 'border-line-2 text-fg-2 hover:border-white/15')}
                    >
                      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border font-mono text-[12px] font-semibold', on ? 'border-gold bg-gold text-gold-ink' : 'border-white/15 text-fg-3')}>
                        {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : o.key}
                      </span>
                      {o.text}
                    </button>
                  );
                })}
              </div>
            ) : question.type === 'TRUE_FALSE' ? (
              <div className="grid grid-cols-2 gap-3" role="radiogroup">
                {[true, false].map((b) => {
                  const on = draft.booleanAnswer === b;
                  return (
                    <button
                      key={String(b)}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!!frozen || busy}
                      onClick={() => edit({ booleanAnswer: b })}
                      className={cn('h-14 rounded-[8px] border text-[16px] font-semibold', on ? 'border-gold/60 bg-gold/[0.08] text-gold-bright' : 'border-line-2 text-fg-3 hover:text-fg-2')}
                    >
                      {b ? 'True' : 'False'}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <textarea
                  autoFocus
                  value={draft.answerText}
                  onChange={(e) => edit({ answerText: e.target.value.slice(0, max) })}
                  onPaste={block('CLIPBOARD_BLOCKED')}
                  onDrop={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
                      e.preventDefault();
                      void submit('MANUAL');
                    }
                  }}
                  disabled={!!frozen || busy}
                  spellCheck
                  placeholder="Type your answer here…"
                  aria-label="Your answer"
                  className={cn(
                    'w-full flex-1 resize-none select-text rounded-[8px] border border-line-2 bg-ink-2 px-4 py-3 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-4 focus:border-gold/50',
                    question.type === 'SHORT_TEXT' ? 'min-h-[180px]' : 'min-h-[260px]',
                  )}
                />
                <div className="mt-2 flex justify-between text-[12px] text-fg-4">
                  <span>Pasting is disabled · Ctrl + Enter submits</span>
                  <span className="tabular">
                    {draft.answerText.length.toLocaleString()} / {max?.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          <footer className="flex flex-col-reverse items-stretch gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <SaveIndicator state={saveState} />
            <Button variant="primary" size="lg" className="sm:min-w-[200px]" disabled={!canSubmit} loading={busy} onClick={() => void submit('MANUAL')}>
              {isLast ? 'Submit and finish' : 'Submit answer'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          </footer>
        </section>
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-fg-4">
          <ShieldAlert className="h-3.5 w-3.5" /> Stay in this window until you finish. You cannot go back to earlier questions.
        </p>
      </main>

      {notice && <div className="fixed bottom-6 left-1/2 z-[55] -translate-x-1/2 rounded-[8px] border border-warn/30 bg-[#1A1710] px-4 py-2.5 text-[13px] text-[#F0C47A]">{notice}</div>}

      {fsLost && !frozen && (
        <div className="fixed inset-x-0 top-16 z-[48] flex justify-center px-4 pt-3">
          <div className="flex items-center gap-3 rounded-[8px] border border-warn/35 bg-[#1A1710] px-4 py-2.5">
            <p className="text-[13px] text-[#F0C47A]">You left fullscreen. This was recorded.</p>
            <Button size="sm" variant="outline" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}>
              <Maximize className="h-3.5 w-3.5" /> Go back to fullscreen
            </Button>
          </div>
        </div>
      )}

      {frozen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/90">
          <div className="flex flex-col items-center px-6 text-center">
            <ShieldAlert className="h-8 w-8 text-bad" />
            <p className="mt-3 text-[20px] font-semibold">You left the interview window</p>
            <p className="mt-2 flex items-center gap-2 text-[13.5px] text-fg-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Ending the interview…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: React.ReactNode; text: string; cls: string }> = {
    idle: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: 'Autosave ready', cls: 'text-fg-4' },
    dirty: { icon: <Loader2 className="h-3.5 w-3.5 opacity-50" />, text: 'Unsaved changes', cls: 'text-fg-3' },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Saving…', cls: 'text-fg-3' },
    saved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: 'Answer saved', cls: 'text-[#7FD3B1]' },
    offline: { icon: <CloudOff className="h-3.5 w-3.5" />, text: 'Connection interrupted — retrying', cls: 'text-[#F0C47A]' },
    closed: { icon: <Lock className="h-3.5 w-3.5" />, text: 'Submission closed', cls: 'text-[#F29790]' },
  };
  const s = map[state];
  return (
    <span className={cn('flex items-center gap-2 text-[12px] font-semibold', s.cls)} aria-live="polite">
      {s.icon}
      {s.text}
    </span>
  );
}
