import type { NextFunction, Request, Response } from 'express';
import { badRequest } from '../utils/errors';

/** Sensitive API responses must never be cached by browsers or intermediaries. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

function hasOperatorKeys(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKeys(v, depth + 1));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
      if (hasOperatorKeys(v, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Rejects payloads containing MongoDB operator keys or prototype-pollution keys.
 * Complements strict Zod validation on every route.
 */
export function rejectOperatorInjection(req: Request, _res: Response, next: NextFunction) {
  if (hasOperatorKeys(req.body) || hasOperatorKeys(req.query) || hasOperatorKeys(req.params)) {
    return next(badRequest('Request contains disallowed keys', 'INJECTION_REJECTED'));
  }
  next();
}
