'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ClipboardList, Eye, KeyRound, MoreHorizontal, PauseCircle, PlayCircle, UserPlus, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AssignDialog, NewCandidateDialog } from '@/components/admin/candidate-dialogs';
import { ConfirmDialog, CredentialsDialog, FilterBar, SearchBox } from '@/components/admin/common';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { EmptyState, Pagination, ProgressBar, StatusBadge, TD, TH, THead, TR, Table, TableSkeleton } from '@/components/ui/data';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { usePublishedInterviews } from '@/hooks/use-admin';
import { useDebounced } from '@/hooks/use-debounce';
import { errorMessage } from '@/lib/api';
import type { CandidateRow, Credentials } from '@/lib/types';
import { fmtDate, initials, pct } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

const INTERVIEW_STATUS = ['ALL', 'NONE', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DISQUALIFIED', 'EXPIRED'];

export function CandidatesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL_ACTIVE');
  const [interviewStatus, setInterviewStatus] = useState('ALL');
  const [result, setResult] = useState('ALL');
  const [templateId, setTemplateId] = useState('ALL');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<CandidateRow | null>(null);
  const [archiveFor, setArchiveFor] = useState<CandidateRow | null>(null);
  const [regenFor, setRegenFor] = useState<CandidateRow | null>(null);
  const [creds, setCreds] = useState<{ c: Credentials; name: string } | null>(null);
  const debounced = useDebounced(search);
  const interviews = usePublishedInterviews();

  useEffect(() => {
    if (params.get('new') === '1') {
      setNewOpen(true);
      router.replace('/admin/candidates');
    }
  }, [params, router]);
  useEffect(() => setPage(1), [debounced, status, interviewStatus, result, templateId, sort]);

  const query = {
    page,
    limit: 20,
    search: debounced || undefined,
    status: status === 'ALL_ACTIVE' ? undefined : status,
    interviewStatus: interviewStatus === 'ALL' ? undefined : interviewStatus,
    result: result === 'ALL' ? undefined : result,
    templateId: templateId === 'ALL' ? undefined : templateId,
    sort,
  };
  const list = useQuery({ queryKey: qk.candidates(query), queryFn: () => adminApi.candidates(query), placeholderData: keepPreviousData });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['candidates'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  const toggle = useMutation({
    mutationFn: (c: CandidateRow) => adminApi.updateCandidate(c.id, { status: c.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: (_d, c) => {
      invalidate();
      toast.success(c.status === 'ACTIVE' ? 'Candidate access disabled' : 'Candidate access restored');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (c: CandidateRow) => adminApi.archiveCandidate(c.id),
    onSuccess: () => {
      invalidate();
      setArchiveFor(null);
      toast.success('Candidate archived — interview history preserved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const regen = useMutation({
    mutationFn: (c: CandidateRow) => adminApi.regenerateCredentials(c.id),
    onSuccess: (r, c) => {
      setRegenFor(null);
      setCreds({ c: r.credentials, name: c.fullName });
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const data = list.data;

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Candidates"
        description="Every applicant, their credentials, assignment and interview outcome. Candidate records are never deleted — archiving removes access while preserving history."
        actions={
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            <UserPlus className="h-4 w-4" /> New candidate
          </Button>
        }
      />

      <Panel bodyClassName="p-0">
        <FilterBar>
          <SearchBox value={search} onChange={setSearch} placeholder="Name, Discord, character, ID…" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select size="sm" className="sm:w-[150px]" value={status} onValueChange={setStatus} options={[{ value: 'ALL_ACTIVE', label: 'Active & disabled' }, { value: 'ACTIVE', label: 'Active' }, { value: 'DISABLED', label: 'Disabled' }, { value: 'ARCHIVED', label: 'Archived' }]} />
            <Select size="sm" className="sm:w-[190px]" value={interviewStatus} onValueChange={setInterviewStatus} options={INTERVIEW_STATUS.map((s) => ({ value: s, label: s === 'ALL' ? 'Any status' : s === 'NONE' ? 'Not assigned' : s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }))} />
            <Select size="sm" className="sm:w-[140px]" value={result} onValueChange={setResult} options={['ALL', 'PENDING', 'UNDER_REVIEW', 'PASSED', 'FAILED', 'DISQUALIFIED'].map((r) => ({ value: r, label: r === 'ALL' ? 'Any result' : r.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }))} />
            <Select size="sm" className="sm:w-[200px]" value={templateId} onValueChange={setTemplateId} options={[{ value: 'ALL', label: 'Any interview' }, ...(interviews.data ?? []).map((i) => ({ value: i.id, label: i.title }))]} />
            <Select size="sm" className="sm:w-[130px]" value={sort} onValueChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'name', label: 'Name A–Z' }, { value: 'score', label: 'Top score' }]} />
          </div>
        </FilterBar>

        <Table>
          <THead>
            <tr>
              <TH>Candidate</TH>
              <TH>Discord</TH>
              <TH>Candidate ID</TH>
              <TH>Assigned interview</TH>
              <TH>Account</TH>
              <TH>Interview status</TH>
              <TH align="right">Score</TH>
              <TH>Created</TH>
              <TH align="right" />
            </tr>
          </THead>
          <tbody>
            {list.isLoading ? (
              <TableSkeleton cols={9} />
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    icon={<Users />}
                    title={debounced || interviewStatus !== 'ALL' || result !== 'ALL' ? 'No matching candidates' : 'No candidates yet'}
                    description={debounced ? 'Try a different search or clear the filters.' : 'Create a candidate to generate their interview credentials.'}
                    action={
                      !debounced && (
                        <Button variant="primary" onClick={() => setNewOpen(true)}>
                          <UserPlus className="h-4 w-4" /> New candidate
                        </Button>
                      )
                    }
                  />
                </td>
              </tr>
            ) : (
              data.items.map((c) => (
                <TR key={c.id} onClick={() => router.push(`/admin/candidates/${c.id}`)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-surface-2 font-display text-[13px] font-semibold text-fg-2">{initials(c.fullName)}</div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-fg">{c.fullName}</p>
                        <p className="truncate text-[11.5px] text-fg-4">IC: {c.characterName}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-fg-2">@{c.discordUsername}</TD>
                  <TD className="whitespace-nowrap font-mono text-[12px] text-gold-bright/90">{c.candidateCode}</TD>
                  <TD className="max-w-[220px]">
                    {c.assignment?.interviewTitle ? (
                      <span className="block truncate text-fg-2">
                        {c.assignment.interviewTitle}
                        <span className="ml-1.5 text-[11px] text-fg-4">v{c.assignment.interviewVersion}</span>
                      </span>
                    ) : (
                      <span className="text-fg-4">Not assigned</span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                  <TD>
                    {c.assignment ? (
                      <div className="space-y-1.5">
                        <StatusBadge status={c.assignment.status} />
                        {c.assignment.status === 'IN_PROGRESS' && c.attempt && <ProgressBar value={c.attempt.progress} max={c.attempt.totalQuestions} tone="azure" className="w-24" />}
                      </div>
                    ) : (
                      <StatusBadge status="NONE" label="—" dot={false} />
                    )}
                  </TD>
                  <TD align="right">
                    {c.attempt?.percentage != null ? (
                      <div>
                        <p className="font-bold tabular text-fg">{pct(c.attempt.percentage)}</p>
                        <p className="text-[10.5px] text-fg-4">{c.attempt.result.replace('_', ' ').toLowerCase()}</p>
                      </div>
                    ) : c.attempt ? (
                      <StatusBadge status={c.attempt.result} />
                    ) : (
                      <span className="text-fg-4">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-fg-3">{fmtDate(c.createdAt)}</TD>
                  <TD align="right">
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label="Candidate actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownContent>
                          <DropdownItem icon={<Eye />} onSelect={() => router.push(`/admin/candidates/${c.id}`)}>
                            View profile
                          </DropdownItem>
                          <DropdownItem icon={<ClipboardList />} disabled={c.status !== 'ACTIVE' || c.assignment?.status === 'NOT_STARTED' || c.assignment?.status === 'IN_PROGRESS'} onSelect={() => setAssignFor(c)}>
                            Assign interview
                          </DropdownItem>
                          <DropdownItem icon={<KeyRound />} disabled={c.status === 'ARCHIVED' || c.assignment?.status === 'IN_PROGRESS'} onSelect={() => setRegenFor(c)}>
                            Replace credentials
                          </DropdownItem>
                          {c.status !== 'ARCHIVED' && (
                            <DropdownItem icon={c.status === 'ACTIVE' ? <PauseCircle /> : <PlayCircle />} disabled={c.assignment?.status === 'IN_PROGRESS'} onSelect={() => toggle.mutate(c)}>
                              {c.status === 'ACTIVE' ? 'Disable access' : 'Restore access'}
                            </DropdownItem>
                          )}
                          {c.status !== 'ARCHIVED' && (
                            <>
                              <DropdownSeparator />
                              <DropdownItem icon={<Archive />} danger disabled={c.assignment?.status === 'IN_PROGRESS'} onSelect={() => setArchiveFor(c)}>
                                Archive candidate
                              </DropdownItem>
                            </>
                          )}
                        </DropdownContent>
                      </DropdownMenu>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="candidates" />}
      </Panel>

      <NewCandidateDialog open={newOpen} onOpenChange={setNewOpen} />
      {assignFor && <AssignDialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)} candidateId={assignFor.id} candidateName={assignFor.fullName} />}
      <ConfirmDialog
        open={!!archiveFor}
        onOpenChange={(o) => !o && setArchiveFor(null)}
        title="Archive candidate"
        description={`${archiveFor?.fullName} will lose access immediately and any unstarted assignment is cancelled. Their interview records remain available permanently.`}
        confirmLabel="Archive"
        loading={archive.isPending}
        onConfirm={() => archiveFor && archive.mutate(archiveFor)}
      />
      <ConfirmDialog
        open={!!regenFor}
        onOpenChange={(o) => !o && setRegenFor(null)}
        title="Replace credentials"
        tone="gold"
        description={`A new password will be generated for ${regenFor?.candidateCode}. The previous password stops working and active sessions are signed out.`}
        confirmLabel="Generate new password"
        loading={regen.isPending}
        onConfirm={() => regenFor && regen.mutate(regenFor)}
      />
      <CredentialsDialog credentials={creds?.c ?? null} subject={creds?.name} title="Replacement credentials" onClose={() => setCreds(null)} />
    </>
  );
}
