'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileDown, FileSearch, Filter, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FilterBar, SearchBox } from '@/components/admin/common';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { EmptyState, Pagination, StatusBadge, TD, TH, THead, TR, Table, TableSkeleton } from '@/components/ui/data';
import { Input } from '@/components/ui/input';
import { Tabs, Tooltip } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { useDebounced } from '@/hooks/use-debounce';
import { api, download, errorMessage } from '@/lib/api';
import type { AttemptSummary } from '@/lib/types';
import { cn, fmtDateTime, fmtDuration, humanize, pct } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

type Queue = 'all' | 'pending' | 'evaluated' | 'disqualified';

export function AttemptsView({
  queue,
  eyebrow,
  title,
  description,
  icon,
  resultTabs,
  emptyTitle,
  emptyDescription,
}: {
  queue: Queue;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  resultTabs?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [templateId, setTemplateId] = useState('ALL');
  const [status, setStatus] = useState(params.get('status') ?? 'ALL');
  const [result, setResult] = useState(params.get('result') ?? 'ALL');
  const [evaluatorId, setEvaluatorId] = useState('ALL');
  const [security, setSecurity] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [debounced, templateId, status, result, evaluatorId, security, from, to, sort]);

  const interviews = useQuery({ queryKey: qk.interviews({ limit: 100 }), queryFn: () => adminApi.interviews({ limit: 100 }), staleTime: 60_000 });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<{ items: { id: string; fullName: string; role: string }[] }>('/staff'), staleTime: 60_000 });

  const query = {
    queue,
    page,
    limit: 20,
    search: debounced || undefined,
    templateId: templateId === 'ALL' ? undefined : templateId,
    status: status === 'ALL' ? undefined : status,
    result: result === 'ALL' ? undefined : result,
    evaluatorId: evaluatorId === 'ALL' ? undefined : evaluatorId,
    security: security === 'ALL' ? undefined : security,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    sort,
  };
  const list = useQuery({ queryKey: qk.attempts(query), queryFn: () => adminApi.attempts(query), placeholderData: keepPreviousData, refetchInterval: 20_000 });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { page: _p, limit: _l, ...rest } = query;
      await download('/exports/attempts', rest, 'libra-rp-interviews.csv');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const data = list.data;
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        icon={icon}
        description={description}
        actions={
          <Button variant="secondary" onClick={exportCsv} loading={exporting}>
            <FileDown className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      {resultTabs && (
        <div className="mb-4">
          <Tabs
            value={result}
            onValueChange={setResult}
            layoutId={`res-${queue}`}
            items={[
              { value: 'ALL', label: 'All results' },
              { value: 'PASSED', label: 'Passed' },
              { value: 'FAILED', label: 'Failed' },
            ]}
          />
        </div>
      )}
      <Panel bodyClassName="p-0">
        <FilterBar>
          <SearchBox value={search} onChange={setSearch} placeholder="Candidate, Discord, reference…" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select size="sm" className="sm:w-[200px]" value={templateId} onValueChange={setTemplateId} options={[{ value: 'ALL', label: 'Any interview' }, ...(interviews.data?.items ?? []).map((i) => ({ value: i.id, label: i.title }))]} />
            {queue === 'all' && (
              <Select size="sm" className="sm:w-[150px]" value={status} onValueChange={setStatus} options={['ALL', 'IN_PROGRESS', 'COMPLETED', 'DISQUALIFIED', 'EXPIRED'].map((s) => ({ value: s, label: s === 'ALL' ? 'Any status' : humanize(s) }))} />
            )}
            {!resultTabs && queue !== 'disqualified' && (
              <Select size="sm" className="sm:w-[140px]" value={result} onValueChange={setResult} options={['ALL', 'PENDING', 'UNDER_REVIEW', 'PASSED', 'FAILED', 'DISQUALIFIED'].map((s) => ({ value: s, label: s === 'ALL' ? 'Any result' : humanize(s) }))} />
            )}
            <Select size="sm" className="sm:w-[170px]" value={evaluatorId} onValueChange={setEvaluatorId} options={[{ value: 'ALL', label: 'Any evaluator' }, ...(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))]} />
            {queue !== 'disqualified' && (
              <Select size="sm" className="sm:w-[150px]" value={security} onValueChange={setSecurity} options={[{ value: 'ALL', label: 'Any security' }, { value: 'CLEAN', label: 'Clean' }, { value: 'WARNINGS', label: 'Warnings only' }, { value: 'VIOLATION', label: 'Violation' }]} />
            )}
            <div className="col-span-2 flex items-center gap-1.5">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="From date" />
              <span className="text-fg-4">–</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="To date" />
            </div>
            <Select size="sm" className="sm:w-[130px]" value={sort} onValueChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'score_desc', label: 'Score ↓' }, { value: 'score_asc', label: 'Score ↑' }]} />
          </div>
        </FilterBar>
        <Table>
          <THead>
            <tr>
              <TH>Reference</TH>
              <TH>Candidate</TH>
              <TH>Interview</TH>
              <TH>Date</TH>
              <TH>Status</TH>
              <TH align="right">Score</TH>
              <TH>Result</TH>
              <TH>Security</TH>
              <TH>Evaluator</TH>
              <TH align="right" />
            </tr>
          </THead>
          <tbody>
            {list.isLoading ? (
              <TableSkeleton cols={10} />
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState icon={<Filter />} title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.items.map((a) => <AttemptRow key={a.id} a={a} onOpen={() => router.push(`/admin/evaluations/${a.id}`)} />)
            )}
          </tbody>
        </Table>
        {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="interview records" />}
      </Panel>
    </>
  );
}

