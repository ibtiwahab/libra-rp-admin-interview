import { z } from 'zod';
import { TEMPLATE_STATUSES, TIMER_MAX_SECONDS, TIMER_MIN_SECONDS } from '../config/constants';
import { paginationSchema } from '../utils/pagination';
import { dateLike, objectId, text } from './common';

const templateQuestion = z
  .object({
    questionId: objectId,
    timeLimitSeconds: z.number().int().min(TIMER_MIN_SECONDS).max(TIMER_MAX_SECONDS).nullable().default(null),
  })
  .strict();

const templateFields = {
  title: text(120, 3),
  description: text(2000).default(''),
  position: text(64, 2),
  instructions: text(6000).default(''),
  passingPercent: z.number().int().min(0).max(100).default(70),
  isActive: z.boolean().default(true),
  availableFrom: dateLike.nullable().default(null),
  availableUntil: dateLike.nullable().default(null),
  questions: z.array(templateQuestion).max(200).default([]),
};

function refineWindow(v: { availableFrom?: Date | null; availableUntil?: Date | null; questions?: { questionId: string }[] }, ctx: z.RefinementCtx) {
  if (v.availableFrom && v.availableUntil && v.availableFrom >= v.availableUntil) {
    ctx.addIssue({ code: 'custom', path: ['availableUntil'], message: 'Availability end must be after the start' });
  }
  if (v.questions) {
    const ids = v.questions.map((q) => q.questionId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'A question can only appear once per interview' });
  }
}

export const createInterviewSchema = z.object(templateFields).strict().superRefine(refineWindow);
export const updateInterviewSchema = z
  .object({
    title: templateFields.title.optional(),
    description: text(2000).optional(),
    position: text(64, 2).optional(),
    instructions: text(6000).optional(),
    passingPercent: z.number().int().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
    availableFrom: dateLike.nullable().optional(),
    availableUntil: dateLike.nullable().optional(),
    questions: z.array(templateQuestion).max(200).optional(),
  })
  .strict()
  .superRefine(refineWindow);

export const listInterviewsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  publishedOnly: z.enum(['true', 'false']).optional(),
});
