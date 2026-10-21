import type { Request, Response } from 'express';
import { env } from '../config/env';
import { adminCtx, loadAdmin, loadCandidate } from '../middleware/auth';
import { Session, User } from '../models';
import { issueCsrfToken, setCsrfCookie } from '../security/csrf';
import { COOKIE_NAMES, clearSessionCookie, findSessionByToken, revokeSession, setSessionCookie } from '../security/sessions';
import * as auth from '../services/authService';
import { getStatus } from '../services/examService';
import { audit, logSecurityEvent } from '../services/logService';
import { unauthorized } from '../utils/errors';
import { requestMeta } from '../utils/request';
import {
  changePasswordSchema,
  disableMfaSchema,
  loginSchema,
  mfaCodeSchema,
  portalSchema,
  profileSchema,
} from '../validators/admin';

function adminDto(u: any) {
  return {
    id: String(u._id),
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    discordUsername: u.discordUsername,
    email: u.email,
    mfaEnabled: Boolean(u.mfa?.enabled),
    mustChangePassword: Boolean(u.mustChangePassword),
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export async function csrf(_req: Request, res: Response) {
  const token = issueCsrfToken();
  setCsrfCookie(res, token);
  res.json({ csrfToken: token });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const meta = requestMeta(req);
  if (input.portal === 'admin') {
    const result = await auth.adminLogin(input.username, input.password, meta);
    setSessionCookie(res, 'ADMIN', result.token, result.session);
    if (result.kind === 'MFA_REQUIRED') return res.json({ status: 'MFA_REQUIRED' });
    const user = await User.findById(result.session.subjectId).lean();
    return res.json({ status: 'OK', user: adminDto(user) });
  }
  const { token, session, candidate } = await auth.candidateLogin(input.username, input.password, meta);
  setSessionCookie(res, 'CANDIDATE', token, session);
  return res.json({ status: 'OK', candidate: { fullName: candidate.fullName, candidateCode: candidate.candidateCode } });
}

export async function verifyMfa(req: Request, res: Response) {
  const { code } = mfaCodeSchema.parse(req.body);
  const { token, session } = await auth.completeMfaLogin(req.cookies?.[COOKIE_NAMES.ADMIN], code, requestMeta(req));
  setSessionCookie(res, 'ADMIN', token, session);
  const user = await User.findById(session.subjectId).lean();
  res.json({ status: 'OK', user: adminDto(user) });
}

export async function logout(req: Request, res: Response) {
  const { portal } = portalSchema.parse(req.body ?? {});
  const subject = portal === 'admin' ? 'ADMIN' : 'CANDIDATE';
  const session = await findSessionByToken(req.cookies?.[portal === 'admin' ? COOKIE_NAMES.ADMIN : COOKIE_NAMES.CANDIDATE], subject);
  if (session) {
    await revokeSession(session._id, 'LOGOUT');
    await logSecurityEvent({
      eventType: 'LOGOUT',
      source: 'SERVER',
      subjectType: subject,
      subjectId: session.subjectId,
      candidateId: subject === 'CANDIDATE' ? session.subjectId : null,
      message: 'Signed out',
      ip: requestMeta(req).ip,
    });
  }
  clearSessionCookie(res, subject);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const portal = req.query.portal === 'candidate' ? 'candidate' : 'admin';
  if (portal === 'admin') {
    const ctx = await loadAdmin(req);
    if (!ctx) throw unauthorized('Not signed in', 'SESSION_INVALID');
    return res.json({ user: adminDto(ctx.user.toObject()), session: { expiresAt: ctx.session.expiresAt, absoluteExpiresAt: ctx.session.absoluteExpiresAt } });
  }
  const ctx = await loadCandidate(req);
  if (!ctx) throw unauthorized('Not signed in', 'SESSION_INVALID');
  return res.json({ candidate: { fullName: ctx.candidate.fullName, candidateCode: ctx.candidate.candidateCode }, status: await getStatus(ctx) });
}

export async function refresh(req: Request, res: Response) {
  const { portal } = portalSchema.parse(req.body ?? {});
  if (portal === 'admin') {
    const ctx = await loadAdmin(req);
    if (!ctx) throw unauthorized('Session expired', 'SESSION_INVALID');
    const expiresAt = new Date(Math.min(Date.now() + env.ADMIN_SESSION_IDLE_MINUTES * 60_000, ctx.session.absoluteExpiresAt.getTime()));
    await Session.updateOne({ _id: ctx.session._id, status: 'ACTIVE' }, { $set: { expiresAt, lastSeenAt: new Date() } });
    return res.json({ expiresAt, absoluteExpiresAt: ctx.session.absoluteExpiresAt });
  }
  const ctx = await loadCandidate(req);
  if (!ctx) throw unauthorized('Session expired', 'SESSION_INVALID');
  return res.json({ expiresAt: ctx.session.expiresAt, absoluteExpiresAt: ctx.session.absoluteExpiresAt });
}

export async function changePassword(req: Request, res: Response) {
  const { user, session } = adminCtx(req);
  const input = changePasswordSchema.parse(req.body);
  await auth.changeAdminPassword(String(user._id), session._id, input.currentPassword, input.newPassword);
  await audit(req, { action: 'ADMIN_PASSWORD_CHANGED', targetType: 'User', targetId: user._id, targetLabel: user.username });
  res.status(204).end();
}

export async function updateProfile(req: Request, res: Response) {
  const { user } = adminCtx(req);
  const input = profileSchema.parse(req.body);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) set[k] = v;
  const updated = await User.findByIdAndUpdate(user._id, { $set: set }, { new: true }).lean();
  res.json({ user: adminDto(updated) });
}

export async function mfaSetup(req: Request, res: Response) {
  const { user } = adminCtx(req);
  res.json(await auth.beginMfaSetup(String(user._id)));
}

export async function mfaEnable(req: Request, res: Response) {
  const { user } = adminCtx(req);
  const { code } = mfaCodeSchema.parse(req.body);
  await auth.confirmMfaSetup(String(user._id), code);
  await audit(req, { action: 'ADMIN_MFA_ENABLED', targetType: 'User', targetId: user._id, targetLabel: user.username });
  res.status(204).end();
}

export async function mfaDisable(req: Request, res: Response) {
  const { user } = adminCtx(req);
  const input = disableMfaSchema.parse(req.body);
  await auth.disableMfa(String(user._id), input.password, input.code);
  await audit(req, { action: 'ADMIN_MFA_DISABLED', targetType: 'User', targetId: user._id, targetLabel: user.username });
  res.status(204).end();
}
