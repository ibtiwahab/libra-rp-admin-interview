'use client';

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, CalendarRange, Check, Clock, Eye, FileStack, GripVertical, Layers, ListChecks, Plus, Rocket, Save, Settings2, Target, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/admin/common';
import { DifficultyBadge, TimerPill, toPreview } from '@/components/admin/question-bank';
import { TYPE_META } from '@/components/admin/question-editor';
import { QuestionCard, QuestionPreviewDialog, type PreviewQuestion } from '@/components/admin/question-preview';
import { Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Spinner, StatusBadge } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/hooks/use-admin';
import { errorMessage } from '@/lib/api';
import type { Interview, Question } from '@/lib/types';
import { cn, fmtDateTime, fmtDuration } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

interface Entry {
  questionId: string;
  timeLimitSeconds: number | null;
}
interface Draft {
  title: string;
  description: string;
  position: string;
  instructions: string;
  passingPercent: number;
  isActive: boolean;
  availableFrom: string;
  availableUntil: string;
  questions: Entry[];
}

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function draftFrom(t: Interview): Draft {
  return {
    title: t.title,
    description: t.description,
    position: t.position,
    instructions: t.instructions,
    passingPercent: t.passingPercent,
    isActive: t.isActive,
    availableFrom: toLocal(t.availableFrom),
    availableUntil: toLocal(t.availableUntil),
    questions: (t.questions ?? []).map((q) => ({ questionId: q.questionId, timeLimitSeconds: q.timeLimitOverride })),
  };
}

