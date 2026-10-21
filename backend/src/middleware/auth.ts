import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import type { AdminRole } from '../config/constants';
import { Candidate, Session, User, type CandidateDoc, type SessionDoc, type UserDoc } from '../models';
import { COOKIE_NAMES, findSessionByToken, isSessionLive } from '../security/sessions';
import { forbidden, unauthorized } from '../utils/errors';

export interface AdminContext {
  user: UserDoc;
  session: SessionDoc;
}
export interface CandidateContext {
  candidate: CandidateDoc;
  session: SessionDoc;
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AdminContext;
    candidateAuth?: CandidateContext;
  }
}

const TOUCH_INTERVAL_MS = 30_000;

async function touch(session: SessionDoc, slideIdle: boolean): Promise<void> {
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return;
  const update: Record<string, Date> = { lastSeenAt: new Date(now) };
  if (slideIdle) {
    update.expiresAt = new Date(Math.min(now + env.ADMIN_SESSION_IDLE_MINUTES * 60_000, session.absoluteExpiresAt.getTime()));
  }
  await Session.updateOne({ _id: session._id, status: 'ACTIVE' }, { $set: update });
}

/** Loads and validates the admin session. Accepts only fully authenticated (post-MFA) sessions. */
export async function loadAdmin(req: Request): Promise<AdminContext | null> {
  const session = await findSessionByToken(req.cookies?.[COOKIE_NAMES.ADMIN], 'ADMIN');
  if (!session || session.status !== 'ACTIVE' || !isSessionLive(session)) return null;
  const user = await User.findById(session.subjectId);
  if (!user || user.status !== 'ACTIVE' || user.role !== session.role) return null;
  await touch(session, true);
  return { user, session };
}

export function requireAdmin(...roles: AdminRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const ctx = await loadAdmin(req);
    if (!ctx) return next(unauthorized('Your administrative session has expired. Please sign in again.', 'SESSION_INVALID'));
    if (roles.length && !roles.includes(ctx.user.role as AdminRole)) {
      return next(forbidden('This action requires elevated privileges', 'ROLE_FORBIDDEN'));
    }
    // Accounts on a temporary password may only manage their own account until it is changed.
    if (ctx.user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) {
      return next(forbidden('Change your temporary password before continuing.', 'PASSWORD_CHANGE_REQUIRED'));
    }
    req.admin = ctx;
    next();
  };
}

/** Both administrative roles. */
export const requireStaff = requireAdmin('HEAD_ADMIN', 'SUPPORT_CURATOR');
/** Head Admin only — Support Curator management. */
export const requireHeadAdmin = requireAdmin('HEAD_ADMIN');

export async function loadCandidate(req: Request): Promise<CandidateContext | null> {
  const session = await findSessionByToken(req.cookies?.[COOKIE_NAMES.CANDIDATE], 'CANDIDATE');
  if (!session || session.status !== 'ACTIVE' || !isSessionLive(session)) return null;
  const candidate = await Candidate.findById(session.subjectId);
  if (!candidate || candidate.status !== 'ACTIVE') return null;
  await touch(session, false);
  return { candidate, session };
}

export async function requireCandidate(req: Request, _res: Response, next: NextFunction) {
  const ctx = await loadCandidate(req);
  if (!ctx) return next(unauthorized('Your session has ended. Please sign in again.', 'SESSION_INVALID'));
  req.candidateAuth = ctx;
  next();
}

export function adminCtx(req: Request): AdminContext {
  if (!req.admin) throw unauthorized();
  return req.admin;
}

export function candidateCtx(req: Request): CandidateContext {
  if (!req.candidateAuth) throw unauthorized();
  return req.candidateAuth;
}
