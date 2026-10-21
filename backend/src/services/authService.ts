import { env } from '../config/env';
import { Attempt, Candidate, Session, User, type SessionDoc } from '../models';
import { hashPassword, needsRehash, passwordPolicyError, verifyPassword } from '../security/password';
import { createSession, findSessionByToken, isSessionLive, revokeAllSessions, revokeSession } from '../security/sessions';
import { generateTotpSecret, totpProvisioning, verifyTotp } from '../security/totp';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../utils/errors';
import { logSecurityEvent } from './logService';

interface Meta {
  ip: string;
  userAgent: string;
}

const INVALID = () => unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
const LOCKED = () => new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. This account is temporarily locked.');

function lockState(failed: number) {
  if (failed >= env.LOGIN_MAX_FAILURES) return new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000);
  return null;
}

// ─────────────────────────────── Administrators ───────────────────────────────

export type AdminLoginResult =
  | { kind: 'MFA_REQUIRED'; token: string; session: SessionDoc }
  | { kind: 'OK'; token: string; session: SessionDoc };

export async function adminLogin(usernameRaw: string, password: string, meta: Meta): Promise<AdminLoginResult> {
  const username = usernameRaw.trim().toLowerCase();
  const user = await User.findOne({ username }).select('+passwordHash');
  const now = new Date();

  if (!user || user.status === 'REMOVED') {
    await verifyPassword(null, password);
    await logSecurityEvent({ eventType: 'LOGIN_FAILED', source: 'SERVER', severity: 'WARNING', message: 'Unknown administrator', metadata: { portal: 'admin', username }, ip: meta.ip });
    throw INVALID();
  }

  if (user.lockUntil && user.lockUntil > now) {
    await logSecurityEvent({ eventType: 'LOGIN_BLOCKED', source: 'SERVER', severity: 'WARNING', subjectType: 'ADMIN', subjectId: user._id, message: 'Login attempted while account locked', metadata: { portal: 'admin' }, ip: meta.ip });
    throw LOCKED();
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = (user.failedLoginAttempts ?? 0) + 1;
    const lockUntil = lockState(failed);
    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: lockUntil ? 0 : failed, lockUntil } });
    await logSecurityEvent({ eventType: 'LOGIN_FAILED', source: 'SERVER', severity: 'WARNING', subjectType: 'ADMIN', subjectId: user._id, message: 'Invalid password', metadata: { portal: 'admin', failed }, ip: meta.ip });
    if (lockUntil) {
      await logSecurityEvent({ eventType: 'ACCOUNT_LOCKED', source: 'SERVER', severity: 'CRITICAL', subjectType: 'ADMIN', subjectId: user._id, message: `Locked for ${env.LOGIN_LOCK_MINUTES} minutes`, ip: meta.ip });
    }
    throw INVALID();
  }

  if (user.status !== 'ACTIVE') {
    await logSecurityEvent({ eventType: 'LOGIN_BLOCKED', source: 'SERVER', severity: 'WARNING', subjectType: 'ADMIN', subjectId: user._id, message: 'Disabled account', ip: meta.ip });
    throw forbidden('This account has been disabled. Contact a Head Admin.', 'ACCOUNT_DISABLED');
  }

  const update: Record<string, unknown> = { failedLoginAttempts: 0, lockUntil: null };
  if (needsRehash(user.passwordHash)) update.passwordHash = await hashPassword(password);

  if (user.mfa?.enabled) {
    await User.updateOne({ _id: user._id }, { $set: update });
    const { token, session } = await createSession({ subjectType: 'ADMIN', subjectId: user._id, role: user.role, status: 'MFA_PENDING', ...meta });
    return { kind: 'MFA_REQUIRED', token, session };
  }

  update.lastLoginAt = now;
  await User.updateOne({ _id: user._id }, { $set: update });
  const { token, session } = await createSession({ subjectType: 'ADMIN', subjectId: user._id, role: user.role, ...meta });
  await logSecurityEvent({ eventType: 'LOGIN_SUCCESS', source: 'SERVER', subjectType: 'ADMIN', subjectId: user._id, message: `${user.username} signed in`, metadata: { portal: 'admin', role: user.role }, ip: meta.ip });
  return { kind: 'OK', token, session };
}

