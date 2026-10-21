'use client';

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, BookOpenCheck, Copy, Eye, FolderTree, GripVertical, MoreHorizontal, Pencil, Plus, Save, Timer, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CategoriesDialog } from '@/components/admin/categories-dialog';
import { ConfirmDialog, FilterBar, SearchBox } from '@/components/admin/common';
import { DIFFICULTY_META, QuestionEditor, TYPE_META } from '@/components/admin/question-editor';
import { QuestionPreviewDialog, type PreviewQuestion } from '@/components/admin/question-preview';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Pagination, Spinner, TD, TH, THead, TR, Table, TableSkeleton } from '@/components/ui/data';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/hooks/use-admin';
import { useDebounced } from '@/hooks/use-debounce';
import { errorMessage } from '@/lib/api';
import type { Question } from '@/lib/types';
import { cn, fmtDate, fmtTimer } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

export const toPreview = (q: Question): PreviewQuestion => ({ ...q, categoryName: q.category.name });

export function DifficultyBadge({ d }: { d: Question['difficulty'] }) {
  return <span className={cn('inline-flex h-[22px] items-center rounded-[6px] border px-2 text-[10.5px] font-bold uppercase tracking-[0.08em]', DIFFICULTY_META[d].tone)}>{DIFFICULTY_META[d].label}</span>;
}
export function TimerPill({ s, override }: { s: number; override?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11.5px] font-semibold tabular', override ? 'border-gold/40 bg-gold/10 text-gold-bright' : 'border-line-2 bg-white/[0.03] text-fg-2')}>
      <Timer className="h-3 w-3 opacity-70" />
      {fmtTimer(s)}
    </span>
  );
}

