'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Circle, Loader2, LogOut, RefreshCw, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LibraMark } from '@/components/brand/libra-mark';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api';
import { fmtDateTime, fmtDuration } from '@/lib/utils';
import { examApi, type CandidateInfo, type ExamState, type Preflight } from '@/services/exam';

const RULES = [
  'Every question has its own timer. It cannot be paused.',
  'When the timer reaches zero, what you have typed is saved and the next question starts.',
  'You cannot go back to a previous question.',
  'Do not switch browser tabs.',
  'Do not switch to another application or window (Alt+Tab, Discord, the game, etc.).',
  'Leaving the interview window ends your interview immediately (disqualification).',
  'Refreshing or closing the page ends the interview.',
  'You only get one attempt. It cannot be restarted.',
  'Answers save automatically while you type.',
  'Do not stream, screen-share or record the interview (YouTube, Twitch, Discord, OBS, etc.). Turn streams off before you start.',
  'Do not screenshot or share the questions. Your username is shown on every screen, so leaks can be traced back to you.',
];

type CheckState = 'pass' | 'fail' | 'warn' | 'pending';
interface Check {
  id: string;
  label: string;
  detail: string;
  state: CheckState;
  required: boolean;
}

function supportsFullscreen() {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

async function measureLatency(): Promise<number | null> {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (!r.ok) return null;
      samples.push(performance.now() - t);
    } catch {
      return null;
    }
  }
  samples.sort((a, b) => a - b);
  return Math.round(samples[1]!);
}

