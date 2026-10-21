import { Types } from 'mongoose';
import { z } from 'zod';

export const objectId = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(v), 'Invalid identifier');

export const idParams = z.object({ id: objectId });

/** Plain text field: trimmed, control characters stripped (except newlines/tabs). */
export const text = (max: number, min = 0) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().min(min).max(max));

export const optionalText = (max: number) => text(max).optional();

export const nullableText = (max: number) =>
  z
    .union([text(max), z.literal(null)])
    .optional()
    .transform((v) => (v === '' ? null : v));

export const dateLike = z.union([z.string().datetime({ offset: true }), z.date()]).transform((v) => new Date(v));

export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
