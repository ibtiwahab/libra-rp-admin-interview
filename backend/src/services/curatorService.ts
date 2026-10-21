import type { Request } from 'express';
import type { z } from 'zod';
import { Attempt, AuditLog, Evaluation, User } from '../models';
import { hashPassword, passwordPolicyError } from '../security/password';
import { revokeAllSessions } from '../security/sessions';
import { generatePassword } from '../utils/crypto';
import { badRequest, conflict, notFound } from '../utils/errors';
import { escapeRegex, paged } from '../utils/pagination';
import type { createCuratorSchema, listCuratorsSchema, updateCuratorSchema } from '../validators/admin';
import { audit } from './logService';

type CreateInput = z.infer<typeof createCuratorSchema>;
type UpdateInput = z.infer<typeof updateCuratorSchema>;

/** Every query is pinned to SUPPORT_CURATOR so Head Admin accounts can never be targeted here. */
const CURATOR = { role: 'SUPPORT_CURATOR' } as const;

function curatorDto(u: any, stats?: { evaluated: number }) {
  return {
    id: String(u._id),
    username: u.username,
    fullName: u.fullName,
    discordUsername: u.discordUsername,
    email: u.email,
    role: u.role,
    status: u.status,
    mfaEnabled: Boolean(u.mfa?.enabled),
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    removedAt: u.removedAt,
    createdBy: u.createdBy?.fullName ?? null,
    interviewsEvaluated: stats?.evaluated ?? 0,
  };
}

async function evaluationCounts(ids: unknown[]) {
  const rows = await Evaluation.aggregate<{ _id: unknown; attempts: unknown[] }>([
    { $match: { evaluatorId: { $in: ids } } },
    { $group: { _id: '$evaluatorId', attempts: { $addToSet: '$attemptId' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.attempts.length]));
}

export async function listCurators(input: z.infer<typeof listCuratorsSchema>) {
  const filter: Record<string, unknown> = { ...CURATOR };
  if (input.includeRemoved !== 'true') filter.status = { $ne: 'REMOVED' };
  if (input.search) {
    const rx = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ fullName: rx }, { username: rx }, { discordUsername: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).populate('createdBy', 'fullName').lean(),
    User.countDocuments(filter),
  ]);
  const counts = await evaluationCounts(items.map((u) => u._id));
  return paged(items.map((u) => curatorDto(u, { evaluated: counts.get(String(u._id)) ?? 0 })), total, input);
}

export async function getCurator(id: string) {
  const u = await User.findOne({ _id: id, ...CURATOR }).populate('createdBy', 'fullName').lean();
  if (!u) throw notFound('Support Curator not found');
  const [counts, recentActions, recentEvaluations] = await Promise.all([
    evaluationCounts([u._id]),
    AuditLog.find({ actorId: u._id }).sort({ createdAt: -1 }).limit(25).lean(),
    Attempt.find({ evaluatedBy: u._id }, { candidateSnapshot: 1, interviewSnapshot: 1, result: 1, evaluatedAt: 1, scoring: 1, referenceCode: 1 }).sort({ evaluatedAt: -1 }).limit(10).lean(),
  ]);
  return {
    ...curatorDto(u, { evaluated: counts.get(String(u._id)) ?? 0 }),
    recentActions: recentActions.map((a) => ({ id: String(a._id), action: a.action, targetLabel: a.targetLabel, targetType: a.targetType, createdAt: a.createdAt })),
    recentEvaluations: recentEvaluations.map((a) => ({
      id: String(a._id),
      candidate: a.candidateSnapshot.fullName,
      candidateCode: a.candidateSnapshot.candidateCode,
      interview: a.interviewSnapshot.title,
      result: a.result,
      percentage: a.scoring?.percentage ?? null,
      evaluatedAt: a.evaluatedAt,
    })),
  };
}

export async function createCurator(req: Request, input: CreateInput) {
  if (await User.exists({ username: input.username })) throw conflict('That username is already taken', 'USERNAME_TAKEN');
  let password: string;
  let generated = false;
  if (input.password && !input.generatePassword) {
    const err = passwordPolicyError(input.password);
    if (err) throw badRequest(err, 'WEAK_PASSWORD');
    password = input.password;
  } else {
    password = generatePassword();
    generated = true;
  }
  const u = await User.create({
    username: input.username,
    fullName: input.fullName,
    discordUsername: input.discordUsername,
    email: input.email,
    role: 'SUPPORT_CURATOR',
    status: input.status,
    passwordHash: await hashPassword(password),
    mustChangePassword: generated,
    createdBy: req.admin!.user._id,
  });
  await audit(req, { action: 'CURATOR_CREATED', targetType: 'User', targetId: u._id, targetLabel: `${u.fullName} (@${u.username})`, details: { status: u.status } });
  return { curator: curatorDto(u.toObject()), credentials: generated ? { username: u.username, password } : null };
}

export async function updateCurator(req: Request, id: string, input: UpdateInput) {
  const u = await User.findOne({ _id: id, ...CURATOR });
  if (!u) throw notFound('Support Curator not found');
  if (u.status === 'REMOVED') throw badRequest('Removed curators cannot be modified', 'CURATOR_REMOVED');

  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) set[k] = v;
  await User.updateOne({ _id: u._id, ...CURATOR }, { $set: set });

  if (input.status && input.status !== u.status) {
    if (input.status === 'DISABLED') await revokeAllSessions('ADMIN', u._id, 'ACCOUNT_DISABLED');
    await audit(req, { action: input.status === 'DISABLED' ? 'CURATOR_DISABLED' : 'CURATOR_REACTIVATED', targetType: 'User', targetId: u._id, targetLabel: `${u.fullName} (@${u.username})` });
  }
  const other = Object.keys(input).filter((k) => k !== 'status');
  if (other.length) await audit(req, { action: 'CURATOR_UPDATED', targetType: 'User', targetId: u._id, targetLabel: `${u.fullName} (@${u.username})`, details: { fields: other } });
  return getCurator(id);
}

/**
 * Removal is a soft delete: access is revoked immediately, but the account document remains so
 * that evaluations, audit entries and other historical references stay intact.
 */
export async function removeCurator(req: Request, id: string) {
  const u = await User.findOne({ _id: id, ...CURATOR });
  if (!u) throw notFound('Support Curator not found');
  if (u.status === 'REMOVED') return;
  await User.updateOne({ _id: u._id, ...CURATOR }, { $set: { status: 'REMOVED', removedAt: new Date(), removedBy: req.admin!.user._id, 'mfa.enabled': false, 'mfa.secretEnc': null } });
  const revoked = await revokeAllSessions('ADMIN', u._id, 'CURATOR_REMOVED');
  await audit(req, { action: 'CURATOR_REMOVED', targetType: 'User', targetId: u._id, targetLabel: `${u.fullName} (@${u.username})`, details: { sessionsRevoked: revoked } });
}

export async function resetCuratorPassword(req: Request, id: string) {
  const u = await User.findOne({ _id: id, ...CURATOR });
  if (!u) throw notFound('Support Curator not found');
  if (u.status === 'REMOVED') throw badRequest('Removed curators cannot be modified', 'CURATOR_REMOVED');
  const password = generatePassword();
  await User.updateOne({ _id: u._id, ...CURATOR }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLoginAttempts: 0, lockUntil: null, passwordChangedAt: new Date() } });
  await revokeAllSessions('ADMIN', u._id, 'PASSWORD_RESET');
  await audit(req, { action: 'CURATOR_PASSWORD_RESET', targetType: 'User', targetId: u._id, targetLabel: `${u.fullName} (@${u.username})` });
  return { username: u.username, password };
}
