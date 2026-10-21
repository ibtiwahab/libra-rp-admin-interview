import type { CookieOptions, Response } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { env } from '../config/env';
import type { SubjectType } from '../config/constants';
import { Session, type SessionDoc } from '../models';
import { hmac, randomToken } from '../utils/crypto';

export const COOKIE_NAMES = {
  ADMIN: 'libra_admin',
  CANDIDATE: 'libra_candidate',
  CSRF: 'libra_csrf',
} as const;

export function cookieNameFor(subject: SubjectType): string {
  return subject === 'ADMIN' ? COOKIE_NAMES.ADMIN : COOKIE_NAMES.CANDIDATE;
}

export function sessionCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function hashToken(token: string): string {
  return hmac(token, 'session');
}

interface CreateSessionInput {
  subjectType: SubjectType;
  subjectId: Types.ObjectId;
  role: string;
  status?: 'ACTIVE' | 'MFA_PENDING';
  ip?: string;
  userAgent?: string;
  dbSession?: ClientSession;
}

export function sessionLifetimes(subjectType: SubjectType, status: 'ACTIVE' | 'MFA_PENDING' = 'ACTIVE') {
  const now = Date.now();
  if (status === 'MFA_PENDING') {
    const t = new Date(now + 5 * 60_000);
    return { expiresAt: t, absoluteExpiresAt: t };
  }
  if (subjectType === 'ADMIN') {
    return {
      expiresAt: new Date(now + env.ADMIN_SESSION_IDLE_MINUTES * 60_000),
      absoluteExpiresAt: new Date(now + env.ADMIN_SESSION_ABSOLUTE_HOURS * 3_600_000),
    };
  }
  const t = new Date(now + env.CANDIDATE_SESSION_HOURS * 3_600_000);
  return { expiresAt: t, absoluteExpiresAt: t };
}

export async function createSession(input: CreateSessionInput): Promise<{ token: string; session: SessionDoc }> {
  const token = randomToken(32);
  const status = input.status ?? 'ACTIVE';
  const [session] = await Session.create(
    [
      {
        tokenHash: hashToken(token),
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        role: input.role,
        status,
        ...sessionLifetimes(input.subjectType, status),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    ],
    { session: input.dbSession },
  );
  return { token, session: session! };
}

export function setSessionCookie(res: Response, subject: SubjectType, token: string, session: SessionDoc): void {
  res.cookie(cookieNameFor(subject), token, sessionCookieOptions(session.absoluteExpiresAt.getTime() - Date.now()));
}

export function clearSessionCookie(res: Response, subject: SubjectType): void {
  res.clearCookie(cookieNameFor(subject), sessionCookieOptions());
}

export async function findSessionByToken(token: string | undefined, subjectType: SubjectType): Promise<SessionDoc | null> {
  if (!token || token.length > 128) return null;
  return Session.findOne({ tokenHash: hashToken(token), subjectType });
}

export function isSessionLive(s: SessionDoc, now = new Date()): boolean {
  return s.expiresAt > now && s.absoluteExpiresAt > now;
}

export async function revokeSession(sessionId: Types.ObjectId, reason: string, dbSession?: ClientSession): Promise<boolean> {
  const res = await Session.updateOne(
    { _id: sessionId, status: { $ne: 'REVOKED' } },
    { $set: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason } },
    { session: dbSession },
  );
  return res.modifiedCount > 0;
}

export async function revokeAllSessions(
  subjectType: SubjectType,
  subjectId: Types.ObjectId,
  reason: string,
  options: { exceptId?: Types.ObjectId; dbSession?: ClientSession } = {},
): Promise<number> {
  const filter: Record<string, unknown> = { subjectType, subjectId, status: { $ne: 'REVOKED' } };
  if (options.exceptId) filter._id = { $ne: options.exceptId };
  const res = await Session.updateMany(
    filter,
    { $set: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason } },
    { session: options.dbSession },
  );
  return res.modifiedCount;
}
