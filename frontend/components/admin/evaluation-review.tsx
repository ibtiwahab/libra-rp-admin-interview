'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, CheckCircle2, ChevronDown, Clock, Download, FileText, Gavel, History, ShieldAlert, ShieldCheck, TimerOff, UserRound, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Panel } from '@/components/admin/shell';
import { EventTimeline } from '@/components/admin/timeline';
import { TYPE_META } from '@/components/admin/question-editor';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, KV, Spinner, StatusBadge } from '@/components/ui/data';
import { Input, Textarea } from '@/components/ui/input';
import { useMe } from '@/hooks/use-admin';
import { download, errorMessage } from '@/lib/api';
import type { Decision, EvaluationDetail, EvaluationQuestion } from '@/lib/types';
import { cn, fmtDateTime, fmtDuration, fmtTime, fmtTimer, humanize, pct } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

interface Mark {
  awardedScore: number | null;
  notes: string;
}

const DECISIONS: { value: Decision; label: string; tone: string; icon: React.ReactNode }[] = [
  { value: 'PASSED', label: 'Passed', tone: 'border-ok/50 bg-ok/10 text-[#7FD3B1]', icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: 'FAILED', label: 'Failed', tone: 'border-bad/50 bg-bad/10 text-[#F29790]', icon: <XCircle className="h-4 w-4" /> },
  { value: 'UNDER_REVIEW', label: 'Under review', tone: 'border-violet/50 bg-violet/10 text-[#C3B9FA]', icon: <Clock className="h-4 w-4" /> },
  { value: 'DISQUALIFIED', label: 'Disqualified', tone: 'border-bad/60 bg-bad/15 text-[#F29790]', icon: <ShieldAlert className="h-4 w-4" /> },
];