function AttemptRow({ a, onOpen }: { a: AttemptSummary; onOpen: () => void }) {
  const [busy, setBusy] = useState(false);
  const durationS = a.endedAt ? (new Date(a.endedAt).getTime() - new Date(a.startedAt).getTime()) / 1000 : null;
  return (
    <TR onClick={a.status === 'IN_PROGRESS' ? undefined : onOpen}>
      <TD className="whitespace-nowrap font-mono text-[12px] text-gold-bright/90">{a.referenceCode}</TD>
      <TD>
        <p className="whitespace-nowrap font-semibold text-fg">{a.candidate.fullName}</p>
        <p className="whitespace-nowrap text-[11px] text-fg-4">
          <span className="font-mono">{a.candidate.candidateCode}</span> · @{a.candidate.discordUsername}
        </p>
      </TD>
      <TD className="max-w-[200px]">
        <p className="truncate text-[12.5px] text-fg-2">{a.interview.title}</p>
        <p className="text-[11px] text-fg-4">v{a.interview.version}</p>
      </TD>
      <TD className="whitespace-nowrap">
        <p className="text-[12.5px] text-fg-2">{fmtDateTime(a.startedAt)}</p>
        <p className="text-[11px] text-fg-4">{durationS !== null ? fmtDuration(durationS) : 'In progress'}</p>
      </TD>
      <TD>
        <StatusBadge status={a.status} />
      </TD>
      <TD align="right">
        {a.scoring.totalScore !== null ? (
          <div>
            <p className="font-bold tabular text-fg">{pct(a.scoring.percentage)}</p>
            <p className="text-[10.5px] tabular text-fg-4">
              {a.scoring.totalScore}/{a.scoring.maxScore}
            </p>
          </div>
        ) : (
          <span className="text-[11.5px] text-fg-4">{a.scoring.autoScore ? `auto ${a.scoring.autoScore}` : '—'}</span>
        )}
      </TD>
      <TD>
        <StatusBadge status={a.result} />
      </TD>
      <TD>
        {a.securityViolation ? (
          <Tooltip content={a.securityViolation.reason}>
            <span className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-semibold', a.status === 'DISQUALIFIED' ? 'text-[#F29790]' : 'text-[#F0C47A]')}>
              <ShieldAlert className="h-3.5 w-3.5" />
              {humanize(a.securityViolation.type)}
            </span>
          </Tooltip>
        ) : a.warningCount ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#F0C47A]">
            <TriangleAlert className="h-3.5 w-3.5" /> {a.warningCount} warning{a.warningCount > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
            <ShieldCheck className="h-3.5 w-3.5 text-ok/70" /> Clean
          </span>
        )}
      </TD>
      <TD className="whitespace-nowrap text-[12px] text-fg-3">{a.evaluatedBy?.fullName ?? '—'}</TD>
      <TD align="right">
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {a.status !== 'IN_PROGRESS' && (
            <>
              <Tooltip content="Download PDF report">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  loading={busy}
                  aria-label="Download PDF"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await download(`/exports/attempts/${a.id}/pdf`, undefined, 'interview.pdf');
                    } catch (e) {
                      toast.error(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {!busy && <Download className="h-3.5 w-3.5" />}
                </Button>
              </Tooltip>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/evaluations/${a.id}`}>
                  <FileSearch className="h-3.5 w-3.5" /> Review
                </Link>
              </Button>
            </>
          )}
          {a.status === 'IN_PROGRESS' && (
            <Button size="sm" variant="ghost" asChild>
              <Link href="/admin/monitor">Monitor</Link>
            </Button>
          )}
        </div>
      </TD>
    </TR>
  );
}