export async function completeMfaLogin(pendingToken: string | undefined, code: string, meta: Meta) {
  const pending = await findSessionByToken(pendingToken, 'ADMIN');
  if (!pending || pending.status !== 'MFA_PENDING' || !isSessionLive(pending)) {
    throw unauthorized('Your verification window expired. Sign in again.', 'MFA_SESSION_INVALID');
  }
  const user = await User.findById(pending.subjectId).select('+mfa.secretEnc');
  if (!user || user.status !== 'ACTIVE' || !user.mfa?.enabled || !user.mfa.secretEnc) {
    await revokeSession(pending._id, 'MFA_INVALID_STATE');
    throw unauthorized('Unable to verify. Sign in again.', 'MFA_SESSION_INVALID');
  }
  if (!verifyTotp(decryptSecret(user.mfa.secretEnc), code)) {
    const attempts = (pending.mfaAttempts ?? 0) + 1;
    await Session.updateOne({ _id: pending._id }, { $set: { mfaAttempts: attempts } });
    await logSecurityEvent({ eventType: 'MFA_FAILED', source: 'SERVER', severity: 'WARNING', subjectType: 'ADMIN', subjectId: user._id, message: 'Invalid authenticator code', metadata: { attempts }, ip: meta.ip });
    if (attempts >= 5) {
      await revokeSession(pending._id, 'MFA_TOO_MANY_ATTEMPTS');
      throw unauthorized('Too many invalid codes. Sign in again.', 'MFA_SESSION_INVALID');
    }
    throw unauthorized('Invalid authenticator code', 'MFA_INVALID');
  }
  // Rotate: the pending session is discarded and a fresh fully-authenticated session issued.
  await revokeSession(pending._id, 'MFA_COMPLETED');
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const { token, session } = await createSession({ subjectType: 'ADMIN', subjectId: user._id, role: user.role, ...meta });
  await logSecurityEvent({ eventType: 'LOGIN_SUCCESS', source: 'SERVER', subjectType: 'ADMIN', subjectId: user._id, message: `${user.username} signed in (MFA)`, metadata: { portal: 'admin', role: user.role, mfa: true }, ip: meta.ip });
  return { token, session };
}

export async function changeAdminPassword(userId: string, currentSessionId: SessionDoc['_id'], current: string, next: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw unauthorized();
  if (!(await verifyPassword(user.passwordHash, current))) throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  const policy = passwordPolicyError(next);
  if (policy) throw badRequest(policy, 'WEAK_PASSWORD');
  if (current === next) throw badRequest('New password must differ from the current password', 'WEAK_PASSWORD');
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(), mustChangePassword: false } });
  await revokeAllSessions('ADMIN', user._id, 'PASSWORD_CHANGED', { exceptId: currentSessionId });
}

export async function beginMfaSetup(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw unauthorized();
  if (user.mfa?.enabled) throw conflict('Multi-factor authentication is already enabled', 'MFA_ALREADY_ENABLED');
  const secret = generateTotpSecret();
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecretEnc': encryptSecret(secret) } });
  const { otpauthUrl, qrDataUrl } = await totpProvisioning(user.username, secret);
  return { secret, otpauthUrl, qrDataUrl };
}

export async function confirmMfaSetup(userId: string, code: string) {
  const user = await User.findById(userId).select('+mfa.pendingSecretEnc');
  if (!user?.mfa?.pendingSecretEnc) throw badRequest('Start MFA setup first', 'MFA_NOT_PENDING');
  const secret = decryptSecret(user.mfa.pendingSecretEnc);
  if (!verifyTotp(secret, code)) throw badRequest('Invalid authenticator code', 'MFA_INVALID');
  await User.updateOne(
    { _id: user._id },
    { $set: { 'mfa.enabled': true, 'mfa.secretEnc': encryptSecret(secret), 'mfa.pendingSecretEnc': null, 'mfa.enabledAt': new Date() } },
  );
}

export async function disableMfa(userId: string, password: string, code: string) {
  const user = await User.findById(userId).select('+passwordHash +mfa.secretEnc');
  if (!user?.mfa?.enabled || !user.mfa.secretEnc) throw badRequest('MFA is not enabled', 'MFA_NOT_ENABLED');
  if (!(await verifyPassword(user.passwordHash, password))) throw badRequest('Password is incorrect', 'INVALID_PASSWORD');
  if (!verifyTotp(decryptSecret(user.mfa.secretEnc), code)) throw badRequest('Invalid authenticator code', 'MFA_INVALID');
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.enabled': false, 'mfa.secretEnc': null, 'mfa.enabledAt': null } });
}

