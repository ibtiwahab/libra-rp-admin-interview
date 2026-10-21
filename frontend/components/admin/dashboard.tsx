'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { EmptyState, StatusBadge } from '@/components/ui/data';
import { useOverview } from '@/hooks/use-admin';
import { cn, fmtDateTime, fromNow } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

export function Dashboard() {
  const { data: o } = useOverview(15_000);
  const pendingQuery = { queue: 'pending', limit: 8, page: 1 };
  const pending = useQuery({ queryKey: qk.attempts(pendingQuery), queryFn: () => adminApi.attempts(pendingQuery), refetchInterval: 20_000 });
  const activity = useQuery({ queryKey: qk.analytics('activity'), queryFn: adminApi.activity, refetchInterval: 20_000 });

  const stats: { label: string; value: number | null | undefined; href: string; tone?: string }[] = [
    { label: 'Candidates', value: o?.totalCandidates, href: '/admin/candidates' },
    { label: 'Interviews running now', value: o?.activeInterviews, href: '/admin/monitor', tone: o?.activeInterviews ? 'text-ok' : undefined },
    { label: 'Awaiting review', value: o?.pendingReviews, href: '/admin/evaluations', tone: o?.pendingReviews ? 'text-gold' : undefined },
    { label: 'Passed', value: o?.passedCandidates, href: '/admin/results' },
    { label: 'Failed', value: o?.failedCandidates, href: '/admin/results?result=FAILED' },
    { label: 'Disqualified', value: o?.disqualifiedCandidates, href: '/admin/disqualifications' },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <Button variant="primary" asChild>
            <Link href="/admin/candidates?new=1">
              <UserPlus className="h-4 w-4" /> New candidate
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="panel rounded-[10px] px-4 py-3.5 transition-colors hover:border-white/15">
            <p className={cn('text-[26px] font-semibold leading-none tabular', s.tone ?? 'text-fg')}>{s.value ?? '—'}</p>
            <p className="mt-1.5 text-[12.5px] text-fg-3">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Awaiting review"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/evaluations">
                All <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {pending.data?.items.length ? (
            <ul className="divide-y divide-line">
              {pending.data.items.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-fg">{a.candidate.fullName}</p>
                    <p className="truncate text-[12px] text-fg-3">
                      {a.interview.title} · {fmtDateTime(a.endedAt)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/evaluations/${a.id}`}>Review</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing to review" description="Finished interviews will appear here for scoring." />
          )}
        </Panel>

        <Panel title="Recent activity">
          {activity.data?.items.length ? (
            <ul className="divide-y divide-line">
              {activity.data.items.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      a.tone === 'critical' ? 'bg-bad' : a.tone === 'success' ? 'bg-ok' : a.tone === 'warning' ? 'bg-warn' : 'bg-fg-4',
                    )}
                  />
                  <p className="min-w-0 flex-1 text-[13px] text-fg-2">
                    <span className="font-semibold text-fg">{a.actor}</span> {a.text}
                  </p>
                  <span className="shrink-0 text-[11.5px] text-fg-4">{fromNow(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </Panel>
      </div>
    </>
  );
}
