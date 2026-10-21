import { z } from 'zod';
import { CLIENT_EVENT_TYPES } from '../config/constants';

/** In-memory identifier of the browser page instance that runs the exam (never persisted client-side). */
export const instanceId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid exam instance');

const answerFields = {
  answerText: z.string().max(5000).optional(),
  selectedOptionKeys: z.array(z.string().regex(/^[A-H]$/)).max(8).optional(),
  booleanAnswer: z.boolean().nullable().optional(),
};

export const startSchema = z
  .object({
    acknowledged: z.literal(true, { errorMap: () => ({ message: 'You must acknowledge the examination rules' }) }),
    instanceId,
    preflight: z
      .object({
        visibilityApi: z.boolean(),
        focused: z.boolean(),
        fullscreen: z.boolean(),
        cookies: z.boolean(),
        latencyMs: z.number().min(0).max(60_000).nullable(),
        viewport: z.object({ width: z.number().int().min(0).max(20000), height: z.number().int().min(0).max(20000) }).optional(),
      })
      .strict(),
  })
  .strict();

export const saveAnswerSchema = z
  .object({
    questionIndex: z.number().int().min(0).max(1000),
    seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    ...answerFields,
  })
  .strict();

export const submitAnswerSchema = saveAnswerSchema.extend({ reason: z.enum(['MANUAL', 'TIMEOUT']).default('MANUAL') }).strict();

export const heartbeatSchema = z
  .object({
    questionIndex: z.number().int().min(0).max(1000).nullable(),
    visible: z.boolean(),
    focused: z.boolean(),
  })
  .strict();

export const securityEventSchema = z
  .object({
    type: z.enum(CLIENT_EVENT_TYPES),
    questionIndex: z.number().int().min(0).max(1000).nullable().optional(),
    clientTimestamp: z.string().datetime({ offset: true }).optional(),
    instanceId: instanceId.optional(),
    details: z
      .object({
        trigger: z.string().max(64).optional(),
        visibilityState: z.string().max(16).optional(),
        hasFocus: z.boolean().optional(),
        elapsedMs: z.number().min(0).max(86_400_000).optional(),
        persisted: z.boolean().optional(),
        note: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    // present only for sendBeacon payloads, which cannot carry headers
    csrfToken: z.string().max(200).optional(),
  })
  .strict();
