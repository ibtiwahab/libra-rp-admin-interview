'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Eye, Radio, ShieldAlert, ShieldCheck, Square, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/admin/common';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ProgressBar, StatusBadge, TD, TH, THead, TR, Table } from '@/components/ui/data';
import { Tooltip } from '@/components/ui/primitives';
import { useLiveStream, useTick } from '@/hooks/use-live-stream';
import { errorMessage } from '@/lib/api';
import type { LiveInterview, SecurityEventRow } from '@/lib/types';
import { clock, cn, fmtTime, humanize } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

const LIFECYCLE_TEXT: Record<string, string> = {
  LOGIN_SUCCESS: 'Candidate logged in',
  INTERVIEW_STARTED: 'Interview started',
  INTERVIEW_COMPLETED: 'Interview completed',
  INTERVIEW_DISQUALIFIED: 'Candidate disqualified',
  INTERVIEW_EXPIRED: 'Attempt expired',
  TAB_HIDDEN: 'Examination tab hidden',
  WINDOW_BLURRED: 'Window focus lost',
  PAGE_EXIT: 'Left the examination page',
  PAGE_RELOAD_DETECTED: 'Reload / second tab detected',
  SESSION_TIMEOUT: 'Heartbeat lost',
  CONCURRENT_LOGIN_ATTEMPT: 'Concurrent login rejected',
};

function describe(e: SecurityEventRow) {
  if (e.eventType === 'QUESTION_STARTED' && e.questionIndex !== null) return `Question ${e.questionIndex + 1} started`;
  if (e.eventType === 'QUESTION_SUBMITTED' && e.questionIndex !== null) return `Question ${e.questionIndex + 1} submitted`;
  if (e.eventType === 'QUESTION_TIMEOUT' && e.questionIndex !== null) return `Question ${e.questionIndex + 1} timed out`;
  return LIFECYCLE_TEXT[e.eventType] ?? humanize(e.eventType);
}

export function MonitorPage() {
  const qc = useQueryClient();
  const active = useQuery({ queryKey: qk.monitor, queryFn: adminApi.monitorActive, refetchInterval: 4000 });
  const initial = useQuery({ queryKey: qk.monitorEvents, queryFn: adminApi.monitorEvents });
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [terminate, setTerminate] = useState<LiveInterview | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useTick(1000);

  useEffect(() => {
    if (initial.data) setEvents(initial.data.items);
  }, [initial.data]);

  const onEvent = useCallback(
    (e: SecurityEventRow) => {
      setEvents((prev) => (prev.some((p) => p.id === e.id) ? prev : [e, ...prev].slice(0, 250)));
      if (e.attemptId) setFlash((f) => ({ ...f, [e.attemptId!]: Date.now() }));
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: qk.monitor });
        qc.invalidateQueries({ queryKey: qk.overview });
      }, 250);
      if (e.severity === 'CRITICAL' && /DISQUALIFIED|TERMINATED/.test(e.eventType)) toast.error(`${e.candidateName ?? 'Candidate'} disqualified`, { description: e.message });
    },
    [qc],
  );
  const stream = useLiveStream(onEvent);

  const kill = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.terminate(id, reason),
    onSuccess: () => {
      setTerminate(null);
      qc.invalidateQueries({ queryKey: qk.monitor });
      toast.success('Attempt terminated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = active.data?.items ?? [];
  const offset = useMemo(() => (active.data ? new Date(active.data.serverNow).getTime() - Date.now() : 0), [active.data]);
  const counts = { online: items.filter((i) => i.connection === 'ONLINE').length, unstable: items.filter((i) => i.connection === 'UNSTABLE').length, offline: items.filter((i) => i.connection === 'OFFLINE').length, warn: items.filter((i) => i.warningCount > 0).length };

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Live Monitoring"
        description="Every interview in progress, updated in real time from server-side state. Heartbeats, deadlines and violations are enforced by the server."
        actions={
          <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]', stream === 'live' ? 'border-ok/30 bg-ok/10 text-[#7FD3B1]' : 'border-warn/30 bg-warn/10 text-[#F0C47A]')}>
            <span className="relative flex h-2 w-2">
              {stream === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', stream === 'live' ? 'bg-ok' : 'bg-warn')} />
            </span>
            {stream === 'live' ? 'Stream live' : stream === 'connecting' ? 'Connecting' : 'Reconnecting · polling'}
          </span>
        }
      />

      <div className="panel mb-4 grid grid-cols-2 overflow-hidden rounded-[14px] sm:grid-cols-5">
        <Cell label="Active interviews" value={items.length} icon={<Radio />} tone="text-azure" />
        <Cell label="Connected" value={counts.online} icon={<Wifi />} tone="text-ok" />
        <Cell label="Unstable" value={counts.unstable} icon={<Activity />} tone="text-warn" />
        <Cell label="No heartbeat" value={counts.offline} icon={<WifiOff />} tone="text-bad" />
        <Cell label="With warnings" value={counts.warn} icon={<ShieldAlert />} tone="text-warn" />
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Active interviews" icon={<Radio />} bodyClassName="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Candidate</TH>
                <TH>Interview</TH>
                <TH>Progress</TH>
                <TH>Current question</TH>
                <TH>Started</TH>
                <TH>Connection</TH>
                <TH>Security</TH>
                <TH align="right" />
              </tr>
            </THead>
            <tbody>
              {!items.length ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon={<Radio />} title="No interviews in progress" description="When a candidate begins their secure interview it will appear here instantly." />
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const remaining = it.question ? new Date(it.question.deadlineAt).getTime() - (Date.now() + offset) : 0;
                  const flashing = (flash[it.attemptId] ?? 0) > Date.now() - 1500;
                  return (
                    <TR key={it.attemptId} className={cn(flashing && 'bg-gold/[0.04]')}>
                      <TD>
                        <Link href={`/admin/candidates/${it.candidateId}`} className="block">
                          <p className="font-semibold text-fg hover:text-gold-bright">{it.candidate.fullName}</p>
                          <p className="font-mono text-[11px] text-fg-4">
                            {it.candidate.candidateCode} · {it.referenceCode}
                          </p>
                        </Link>
                      </TD>
                      <TD className="max-w-[180px] truncate text-[12.5px]">{it.interviewTitle}</TD>
                      <TD>
                        <p className="mb-1.5 text-[12px] font-bold tabular text-fg">
                          {it.completed}/{it.totalQuestions}
                        </p>
                        <ProgressBar value={it.completed} max={it.totalQuestions} tone="azure" className="w-24" />
                      </TD>
                      <TD>
                        {it.question ? (
                          <div>
                            <p className={cn('font-mono text-[15px] font-semibold tabular', remaining < 10_000 ? 'text-bad' : remaining < 15_000 ? 'text-warn' : 'text-gold-bright')}>{clock(remaining)}</p>
                            <p className="max-w-[180px] truncate text-[11px] text-fg-4">
                              Q{it.currentQuestion} · {it.question.title}
                            </p>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD className="font-mono text-[12px] text-fg-3">{fmtTime(it.startedAt)}</TD>
                      <TD>
                        <Tooltip content={`Last heartbeat ${fmtTime(it.lastHeartbeatAt)}`}>
                          <span>
                            <StatusBadge status={it.connection} />
                          </span>
                        </Tooltip>
                      </TD>
                      <TD>{it.warningCount ? <StatusBadge status="WARNING" label={`${it.warningCount} warning${it.warningCount > 1 ? 's' : ''}`} /> : <StatusBadge status="SECURE" />}</TD>
                      <TD align="right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" asChild aria-label="View candidate">
                            <Link href={`/admin/candidates/${it.candidateId}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button size="icon-sm" variant="danger-ghost" aria-label="Terminate attempt" onClick={() => setTerminate(it)}>
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Live events" description="Server timestamps · newest first" icon={<Activity />} bodyClassName="p-0">
          <div className="max-h-[620px] overflow-y-auto bg-[#0A0B0F] px-4 py-3 font-mono text-[12px]">
              {events.map((e) => (
                <div key={e.id} className="overflow-hidden">
                  <div className="flex gap-3 border-b border-white/[0.03] py-1.5 leading-relaxed">
                    <span className="shrink-0 tabular text-fg-4">{fmtTime(e.serverTimestamp)}</span>
                    <span className={cn('shrink-0', e.severity === 'CRITICAL' ? 'text-bad' : e.severity === 'WARNING' ? 'text-warn' : 'text-gold/70')}>—</span>
                    <span className="min-w-0">
                      <span className={cn(e.severity === 'CRITICAL' ? 'text-[#F29790]' : e.severity === 'WARNING' ? 'text-[#F0C47A]' : 'text-fg-2')}>{describe(e)}</span>
                      {e.candidateName && <span className="text-fg-4"> · {e.candidateName}</span>}
                    </span>
                  </div>
                </div>
              ))}
            {!events.length && <p className="py-10 text-center font-sans text-fg-4">Waiting for activity…</p>}
          </div>
        </Panel>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-line bg-white/[0.015] px-5 py-4 text-[12px] leading-relaxed text-fg-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold/80" />
        <p>
          Browser signals (tab hidden, focus lost, page exit) are reported by the candidate&apos;s browser and confirmed by the server, which then locks the attempt. Abandoned sessions are detected independently when heartbeats stop for {active.data?.heartbeatTimeoutSeconds ?? 25}s. A website cannot observe activity outside the browser such as screen recorders or a second device.
        </p>
      </div>

      <ConfirmDialog
        open={!!terminate}
        onOpenChange={(o) => !o && setTerminate(null)}
        title="Terminate attempt"
        description={`${terminate?.candidate.fullName}'s session is revoked immediately and the attempt is permanently closed as disqualified. Saved answers are preserved.`}
        confirmLabel="Terminate now"
        requireReason
        loading={kill.isPending}
        onConfirm={(reason) => terminate && kill.mutate({ id: terminate.attemptId, reason: reason ?? '' })}
      />
    </>
  );
}

function Cell({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="border-b border-r border-line px-5 py-4 [&_svg]:h-4 [&_svg]:w-4">
      <span className={tone}>{icon}</span>
      <p className="mt-2 font-display text-[32px] font-semibold leading-none tabular">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-3">{label}</p>
    </div>
  );
}
