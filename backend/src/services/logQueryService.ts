import { Types } from 'mongoose';
import type { z } from 'zod';
import { AuditLog, Candidate, SecurityEvent } from '../models';
import { paged } from '../utils/pagination';
import type { auditLogQuery, securityLogQuery } from '../validators/admin';

export async function querySecurityLog(input: z.infer<typeof securityLogQuery>) {
  const f: Record<string, unknown> = {};
  if (input.eventType) f.eventType = input.eventType;
  if (input.severity) f.severity = input.severity;
  if (input.source) f.source = input.source;
  if (input.candidateId) f.candidateId = new Types.ObjectId(input.candidateId);
  if (input.attemptId) f.attemptId = new Types.ObjectId(input.attemptId);
  if (input.from || input.to) f.serverTimestamp = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) };
  const [items, total] = await Promise.all([
    SecurityEvent.find(f).sort({ serverTimestamp: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean(),
    SecurityEvent.countDocuments(f),
  ]);
  const cands = await Candidate.find({ _id: { $in: [...new Set(items.filter((i) => i.candidateId).map((i) => String(i.candidateId)))] } }, { fullName: 1, candidateCode: 1 }).lean();
  const cmap = new Map(cands.map((c) => [String(c._id), c]));
  return paged(
    items.map((e) => ({
      id: String(e._id),
      eventType: e.eventType,
      source: e.source,
      severity: e.severity,
      subjectType: e.subjectType,
      subjectId: e.subjectId ? String(e.subjectId) : null,
      candidateId: e.candidateId ? String(e.candidateId) : null,
      candidate: e.candidateId ? { fullName: cmap.get(String(e.candidateId))?.fullName ?? null, candidateCode: cmap.get(String(e.candidateId))?.candidateCode ?? null } : null,
      attemptId: e.attemptId ? String(e.attemptId) : null,
      questionIndex: e.questionIndex,
      serverTimestamp: e.serverTimestamp,
      clientTimestamp: e.clientTimestamp,
      message: e.message,
      metadata: e.metadata,
      ip: e.ip,
    })),
    total,
    input,
  );
}

export async function queryAuditLog(input: z.infer<typeof auditLogQuery>) {
  const f: Record<string, unknown> = {};
  if (input.action) f.action = input.action;
  if (input.actorId) f.actorId = new Types.ObjectId(input.actorId);
  if (input.targetType) f.targetType = input.targetType;
  if (input.from || input.to) f.createdAt = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) };
  const [items, total] = await Promise.all([
    AuditLog.find(f).sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean(),
    AuditLog.countDocuments(f),
  ]);
  return paged(
    items.map((a) => ({
      id: String(a._id),
      action: a.action,
      actorId: a.actorId ? String(a.actorId) : null,
      actorUsername: a.actorUsername,
      actorRole: a.actorRole,
      targetType: a.targetType,
      targetId: a.targetId ? String(a.targetId) : null,
      targetLabel: a.targetLabel,
      details: a.details,
      ip: a.ip,
      createdAt: a.createdAt,
    })),
    total,
    input,
  );
}
