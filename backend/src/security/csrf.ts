import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { hmac, randomToken, safeEqual } from '../utils/crypto';
import { forbidden } from '../utils/errors';
import { COOKIE_NAMES } from './sessions';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Signed double-submit token: `<random>.<hmac(random)>`. */
export function issueCsrfToken(): string {
  const r = randomToken(24);
  return `${r}.${hmac(r, 'csrf')}`;
}

export function isValidCsrfToken(token: unknown): token is string {
  if (typeof token !== 'string' || token.length > 200) return false;
  const [r, sig] = token.split('.');
  if (!r || !sig) return false;
  return safeEqual(sig, hmac(r, 'csrf'));
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAMES.CSRF, token, {
    httpOnly: false, // must be readable by the SPA to echo it back in a header
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 3_600_000,
  });
}

const allowedOrigins = new Set(env.allowedOrigins);

/**
 * CSRF defence in depth:
 *  1. SameSite=Strict session cookies.
 *  2. Origin header (when present) must be the configured frontend origin.
 *  3. Signed double-submit token in `X-CSRF-Token` must match the CSRF cookie.
 * `bodyTokenField` allows navigator.sendBeacon (which cannot set headers) to carry the token in its body.
 */
export function csrfProtection(options: { bodyTokenField?: string } = {}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return next(forbidden('Cross-origin request rejected', 'BAD_ORIGIN'));

    const cookieToken = req.cookies?.[COOKIE_NAMES.CSRF] as string | undefined;
    let sent = req.get('x-csrf-token');
    if (!sent && options.bodyTokenField && req.body && typeof req.body === 'object') {
      const v = (req.body as Record<string, unknown>)[options.bodyTokenField];
      if (typeof v === 'string') sent = v;
    }
    if (!cookieToken || !sent || !safeEqual(cookieToken, sent) || !isValidCsrfToken(sent)) {
      return next(forbidden('Invalid or missing CSRF token', 'CSRF_INVALID'));
    }
    next();
  };
}
