import { z } from 'zod';
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  TIMER_DEFAULT_SECONDS,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
} from '../config/constants';
import { paginationSchema } from '../utils/pagination';
import { objectId, text } from './common';

const optionInput = z.object({
  key: z.string().regex(/^[A-H]$/, 'Option keys must be A–H'),
  text: text(500, 1),
});

const questionBase = z.object({
  title: text(160, 3),
  prompt: text(4000, 5),
  scenario: text(4000).default(''),
  type: z.enum(QUESTION_TYPES),
  categoryId: objectId,
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  timeLimitSeconds: z.coerce
    .number()
    .int()
    .min(TIMER_MIN_SECONDS, `Timer must be at least ${TIMER_MIN_SECONDS} seconds`)
    .max(TIMER_MAX_SECONDS, `Timer must be at most ${TIMER_MAX_SECONDS} seconds`)
    .default(TIMER_DEFAULT_SECONDS),
  maxScore: z.coerce.number().int().min(1).max(100).default(10),
  rubric: text(4000).default(''),
  options: z.array(optionInput).max(8).default([]),
  allowMultiple: z.boolean().default(false),
  correctOptionKeys: z.array(z.string().regex(/^[A-H]$/)).max(8).default([]),
  correctBoolean: z.boolean().nullable().default(null),
});

type QuestionInput = z.infer<typeof questionBase>;

/** Cross-field rules per question type; normalises irrelevant fields away. */
export function refineQuestion(q: QuestionInput, ctx: z.RefinementCtx): void {
  if (q.type === 'MULTIPLE_CHOICE') {
    if (q.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Provide at least two options' });
    const keys = q.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option keys must be unique' });
    const unknown = q.correctOptionKeys.filter((k) => !keys.includes(k));
    if (unknown.length) ctx.addIssue({ code: 'custom', path: ['correctOptionKeys'], message: 'Correct answers must reference existing options' });
    if (q.correctOptionKeys.length === 0) ctx.addIssue({ code: 'custom', path: ['correctOptionKeys'], message: 'Mark at least one correct option' });
    if (!q.allowMultiple && q.correctOptionKeys.length > 1) ctx.addIssue({ code: 'custom', path: ['correctOptionKeys'], message: 'Single-answer questions may have only one correct option' });
  }
  if (q.type === 'TRUE_FALSE' && q.correctBoolean === null) {
    ctx.addIssue({ code: 'custom', path: ['correctBoolean'], message: 'Select the correct answer' });
  }
}

export function normaliseQuestion<T extends QuestionInput>(q: T): T {
  if (q.type !== 'MULTIPLE_CHOICE') {
    q.options = [];
    q.correctOptionKeys = [];
    q.allowMultiple = false;
  } else {
    q.correctOptionKeys = [...new Set(q.correctOptionKeys)].sort();
  }
  if (q.type !== 'TRUE_FALSE') q.correctBoolean = null;
  return q;
}

export const createQuestionSchema = questionBase.strict().superRefine(refineQuestion).transform(normaliseQuestion);
export const updateQuestionSchema = createQuestionSchema;

export const listQuestionsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: objectId.optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  all: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reorderSchema = z.object({ orderedIds: z.array(objectId).min(1).max(2000) }).strict();

export const categorySchema = z
  .object({
    name: text(60, 2),
    description: text(280).default(''),
    isActive: z.boolean().default(true),
  })
  .strict();
export const categoryUpdateSchema = categorySchema.partial().strict();
