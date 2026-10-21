import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ATTEMPT_END_REASONS, ATTEMPT_STATUSES, RESULTS, SECURITY_EVENT_SOURCES } from '../config/constants';

const violationSchema = new Schema(
  {
    type: { type: String, required: true },
    source: { type: String, enum: SECURITY_EVENT_SOURCES, required: true },
    reason: { type: String, required: true },
    detectedAt: { type: Date, required: true },
    questionIndex: { type: Number, default: null },
    clientTimestamp: { type: Date, default: null },
    details: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

/** Candidate details exactly as they were when the attempt started. */
const candidateSnapshotSchema = new Schema(
  {
    candidateCode: { type: String, required: true },
    fullName: { type: String, required: true },
    discordUsername: { type: String, required: true },
    discordId: { type: String, default: null },
    characterName: { type: String, required: true },
    appliedRole: { type: String, required: true },
  },
  { _id: false },
);

const interviewSnapshotSchema = new Schema(
  {
    title: { type: String, required: true },
    position: { type: String, required: true },
    version: { type: Number, required: true },
    passingPercent: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    totalTimeSeconds: { type: Number, required: true },
  },
  { _id: false },
);

const scoringSchema = new Schema(
  {
    totalScore: { type: Number, default: null },
    maxScore: { type: Number, required: true },
    percentage: { type: Number, default: null },
    answeredCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    timedOutCount: { type: Number, default: 0 },
    autoScore: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * One examination attempt. The unique index on `assignmentId` is the database-level guarantee
 * that an assignment can only ever be attempted once.
 */
const attemptSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'InterviewTemplate', required: true },
    interviewVersionId: { type: Schema.Types.ObjectId, ref: 'InterviewVersion', required: true },
    attemptNumber: { type: Number, default: 1 },
    /** Short reference shown in the watermark, e.g. A7F2K9. */
    referenceCode: { type: String, required: true },
    status: { type: String, enum: ATTEMPT_STATUSES, required: true, default: 'IN_PROGRESS' },
    endReason: { type: String, enum: ATTEMPT_END_REASONS, default: null },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    /** Hard ceiling for the whole attempt: sum of timers + grace. */
    expiresAt: { type: Date, required: true },
    currentQuestionIndex: { type: Number, required: true, default: 0 },
    totalQuestions: { type: Number, required: true },

    /** Exam is bound to the session and the in-memory client instance that started it. */
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    instanceHash: { type: String, required: true, select: false },
    lastHeartbeatAt: { type: Date, required: true },
    heartbeatCount: { type: Number, default: 0 },
    acknowledgedRulesAt: { type: Date, required: true },
    preflight: { type: Schema.Types.Mixed, default: null },

    securityViolation: { type: violationSchema, default: null },
    warningCount: { type: Number, default: 0 },

    candidateSnapshot: { type: candidateSnapshotSchema, required: true },
    interviewSnapshot: { type: interviewSnapshotSchema, required: true },
    scoring: { type: scoringSchema, required: true },

    result: { type: String, enum: RESULTS, default: 'PENDING' },
    evaluatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    evaluatedAt: { type: Date, default: null },
    evaluationRevision: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'interview_attempts' },
);

attemptSchema.index({ assignmentId: 1 }, { unique: true });
attemptSchema.index({ referenceCode: 1 }, { unique: true });
attemptSchema.index({ status: 1, lastHeartbeatAt: 1 });
attemptSchema.index({ status: 1, expiresAt: 1 });
attemptSchema.index({ candidateId: 1, startedAt: -1 });
attemptSchema.index({ result: 1, endedAt: -1 });
attemptSchema.index({ templateId: 1, startedAt: -1 });
attemptSchema.index({ evaluatedBy: 1 });
attemptSchema.index({ startedAt: -1 });

export type AttemptAttrs = InferSchemaType<typeof attemptSchema>;
export type AttemptDoc = HydratedDocument<AttemptAttrs>;
export const Attempt = model('InterviewAttempt', attemptSchema);
