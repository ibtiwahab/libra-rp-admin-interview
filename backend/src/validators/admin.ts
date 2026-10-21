import { z } from 'zod';
import { AUDIT_ACTIONS, SECURITY_EVENT_SEVERITIES, SECURITY_EVENT_SOURCES, SECURITY_EVENT_TYPES } from '../config/constants';
import { paginationSchema } from '../utils/pagination';
import { dateLike, objectId, text } from './common';

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Usernames are 3–32 characters: letters, digits, dot, dash, underscore');

const email = z
  .union([z.string().trim().toLowerCase().email().max(254), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const createCuratorSchema = z
  .object({
    fullName: text(80, 2),
    username,
    discordUsername: text(64).optional().transform((v) => (v ? v : null)),
    email,
    password: z.string().min(12).max(128).optional(),
    generatePassword: z.boolean().default(true),
    status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
  })
  .strict();

/** Note: there is intentionally no `role` field — curators can never be promoted through this API. */
export const updateCuratorSchema = z
  .object({
    fullName: text(80, 2).optional(),
    discordUsername: text(64).optional().transform((v) => (v === undefined ? undefined : v || null)),
    email,
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict();

export const listCuratorsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  includeRemoved: z.enum(['true', 'false']).optional(),
});

export const loginSchema = z
  .object({
    portal: z.enum(['admin', 'candidate']),
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();

export const mfaCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }).strict();
export const disableMfaSchema = z.object({ password: z.string().min(1).max(256), code: z.string().trim().regex(/^\d{6}$/) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(128) }).strict();
export const portalSchema = z.object({ portal: z.enum(['admin', 'candidate']) }).strict();
export const profileSchema = z
  .object({
    fullName: text(80, 2).optional(),
    discordUsername: text(64).optional().transform((v) => (v === undefined ? undefined : v || null)),
    email,
  })
  .strict();

export const securityLogQuery = paginationSchema.extend({
  eventType: z.enum(SECURITY_EVENT_TYPES).optional(),
  severity: z.enum(SECURITY_EVENT_SEVERITIES).optional(),
  source: z.enum(SECURITY_EVENT_SOURCES).optional(),
  candidateId: objectId.optional(),
  attemptId: objectId.optional(),
  from: dateLike.optional(),
  to: dateLike.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const auditLogQuery = paginationSchema.extend({
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: objectId.optional(),
  targetType: z.string().max(40).optional(),
  from: dateLike.optional(),
  to: dateLike.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const analyticsRange = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });
