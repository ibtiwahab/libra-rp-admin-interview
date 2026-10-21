import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env } from '../config/env';
import { hashToken, COOKIE_NAMES } from '../security/sessions';

/*
 * In-memory stores are adequate for a single API instance. For horizontal scaling, plug a shared
 * store (e.g. rate-limit-redis) into these limiters — see documentation/DEPLOYMENT.md.
 *
 * Behind hosting proxies (Vercel → Render, load balancers…) every request may appear to come from
 * the same IP if TRUST_PROXY is not exactly right. Limits are therefore keyed by session wherever
 * possible, so a mis-detected IP can never make all candidates share one bucket.
 */

const base: Partial<Options> = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
  skip: () => env.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== '1',
};

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? '0.0.0.0');

/** Keyed by session token hash when authenticated (fair per-user limits behind shared IPs/proxies). */
const sessionKey = (req: Request) => {
  const token = req.cookies?.[COOKIE_NAMES.CANDIDATE] ?? req.cookies?.[COOKIE_NAMES.ADMIN];
  return typeof token === 'string' && token.length <= 128 ? `s:${hashToken(token)}` : `ip:${ipKey(req)}`;
};

/** Sign-in attempts are limited per (IP, username) — per-account lockout handles the rest. */
const loginKey = (req: Request) => {
  const body = (req.body ?? {}) as { username?: unknown };
  const user = typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 64) : '';
  return `login:${ipKey(req)}:${user}`;
};

export const globalLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 600, keyGenerator: sessionKey });

export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 20,
  keyGenerator: loginKey,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a few minutes.' } },
});

export const mfaLimiter = rateLimit({ ...base, windowMs: 5 * 60_000, limit: 10, keyGenerator: sessionKey });

/** Autosave / heartbeat traffic for a single exam session. */
export const examWriteLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 240, keyGenerator: sessionKey });

/** Question retrieval: low ceiling to frustrate scraping attempts. */
export const examReadLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 90, keyGenerator: sessionKey });

export const exportLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 20, keyGenerator: sessionKey });
