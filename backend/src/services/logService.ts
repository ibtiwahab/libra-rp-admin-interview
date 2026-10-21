import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import type {
  AuditAction,
  SecurityEventSeverity,
  SecurityEventSource,
  SecurityEventType,
  SubjectType,
} from '../config/constants';
import { logger } from '../config/logger';
import { AuditLog, Candidate, SecurityEvent } from '../models';
import { clientIp } from '../utils/request';
import { liveBus } from './eventBus';

export interface SecurityEventInput {
  eventType: SecurityEventType;
  source: SecurityEventSource;
  severity?: SecurityEventSeverity;
  subjectType?: SubjectType | null;
  subjectId?: Types.ObjectId | null;
  candidateId?: Types.ObjectId | null;
  attemptId?: Types.ObjectId | null;
  questionIndex?: number | null;
  questionId?: Types.ObjectId | null;
  clientTimestamp?: Date | null;
  message?: string;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Event types that are too chatty for the live feed (still persisted). */
const QUIET_EVENTS = new Set<SecurityEventType>(['ANSWER_SAVED']);

const candidateLabelCache = new Map<string, { name: string; code: string; at: number }>();

async function candidateLabel(id: Types.ObjectId | null | undefined) {
  if (!id) return null;
  const key = String(id);
  const hit = candidateLabelCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const c = await Candidate.findById(id, { fullName: 1, candidateCode: 1 }).lean();
  if (!c) return null;
  const v = { name: c.fullName, code: c.candidateCode, at: Date.now() };
  candidateLabelCache.set(key, v);
  return v;
}

export async function logSecurityEvent(input: SecurityEventInput, dbSession?: ClientSession) {
  const severity: SecurityEventSeverity = input.severity ?? 'INFO';
  const [doc] = await SecurityEvent.create(
    [
      {
        ...input,
        severity,
        subjectType: input.subjectType ?? (input.candidateId ? 'CANDIDATE' : null),
        subjectId: input.subjectId ?? input.candidateId ?? null,
        serverTimestamp: new Date(),
        message: input.message ?? '',
      },
    ],
    { session: dbSession },
  );
  if (!dbSession && !QUIET_EVENTS.has(input.eventType)) {
    void publishLive(doc!).catch((err) => logger.warn({ err }, 'live publish failed'));
  }
  return doc!;
}

export async function publishLive(doc: InstanceType<typeof SecurityEvent>) {
  const label = await candidateLabel(doc.candidateId);
  liveBus.publish({
    id: String(doc._id),
    eventType: doc.eventType,
    severity: doc.severity,
    source: doc.source,
    candidateId: doc.candidateId ? String(doc.candidateId) : null,
    attemptId: doc.attemptId ? String(doc.attemptId) : null,
    questionIndex: doc.questionIndex ?? null,
    message: doc.message,
    serverTimestamp: doc.serverTimestamp.toISOString(),
    candidateName: label?.name ?? null,
    candidateCode: label?.code ?? null,
  });
}

export interface AuditInput {
  action: AuditAction;
  targetType: string;
  targetId?: Types.ObjectId | null;
  targetLabel?: string;
  details?: Record<string, unknown> | null;
}

export async function audit(req: Request | null, input: AuditInput, dbSession?: ClientSession) {
  const actor = req?.admin?.user;
  await AuditLog.create(
    [
      {
        ...input,
        actorId: actor?._id ?? null,
        actorUsername: actor?.username ?? 'system',
        actorRole: actor?.role ?? 'SYSTEM',
        ip: req ? clientIp(req) : null,
        createdAt: new Date(),
      },
    ],
    { session: dbSession },
  );
}
