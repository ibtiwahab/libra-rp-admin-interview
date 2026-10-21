'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, FileStack, Layers, LayoutList, Plus, Target, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/admin/common';
import { PageHeader } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, StatusBadge } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Switch, Tabs } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import type { Interview } from '@/lib/types';
import { fmtDate, fmtDuration } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

const PRESETS = ['LIBRA RP — ADMIN RECRUITMENT INTERVIEW', 'LIBRA RP — SENIOR ADMIN INTERVIEW', 'LIBRA RP — SUPPORT STAFF INTERVIEW', 'LIBRA RP — MODERATOR PROMOTION INTERVIEW'];

export function InterviewsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState(PRESETS[0]!);
  const [position, setPosition] = useState('Administrator');
  const [del, setDel] = useState<Interview | null>(null);
  const query = { limit: 100, status: filter === 'ALL' ? undefined : filter };
  const { data, isLoading } = useQuery({ queryKey: qk.interviews(query), queryFn: () => adminApi.interviews(query) });

  const create = useMutation({
    mutationFn: () => adminApi.createInterview({ title, position, questions: [] }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['interviews'] });
      router.push(`/admin/interviews/${t.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (t: Interview) => adminApi.updateInterview(t.id, { isActive: !t.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interviews'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteInterview(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interviews'] });
      setDel(null);
      toast.success('Interview archived. Historical attempts are unaffected.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Interviews"
        description="Interview templates combine questions, timers and passing criteria. Publishing freezes an immutable version that candidates are assigned."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New interview
          </Button>
        }
      />
      <div className="mb-5">
        <Tabs
          value={filter}
          onValueChange={setFilter}
          layoutId="interviews-filter"
          items={[
            { value: 'ALL', label: 'All' },
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'DRAFT', label: 'Drafts' },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-[260px] rounded-[16px]" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="panel rounded-[16px]">
          <EmptyState icon={<LayoutList />} title="No interviews yet" description="Create an interview template, add questions from the bank and publish it to start assigning candidates." action={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New interview</Button>} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.items.map((t, i) => (
            <article
              key={t.id}
             
             
             
              className="panel group relative flex flex-col overflow-hidden rounded-[16px] transition hover:border-white/12"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(201,169,97,0.5),transparent)] opacity-0 transition group-hover:opacity-100" />
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={t.status} />
                  {t.publishedVersion > 0 && <Badge tone="muted">v{t.publishedVersion}</Badge>}
                  {t.status === 'PUBLISHED' && t.hasUnpublishedChanges && <Badge tone="warn">Unpublished changes</Badge>}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-fg-4" onClick={(e) => e.stopPropagation()}>
                  {t.isActive ? 'Active' : 'Inactive'}
                  <Switch checked={t.isActive} onCheckedChange={() => toggle.mutate(t)} />
                </div>
              </div>
              <Link href={`/admin/interviews/${t.id}`} className="flex flex-1 flex-col px-5 pb-5 pt-4">
                <h3 className="font-display text-[23px] font-semibold leading-[1.02] text-fg transition group-hover:text-gold-bright">{t.title}</h3>
                <p className="mt-1 text-[12.5px] font-semibold text-fg-3">{t.position}</p>
                {t.description && <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-3">{t.description}</p>}
                <div className="mt-auto grid grid-cols-4 gap-px overflow-hidden rounded-[10px] border border-line bg-line pt-0 [margin-top:1.25rem]">
                  <Mini icon={<Layers />} label="Questions" value={t.totalQuestions} />
                  <Mini icon={<Clock />} label="Duration" value={fmtDuration(t.totalTimeSeconds)} />
                  <Mini icon={<FileStack />} label="Max" value={t.maxScore} />
                  <Mini icon={<Target />} label="Pass" value={`${t.passingPercent}%`} />
                </div>
              </Link>
              <footer className="flex items-center justify-between border-t border-line px-5 py-3 text-[11.5px] text-fg-4">
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {t.assignmentCount ?? 0} assigned
                  </span>
                  <span>· {t.attemptCount ?? 0} attempts</span>
                </span>
                <span className="flex items-center gap-1">
                  <Button size="icon-sm" variant="danger-ghost" aria-label="Archive interview" onClick={() => setDel(t)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/admin/interviews/${t.id}`}>
                      Builder <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </span>
              </footer>
              <p className="sr-only">Updated {fmtDate(t.updatedAt)}</p>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New interview"
        description="Start a draft. You'll add questions, timers and settings in the builder."
        icon={<LayoutList />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={title.trim().length < 3 || position.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>
              Create & open builder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Interview title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setTitle(p)} className="rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-fg-3 transition hover:border-gold/40 hover:text-gold-bright">
                {p.replace('LIBRA RP — ', '')}
              </button>
            ))}
          </div>
          <Field label="Candidate position" required>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Administrator" maxLength={64} />
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Archive interview"
        description="The template is removed from active use and unstarted assignments are cancelled. Completed attempts and their published versions are preserved permanently."
        confirmLabel="Archive"
        loading={remove.isPending}
        onConfirm={() => del && remove.mutate(del.id)}
      />
    </>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[#101217] px-3 py-2.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
      <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-fg-4">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-[19px] font-semibold leading-none tabular text-fg">{value}</p>
    </div>
  );
}
