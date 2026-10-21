'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, ClipboardList, Download, FileSearch, KeyRound, MessageSquarePlus, Pencil, PauseCircle, PlayCircle, ShieldAlert, ShieldCheck, Square, UserRound, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AssignDialog, ROLES } from '@/components/admin/candidate-dialogs';
import { ConfirmDialog, CredentialsDialog } from '@/components/admin/common';
import { Panel } from '@/components/admin/shell';
import { EventTimeline } from '@/components/admin/timeline';
import { Button } from '@/components/ui/button';
import { CopyButton, EmptyState, KV, ProgressBar, Spinner, StatusBadge } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { download, errorMessage } from '@/lib/api';
import type { CandidateProfile, Credentials } from '@/lib/types';
import { fmtDateTime, fmtDuration, fromNow, humanize, initials, pct } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

export function CandidateProfilePage({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: c, isLoading, error } = useQuery({ queryKey: qk.candidate(id), queryFn: () => adminApi.candidate(id), refetchInterval: (q) => (q.state.data?.assignments.some((a) => a.status === 'IN_PROGRESS') ? 5000 : false) });
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'regen' | { cancel: string } | { terminate: string }>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [note, setNote] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.candidate(id) });
    qc.invalidateQueries({ queryKey: ['candidates'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  const run = useMutation({
    mutationFn: async (action: { kind: string; arg?: string; reason?: string }) => {
      switch (action.kind) {
        case 'archive':
          return adminApi.archiveCandidate(id);
        case 'regen':
          return adminApi.regenerateCredentials(id);
        case 'toggle':
          return adminApi.updateCandidate(id, { status: c?.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
        case 'cancel':
          return adminApi.cancelAssignment(action.arg!);
        case 'terminate':
          return adminApi.terminate(action.arg!, action.reason!);
        case 'note':
          return adminApi.addNote(id, { body: action.arg });
      }
    },
    onSuccess: (r, action) => {
      refresh();
      setConfirm(null);
      if (action.kind === 'regen') setCreds((r as { credentials: Credentials }).credentials);
      if (action.kind === 'note') setNote('');
      const msg: Record<string, string> = { archive: 'Candidate archived', toggle: 'Access updated', cancel: 'Assignment cancelled', terminate: 'Attempt terminated', note: 'Note added' };
      if (msg[action.kind]) toast.success(msg[action.kind]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (error || !c) return <EmptyState title="Candidate not found" action={<Button onClick={() => router.push('/admin/candidates')}>Back to candidates</Button>} />;

  const current = c.assignments[0];
  const attempt = current?.attempt;
  const hasOpen = c.assignments.some((a) => a.status === 'NOT_STARTED' || a.status === 'IN_PROGRESS');
  const inProgress = c.assignments.some((a) => a.status === 'IN_PROGRESS');

  return (
    <>
      <Link href="/admin/candidates" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-3 transition hover:text-gold">
        <ArrowLeft className="h-4 w-4" /> Candidates
      </Link>

      {/* ── Identity header ── */}
      <div className="panel relative mb-4 overflow-hidden rounded-[16px] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[16px] border border-gold/30 bg-[linear-gradient(160deg,rgba(201,169,97,0.25),rgba(201,169,97,0.04))] font-display text-[28px] font-semibold text-gold-bright">{initials(c.fullName)}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[34px] font-semibold leading-none">{c.fullName}</h1>
                <StatusBadge status={c.status} />
                {current && <StatusBadge status={current.status} />}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg-3">
                <span className="flex items-center gap-1.5 font-mono text-gold-bright">
                  {c.candidateCode} <CopyButton value={c.candidateCode} className="!h-6 !w-6" />
                </span>
                <span>@{c.discordUsername}</span>
                <span>IC: {c.characterName}</span>
                <span>{c.appliedRole}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.status !== 'ARCHIVED' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)} disabled={hasOpen || c.status !== 'ACTIVE'}>
                  <ClipboardList className="h-4 w-4" /> Assign interview
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirm('regen')} disabled={inProgress}>
                  <KeyRound className="h-4 w-4" /> Replace credentials
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => run.mutate({ kind: 'toggle' })} disabled={inProgress}>
                  {c.status === 'ACTIVE' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                  {c.status === 'ACTIVE' ? 'Disable' : 'Restore'}
                </Button>
                <Button variant="danger-ghost" size="sm" onClick={() => setConfirm('archive')} disabled={inProgress}>
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        {/* ── Left column ── */}
        <div className="space-y-4">
          <Panel title="Candidate information" icon={<UserRound />} bodyClassName="p-5">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              <KV label="Name (OOC)">{c.fullName}</KV>
              <KV label="Candidate ID" mono>{c.candidateCode}</KV>
              <KV label="Discord username">@{c.discordUsername}</KV>
              <KV label="Discord ID" mono>{c.discordId ?? '—'}</KV>
              <KV label="Main IC character">{c.characterName}</KV>
              <KV label="Applying for">{c.appliedRole}</KV>
              <KV label="Account created">{fmtDateTime(c.createdAt)}</KV>
              <KV label="Last sign-in">{c.lastLoginAt ? fromNow(c.lastLoginAt) : 'Never'}</KV>
            </dl>
          </Panel>

          <Panel title="Administrative information" icon={<ShieldCheck />} bodyClassName="p-5">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              <KV label="Account created by">{c.createdBy?.fullName ?? '—'}</KV>
              <KV label="Credentials issued">{fmtDateTime(c.credentialsIssuedAt)}</KV>
              <KV label="Credential version">v{c.credentialVersion}</KV>
              <KV label="Interview assigned by">{current?.assignedBy ?? '—'}</KV>
              <KV label="Evaluated by">{attempt?.evaluatedBy ?? '—'}</KV>
              <KV label="Evaluation date">{fmtDateTime(attempt?.evaluatedAt)}</KV>
            </dl>
          </Panel>

          <Panel title="Evaluation notes" icon={<MessageSquarePlus />} bodyClassName="p-5">
            <div className="space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note for management…" className="min-h-[80px]" maxLength={4000} />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={!note.trim()} loading={run.isPending && run.variables?.kind === 'note'} onClick={() => run.mutate({ kind: 'note', arg: note.trim() })}>
                  Add note
                </Button>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {c.notes.map((n) => (
                <li key={n.id} className="rounded-[10px] border border-line bg-white/[0.015] p-3.5">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{n.body}</p>
                  <p className="mt-2 text-[11px] text-fg-4">
                    {n.author?.fullName ?? 'Unknown'} · {humanize(n.author?.role)} · {fmtDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
              {!c.notes.length && <li className="text-center text-[12px] text-fg-4">No notes yet.</li>}
            </ul>
          </Panel>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {c.assignments.length === 0 && (
            <Panel bodyClassName="p-0">
              <EmptyState
                icon={<ClipboardList />}
                title="No interview assigned"
                description="Assign a published interview so this candidate can begin."
                action={c.status === 'ACTIVE' && <Button variant="primary" onClick={() => setAssignOpen(true)}>Assign interview</Button>}
              />
            </Panel>
          )}
          {c.assignments.map((a, idx) => (
            <AssignmentPanel
              key={a.id}
              a={a}
              primary={idx === 0}
              onCancel={() => setConfirm({ cancel: a.id })}
              onTerminate={() => a.attempt && setConfirm({ terminate: a.attempt.id })}
            />
          ))}

          {attempt && (
            <Panel title="Security information" icon={<ShieldAlert />} bodyClassName="p-5">
              {attempt.securityViolation ? (
                <div className="mb-5 rounded-[12px] border border-bad/30 bg-bad/[0.07] p-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-bad" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#F29790]">{humanize(attempt.securityViolation.type)}</p>
                    <span className="ml-auto text-[11px] text-fg-3">{humanize(attempt.securityViolation.source)}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-fg-2">{attempt.securityViolation.reason}</p>
                  <p className="mt-1.5 text-[11.5px] text-fg-4">
                    Detected {fmtDateTime(attempt.securityViolation.detectedAt)} (server time) on question {(attempt.securityViolation.questionIndex ?? 0) + 1}
                  </p>
                </div>
              ) : (
                <div className="mb-5 flex items-center gap-3 rounded-[12px] border border-ok/25 bg-ok/[0.06] px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-ok" />
                  <p className="text-[13px] text-fg-2">
                    No security violation recorded{attempt.warningCount ? ` · ${attempt.warningCount} warning(s) logged` : ''}.
                  </p>
                </div>
              )}
              <p className="label-caps mb-2">Interview lifecycle</p>
              <div className="max-h-[420px] overflow-y-auto pr-2">
                <EventTimeline events={c.events.filter((e) => e.attemptId === attempt.id)} dense />
              </div>
            </Panel>
          )}

          <Panel title="Sign-in history" icon={<KeyRound />} bodyClassName="p-5">
            <div className="max-h-[260px] overflow-y-auto pr-2">
              <EventTimeline events={c.authEvents} dense />
            </div>
          </Panel>
        </div>
      </div>

      {assignOpen && <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} candidateId={c.id} candidateName={c.fullName} />}
      <EditCandidateDialog open={editOpen} onOpenChange={setEditOpen} candidate={c} />
      <ConfirmDialog open={confirm === 'archive'} onOpenChange={(o) => !o && setConfirm(null)} title="Archive candidate" description="Access is removed immediately and unstarted assignments are cancelled. Interview records are preserved permanently." confirmLabel="Archive" loading={run.isPending} onConfirm={() => run.mutate({ kind: 'archive' })} />
      <ConfirmDialog open={confirm === 'regen'} onOpenChange={(o) => !o && setConfirm(null)} tone="gold" title="Replace credentials" description="A new password is generated and the old one stops working immediately. Active sessions are signed out." confirmLabel="Generate" loading={run.isPending} onConfirm={() => run.mutate({ kind: 'regen' })} />
      <ConfirmDialog
        open={!!confirm && typeof confirm === 'object' && 'cancel' in confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancel assignment"
        description="The candidate will no longer be able to start this interview. This cannot be undone, but you may assign a new interview afterwards."
        confirmLabel="Cancel assignment"
        loading={run.isPending}
        onConfirm={() => confirm && typeof confirm === 'object' && 'cancel' in confirm && run.mutate({ kind: 'cancel', arg: confirm.cancel })}
      />
      <ConfirmDialog
        open={!!confirm && typeof confirm === 'object' && 'terminate' in confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Terminate attempt"
        description="The candidate's session is revoked and the attempt is permanently closed as disqualified. Saved answers are preserved."
        confirmLabel="Terminate"
        requireReason
        loading={run.isPending}
        onConfirm={(reason) => confirm && typeof confirm === 'object' && 'terminate' in confirm && run.mutate({ kind: 'terminate', arg: confirm.terminate, reason })}
      />
      <CredentialsDialog credentials={creds} subject={c.fullName} title="Replacement credentials" onClose={() => setCreds(null)} />
    </>
  );
}

function AssignmentPanel({ a, primary, onCancel, onTerminate }: { a: CandidateProfile['assignments'][number]; primary: boolean; onCancel: () => void; onTerminate: () => void }) {
  const t = a.attempt;
  const [busy, setBusy] = useState(false);
  return (
    <Panel
      title={a.interview?.title ?? 'Interview'}
      description={`${primary ? 'Current' : 'Previous'} assignment · v${a.interview?.version} · assigned ${fmtDateTime(a.assignedAt)}${a.assignedBy ? ` by ${a.assignedBy}` : ''}`}
      icon={<ClipboardList />}
      actions={<StatusBadge status={a.status} />}
      bodyClassName="p-5"
    >
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        <KV label="Questions">{a.interview?.totalQuestions ?? '—'}</KV>
        <KV label="Duration">{a.interview ? fmtDuration(a.interview.totalTimeSeconds) : '—'}</KV>
        <KV label="Started">{fmtDateTime(t?.startedAt)}</KV>
        <KV label="Ended">{fmtDateTime(t?.endedAt)}</KV>
        {t && (
          <>
            <KV label="Answered">{t.scoring.answeredCount}</KV>
            <KV label="Unanswered">{t.scoring.unansweredCount}</KV>
            <KV label="Timed out">{t.scoring.timedOutCount}</KV>
            <KV label="Reference" mono>{t.referenceCode}</KV>
          </>
        )}
        {!t && a.startDeadline && <KV label="Start deadline">{fmtDateTime(a.startDeadline)}</KV>}
      </dl>

      {t && t.status === 'IN_PROGRESS' && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[11.5px] text-fg-3">
            <span>Question {t.currentQuestionIndex + 1} of {t.totalQuestions}</span>
            <span className="flex items-center gap-1.5 text-azure"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-azure" /> Live</span>
          </div>
          <ProgressBar value={t.currentQuestionIndex} max={t.totalQuestions} tone="azure" />
        </div>
      )}

      {t && t.status !== 'IN_PROGRESS' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-line bg-black/20 p-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="label-caps !text-[9.5px]">Overall score</p>
              <p className="mt-1 font-display text-[30px] font-semibold leading-none tabular">
                {t.scoring.totalScore ?? '—'}
                <span className="text-[16px] text-fg-4"> / {t.scoring.maxScore}</span>
              </p>
            </div>
            <div>
              <p className="label-caps !text-[9.5px]">Percentage</p>
              <p className="mt-1 font-display text-[30px] font-semibold leading-none tabular">{pct(t.scoring.percentage)}</p>
            </div>
            <div>
              <p className="label-caps !text-[9.5px]">Result</p>
              <div className="mt-2">
                <StatusBadge status={t.result} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await download(`/exports/attempts/${t.id}/pdf`, undefined, 'interview.pdf');
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download className="h-4 w-4" /> PDF
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href={`/admin/evaluations/${t.id}`}>
                <FileSearch className="h-4 w-4" /> Review answers
              </Link>
            </Button>
          </div>
        </div>
      )}

      {(a.status === 'NOT_STARTED' || a.status === 'IN_PROGRESS') && (
        <div className="mt-4 flex justify-end gap-2">
          {a.status === 'NOT_STARTED' && (
            <Button variant="danger-ghost" size="sm" onClick={onCancel}>
              <XCircle className="h-4 w-4" /> Cancel assignment
            </Button>
          )}
          {a.status === 'IN_PROGRESS' && (
            <Button variant="danger-ghost" size="sm" onClick={onTerminate}>
              <Square className="h-4 w-4" /> Terminate attempt
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

const editSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  discordUsername: z.string().trim().min(2).max(64),
  discordId: z.string().trim().refine((v) => !v || /^\d{15,22}$/.test(v), 'Discord IDs are 15–22 digits'),
  characterName: z.string().trim().min(2).max(80),
  appliedRole: z.enum(ROLES),
});

function EditCandidateDialog({ open, onOpenChange, candidate }: { open: boolean; onOpenChange: (o: boolean) => void; candidate: CandidateProfile }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, control, formState } = useForm<z.infer<typeof editSchema>>({ resolver: zodResolver(editSchema) });
  useEffect(() => {
    if (open) reset({ fullName: candidate.fullName, discordUsername: candidate.discordUsername, discordId: candidate.discordId ?? '', characterName: candidate.characterName, appliedRole: (ROLES as readonly string[]).includes(candidate.appliedRole) ? (candidate.appliedRole as (typeof ROLES)[number]) : 'Admin Assistant' });
  }, [open, candidate, reset]);
  const m = useMutation({
    mutationFn: (v: z.infer<typeof editSchema>) => adminApi.updateCandidate(candidate.id, { ...v, discordId: v.discordId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.candidate(candidate.id) });
      qc.invalidateQueries({ queryKey: ['candidates'] });
      toast.success('Candidate updated');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit candidate"
      description="Changes apply to future records. Completed interviews keep the details captured when they started."
      icon={<Pencil />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={handleSubmit((v) => m.mutate(v))}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name (OOC)" error={formState.errors.fullName?.message}>
          <Input {...register('fullName')} />
        </Field>
        <Field label="Main IC character" error={formState.errors.characterName?.message}>
          <Input {...register('characterName')} />
        </Field>
        <Field label="Discord username" error={formState.errors.discordUsername?.message}>
          <Input {...register('discordUsername')} />
        </Field>
        <Field label="Discord ID" error={formState.errors.discordId?.message}>
          <Input className="font-mono" {...register('discordId')} />
        </Field>
        <Field label="Applying for" className="sm:col-span-2" error={formState.errors.appliedRole?.message}>
          <Controller name="appliedRole" control={control} render={({ field }) => <Select value={field.value} onValueChange={field.onChange} options={ROLES.map((r) => ({ value: r, label: r }))} />} />
        </Field>
      </div>
    </Dialog>
  );
}
