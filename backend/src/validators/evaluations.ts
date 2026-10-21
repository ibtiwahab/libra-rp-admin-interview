import { z } from 'zod';
import { ATTEMPT_STATUSES, EVALUATION_DECISIONS, RESULTS } from '../config/constants';
import { paginationSchema } from '../utils/pagination';
import { dateLike, objectId, text } from './common';

export const saveEvaluationSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    decision: z.enum(EVALUATION_DECISIONS),
    overallNotes: text(4000).default(''),
    marks: z
      .array(
        z
          .object({
            questionIndex: z.number().int().min(0).max(1000),
            awardedScore: z.number().min(0).max(100),
            notes: text(2000).default(''),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const listAttemptsSchema = paginationSchema.extend({
  queue: z.enum(['pending', 'evaluated', 'disqualified', 'all']).default('all'),
  search: z.string().trim().max(100).optional(),
  templateId: objectId.optional(),
  status: z.enum(ATTEMPT_STATUSES).optional(),
  result: z.enum(RESULTS).optional(),
  evaluatorId: objectId.optional(),
  security: z.enum(['VIOLATION', 'WARNINGS', 'CLEAN']).optional(),
  from: dateLike.optional(),
  to: dateLike.optional(),
  sort: z.enum(['newest', 'oldest', 'score_desc', 'score_asc']).default('newest'),
});
