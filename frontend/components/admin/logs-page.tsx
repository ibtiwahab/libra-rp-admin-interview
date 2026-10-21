'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Lock, ScrollText, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { FilterBar } from '@/components/admin/common';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Badge, EmptyState, Pagination, StatusBadge, TD, TH, THead, TR, Table, TableSkeleton } from '@/components/ui/data';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { cn, fmtDateTime, humanize } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

const EVENT_TYPES = [
  'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_BLOCKED', 'ACCOUNT_LOCKED', 'MFA_FAILED', 'LOGOUT', 'SESSION_REVOKED', 'CONCURRENT_LOGIN_ATTEMPT', 'SESSION_TIMEOUT',
  'INTERVIEW_STARTED', 'QUESTION_STARTED', 'ANSWER_SAVED', 'QUESTION_SUBMITTED', 'QUESTION_TIMEOUT', 'INTERVIEW_COMPLETED', 'INTERVIEW_DISQUALIFIED', 'INTERVIEW_EXPIRED', 'INTERVIEW_TERMINATED_BY_ADMIN',
  'TAB_HIDDEN', 'WINDOW_BLURRED', 'PAGE_EXIT', 'PAGE_RELOAD_DETECTED', 'FULLSCREEN_EXITED', 'CLIPBOARD_BLOCKED', 'CONTEXT_MENU_BLOCKED', 'STALE_SESSION_REQUEST', 'LATE_SUBMISSION_REJECTED',
];
const AUDIT_ACTIONS = [
  'ADMIN_BOOTSTRAPPED', 'CURATOR_CREATED', 'CURATOR_UPDATED', 'CURATOR_DISABLED', 'CURATOR_REACTIVATED', 'CURATOR_REMOVED', 'CURATOR_PASSWORD_RESET', 'ADMIN_PASSWORD_CHANGED', 'ADMIN_MFA_ENABLED', 'ADMIN_MFA_DISABLED',
  'CANDIDATE_CREATED', 'CANDIDATE_UPDATED', 'CANDIDATE_ARCHIVED', 'CANDIDATE_CREDENTIALS_REGENERATED', 'CANDIDATE_NOTE_ADDED', 'INTERVIEW_ASSIGNED', 'ASSIGNMENT_CANCELLED', 'ATTEMPT_TERMINATED',
  'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED', 'QUESTION_CREATED', 'QUESTION_UPDATED', 'QUESTION_DELETED', 'QUESTION_DUPLICATED', 'QUESTIONS_REORDERED',
  'INTERVIEW_CREATED', 'INTERVIEW_UPDATED', 'INTERVIEW_DELETED', 'INTERVIEW_PUBLISHED', 'EVALUATION_SAVED', 'EVALUATION_MODIFIED', 'EXPORT_GENERATED',
];
const SOURCES: Record<string, { label: string; tone: 'azure' | 'gold' | 'violet' | 'neutral' }> = {
  CLIENT_REPORTED: { label: 'Browser-reported', tone: 'azure' },
  SERVER: { label: 'Server-confirmed', tone: 'gold' },
  HEARTBEAT: { label: 'Heartbeat expiry', tone: 'violet' },
  ADMIN: { label: 'Administrative', tone: 'neutral' },
};

const iso = (d: string, end = false) => (d ? new Date(end ? `${d}T23:59:59` : d).toISOString() : undefined);

