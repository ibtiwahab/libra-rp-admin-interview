'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, FileQuestion, Plus, Timer, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/hooks/use-admin';
import { errorMessage } from '@/lib/api';
import type { Difficulty, Question, QuestionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/admin';

export const TYPE_META: Record<QuestionType, { label: string; short: string; hint: string }> = {
  SHORT_TEXT: { label: 'Short text', short: 'Short', hint: 'A brief written answer (≤ 1,000 characters).' },
  LONG_TEXT: { label: 'Long text', short: 'Long', hint: 'An extended written answer (≤ 5,000 characters).' },
  SCENARIO: { label: 'Scenario', short: 'Scenario', hint: 'A situational case file followed by a written response.' },
  MULTIPLE_CHOICE: { label: 'Multiple choice', short: 'Choice', hint: 'Auto-graded against the answer key.' },
  TRUE_FALSE: { label: 'True / False', short: 'T/F', hint: 'Auto-graded.' },
};
export const DIFFICULTY_META: Record<Difficulty, { label: string; tone: string }> = {
  EASY: { label: 'Easy', tone: 'text-[#7FD3B1] border-ok/30 bg-ok/10' },
  MEDIUM: { label: 'Medium', tone: 'text-[#A9C3F7] border-azure/30 bg-azure/10' },
  HARD: { label: 'Hard', tone: 'text-[#F0C47A] border-warn/30 bg-warn/10' },
  EXPERT: { label: 'Expert', tone: 'text-[#F29790] border-bad/30 bg-bad/10' },
};

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const schema = z
  .object({
    title: z.string().trim().min(3, 'At least 3 characters').max(160),
    prompt: z.string().trim().min(5, 'At least 5 characters').max(4000),
    scenario: z.string().trim().max(4000),
    type: z.enum(['SHORT_TEXT', 'LONG_TEXT', 'MULTIPLE_CHOICE', 'SCENARIO', 'TRUE_FALSE']),
    categoryId: z.string().min(1, 'Choose a category'),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
    timeLimitSeconds: z.coerce.number().int().min(30, 'Minimum 30 seconds').max(60, 'Maximum 60 seconds'),
    maxScore: z.coerce.number().int().min(1).max(100),
    rubric: z.string().trim().max(4000),
    options: z.array(z.object({ key: z.string(), text: z.string().trim(), correct: z.boolean() })),
    allowMultiple: z.boolean(),
    correctBoolean: z.boolean().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'MULTIPLE_CHOICE') {
      const filled = v.options.filter((o) => o.text);
      if (filled.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Provide at least two options' });
      const correct = filled.filter((o) => o.correct);
      if (!correct.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Mark the correct option' });
      if (!v.allowMultiple && correct.length > 1) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only one correct option allowed (enable multiple answers to mark more)' });
    }
    if (v.type === 'TRUE_FALSE' && v.correctBoolean === null) ctx.addIssue({ code: 'custom', path: ['correctBoolean'], message: 'Select the correct answer' });
  });
type Form = z.infer<typeof schema>;

const blankOptions = () => KEYS.slice(0, 4).map((key) => ({ key, text: '', correct: false }));

function toForm(q?: Question | null): Form {
  if (!q) {
    return { title: '', prompt: '', scenario: '', type: 'LONG_TEXT', categoryId: '', difficulty: 'MEDIUM', timeLimitSeconds: 45, maxScore: 10, rubric: '', options: blankOptions(), allowMultiple: false, correctBoolean: null };
  }
  return {
    title: q.title,
    prompt: q.prompt,
    scenario: q.scenario ?? '',
    type: q.type,
    categoryId: q.category.id,
    difficulty: q.difficulty,
    timeLimitSeconds: q.timeLimitSeconds,
    maxScore: q.maxScore,
    rubric: q.rubric ?? '',
    options: q.options.length ? q.options.map((o) => ({ key: o.key, text: o.text, correct: q.correctOptionKeys.includes(o.key) })) : blankOptions(),
    allowMultiple: q.allowMultiple,
    correctBoolean: q.correctBoolean,
  };
}

export function QuestionEditor({ open, onOpenChange, question }: { open: boolean; onOpenChange: (o: boolean) => void; question?: Question | null }) {
  const qc = useQueryClient();
  const categories = useCategories();
  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: toForm(question) });
  const options = useFieldArray({ control, name: 'options' });

  useEffect(() => {
    if (open) {
      const f = toForm(question);
      if (!f.categoryId && categories.data?.length) f.categoryId = categories.data.find((c) => c.isActive)?.id ?? '';
      reset(f);
    }
  }, [open, question, reset, categories.data]);

  const type = watch('type');
  const timer = watch('timeLimitSeconds');
  const allowMultiple = watch('allowMultiple');
  const opts = watch('options');

  const save = useMutation({
    mutationFn: (v: Form) => {
      const filled = v.options.filter((o) => o.text);
      // re-key filled options sequentially A, B, C…
      const rekeyed = filled.map((o, i) => ({ ...o, key: KEYS[i]! }));
      const body = {
        title: v.title,
        prompt: v.prompt,
        scenario: v.scenario,
        type: v.type,
        categoryId: v.categoryId,
        difficulty: v.difficulty,
        timeLimitSeconds: v.timeLimitSeconds,
        maxScore: v.maxScore,
        rubric: v.rubric,
        options: v.type === 'MULTIPLE_CHOICE' ? rekeyed.map(({ key, text }) => ({ key, text })) : [],
        allowMultiple: v.type === 'MULTIPLE_CHOICE' ? v.allowMultiple : false,
        correctOptionKeys: v.type === 'MULTIPLE_CHOICE' ? rekeyed.filter((o) => o.correct).map((o) => o.key) : [],
        correctBoolean: v.type === 'TRUE_FALSE' ? v.correctBoolean : null,
      };
      return question ? adminApi.updateQuestion(question.id, body) : adminApi.createQuestion(body);
    },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['question', q.id] });
      qc.invalidateQueries({ queryKey: ['interviews'] });
      qc.invalidateQueries({ queryKey: ['interview'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success(question ? `Saved — now version ${q.version}` : 'Question added to the bank');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const timerTone = timer <= 35 ? 'text-bad' : timer <= 45 ? 'text-warn' : 'text-ok';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={question ? 'Edit question' : 'Add question'}
      description={question ? `Saving creates version ${question.version + 1}. Interviews already taken keep the exact version candidates received.` : 'New questions are appended to the end of the bank.'}
      icon={<FileQuestion />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            {question ? 'Save new version' : 'Add question'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Field label="Question type">
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {(Object.keys(TYPE_META) as QuestionType[]).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => field.onChange(t)}
                      className={cn(
                        'rounded-[8px] border px-2 py-2 text-[12px] font-semibold transition',
                        field.value === t ? 'border-gold/60 bg-gold/10 text-gold-bright' : 'border-line-2 bg-ink-2 text-fg-3 hover:border-white/15 hover:text-fg-2',
                      )}
                    >
                      {TYPE_META[t].label}
                    </button>
                  ))}
                </div>
              )}
            />
            <p className="mt-1.5 text-[11.5px] text-fg-4">{TYPE_META[type].hint}</p>
          </Field>

          <Field label="Question title" htmlFor="q-title" required error={formState.errors.title?.message}>
            <Input id="q-title" placeholder="e.g. Handling a rule-break report" {...register('title')} aria-invalid={!!formState.errors.title} />
          </Field>
          <Field label="Question description" htmlFor="q-prompt" required error={formState.errors.prompt?.message} hint="Shown to the candidate exactly as written.">
            <Textarea id="q-prompt" className="min-h-[110px]" placeholder="What would you do if…" {...register('prompt')} aria-invalid={!!formState.errors.prompt} />
          </Field>
          {(type === 'SCENARIO' || watch('scenario')) && (
            <Field label="Scenario / supporting information" htmlFor="q-scn" hint="Optional case-file context displayed above the answer field.">
              <Textarea id="q-scn" className="min-h-[90px]" {...register('scenario')} />
            </Field>
          )}

          {type === 'MULTIPLE_CHOICE' && (
            <div className="rounded-[12px] border border-line bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-fg-2">Options & answer key</p>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fg-3">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#C9A961]" {...register('allowMultiple')} /> Multiple correct answers
                </label>
              </div>
              <div className="space-y-2">
                {options.fields.map((f, i) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (allowMultiple) setValue(`options.${i}.correct`, !opts[i]?.correct, { shouldValidate: formState.isSubmitted });
                        else opts.forEach((_, j) => setValue(`options.${j}.correct`, j === i, { shouldValidate: formState.isSubmitted }));
                      }}
                      className={cn('shrink-0 rounded-full p-0.5 transition', opts[i]?.correct ? 'text-ok' : 'text-fg-4 hover:text-fg-3')}
                      aria-label={`Mark option ${KEYS[i]} correct`}
                    >
                      {opts[i]?.correct ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <span className="w-5 font-mono text-[12px] font-bold text-fg-3">{KEYS[i]}</span>
                    <Input placeholder={`Option ${KEYS[i]}`} className="h-9" {...register(`options.${i}.text`)} />
                    <Button type="button" variant="ghost" size="icon-sm" disabled={options.fields.length <= 2} onClick={() => options.remove(i)} aria-label="Remove option">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {options.fields.length < 8 && (
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => options.append({ key: KEYS[options.fields.length]!, text: '', correct: false })}>
                  <Plus className="h-3.5 w-3.5" /> Add option
                </Button>
              )}
              {formState.errors.options && <p className="mt-2 text-[11.5px] text-bad">{(formState.errors.options as { message?: string }).message ?? formState.errors.options.root?.message}</p>}
            </div>
          )}

          {type === 'TRUE_FALSE' && (
            <Field label="Correct answer" error={formState.errors.correctBoolean?.message}>
              <Controller
                name="correctBoolean"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-2">
                    {[true, false].map((b) => (
                      <button
                        type="button"
                        key={String(b)}
                        onClick={() => field.onChange(b)}
                        className={cn('h-11 rounded-[9px] border text-[13px] font-bold uppercase tracking-[0.1em] transition', field.value === b ? 'border-ok/60 bg-ok/10 text-[#7FD3B1]' : 'border-line-2 bg-ink-2 text-fg-3 hover:text-fg-2')}
                      >
                        {b ? 'True' : 'False'}
                      </button>
                    ))}
                  </div>
                )}
              />
            </Field>
          )}

          <Field label="Expected answer / grading rubric" htmlFor="q-rubric" hint="Visible to evaluators only — never sent to candidates.">
            <Textarea id="q-rubric" className="min-h-[90px]" placeholder="Key points a strong answer should cover…" {...register('rubric')} />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Category" required error={formState.errors.categoryId?.message}>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => <Select value={field.value || undefined} onValueChange={field.onChange} placeholder="Select category" options={(categories.data ?? []).filter((c) => c.isActive || c.id === field.value).map((c) => ({ value: c.id, label: c.name }))} aria-invalid={!!formState.errors.categoryId} />}
            />
          </Field>

          <Field label="Difficulty">
            <Controller
              name="difficulty"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
                    <button type="button" key={d} onClick={() => field.onChange(d)} className={cn('rounded-[8px] border py-2 text-[11.5px] font-bold uppercase tracking-[0.06em] transition', field.value === d ? DIFFICULTY_META[d].tone : 'border-line-2 bg-ink-2 text-fg-4 hover:text-fg-3')}>
                      {DIFFICULTY_META[d].label}
                    </button>
                  ))}
                </div>
              )}
            />
          </Field>

          <div className="rounded-[12px] border border-line bg-black/20 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-fg-2">
                <Timer className="h-4 w-4 text-gold" /> Time limit
              </p>
              <p className={cn('font-display text-[30px] font-semibold leading-none tabular', timerTone)}>
                {timer}
                <span className="text-[14px] text-fg-4">s</span>
              </p>
            </div>
            <input type="range" min={30} max={60} step={1} className="mt-4 w-full accent-[#C9A961]" {...register('timeLimitSeconds', { valueAsNumber: true })} aria-label="Time limit in seconds" />
            <div className="mt-2 flex justify-between gap-1.5">
              {[30, 40, 45, 50, 60].map((s) => (
                <button type="button" key={s} onClick={() => setValue('timeLimitSeconds', s)} className={cn('flex-1 rounded-[6px] border py-1 text-[11px] font-bold tabular transition', timer === s ? 'border-gold/50 bg-gold/10 text-gold-bright' : 'border-line text-fg-4 hover:text-fg-2')}>
                  {s}s
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-fg-4">Strict server-enforced timer between 30 and 60 seconds (default 45).</p>
          </div>

          <Field label="Maximum score" htmlFor="q-max" error={formState.errors.maxScore?.message}>
            <Input id="q-max" type="number" min={1} max={100} {...register('maxScore', { valueAsNumber: true })} />
          </Field>

          {question?.versions && question.versions.length > 0 && (
            <div className="rounded-[12px] border border-line p-4">
              <p className="label-caps mb-2.5">Version history</p>
              <ul className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
                {question.versions.map((v) => (
                  <li key={v.version} className="flex items-center justify-between text-[12px]">
                    <span className="font-mono font-bold text-gold-bright">v{v.version}</span>
                    <span className="text-fg-3">{v.changeType.toLowerCase()}</span>
                    <span className="text-fg-4">{v.createdBy ?? '—'}</span>
                    <span className="text-fg-4">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