export function Preparation({ candidate, onStarted }: { candidate: CandidateInfo; onStarted: (s: ExamState) => void }) {
  const router = useRouter();
  const ins = useQuery({ queryKey: ['exam', 'instructions'], queryFn: examApi.instructions, retry: false, refetchOnWindowFocus: false });
  const [visible, setVisible] = useState(true);
  const [focused, setFocused] = useState(true);
  const [latency, setLatency] = useState<number | null | undefined>(undefined);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const runLatency = useCallback(async () => {
    setLatency(undefined);
    setLatency(await measureLatency());
  }, []);

  useEffect(() => {
    void runLatency();
    const sync = () => {
      setVisible(document.visibilityState === 'visible');
      setFocused(document.hasFocus());
    };
    sync();
    const t = setInterval(sync, 700);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [runLatency]);

  const apis = typeof window !== 'undefined' && 'visibilityState' in document && typeof document.hasFocus === 'function' && typeof navigator.sendBeacon === 'function' && !!window.crypto?.getRandomValues && typeof performance?.now === 'function';
  const framed = typeof window !== 'undefined' && window.top !== window.self;
  const cookies = typeof navigator !== 'undefined' && navigator.cookieEnabled;
  const fs = supportsFullscreen();

  const checks: Check[] = [
    { id: 'browser', label: 'Browser supported', detail: !apis ? 'Please use a current Chrome, Edge, Firefox or Safari.' : framed ? 'Open the interview directly, not inside another page.' : !cookies ? 'Cookies must be enabled.' : 'OK', state: apis && !framed && cookies ? 'pass' : 'fail', required: true },
    { id: 'focus', label: 'This window is active', detail: visible && focused ? 'OK' : 'Click anywhere on this page.', state: visible && focused ? 'pass' : 'fail', required: true },
    { id: 'net', label: 'Connection', detail: latency === undefined ? 'Checking…' : latency === null ? 'Cannot reach the server.' : `${latency} ms${latency > 1500 ? ' — slow connection' : ''}`, state: latency === undefined ? 'pending' : latency === null || latency > 3000 ? 'fail' : latency > 1500 ? 'warn' : 'pass', required: true },
    { id: 'attempt', label: 'Attempt available', detail: ins.data ? 'Not used yet' : ins.isError ? 'Unavailable' : 'Checking…', state: ins.data ? 'pass' : ins.isError ? 'fail' : 'pending', required: true },
    { id: 'fs', label: 'Fullscreen', detail: fs ? 'Will open when you start' : 'Not supported — the interview runs in this window', state: fs ? 'pass' : 'warn', required: false },
  ];
  const window_ = ins.data?.window ?? 'OPEN';
  const ready = ack1 && ack2 && checks.every((c) => !c.required || c.state === 'pass' || c.state === 'warn') && window_ === 'OPEN';

  const begin = async () => {
    setStartError(null);
    setStarting(true);
    // Fullscreen must be requested synchronously inside the user gesture.
    let fsPromise: Promise<void> | null = null;
    if (fs && !document.fullscreenElement) {
      try {
        fsPromise = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        fsPromise = null;
      }
    }
    // Some browsers/embedded contexts never settle the fullscreen promise; never block on it.
    const fullscreen = await Promise.race([
      (fsPromise ?? Promise.resolve()).then(
        () => !!document.fullscreenElement,
        () => false,
      ),
      new Promise<boolean>((res) => setTimeout(() => res(!!document.fullscreenElement), 1500)),
    ]);
    const preflight: Preflight = {
      visibilityApi: apis,
      focused: document.hasFocus(),
      fullscreen,
      cookies,
      latencyMs: latency ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
    try {
      const s = await examApi.start(preflight);
      setConfirmOpen(false);
      onStarted(s);
    } catch (err) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setStarting(false);
      if (err instanceof ApiError && err.code === 'ATTEMPT_ALREADY_CONSUMED') {
        router.refresh();
        window.location.reload();
        return;
      }
      setStartError(err instanceof ApiError ? err.message : 'Unable to start the interview. Check your connection.');
    }
  };

  const iv = ins.data?.interview;
  const timers = iv ? (iv.shortestTimerSeconds === iv.longestTimerSeconds ? `${iv.shortestTimerSeconds} seconds` : `${iv.shortestTimerSeconds}–${iv.longestTimerSeconds} seconds`) : '';

  return (
    <main className="min-h-dvh bg-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <LibraMark className="h-7 w-7" />
            <span className="text-[14px] font-semibold text-fg">Libra RP Staff Interview</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-fg-3 sm:block">
              {candidate.fullName} · <span className="font-mono text-[12px]">{candidate.candidateCode}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await examApi.logout().catch(() => undefined);
                router.replace('/login');
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[760px] space-y-5 px-5 py-8">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight">{iv?.title ?? 'Loading your interview…'}</h1>
          {iv && (
            <p className="mt-1.5 text-[14px] text-fg-3">
              {iv.totalQuestions} questions · about {fmtDuration(iv.totalTimeSeconds)} · {timers} per question · 1 attempt
            </p>
          )}
          <p className="mt-3 text-[14px] text-fg-2">
            Hi {candidate.fullName}. The interview has not started yet — read this page first.
          </p>
        </div>

        {ins.isError && <p className="rounded-[8px] border border-bad/30 bg-bad/[0.08] px-4 py-3 text-[13.5px] text-fg-2">{ins.error instanceof ApiError ? ins.error.message : 'Unable to load the interview.'}</p>}

        <section className="rounded-[10px] border border-gold/30 bg-gold/[0.06] px-5 py-4 text-[14px] leading-relaxed text-fg-2">
          <p className="font-semibold text-fg">Answer out of character (OOC)</p>
          <p className="mt-1">Staff work is OOC. Answer as yourself — not as your character — and write your answers in your own words.</p>
          {iv?.instructions && <p className="mt-3 whitespace-pre-wrap text-fg-3">{iv.instructions}</p>}
        </section>

        <section className="panel rounded-[10px] px-5 py-4">
          <h2 className="text-[15px] font-semibold">Rules</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg-2 marker:text-fg-4">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          <p className="mt-4 text-[13px] leading-relaxed text-fg-3">
            <span className="font-semibold text-[#F29790]">Before you start:</span> close other programs and turn on Do Not Disturb. A pop-up that takes focus away from this window counts as leaving the interview. If the connection drops for more than {ins.data?.policy.heartbeatTimeoutSeconds ?? 25} seconds, the interview ends.
          </p>
          {(ins.data?.startDeadline || iv?.availableUntil) && <p className="mt-2 text-[13px] text-fg-3">Start before {fmtDateTime(ins.data?.startDeadline ?? iv?.availableUntil)}.</p>}
        </section>

        <section className="panel rounded-[10px] px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">System check</h2>
            <Button variant="ghost" size="xs" onClick={runLatency}>
              <RefreshCw className="h-3 w-3" /> Re-check
            </Button>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {checks.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-[13.5px]">
                <CheckIcon state={c.state} />
                <span className="flex-1 text-fg">{c.label}</span>
                <span className="text-fg-3">{c.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel space-y-3 rounded-[10px] px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-fg-2">
            <Checkbox checked={ack1} onCheckedChange={setAck1} className="mt-0.5" />I have read and understood the rules, and I am not streaming, screen-sharing or recording.
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-fg-2">
            <Checkbox checked={ack2} onCheckedChange={setAck2} className="mt-0.5" />I understand that leaving the interview window or switching applications ends my only attempt.
          </label>
          {window_ !== 'OPEN' && <p className="text-[13px] text-[#F0C47A]">{window_ === 'NOT_YET_OPEN' ? 'This interview is not open yet.' : 'The time to start this interview has passed.'}</p>}
          <Button variant="primary" size="lg" className="w-full" disabled={!ready} onClick={() => setConfirmOpen(true)}>
            Start interview
          </Button>
          {!ready && <p className="text-center text-[12.5px] text-fg-4">Tick both boxes and make sure the system check passes.</p>}
        </section>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !starting && setConfirmOpen(o)}
        dismissible={!starting}
        tone="danger"
        icon={<AlertTriangle />}
        size="sm"
        title="Start the interview now?"
        description="Your one attempt begins as soon as you press Start. Leaving this window or switching applications will end it."
        footer={
          <>
            <Button variant="ghost" disabled={starting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={starting} onClick={begin}>
              Start
            </Button>
          </>
        }
      >
        {startError && <p className="rounded-[8px] border border-bad/30 bg-bad/[0.08] px-3 py-2.5 text-[13px] text-[#F29790]">{startError}</p>}
      </Dialog>
    </main>
  );
}

function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'pending') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-4" />;
  if (state === 'pass') return <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />;
  if (state === 'warn') return <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />;
  if (state === 'fail') return <XCircle className="h-4 w-4 shrink-0 text-bad" />;
  return <Circle className="h-4 w-4 shrink-0 text-fg-4" />;
}
