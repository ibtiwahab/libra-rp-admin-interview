import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  AUDIT_ACTIONS,
  SECURITY_EVENT_SEVERITIES,
  SECURITY_EVENT_SOURCES,
  SECURITY_EVENT_TYPES,
  SUBJECT_TYPES,
} from '../config/constants';
import { makeImmutable } from './immutable';

/**
 * Security & lifecycle events. `serverTimestamp` is authoritative; any client timestamp is
 * stored only as informational evidence and never used for enforcement.
 */
const securityEventSchema = new Schema(
  {
    eventType: { type: String, enum: SECURITY_EVENT_TYPES, required: true },
    source: { type: String, enum: SECURITY_EVENT_SOURCES, required: true },
    severity: { type: String, enum: SECURITY_EVENT_SEVERITIES, required: true, default: 'INFO' },
    subjectType: { type: String, enum: SUBJECT_TYPES, default: null },
    subjectId: { type: Schema.Types.ObjectId, default: null },
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', default: null },
    attemptId: { type: Schema.Types.ObjectId, ref: 'InterviewAttempt', default: null },
    questionIndex: { type: Number, default: null },
    questionId: { type: Schema.Types.ObjectId, default: null },
    serverTimestamp: { type: Date, required: true, default: () => new Date() },
    clientTimestamp: { type: Date, default: null },
    message: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { collection: 'security_events', versionKey: false },
);
securityEventSchema.index({ serverTimestamp: -1 });
securityEventSchema.index({ attemptId: 1, serverTimestamp: 1 });
securityEventSchema.index({ candidateId: 1, serverTimestamp: -1 });
securityEventSchema.index({ eventType: 1, serverTimestamp: -1 });
securityEventSchema.index({ severity: 1, serverTimestamp: -1 });
makeImmutable(securityEventSchema, 'SecurityEvent');

export type SecurityEventAttrs = InferSchemaType<typeof securityEventSchema>;
export const SecurityEvent = model('SecurityEvent', securityEventSchema);

/** Administrative audit trail. Append-only; no API exposes mutation. */
const auditLogSchema = new Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorUsername: { type: String, default: 'system' },
    actorRole: { type: String, default: 'SYSTEM' },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: '' },
    details: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'audit_logs', versionKey: false },
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
makeImmutable(auditLogSchema, 'AuditLog');

export type AuditLogAttrs = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