// ─────────────────────────────── Candidates ───────────────────────────────

export async function candidateLogin(usernameRaw: string, password: string, meta: Meta) {
  const code = usernameRaw.trim().toUpperCase();
  const candidate = await Candidate.findOne({ candidateCode: code }).select('+passwordHash');
  const now = new Date();

  if (!candidate) {
    await verifyPassword(null, password);
    await logSecurityEvent({ eventType: 'LOGIN_FAILED', source: 'SERVER', severity: 'WARNING', message: 'Unknown candidate username', metadata: { portal: 'candidate', username: code.slice(0, 40) }, ip: meta.ip });
    throw INVALID();
  }

  if (candidate.lockUntil && candidate.lockUntil > now) {
    await logSecurityEvent({ eventType: 'LOGIN_BLOCKED', source: 'SERVER', severity: 'WARNING', candidateId: candidate._id, message: 'Login attempted while account locked', ip: meta.ip });
    throw LOCKED();
  }

  if (!(await verifyPassword(candidate.passwordHash, password))) {
    const failed = (candidate.failedLoginAttempts ?? 0) + 1;
    const lockUntil = lockState(failed);
    await Candidate.updateOne({ _id: candidate._id }, { $set: { failedLoginAttempts: lockUntil ? 0 : failed, lockUntil } });
    await logSecurityEvent({ eventType: 'LOGIN_FAILED', source: 'SERVER', severity: 'WARNING', candidateId: candidate._id, message: 'Invalid password', metadata: { portal: 'candidate', failed }, ip: meta.ip });
    if (lockUntil) await logSecurityEvent({ eventType: 'ACCOUNT_LOCKED', source: 'SERVER', severity: 'CRITICAL', candidateId: candidate._id, message: `Locked for ${env.LOGIN_LOCK_MINUTES} minutes`, ip: meta.ip });
    throw INVALID();
  }

  if (candidate.status !== 'ACTIVE') {
    await logSecurityEvent({ eventType: 'LOGIN_BLOCKED', source: 'SERVER', severity: 'WARNING', candidateId: candidate._id, message: `Candidate account ${candidate.status.toLowerCase()}`, ip: meta.ip });
    throw forbidden('This candidate account is no longer active. Contact Libra RP Management.', 'ACCOUNT_DISABLED');
  }

  // An interview in progress is bound to the session that started it. A competing login is
  // rejected outright and never receives any interview content.
  const live = await Attempt.findOne({ candidateId: candidate._id, status: 'IN_PROGRESS' }, { _id: 1 }).lean();
  if (live) {
    await logSecurityEvent({
      eventType: 'CONCURRENT_LOGIN_ATTEMPT',
      source: 'SERVER',
      severity: 'CRITICAL',
      candidateId: candidate._id,
      attemptId: live._id,
      message: 'Login rejected: interview already in progress in another session',
      metadata: { userAgent: meta.userAgent },
      ip: meta.ip,
    });
    throw conflict(
      'Your interview is already in progress in another session. Concurrent sessions are not permitted.',
      'EXAM_SESSION_ACTIVE',
    );
  }

  await Candidate.updateOne({ _id: candidate._id }, { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: now } });
  const superseded = await revokeAllSessions('CANDIDATE', candidate._id, 'SUPERSEDED_BY_NEW_LOGIN');
  if (superseded > 0) {
    await logSecurityEvent({ eventType: 'SESSION_REVOKED', source: 'SERVER', candidateId: candidate._id, message: `${superseded} earlier session(s) superseded by a new sign-in`, ip: meta.ip });
  }
  const { token, session } = await createSession({ subjectType: 'CANDIDATE', subjectId: candidate._id, role: 'CANDIDATE', ...meta });
  await logSecurityEvent({ eventType: 'LOGIN_SUCCESS', source: 'SERVER', candidateId: candidate._id, message: `${candidate.candidateCode} signed in`, metadata: { portal: 'candidate' }, ip: meta.ip });
  return { token, session, candidate };
}
