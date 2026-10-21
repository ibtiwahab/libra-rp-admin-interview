import { z } from 'zod';
import { APPLIED_ROLES, ASSIGNMENT_STATUSES, RESULTS } from '../config/constants';
import { paginationSchema } from '../utils/pagination';
import { dateLike, nullableText, objectId, text } from './common';

const discordId = z
  .union([z.string().trim().regex(/^\d{15,22}$/, 'Discord IDs are 15–22 digits'), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const createCandidateSchema = z
  .object({
    fullName: text(80, 2),
    discordUsername: text(64, 2),
    discordId,
    characterName: text(80, 2),
    appliedRole: z.enum(APPLIED_ROLES).default('Admin Assistant'),
    templateId: objectId.optional(),
    startDeadline: dateLike.nullable().optional(),
  })
  .strict();

export const updateCandidateSchema = z
  .object({
    fullName: text(80, 2).optional(),
    discordUsername: text(64, 2).optional(),
    discordId,
    characterName: text(80, 2).optional(),
    appliedRole: z.enum(APPLIED_ROLES).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict();

export const listCandidatesSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'ARCHIVED']).optional(),
  interviewStatus: z.enum([...ASSIGNMENT_STATUSES, 'NONE']).optional(),
  result: z.enum(RESULTS).optional(),
  templateId: objectId.optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'score']).default('newest'),
});

export const assignSchema = z
  .object({
    templateId: objectId,
    startDeadline: dateLike.nullable().optional(),
  })
  .strict();

export const noteSchema = z.object({ body: text(4000, 1), attemptId: objectId.optional() }).strict();

export const terminateSchema = z.object({ reason: text(500, 3) }).strict();

export { nullableText };