export function EvaluationReview({ attemptId }: { attemptId: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: qk.evaluation(attemptId), queryFn: () => adminApi.evaluation(attemptId) });
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notes, setNotes] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const m: Record<number, Mark> = {};
    for (const q of data.questions) if (q.reached) m[q.index] = { awardedScore: q.awardedScore, notes: q.evaluatorNotes };
    setMarks(m);
    setDecision(data.attempt.result === 'PENDING' ? null : (data.attempt.result as Decision));
    setNotes('');
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return { total: 0, max: 0, pct: 0, scored: 0, reached: 0 };
    const reached = data.questions.filter((q) => q.reached);
    const total = reached.reduce((s, q) => s + (marks[q.index]?.awardedScore ?? 0), 0);
    const max = data.attempt.scoring.maxScore;
    return { total, max, pct: max ? Math.round((total / max) * 1000) / 10 : 0, scored: reached.filter((q) => marks[q.index]?.awardedScore !== null && marks[q.index]?.awardedScore !== undefined).length, reached: reached.length };
  }, [data, marks]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.saveEvaluation(attemptId, {
        expectedRevision: data!.attempt.evaluationRevision,
        decision,
        overallNotes: notes,
        marks: Object.entries(marks)
          .filter(([, m]) => m.awardedScore !== null && m.awardedScore !== undefined)
          .map(([i, m]) => ({ questionIndex: Number(i), awardedScore: m.awardedScore, notes: m.notes })),
      }),
    onSuccess: (d) => {
      qc.setQueryData(qk.evaluation(attemptId), d);
      qc.invalidateQueries({ queryKey: ['attempts'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['candidates'] });
      toast.success(`Evaluation saved — revision ${d.attempt.evaluationRevision}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if ((e as { code?: string }).code === 'STALE_EVALUATION') qc.invalidateQueries({ queryKey: qk.evaluation(attemptId) });
    },
  });

  if (isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (error || !data) return <EmptyState title="Interview record not found" />;
  const a = data.attempt;
  if (a.status === 'IN_PROGRESS') return <EmptyState title="Interview in progress" description="This attempt can be evaluated once it ends." action={<Button asChild><Link href="/admin/monitor">Open live monitor</Link></Button>} />;

  const passing = a.interview.passingPercent;
  const suggested: Decision = totals.pct >= passing ? 'PASSED' : 'FAILED';
  const overturning = a.status === 'DISQUALIFIED' && decision && decision !== 'DISQUALIFIED';
  const blockedOverturn = overturning && me?.user.role !== 'HEAD_ADMIN';
  const needsAll = decision === 'PASSED' || decision === 'FAILED';
  const canSave = !!decision && !blockedOverturn && (!needsAll || totals.scored === totals.reached) && (!overturning || notes.trim().length >= 10);

  return (
    <>
      <Link href="/admin/evaluations" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-3 transition hover:text-gold">
        <ArrowLeft className="h-4 w-4" /> Reviews
      </Link>

      {/* Header */}
      <div className="panel relative mb-4 overflow-hidden rounded-[16px] p-6">
        <div className="pointer-events-none absolute -left-20 -top-28 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="label-caps !text-gold/90">Interview review</span>
              <Badge tone="gold">{a.referenceCode}</Badge>
              <StatusBadge status={a.status} />
              <StatusBadge status={a.result} />
              {a.evaluationRevision > 0 && <Badge tone="muted">Revision {a.evaluationRevision}</Badge>}
            </div>
            <h1 className="font-display text-[34px] font-semibold leading-none">{a.candidate.fullName}</h1>
            <p className="mt-2 text-[12.5px] text-fg-3">
              <span className="font-mono text-gold-bright">{a.candidate.candidateCode}</span> · @{a.candidate.discordUsername} · {a.candidate.characterName} · {a.interview.title} v{a.interview.version}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/admin/candidates/${a.candidateId}`}>
                <UserRound className="h-4 w-4" /> Profile
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                try {
                  await download(`/exports/attempts/${a.id}/pdf`, undefined, 'interview.pdf');
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setPdfBusy(false);
                }
              }}
            >
              <Download className="h-4 w-4" /> PDF report
            </Button>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-4 xl:grid-cols-8">
          <Sum label="Score" value={`${totals.total} / ${totals.max}`} />
          <Sum label="Percentage" value={pct(totals.pct)} accent={totals.pct >= passing ? 'text-ok' : 'text-bad'} />
          <Sum label="Pass mark" value={`${passing}%`} />
          <Sum label="Answered" value={a.scoring.answeredCount} />
          <Sum label="Unanswered" value={a.scoring.unansweredCount} />
          <Sum label="Timed out" value={a.scoring.timedOutCount} />
          <Sum label="Duration" value={a.endedAt ? fmtDuration((new Date(a.endedAt).getTime() - new Date(a.startedAt).getTime()) / 1000) : '—'} />
          <Sum label="Security" value={a.securityViolation ? 'Violation' : a.warningCount ? `${a.warningCount} warn` : 'Clean'} accent={a.securityViolation ? 'text-bad' : a.warningCount ? 'text-warn' : 'text-ok'} />
        </div>
      </div>

      {a.securityViolation && (
        <div className={cn('mb-4 rounded-[14px] border p-5', a.status === 'DISQUALIFIED' ? 'border-bad/35 bg-[linear-gradient(90deg,rgba(224,93,85,0.12),rgba(224,93,85,0.03))]' : 'border-warn/30 bg-warn/[0.06]')}>
          <div className="flex flex-wrap items-start gap-4">
            <ShieldAlert className={cn('mt-0.5 h-6 w-6', a.status === 'DISQUALIFIED' ? 'text-bad' : 'text-warn')} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[20px] font-bold">{humanize(a.securityViolation.type)}</p>
              <p className="mt-1 text-[13px] text-fg-2">{a.securityViolation.reason}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <KV label="Source">{humanize(a.securityViolation.source)}</KV>
                <KV label="Server time" mono>{fmtTime(a.securityViolation.detectedAt)}</KV>
                <KV label="Client time" mono>{a.securityViolation.clientTimestamp ? fmtTime(a.securityViolation.clientTimestamp) : '—'}</KV>
                <KV label="On question">Q{(a.securityViolation.questionIndex ?? 0) + 1}</KV>
              </dl>
              {a.securityViolation.details && <pre className="mt-3 overflow-x-auto rounded-[8px] bg-black/30 p-3 font-mono text-[11px] text-fg-3">{JSON.stringify(a.securityViolation.details, null, 2)}</pre>}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {data.questions.map((q) => (
            <QuestionReview key={q.index} q={q} mark={marks[q.index]} onMark={(m) => setMarks((prev) => ({ ...prev, [q.index]: { ...(prev[q.index] ?? { awardedScore: null, notes: '' }), ...m } }))} />
          ))}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Panel title="Final evaluation" icon={<Gavel />} bodyClassName="space-y-4 p-5">
            <div className="rounded-[12px] border border-line bg-black/25 p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="label-caps !text-[9.5px]">Calculated score</p>
                  <p className="mt-1 font-display text-[40px] font-semibold leading-none tabular">
                    {totals.total}
                    <span className="text-[18px] text-fg-4"> / {totals.max}</span>
                  </p>
                </div>
                <p className={cn('font-display text-[30px] font-semibold tabular', totals.pct >= passing ? 'text-ok' : 'text-bad')}>{pct(totals.pct)}</p>
              </div>
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={cn('h-full rounded-full', totals.pct >= passing ? 'bg-ok' : 'bg-bad')} style={{ width: `${Math.min(100, totals.pct)}%` }} />
                <span className="absolute inset-y-0 w-0.5 bg-gold" style={{ left: `${passing}%` }} />
              </div>
              <p className="mt-2 text-[11.5px] text-fg-3">
                {totals.scored}/{totals.reached} reached questions scored · threshold {passing}% · suggested <span className="font-bold text-fg-2">{humanize(suggested)}</span>
              </p>
            </div>

            <div>
              <p className="label-caps mb-2">Decision</p>
              <div className="grid grid-cols-2 gap-2">
                {DECISIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDecision(d.value)}
                    className={cn('flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.06em] transition', decision === d.value ? d.tone : 'border-line-2 bg-ink-2 text-fg-3 hover:text-fg-2')}
                  >
                    {d.icon}
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {blockedOverturn && <p className="rounded-[9px] border border-bad/30 bg-bad/[0.07] px-3 py-2 text-[12px] text-[#F29790]">Only a Head Admin can overturn a security disqualification.</p>}
            <div>
              <p className="label-caps mb-2">{overturning ? 'Justification (required)' : 'Overall notes'}</p>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={overturning ? 'Explain the evidence supporting this review…' : 'Summary for management (stored with this revision)'} className="min-h-[90px]" maxLength={4000} />
            </div>
            {needsAll && totals.scored < totals.reached && <p className="text-[11.5px] text-[#F0C47A]">Score every reached question to record a final Passed/Failed decision.</p>}
            <Button variant="primary" size="lg" className="w-full uppercase" disabled={!canSave} loading={save.isPending} onClick={() => save.mutate()}>
              <BadgeCheck className="h-4 w-4" /> {a.evaluationRevision ? 'Save new revision' : 'Save evaluation'}
            </Button>
            {a.evaluatedBy && (
              <p className="text-center text-[11px] text-fg-4">
                Last evaluated by {a.evaluatedBy.fullName} · {fmtDateTime(a.evaluatedAt)}
              </p>
            )}
          </Panel>

          {data.revisions.length > 0 && <RevisionHistory data={data} />}

          <Panel title="Attempt timeline" icon={<History />} bodyClassName="max-h-[520px] overflow-y-auto p-5">
            <EventTimeline events={data.timeline} dense />
            <p className="mt-3 text-[11px] text-fg-4">{data.autosaveEventCount} autosave checkpoints recorded.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Sum({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-[#101217] px-4 py-3">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-fg-4">{label}</p>
      <p className={cn('mt-1 font-display text-[21px] font-semibold leading-none tabular', accent ?? 'text-fg')}>{value}</p>
    </div>
  );
}

function QuestionReview({ q, mark, onMark }: { q: EvaluationQuestion; mark?: Mark; onMark: (m: Partial<Mark>) => void }) {
  const objective = q.question.type === 'MULTIPLE_CHOICE' || q.question.type === 'TRUE_FALSE';
  const statusIcon = q.status === 'SUBMITTED' ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : q.status === 'TIMED_OUT' ? <TimerOff className="h-3.5 w-3.5 text-warn" /> : q.status === 'TERMINATED' ? <ShieldAlert className="h-3.5 w-3.5 text-bad" /> : <Clock className="h-3.5 w-3.5 text-fg-4" />;
  const max = q.question.maxScore;
  return (
    <section className={cn('panel overflow-hidden rounded-[14px]', !q.reached && 'opacity-60')}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-gold/30 bg-gold/[0.08] font-display text-[14px] font-semibold text-gold-bright">{q.index + 1}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-3">{q.question.categoryName}</span>
        <Badge tone="neutral">{TYPE_META[q.question.type].short}</Badge>
        <span className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
          {statusIcon}
          {humanize(q.status)}
          {q.responseMs !== null && ` in ${(q.responseMs / 1000).toFixed(1)}s`} / {fmtTimer(q.allowedSeconds)}
        </span>
        <span className="ml-auto text-[11px] text-fg-4">{q.submittedAt ? `Submitted ${fmtTime(q.submittedAt)}` : q.closedAt ? `Closed ${fmtTime(q.closedAt)}` : ''}</span>
      </header>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <h3 className="whitespace-pre-wrap text-[15px] font-semibold leading-snug text-fg">{q.question.prompt}</h3>
          {q.question.scenario && (
            <div className="mt-3 rounded-[8px] border-l-2 border-gold/50 bg-gold/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-fg-3">
              <span className="mr-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold"><FileText className="h-3 w-3" />Scenario</span>
              {q.question.scenario}
            </div>
          )}
          <p className="label-caps mb-2 mt-4">Candidate answer</p>
          {!q.reached ? (
            <p className="rounded-[10px] border border-dashed border-line-2 px-4 py-3 text-[12.5px] text-fg-4">Not reached — the attempt ended before this question.</p>
          ) : q.question.type === 'MULTIPLE_CHOICE' ? (
            <ul className="space-y-1.5">
              {q.question.options.map((o) => {
                const picked = q.selectedOptionKeys.includes(o.key);
                const correct = q.question.correctOptionKeys.includes(o.key);
                return (
                  <li key={o.key} className={cn('flex items-center gap-2.5 rounded-[9px] border px-3 py-2 text-[12.5px]', picked && correct && 'border-ok/40 bg-ok/[0.07] text-fg', picked && !correct && 'border-bad/40 bg-bad/[0.07] text-fg', !picked && correct && 'border-ok/25 border-dashed text-fg-3', !picked && !correct && 'border-line text-fg-4')}>
                    <span className="font-mono text-[11px] font-bold">{o.key}</span>
                    <span className="flex-1">{o.text}</span>
                    {picked && <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Selected</span>}
                    {correct && <CheckCircle2 className="h-3.5 w-3.5 text-ok" />}
                  </li>
                );
              })}
            </ul>
          ) : q.question.type === 'TRUE_FALSE' ? (
            <p className="text-[14px] font-bold">
              {q.booleanAnswer === null ? <span className="text-fg-4">No answer</span> : q.booleanAnswer ? 'True' : 'False'}
              <span className="ml-3 text-[12px] font-normal text-fg-4">Correct: {q.question.correctBoolean ? 'True' : 'False'}</span>
            </p>
          ) : q.answerText.trim() ? (
            <blockquote className="whitespace-pre-wrap rounded-[10px] border border-line-2 bg-ink-2 px-4 py-3 text-[13.5px] leading-relaxed text-fg">{q.answerText}</blockquote>
          ) : (
            <p className="rounded-[10px] border border-dashed border-line-2 px-4 py-3 text-[12.5px] text-fg-4">No answer provided.</p>
          )}
        </div>

        <div className="space-y-3">
          {q.question.rubric && (
            <div className="rounded-[10px] border border-violet/25 bg-violet/[0.05] p-3.5">
              <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#C3B9FA]">Expected answer / rubric</p>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-2">{q.question.rubric}</p>
            </div>
          )}
          {q.reached && (
            <div className="rounded-[10px] border border-line bg-black/20 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-fg-3">Marks awarded {objective && <span className="text-fg-4">· auto {q.autoScore ?? 0}</span>}</p>
                <span className="text-[11px] text-fg-4">max {max}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={max}
                  step={0.5}
                  value={mark?.awardedScore ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Math.max(0, Math.min(max, Number(e.target.value)));
                    onMark({ awardedScore: v });
                  }}
                  className="h-10 w-[84px] text-center font-display text-[20px] font-semibold tabular"
                  aria-label={`Marks for question ${q.index + 1}`}
                />
                <div className="flex flex-1 gap-1">
                  {[
                    { v: 0, label: max === 1 ? '✗' : '0', tip: 'Wrong', on: 'border-bad/50 bg-bad/10 text-[#F29790]' },
                    { v: max / 2, label: max === 1 ? '½' : String(max / 2), tip: 'Partly correct', on: 'border-warn/50 bg-warn/10 text-[#F0C47A]' },
                    { v: max, label: max === 1 ? '✓' : String(max), tip: 'Correct', on: 'border-ok/50 bg-ok/10 text-[#7FD3B1]' },
                  ].map((b) => (
                    <button key={b.v} title={b.tip} aria-label={b.tip} onClick={() => onMark({ awardedScore: b.v })} className={cn('flex-1 rounded-[7px] border py-2 text-[15px] font-semibold tabular', mark?.awardedScore === b.v ? b.on : 'border-line-2 text-fg-3 hover:text-fg')}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <Input value={mark?.notes ?? ''} onChange={(e) => onMark({ notes: e.target.value })} placeholder="Evaluator notes" className="mt-2 h-9 text-[12.5px]" maxLength={2000} />
              {q.scoredBy && <p className="mt-1.5 text-[10.5px] text-fg-4">Last scored by {q.scoredBy}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RevisionHistory({ data }: { data: EvaluationDetail }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="Evaluation history" description="Immutable — every revision is retained" icon={<ShieldCheck />} bodyClassName="p-2">
      <ul>
        {data.revisions.map((r) => (
          <li key={r.id} className="rounded-[9px] transition hover:bg-white/[0.02]">
            <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className="font-mono text-[12px] font-bold text-gold-bright">R{r.revision}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-fg">
                  {humanize(r.previousDecision)} → {humanize(r.decision)}
                </p>
                <p className="text-[11px] text-fg-4">
                  {r.evaluator} · {fmtDateTime(r.createdAt)}
                </p>
              </div>
              <span className="text-[12px] font-bold tabular">{r.percentage}%</span>
              <ChevronDown className={cn('h-4 w-4 text-fg-4 transition', open === r.id && 'rotate-180')} />
            </button>
              {open === r.id && (
                <div className="overflow-hidden">
                  <div className="space-y-1.5 px-3 pb-3 text-[11.5px] text-fg-3">
                    {r.overallNotes && <p className="whitespace-pre-wrap rounded-[7px] bg-black/25 p-2.5 text-fg-2">{r.overallNotes}</p>}
                    {r.marks.map((m) => (
                      <p key={m.questionIndex}>
                        Q{m.questionIndex + 1}: <span className="font-bold text-fg-2">{m.awardedScore}</span>/{m.maxScore}
                        {m.notes && <span className="text-fg-4"> — {m.notes}</span>}
                      </p>
                    ))}
                    <p className="text-fg-4">
                      Total {r.totalScore}/{r.maxScore}
                    </p>
                  </div>
                </div>
              )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