export function LogsPage() {
  const [tab, setTab] = useState('security');
  return (
    <>
      <PageHeader eyebrow="Management" title="Activity Logs" description="Append-only security events and administrative audit trail. Records cannot be edited or deleted through the application." />
      <div className="mb-4">
        <Tabs
          value={tab}
          onValueChange={setTab}
          layoutId="logs-tab"
          items={[
            { value: 'security', label: <span className="flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Security events</span> },
            { value: 'audit', label: <span className="flex items-center gap-1.5"><ScrollText className="h-3.5 w-3.5" /> Administrative audit</span> },
          ]}
        />
      </div>
      {tab === 'security' ? <SecurityLog /> : <AuditLogView />}
      <p className="mt-4 flex items-center gap-2 text-[11.5px] text-fg-4">
        <Lock className="h-3.5 w-3.5" /> Server timestamps are authoritative. Browser-supplied timestamps are stored as evidence only and never used for enforcement.
      </p>
    </>
  );
}

function SecurityLog() {
  const [eventType, setEventType] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setPage(1), [eventType, severity, source, from, to]);
  const query = { page, limit: 50, eventType: eventType === 'ALL' ? undefined : eventType, severity: severity === 'ALL' ? undefined : severity, source: source === 'ALL' ? undefined : source, from: iso(from), to: iso(to, true) };
  const { data, isLoading } = useQuery({ queryKey: qk.securityLog(query), queryFn: () => adminApi.securityLog(query), placeholderData: keepPreviousData, refetchInterval: 15_000 });

  return (
    <Panel bodyClassName="p-0">
      <FilterBar>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select size="sm" className="sm:w-[230px]" value={eventType} onValueChange={setEventType} options={[{ value: 'ALL', label: 'All event types' }, ...EVENT_TYPES.map((t) => ({ value: t, label: humanize(t) }))]} />
          <Select size="sm" className="sm:w-[140px]" value={severity} onValueChange={setSeverity} options={['ALL', 'INFO', 'WARNING', 'CRITICAL'].map((s) => ({ value: s, label: s === 'ALL' ? 'Any severity' : humanize(s) }))} />
          <Select size="sm" className="sm:w-[170px]" value={source} onValueChange={setSource} options={[{ value: 'ALL', label: 'Any source' }, ...Object.entries(SOURCES).map(([k, v]) => ({ value: k, label: v.label }))]} />
          <div className="col-span-2 flex items-center gap-1.5">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="From date" />
            <span className="text-fg-4">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="To date" />
          </div>
        </div>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <TH className="w-8" />
            <TH>Server time</TH>
            <TH>Event</TH>
            <TH>Severity</TH>
            <TH>Source</TH>
            <TH>Subject</TH>
            <TH>Details</TH>
          </tr>
        </THead>
        <tbody>
          {isLoading ? (
            <TableSkeleton cols={7} />
          ) : !data?.items.length ? (
            <tr>
              <td colSpan={7}>
                <EmptyState icon={<ShieldAlert />} title="No events" description="No security events match these filters." />
              </td>
            </tr>
          ) : (
            data.items.map((e) => (
              <Fragment key={e.id}>
                <TR onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <TD>
                    <ChevronRight className={cn('h-3.5 w-3.5 text-fg-4 transition', open === e.id && 'rotate-90')} />
                  </TD>
                  <TD className="whitespace-nowrap font-mono text-[12px] text-fg-3">{fmtDateTime(e.serverTimestamp)}</TD>
                  <TD className={cn('whitespace-nowrap font-semibold', e.severity === 'CRITICAL' ? 'text-[#F29790]' : e.severity === 'WARNING' ? 'text-[#F0C47A]' : 'text-fg')}>{humanize(e.eventType)}</TD>
                  <TD>
                    <StatusBadge status={e.severity} />
                  </TD>
                  <TD>
                    <Badge tone={SOURCES[e.source]?.tone ?? 'neutral'}>{SOURCES[e.source]?.label ?? e.source}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-[12.5px]">
                    {e.candidate?.fullName ? (
                      <Link href={`/admin/candidates/${e.candidateId}`} onClick={(ev) => ev.stopPropagation()} className="hover:text-gold">
                        {e.candidate.fullName} <span className="font-mono text-[11px] text-fg-4">{e.candidate.candidateCode}</span>
                      </Link>
                    ) : e.subjectType === 'ADMIN' ? (
                      <span className="text-fg-3">Staff account</span>
                    ) : (
                      <span className="text-fg-4">—</span>
                    )}
                  </TD>
                  <TD className="max-w-[360px] truncate text-[12px] text-fg-3">{e.message}</TD>
                </TR>
                {open === e.id && (
                  <tr>
                    <td colSpan={7} className="border-b border-line bg-black/25 px-12 py-4">
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
                        <div><dt className="text-fg-4">Event ID</dt><dd className="font-mono text-fg-2">{e.id}</dd></div>
                        <div><dt className="text-fg-4">Attempt</dt><dd className="font-mono text-fg-2">{e.attemptId ? <Link className="hover:text-gold" href={`/admin/evaluations/${e.attemptId}`}>{e.attemptId}</Link> : '—'}</dd></div>
                        <div><dt className="text-fg-4">Question</dt><dd className="text-fg-2">{e.questionIndex !== null ? `Q${e.questionIndex + 1}` : '—'}</dd></div>
                        <div><dt className="text-fg-4">Client timestamp</dt><dd className="font-mono text-fg-2">{e.clientTimestamp ? fmtDateTime(e.clientTimestamp) : '—'}</dd></div>
                        <div><dt className="text-fg-4">IP</dt><dd className="font-mono text-fg-2">{e.ip ?? '—'}</dd></div>
                      </dl>
                      {e.metadata && <pre className="mt-3 overflow-x-auto rounded-[8px] bg-black/40 p-3 font-mono text-[11px] text-fg-3">{JSON.stringify(e.metadata, null, 2)}</pre>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </Table>
      {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="events" />}
    </Panel>
  );
}

function AuditLogView() {
  const [action, setAction] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setPage(1), [action, from, to]);
  const query = { page, limit: 50, action: action === 'ALL' ? undefined : action, from: iso(from), to: iso(to, true) };
  const { data, isLoading } = useQuery({ queryKey: qk.auditLog(query), queryFn: () => adminApi.auditLog(query), placeholderData: keepPreviousData });

  return (
    <Panel bodyClassName="p-0">
      <FilterBar>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select size="sm" className="sm:w-[260px]" value={action} onValueChange={setAction} options={[{ value: 'ALL', label: 'All actions' }, ...AUDIT_ACTIONS.map((t) => ({ value: t, label: humanize(t) }))]} />
          <div className="col-span-2 flex items-center gap-1.5">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="From date" />
            <span className="text-fg-4">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="To date" />
          </div>
        </div>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <TH className="w-8" />
            <TH>Time</TH>
            <TH>Administrator</TH>
            <TH>Action</TH>
            <TH>Target</TH>
            <TH>IP</TH>
          </tr>
        </THead>
        <tbody>
          {isLoading ? (
            <TableSkeleton cols={6} />
          ) : !data?.items.length ? (
            <tr>
              <td colSpan={6}>
                <EmptyState icon={<ScrollText />} title="No audit entries" description="Administrative actions will be recorded here." />
              </td>
            </tr>
          ) : (
            data.items.map((a) => (
              <Fragment key={a.id}>
                <TR onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <TD>
                    <ChevronRight className={cn('h-3.5 w-3.5 text-fg-4 transition', open === a.id && 'rotate-90')} />
                  </TD>
                  <TD className="whitespace-nowrap font-mono text-[12px] text-fg-3">{fmtDateTime(a.createdAt)}</TD>
                  <TD>
                    <p className="font-semibold text-fg">@{a.actorUsername}</p>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg-4">{humanize(a.actorRole)}</p>
                  </TD>
                  <TD className="whitespace-nowrap font-semibold text-gold-bright/90">{humanize(a.action)}</TD>
                  <TD className="max-w-[360px] truncate text-[12.5px] text-fg-2">
                    {a.targetLabel || '—'} <span className="text-[11px] text-fg-4">{a.targetType}</span>
                  </TD>
                  <TD className="font-mono text-[11.5px] text-fg-4">{a.ip ?? '—'}</TD>
                </TR>
                {open === a.id && (
                  <tr>
                    <td colSpan={6} className="border-b border-line bg-black/25 px-12 py-4">
                      <pre className="overflow-x-auto rounded-[8px] bg-black/40 p-3 font-mono text-[11px] text-fg-3">{JSON.stringify({ id: a.id, targetId: a.targetId, details: a.details }, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </Table>
      {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="entries" />}
    </Panel>
  );
}