export function InterviewBuilder({ id }: { id: string }) {
  const qc = useQueryClient();
  const tpl = useQuery({ queryKey: qk.interview(id), queryFn: () => adminApi.interview(id) });
  const bank = useQuery({ queryKey: qk.questions({ all: 'true' }), queryFn: () => adminApi.questions({ all: 'true' }) });
  const categories = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bankSearch, setBankSearch] = useState('');
  const [bankCat, setBankCat] = useState('ALL');
  const [preview, setPreview] = useState<PreviewQuestion | null>(null);
  const [fullPreview, setFullPreview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    if (tpl.data && !draft) setDraft(draftFrom(tpl.data));
  }, [tpl.data, draft]);

  const byId = useMemo(() => new Map((bank.data?.items ?? []).map((q) => [q.id, q])), [bank.data]);
  const original = useMemo(() => (tpl.data ? JSON.stringify(draftFrom(tpl.data)) : ''), [tpl.data]);
  const dirty = !!draft && JSON.stringify(draft) !== original;

  const selected = (draft?.questions ?? []).map((e) => ({ e, q: byId.get(e.questionId) })).filter((x): x is { e: Entry; q: Question } => !!x.q);
  const totals = useMemo(() => {
    const time = selected.reduce((s, x) => s + (x.e.timeLimitSeconds ?? x.q.timeLimitSeconds), 0);
    const max = selected.reduce((s, x) => s + x.q.maxScore, 0);
    return { count: selected.length, time, max, passMarks: Math.ceil((max * (draft?.passingPercent ?? 0)) / 100) };
  }, [selected, draft?.passingPercent]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const inDraft = new Set(draft?.questions.map((q) => q.questionId));
  const available = (bank.data?.items ?? []).filter((q) => (bankCat === 'ALL' || q.category.id === bankCat) && (!bankSearch || `${q.title} ${q.prompt}`.toLowerCase().includes(bankSearch.toLowerCase())));

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.updateInterview(id, {
        title: draft!.title,
        description: draft!.description,
        position: draft!.position,
        instructions: draft!.instructions,
        passingPercent: draft!.passingPercent,
        isActive: draft!.isActive,
        availableFrom: fromLocal(draft!.availableFrom),
        availableUntil: fromLocal(draft!.availableUntil),
        questions: draft!.questions,
      }),
    onSuccess: (t) => {
      qc.setQueryData(qk.interview(id), t);
      setDraft(draftFrom(t));
      qc.invalidateQueries({ queryKey: ['interviews'] });
    },
  });
  const publishMut = useMutation({
    mutationFn: async () => {
      if (dirty) await saveMut.mutateAsync();
      return adminApi.publishInterview(id);
    },
    onSuccess: (t) => {
      qc.setQueryData(qk.interview(id), t);
      setDraft(draftFrom(t));
      qc.invalidateQueries({ queryKey: ['interviews'] });
      setPublishOpen(false);
      toast.success(`Published version ${t.published.version} — ready for assignment`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!draft || !e.over || e.active.id === e.over.id) return;
    const from = draft.questions.findIndex((q) => q.questionId === e.active.id);
    const to = draft.questions.findIndex((q) => q.questionId === e.over!.id);
    set('questions', arrayMove(draft.questions, from, to));
  };

  if (tpl.isLoading || !draft) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (tpl.error || !tpl.data) return <EmptyState title="Interview not found" />;
  const t = tpl.data;

  return (
    <>
      <Link href="/admin/interviews" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-3 transition hover:text-gold">
        <ArrowLeft className="h-4 w-4" /> Interviews
      </Link>

      {/* Sticky builder header */}
      <div className="sticky top-14 z-30 -mx-4 mb-5 border-b border-line bg-ink/80 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="label-caps !text-gold/90">Interview builder</span>
              <StatusBadge status={t.status} />
              {t.publishedVersion > 0 && <Badge tone="muted">Published v{t.publishedVersion}</Badge>}
              {dirty ? <Badge tone="warn">Unsaved edits</Badge> : t.hasUnpublishedChanges && t.publishedVersion > 0 ? <Badge tone="warn">Draft differs from published</Badge> : null}
            </div>
            <h1 className="truncate font-display text-[28px] font-semibold leading-none">{draft.title || 'Untitled interview'}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setFullPreview(true)} disabled={!selected.length}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button variant="secondary" disabled={!dirty} loading={saveMut.isPending} onClick={() => saveMut.mutate(undefined, { onSuccess: () => toast.success('Draft saved'), onError: (e) => toast.error(errorMessage(e)) })}>
              <Save className="h-4 w-4" /> Save draft
            </Button>
            <Button variant="primary" disabled={!selected.length || (!dirty && !t.hasUnpublishedChanges)} onClick={() => setPublishOpen(true)}>
              <Rocket className="h-4 w-4" /> Publish
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_290px] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* ── Left: question bank ── */}
        <Panel title="Question bank" description={`${bank.data?.total ?? 0} questions`} icon={<BookOpenCheck />} bodyClassName="flex max-h-[calc(100dvh-230px)] flex-col">
          <div className="space-y-2 border-b border-line p-3">
            <Input value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} placeholder="Search bank…" className="h-9" />
            <Select size="sm" value={bankCat} onValueChange={setBankCat} options={[{ value: 'ALL', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {available.map((q) => {
              const added = inDraft.has(q.id);
              return (
                <li key={q.id} className={cn('group flex items-start gap-2 rounded-[9px] px-2.5 py-2.5 transition', added ? 'opacity-45' : 'hover:bg-white/[0.03]')}>
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setPreview(toPreview(q))}>
                    <p className="truncate text-[12.5px] font-semibold text-fg">{q.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-fg-4">
                      <span>{q.category.name}</span>·<span>{TYPE_META[q.type].short}</span>·<span className="tabular">{q.timeLimitSeconds}s</span>·<span>{q.maxScore} pts</span>
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant={added ? 'ghost' : 'outline'}
                    disabled={added}
                    aria-label={added ? 'Already added' : `Add ${q.title}`}
                    onClick={() => set('questions', [...draft.questions, { questionId: q.id, timeLimitSeconds: null }])}
                  >
                    {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              );
            })}
            {!available.length && <li className="py-10 text-center text-[12px] text-fg-4">No questions match.</li>}
          </ul>
        </Panel>

        {/* ── Center: selected sequence ── */}
        <Panel title="Interview sequence" description="Drag to reorder · candidates receive questions in this order" icon={<ListChecks />} bodyClassName="p-3">
          {selected.length ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={draft.questions.map((q) => q.questionId)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2">
                    {selected.map(({ e, q }, i) => (
                      <SequenceItem
                        key={q.id}
                        index={i}
                        entry={e}
                        q={q}
                        onPreview={() => setPreview(toPreview(q))}
                        onRemove={() => set('questions', draft.questions.filter((x) => x.questionId !== q.id))}
                        onTimer={(v) => set('questions', draft.questions.map((x) => (x.questionId === q.id ? { ...x, timeLimitSeconds: v } : x)))}
                      />
                    ))}
                </ol>
              </SortableContext>
            </DndContext>
          ) : (
            <EmptyState icon={<Layers />} title="No questions selected" description="Add questions from the bank on the left. Each keeps its own strict timer (30–60s), which you may override here." />
          )}
        </Panel>

        {/* ── Right: settings & summary ── */}
        <div className="space-y-4">
          <Panel title="Summary" icon={<Target />} bodyClassName="p-0">
            <div className="grid grid-cols-2 gap-px bg-line">
              <SumCell icon={<Layers />} label="Total questions" value={totals.count} />
              <SumCell icon={<Clock />} label="Total time" value={fmtDuration(totals.time)} />
              <SumCell icon={<FileStack />} label="Maximum score" value={totals.max} />
              <SumCell icon={<Target />} label="Passing threshold" value={`${totals.passMarks} pts`} sub={`${draft.passingPercent}%`} />
            </div>
          </Panel>

          <Panel title="Settings" icon={<Settings2 />} bodyClassName="space-y-4 p-5">
            <Field label="Interview title" required>
              <Input value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
            </Field>
            <Field label="Candidate position" required>
              <Input value={draft.position} onChange={(e) => set('position', e.target.value)} maxLength={64} />
            </Field>
            <Field label="Description">
              <Textarea value={draft.description} onChange={(e) => set('description', e.target.value)} className="min-h-[70px]" maxLength={2000} />
            </Field>
            <Field label="Candidate instructions" hint="Shown on the preparation screen before the attempt starts.">
              <Textarea value={draft.instructions} onChange={(e) => set('instructions', e.target.value)} className="min-h-[110px]" maxLength={6000} />
            </Field>
            <Field label={`Passing score — ${draft.passingPercent}%`}>
              <input type="range" min={0} max={100} step={5} value={draft.passingPercent} onChange={(e) => set('passingPercent', Number(e.target.value))} className="w-full accent-[#C9A961]" aria-label="Passing percentage" />
            </Field>
            <div className="flex items-center justify-between rounded-[10px] border border-line px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-fg">Active</p>
                <p className="text-[11px] text-fg-4">Inactive interviews cannot be assigned.</p>
              </div>
              <Switch checked={draft.isActive} onCheckedChange={(v) => set('isActive', v)} />
            </div>
            <div className="rounded-[10px] border border-line p-3.5">
              <p className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-fg-2">
                <CalendarRange className="h-4 w-4 text-gold" /> Availability window
              </p>
              <div className="grid gap-2.5">
                <Field label="Opens">
                  <Input type="datetime-local" value={draft.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} className="h-9" />
                </Field>
                <Field label="Closes">
                  <Input type="datetime-local" value={draft.availableUntil} onChange={(e) => set('availableUntil', e.target.value)} className="h-9" />
                </Field>
              </div>
            </div>
          </Panel>

          {!!t.versions?.length && (
            <Panel title="Published versions" icon={<Rocket />} bodyClassName="p-2">
              <ul>
                {t.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-[8px] px-3 py-2 text-[12px]">
                    <span className="font-mono font-bold text-gold-bright">v{v.version}</span>
                    <span className="text-fg-3">
                      {v.totalQuestions}q · {fmtDuration(v.totalTimeSeconds)}
                    </span>
                    <span className="text-fg-4">{fmtDateTime(v.publishedAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <QuestionPreviewDialog q={preview} onClose={() => setPreview(null)} />
      <Dialog open={fullPreview} onOpenChange={setFullPreview} size="lg" title="Interview preview" description={`${totals.count} questions · ${fmtDuration(totals.time)} total · candidates see one question at a time.`} icon={<Eye />}>
        <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-2">
          {selected.map(({ e, q }, i) => (
            <QuestionCard key={q.id} index={i} total={selected.length} q={{ ...toPreview(q), timeLimitSeconds: e.timeLimitSeconds ?? q.timeLimitSeconds }} />
          ))}
        </div>
      </Dialog>
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        tone="gold"
        title={`Publish version ${t.publishedVersion + 1}`}
        description="This freezes the current questions, wording, timers and answer keys into an immutable version. New assignments use it; attempts already assigned keep their own version."
        confirmLabel="Publish interview"
        loading={publishMut.isPending}
        onConfirm={() => publishMut.mutate()}
      />
    </>
  );
}

function SequenceItem({ q, entry, index, onRemove, onTimer, onPreview }: { q: Question; entry: Entry; index: number; onRemove: () => void; onTimer: (v: number | null) => void; onPreview: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  return (
    <li
      ref={setNodeRef}
     
     
     
     
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2.5 rounded-[11px] border border-line bg-[linear-gradient(180deg,#171A21,#121419)] px-3 py-2.5', isDragging && 'relative z-10 border-gold/40 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.95)]')}
    >
      <button className="cursor-grab touch-none rounded-md p-1 text-fg-4 hover:bg-white/5 hover:text-fg-2 active:cursor-grabbing" aria-label={`Drag ${q.title}`} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-gold/25 bg-gold/[0.07] font-display text-[14px] font-semibold text-gold-bright">{index + 1}</span>
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onPreview}>
        <p className="truncate text-[13px] font-semibold text-fg">{q.title}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <DifficultyBadge d={q.difficulty} />
          <span className="text-[10.5px] text-fg-4">{q.category.name} · {q.maxScore} pts</span>
        </div>
      </div>
      <div className="w-[84px] shrink-0">
        <Select
          size="sm"
          value={entry.timeLimitSeconds === null ? 'default' : String(entry.timeLimitSeconds)}
          onValueChange={(v) => onTimer(v === 'default' ? null : Number(v))}
          options={[{ value: 'default', label: `${q.timeLimitSeconds}s`, hint: 'default' }, ...[30, 35, 40, 45, 50, 55, 60].map((s) => ({ value: String(s), label: `${s}s`, hint: 'override' }))]}
        />
      </div>
      {entry.timeLimitSeconds !== null && <TimerPill s={entry.timeLimitSeconds} override />}
      <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Remove question">
        <X className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function SumCell({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-panel px-4 py-4 [&_svg]:h-3.5 [&_svg]:w-3.5">
      <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-fg-4">
        <span className="text-gold/80">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 font-display text-[26px] font-semibold leading-none tabular text-fg">
        {value}
        {sub && <span className="ml-1.5 text-[13px] text-fg-4">{sub}</span>}
      </p>
    </div>
  );
}