export function QuestionBankPage() {
  const qc = useQueryClient();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [difficulty, setDifficulty] = useState('ALL');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ open: boolean; q: Question | null }>({ open: false, q: null });
  const [preview, setPreview] = useState<PreviewQuestion | null>(null);
  const [del, setDel] = useState<Question | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [reorder, setReorder] = useState(false);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [debounced, categoryId, type, difficulty]);

  const query = { page, limit: 25, search: debounced || undefined, categoryId: categoryId === 'ALL' ? undefined : categoryId, type: type === 'ALL' ? undefined : type, difficulty: difficulty === 'ALL' ? undefined : difficulty };
  const list = useQuery({ queryKey: qk.questions(query), queryFn: () => adminApi.questions(query), placeholderData: keepPreviousData, enabled: !reorder });

  const openEdit = async (q: Question) => {
    try {
      const full = await qc.fetchQuery({ queryKey: qk.question(q.id), queryFn: () => adminApi.question(q.id) });
      setEditor({ open: true, q: full });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const dup = useMutation({
    mutationFn: (id: string) => adminApi.duplicateQuestion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question duplicated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteQuestion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['interviews'] });
      qc.invalidateQueries({ queryKey: ['interview'] });
      setDel(null);
      toast.success('Question removed from the bank and from interview drafts');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const data = list.data;
  const filtered = !!(debounced || categoryId !== 'ALL' || type !== 'ALL' || difficulty !== 'ALL');

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Question Bank"
        description="Author, version and order every interview question. Edits create a new version — candidates' historical records always keep the exact wording they received."
        actions={
          reorder ? null : (
            <>
              <Button variant="secondary" onClick={() => setCatsOpen(true)}>
                <FolderTree className="h-4 w-4" /> Categories
              </Button>
              <Button variant="secondary" onClick={() => setReorder(true)}>
                <ArrowDownUp className="h-4 w-4" /> Reorder
              </Button>
              <Button variant="primary" onClick={() => setEditor({ open: true, q: null })}>
                <Plus className="h-4 w-4" /> Add question
              </Button>
            </>
          )
        }
      />

      {reorder ? (
        <ReorderPanel onDone={() => setReorder(false)} onPreview={setPreview} />
      ) : (
        <Panel bodyClassName="p-0">
          <FilterBar>
            <SearchBox value={search} onChange={setSearch} placeholder="Search title or question text…" />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Select size="sm" className="sm:w-[190px]" value={categoryId} onValueChange={setCategoryId} options={[{ value: 'ALL', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              <Select size="sm" className="sm:w-[150px]" value={type} onValueChange={setType} options={[{ value: 'ALL', label: 'All types' }, ...Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))]} />
              <Select size="sm" className="sm:w-[140px]" value={difficulty} onValueChange={setDifficulty} options={[{ value: 'ALL', label: 'Any difficulty' }, ...Object.entries(DIFFICULTY_META).map(([k, v]) => ({ value: k, label: v.label }))]} />
            </div>
          </FilterBar>
          <Table>
            <THead>
              <tr>
                <TH className="w-12">#</TH>
                <TH>Question</TH>
                <TH>Category</TH>
                <TH>Type</TH>
                <TH>Difficulty</TH>
                <TH>Timer</TH>
                <TH align="right">Max</TH>
                <TH>Created / Modified</TH>
                <TH>Author</TH>
                <TH align="right" />
              </tr>
            </THead>
            <tbody>
              {list.isLoading ? (
                <TableSkeleton cols={10} />
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon={<BookOpenCheck />}
                      title={filtered ? 'No matching questions' : 'The bank is empty'}
                      description={filtered ? 'Adjust the filters to see more questions.' : 'Add your first interview question to begin building interviews.'}
                      action={!filtered && <Button variant="primary" onClick={() => setEditor({ open: true, q: null })}><Plus className="h-4 w-4" /> Add question</Button>}
                    />
                  </td>
                </tr>
              ) : (
                data.items.map((q) => (
                  <TR key={q.id} onClick={() => openEdit(q)}>
                    <TD className="font-mono text-[12px] text-fg-4">{String(q.position).padStart(2, '0')}</TD>
                    <TD className="max-w-[420px]">
                      <p className="truncate font-semibold text-fg">{q.title}</p>
                      <p className="line-clamp-2 text-[12px] leading-snug text-fg-3">{q.prompt}</p>
                    </TD>
                    <TD className="whitespace-nowrap text-[12.5px]">{q.category.name}</TD>
                    <TD>
                      <Badge tone="neutral">{TYPE_META[q.type].short}</Badge>
                    </TD>
                    <TD>
                      <DifficultyBadge d={q.difficulty} />
                    </TD>
                    <TD>
                      <TimerPill s={q.timeLimitSeconds} />
                    </TD>
                    <TD align="right" className="font-bold tabular text-fg">{q.maxScore}</TD>
                    <TD className="whitespace-nowrap text-[12px] text-fg-3">
                      <p>{fmtDate(q.createdAt)}</p>
                      <p className="text-[11px] text-fg-4">
                        {fmtDate(q.updatedAt)}
                        <span className="ml-1.5 font-mono text-[10.5px] text-gold/80">v{q.version}</span>
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-[12px] text-fg-3">{q.createdBy?.fullName ?? '—'}</TD>
                    <TD align="right">
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label="Question actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownTrigger>
                          <DropdownContent>
                            <DropdownItem icon={<Eye />} onSelect={() => setPreview(toPreview(q))}>
                              Preview
                            </DropdownItem>
                            <DropdownItem icon={<Pencil />} onSelect={() => openEdit(q)}>
                              Edit
                            </DropdownItem>
                            <DropdownItem icon={<Copy />} onSelect={() => dup.mutate(q.id)}>
                              Duplicate
                            </DropdownItem>
                            <DropdownSeparator />
                            <DropdownItem icon={<Trash2 />} danger onSelect={() => setDel(q)}>
                              Delete
                            </DropdownItem>
                          </DropdownContent>
                        </DropdownMenu>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
          {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="questions" />}
        </Panel>
      )}

      <QuestionEditor open={editor.open} onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} question={editor.q} />
      <QuestionPreviewDialog q={preview} onClose={() => setPreview(null)} />
      <CategoriesDialog open={catsOpen} onOpenChange={setCatsOpen} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete question"
        description={`“${del?.title}” will be removed from the bank and from all interview drafts. Published interview versions and every recorded answer keep their own immutable copy.`}
        confirmLabel="Delete question"
        loading={remove.isPending}
        onConfirm={() => del && remove.mutate(del.id)}
      />
    </>
  );
}

function SortableRow({ q, index, onPreview }: { q: Question; index: number; onPreview: (p: PreviewQuestion) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 border-b border-line bg-panel px-4 py-3 last:border-b-0', isDragging && 'relative z-10 rounded-[10px] border border-gold/40 bg-surface shadow-[0_20px_40px_-12px_rgba(0,0,0,0.9)]')}
    >
      <button className="cursor-grab touch-none rounded-md p-1 text-fg-4 hover:bg-white/5 hover:text-fg-2 active:cursor-grabbing" aria-label={`Drag ${q.title}`} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-8 font-mono text-[12px] font-bold text-gold/80">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-fg">{q.title}</p>
        <p className="truncate text-[11.5px] text-fg-4">{q.category.name}</p>
      </div>
      <DifficultyBadge d={q.difficulty} />
      <TimerPill s={q.timeLimitSeconds} />
      <Button size="icon-sm" variant="ghost" aria-label="Preview" onClick={() => onPreview(toPreview(q))}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function ReorderPanel({ onDone, onPreview }: { onDone: () => void; onPreview: (p: PreviewQuestion) => void }) {
  const qc = useQueryClient();
  const all = useQuery({ queryKey: qk.questions({ all: 'true' }), queryFn: () => adminApi.questions({ all: 'true' }) });
  const [items, setItems] = useState<Question[] | null>(null);
  useEffect(() => {
    if (all.data && !items) setItems(all.data.items);
  }, [all.data, items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const dirty = !!items && !!all.data && items.some((q, i) => q.id !== all.data!.items[i]?.id);

  const save = useMutation({
    mutationFn: () => adminApi.reorderQuestions(items!.map((q) => q.id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question order saved');
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || !items) return;
    const from = items.findIndex((q) => q.id === e.active.id);
    const to = items.findIndex((q) => q.id === e.over!.id);
    setItems(arrayMove(items, from, to));
  };

  return (
    <Panel
      title="Reorder question bank"
      description="Drag questions into the desired sequence. Keyboard: focus a handle, press space, use arrow keys."
      icon={<ArrowDownUp />}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onDone}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> Save order
          </Button>
        </>
      }
    >
      {!items ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ol>
              {items.map((q, i) => (
                <SortableRow key={q.id} q={q} index={i} onPreview={onPreview} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </Panel>
  );
}
