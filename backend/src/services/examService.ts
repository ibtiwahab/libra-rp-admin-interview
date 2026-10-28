import { Types, type ClientSession } from 'mongoose';
import type { z } from 'zod';
import {
  DISQUALIFYING_CLIENT_EVENTS,
  type AttemptEndReason,
  type ClientEventType,
  type SecurityEventSource,
  type SecurityEventType,
} from '../config/constants';
import { withTransaction } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { CandidateContext } from '../middleware/auth';
import {
  Answer,
  Assignment,
  Attempt,
  Candidate,
  InterviewVersion,
  type AnswerDoc,
  type AttemptDoc,
  type QuestionSnapshot,
} from '../models';
import { revokeAllSessions, revokeSession } from '../security/sessions';
import { hmac, safeEqual, shortCode } from '../utils/crypto';
import { AppError, badRequest, conflict, forbidden, gone, notFound } from '../utils/errors';
import type { heartbeatSchema, saveAnswerSchema, securityEventSchema, startSchema, submitAnswerSchema } from '../validators/exam';
import { logSecurityEvent } from './logService';

type StartInput = z.infer<typeof startSchema>;
type SaveInput = z.infer<typeof saveAnswerSchema>;
type SubmitInput = z.infer<typeof submitAnswerSchema>;
type HeartbeatInput = z.infer<typeof heartbeatSchema>;
type SecurityEventInput = z.infer<typeof securityEventSchema>;

const GRACE = () => env.SUBMISSION_GRACE_MS;

export const VIOLATION_REASONS: Record<string, string> = {
  TAB_HIDDEN: 'The examination tab was hidden (tab switch, minimise or screen lock).',
  WINDOW_BLURRED: 'The examination window lost focus (another application or window was activated).',
  PAGE_EXIT: 'The examination page was closed, reloaded or navigated away from.',
  PAGE_RELOAD_DETECTED: 'The examination was reloaded or opened in another tab or window.',
  HEARTBEAT_TIMEOUT: 'No heartbeat was received from the examination window within the allowed period.',
  EXAM_WINDOW_EXPIRED: 'The maximum examination duration elapsed.',
  ADMIN_TERMINATED: 'The attempt was terminated by Libra RP Management.',
};

export const instanceHash = (instanceId: string) => hmac(instanceId, 'exam-instance');

// ───────────────────────────── grading helpers ─────────────────────────────

export function autoScore(q: QuestionSnapshot, a: { selectedOptionKeys?: string[] | null; booleanAnswer?: boolean | null }): number | null {
  if (q.type === 'MULTIPLE_CHOICE') {
    const sel = [...new Set(a.selectedOptionKeys ?? [])].sort();
    const correct = [...(q.correctOptionKeys ?? [])].sort();
    return sel.length > 0 && sel.length === correct.length && sel.every((k, i) => k === correct[i]) ? q.maxScore : 0;
  }
  if (q.type === 'TRUE_FALSE') {
    return a.booleanAnswer !== null && a.booleanAnswer !== undefined && a.booleanAnswer === q.correctBoolean ? q.maxScore : 0;
  }
  return null;
}

function hasResponse(a: { answerText?: string | null; selectedOptionKeys?: string[] | null; booleanAnswer?: boolean | null }): boolean {
  return Boolean((a.answerText && a.answerText.trim().length) || (a.selectedOptionKeys && a.selectedOptionKeys.length) || typeof a.booleanAnswer === 'boolean');
}

/** Validates an answer payload against the delivered question and returns the normalised patch. */
function answerPatch(q: QuestionSnapshot, input: Pick<SaveInput, 'answerText' | 'selectedOptionKeys' | 'booleanAnswer'>) {
  const patch: { answerText: string; selectedOptionKeys: string[]; booleanAnswer: boolean | null } = {
    answerText: '',
    selectedOptionKeys: [],
    booleanAnswer: null,
  };
  if (q.type === 'MULTIPLE_CHOICE') {
    const keys = [...new Set(input.selectedOptionKeys ?? [])];
    const valid = new Set((q.options ?? []).map((o) => o.key));
    if (!keys.every((k) => valid.has(k))) throw badRequest('Invalid option selected', 'INVALID_ANSWER');
    if (!q.allowMultiple && keys.length > 1) throw badRequest('Only one option may be selected', 'INVALID_ANSWER');
    patch.selectedOptionKeys = keys.sort();
  } else if (q.type === 'TRUE_FALSE') {
    patch.booleanAnswer = typeof input.booleanAnswer === 'boolean' ? input.booleanAnswer : null;
  } else {
    const max = q.type === 'SHORT_TEXT' ? 1000 : 5000;
    const t = (input.answerText ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (t.length > max) throw badRequest(`Answer exceeds ${max} characters`, 'ANSWER_TOO_LONG');
    patch.answerText = t;
  }
  return patch;
}

// ───────────────────────────── payloads ─────────────────────────────

export type ExamState =
  | ReturnType<typeof questionPayload>
  | ReturnType<typeof terminalPayload>;

function questionPayload(attempt: AttemptDoc, answer: AnswerDoc) {
  const q = answer.question;
  const now = Date.now();
  return {
    state: 'IN_PROGRESS' as const,
    attempt: {
      id: String(attempt._id),
      referenceCode: attempt.referenceCode,
      currentQuestionIndex: attempt.currentQuestionIndex,
      totalQuestions: attempt.totalQuestions,
      startedAt: attempt.startedAt,
      title: attempt.interviewSnapshot.title,
    },
    question: {
      index: answer.questionIndex,
      title: q.title,
      prompt: q.prompt,
      scenario: q.scenario,
      type: q.type,
      category: q.categoryName,
      difficulty: q.difficulty,
      maxScore: q.maxScore,
      timeLimitSeconds: answer.allowedSeconds,
      allowMultiple: q.allowMultiple,
      // never the answer key or rubric
      options: (q.options ?? []).map((o) => ({ key: o.key, text: o.text })),
    },
    timing: {
      activatedAt: answer.activatedAt.toISOString(),
      deadlineAt: answer.deadlineAt.toISOString(),
      serverNow: new Date(now).toISOString(),
      remainingMs: Math.max(0, answer.deadlineAt.getTime() - now),
    },
    saved: {
      answerText: answer.answerText,
      selectedOptionKeys: answer.selectedOptionKeys,
      booleanAnswer: answer.booleanAnswer,
      saveSeq: answer.saveSeq,
      lastSavedAt: answer.lastSavedAt,
    },
    watermark: {
      candidateCode: attempt.candidateSnapshot.candidateCode,
      candidateRef: String(attempt.candidateId).slice(-6).toUpperCase(),
      referenceCode: attempt.referenceCode,
    },
    heartbeatIntervalSeconds: env.HEARTBEAT_INTERVAL_SECONDS,
  };
}

function terminalPayload(attempt: Pick<AttemptDoc, 'status' | 'referenceCode' | 'endedAt' | 'totalQuestions' | 'scoring' | 'interviewSnapshot'>) {
  return {
    state: attempt.status as 'COMPLETED' | 'DISQUALIFIED' | 'EXPIRED',
    referenceCode: attempt.referenceCode,
    endedAt: attempt.endedAt,
    title: attempt.interviewSnapshot.title,
    totalQuestions: attempt.totalQuestions,
    answeredCount: attempt.scoring?.answeredCount ?? 0,
    // Deliberately generic: detection specifics are never revealed to candidates.
    reason: attempt.status === 'DISQUALIFIED' ? 'EXAMINATION_SECURITY_POLICY' : attempt.status === 'EXPIRED' ? 'SESSION_EXPIRED' : null,
  };
}

// ───────────────────────────── state transitions ─────────────────────────────

async function computeScoring(attempt: Pick<AttemptDoc, '_id' | 'totalQuestions' | 'scoring'>, session: ClientSession) {
  const answers = await Answer.find({ attemptId: attempt._id }, { hasResponse: 1, status: 1, autoScore: 1 }).session(session).lean();
  const answered = answers.filter((a) => a.hasResponse).length;
  return {
    'scoring.answeredCount': answered,
    'scoring.unansweredCount': attempt.totalQuestions - answered,
    'scoring.timedOutCount': answers.filter((a) => a.status === 'TIMED_OUT').length,
    'scoring.autoScore': answers.reduce((s, a) => s + (a.autoScore ?? 0), 0),
  };
}

interface PendingEvent {
  eventType: SecurityEventType;
  source: SecurityEventSource;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  questionIndex?: number | null;
  questionId?: Types.ObjectId | null;
  message: string;
  metadata?: Record<string, unknown>;
  clientTimestamp?: Date | null;
}

async function flushEvents(attempt: Pick<AttemptDoc, '_id' | 'candidateId'>, events: PendingEvent[]) {
  for (const e of events) {
    await logSecurityEvent({ ...e, candidateId: attempt.candidateId, attemptId: attempt._id }).catch((err) =>
      logger.error({ err }, 'failed to record security event'),
    );
  }
}

function activationFor(attemptId: Types.ObjectId, candidateId: Types.ObjectId, q: QuestionSnapshot, index: number, now: Date) {
  return {
    attemptId,
    candidateId,
    questionIndex: index,
    question: q,
    status: 'ACTIVE' as const,
    activatedAt: now,
    deadlineAt: new Date(now.getTime() + q.timeLimitSeconds * 1000),
    allowedSeconds: q.timeLimitSeconds,
  };
}

/**
 * Closes question `fromIndex` and activates the next one (or completes the attempt) atomically.
 * Compare-and-set on both the answer status and the attempt's currentQuestionIndex means that
 * concurrent submit/timeout/reconcile calls can never double-advance or skip a question.
 * Returns false when another actor already performed the transition.
 */
async function advance(
  attemptId: Types.ObjectId,
  fromIndex: number,
  closeAs: 'SUBMITTED' | 'TIMED_OUT',
  patch?: { seq: number; fields: ReturnType<typeof answerPatch> },
): Promise<boolean> {
  const events: PendingEvent[] = [];
  let attemptRef: { _id: Types.ObjectId; candidateId: Types.ObjectId } | null = null;

  const done = await withTransaction(async (session) => {
    events.length = 0;
    const now = new Date();
    const attempt = await Attempt.findOne({ _id: attemptId, status: 'IN_PROGRESS', currentQuestionIndex: fromIndex }).session(session);
    if (!attempt) return false;
    attemptRef = { _id: attempt._id, candidateId: attempt.candidateId };

    if (patch) {
      await Answer.updateOne(
        { attemptId, questionIndex: fromIndex, status: 'ACTIVE', saveSeq: { $lt: patch.seq } },
        { $set: { ...patch.fields, saveSeq: patch.seq, lastSavedAt: now, hasResponse: hasResponse(patch.fields) }, $inc: { saveCount: 1 } },
        { session },
      );
    }

    const current = await Answer.findOne({ attemptId, questionIndex: fromIndex, status: 'ACTIVE' }).session(session);
    if (!current) return false;
    const score = autoScore(current.question, current);
    await Answer.updateOne(
      { _id: current._id, status: 'ACTIVE' },
      { $set: { status: closeAs, closedAt: now, submittedAt: closeAs === 'SUBMITTED' ? now : null, autoScore: score, ...(score !== null ? { awardedScore: score } : {}) } },
      { session },
    );
    events.push({
      eventType: closeAs === 'SUBMITTED' ? 'QUESTION_SUBMITTED' : 'QUESTION_TIMEOUT',
      source: 'SERVER',
      questionIndex: fromIndex,
      questionId: current.question.questionId,
      message: closeAs === 'SUBMITTED' ? `Question ${fromIndex + 1} submitted` : `Question ${fromIndex + 1} closed by timer`,
      metadata: { elapsedMs: now.getTime() - current.activatedAt.getTime(), hasResponse: current.hasResponse || (patch ? hasResponse(patch.fields) : false) },
    });

    const nextIndex = fromIndex + 1;
    if (nextIndex < attempt.totalQuestions) {
      const version = await InterviewVersion.findById(attempt.interviewVersionId, { questions: 1 }).session(session).lean();
      const nextQ = version?.questions.find((q) => q.order === nextIndex) ?? version?.questions[nextIndex];
      if (!nextQ) throw new AppError(500, 'VERSION_CORRUPT', 'Interview version is missing a question');
      const moved = await Attempt.updateOne(
        { _id: attempt._id, status: 'IN_PROGRESS', currentQuestionIndex: fromIndex },
        { $set: { currentQuestionIndex: nextIndex } },
        { session },
      );
      if (moved.modifiedCount !== 1) throw new AppError(409, 'CONCURRENT_TRANSITION', 'Concurrent transition');
      await Answer.create([activationFor(attempt._id, attempt.candidateId, nextQ, nextIndex, now)], { session });
      events.push({ eventType: 'QUESTION_STARTED', source: 'SERVER', questionIndex: nextIndex, questionId: nextQ.questionId, message: `Question ${nextIndex + 1} started`, metadata: { allowedSeconds: nextQ.timeLimitSeconds } });
    } else {
      const scoring = await computeScoring(attempt, session);
      const moved = await Attempt.updateOne(
        { _id: attempt._id, status: 'IN_PROGRESS', currentQuestionIndex: fromIndex },
        { $set: { status: 'COMPLETED', endedAt: now, endReason: 'ALL_QUESTIONS_ANSWERED', currentQuestionIndex: attempt.totalQuestions, ...scoring } },
        { session },
      );
      if (moved.modifiedCount !== 1) throw new AppError(409, 'CONCURRENT_TRANSITION', 'Concurrent transition');
      await Assignment.updateOne({ _id: attempt.assignmentId }, { $set: { status: 'COMPLETED', isOpen: false, closedAt: now } }, { session });
      events.push({ eventType: 'INTERVIEW_COMPLETED', source: 'SERVER', message: 'Interview completed', metadata: { answered: scoring['scoring.answeredCount'], timedOut: scoring['scoring.timedOutCount'] } });
    }
    return true;
  }).catch((err) => {
    if (err instanceof AppError && err.code === 'CONCURRENT_TRANSITION') return false;
    throw err;
  });

  if (done && attemptRef) await flushEvents(attemptRef, events);
  return done;
}

export interface TerminationInput {
  status: 'DISQUALIFIED' | 'EXPIRED';
  endReason: AttemptEndReason;
  violation: {
    type: string;
    source: SecurityEventSource;
    reason: string;
    questionIndex?: number | null;
    clientTimestamp?: Date | null;
    details?: Record<string, unknown> | null;
  };
}

/**
 * Moves an IN_PROGRESS attempt to a terminal state. Idempotent: a second call (duplicate or
 * delayed event) finds no IN_PROGRESS attempt and returns false without touching anything.
 * Saved answers are preserved; the active question is frozen with its last saved content.
 */
export async function terminateAttempt(attemptId: Types.ObjectId, input: TerminationInput): Promise<boolean> {
  let snapshot: { _id: Types.ObjectId; candidateId: Types.ObjectId; sessionId: Types.ObjectId; currentQuestionIndex: number } | null = null;

  const changed = await withTransaction(async (session) => {
    const now = new Date();
    const attempt = await Attempt.findOne({ _id: attemptId, status: 'IN_PROGRESS' }).session(session);
    if (!attempt) return false;
    snapshot = { _id: attempt._id, candidateId: attempt.candidateId, sessionId: attempt.sessionId, currentQuestionIndex: attempt.currentQuestionIndex };

    // Freeze the active question with its last saved content (objective answers are still auto-graded
    // so that evaluators of expired attempts see a complete picture).
    const activeAnswers = await Answer.find({ attemptId: attempt._id, status: 'ACTIVE' }).session(session);
    for (const a of activeAnswers) {
      const score = autoScore(a.question, a);
      await Answer.updateOne(
        { _id: a._id, status: 'ACTIVE' },
        { $set: { status: 'TERMINATED', closedAt: now, autoScore: score, ...(score !== null ? { awardedScore: score } : {}) } },
        { session },
      );
    }
    const scoring = await computeScoring(attempt, session);
    const res = await Attempt.updateOne(
      { _id: attempt._id, status: 'IN_PROGRESS' },
      {
        $set: {
          status: input.status,
          endReason: input.endReason,
          endedAt: now,
          result: input.status === 'DISQUALIFIED' ? 'DISQUALIFIED' : 'PENDING',
          securityViolation: {
            type: input.violation.type,
            source: input.violation.source,
            reason: input.violation.reason,
            detectedAt: now,
            questionIndex: input.violation.questionIndex ?? attempt.currentQuestionIndex,
            clientTimestamp: input.violation.clientTimestamp ?? null,
            details: input.violation.details ?? null,
          },
          ...scoring,
        },
      },
      { session },
    );
    if (res.modifiedCount !== 1) return false;
    await Assignment.updateOne({ _id: attempt.assignmentId }, { $set: { status: input.status, isOpen: false, closedAt: now } }, { session });
    // The exam session (and any other candidate session) is revoked in the same transaction.
    await revokeSession(attempt.sessionId, `ATTEMPT_${input.status}`, session);
    await revokeAllSessions('CANDIDATE', attempt.candidateId, `ATTEMPT_${input.status}`, { dbSession: session });
    return true;
  });

  if (changed && snapshot) {
    const s = snapshot as { _id: Types.ObjectId; candidateId: Types.ObjectId; currentQuestionIndex: number };
    await flushEvents(s, [
      {
        eventType: input.status === 'DISQUALIFIED' ? (input.endReason === 'ADMIN_TERMINATED' ? 'INTERVIEW_TERMINATED_BY_ADMIN' : 'INTERVIEW_DISQUALIFIED') : 'INTERVIEW_EXPIRED',
        source: input.violation.source === 'CLIENT_REPORTED' ? 'SERVER' : input.violation.source,
        severity: 'CRITICAL',
        questionIndex: input.violation.questionIndex ?? s.currentQuestionIndex,
        message: `${input.status === 'DISQUALIFIED' ? 'Disqualified' : 'Expired'} — ${input.violation.reason}`,
        metadata: { violationType: input.violation.type, violationSource: input.violation.source },
      },
      { eventType: 'SESSION_REVOKED', source: 'SERVER', message: 'Examination session revoked', metadata: { reason: `ATTEMPT_${input.status}` } },
    ]);
  }
  return changed;
}

/**
 * Brings an attempt up to date with server time: closes any question whose deadline (plus network
 * grace) has passed and expires the attempt if its overall ceiling elapsed. Safe to call from any
 * request and from the background reconciler concurrently.
 */
export async function reconcileAttempt(attemptId: Types.ObjectId): Promise<void> {
  for (let guard = 0; guard < 500; guard++) {
    const attempt = await Attempt.findOne({ _id: attemptId, status: 'IN_PROGRESS' }, { currentQuestionIndex: 1, expiresAt: 1 }).lean();
    if (!attempt) return;
    const now = Date.now();
    if (attempt.expiresAt.getTime() < now) {
      await terminateAttempt(attempt._id, {
        status: 'EXPIRED',
        endReason: 'EXAM_WINDOW_EXPIRED',
        violation: { type: 'EXAM_WINDOW_EXPIRED', source: 'SERVER', reason: VIOLATION_REASONS.EXAM_WINDOW_EXPIRED! },
      });
      return;
    }
    const active = await Answer.findOne({ attemptId, questionIndex: attempt.currentQuestionIndex, status: 'ACTIVE' }, { deadlineAt: 1 }).lean();
    if (!active) {
      await repairMissingActivation(attemptId);
      return;
    }
    if (active.deadlineAt.getTime() + GRACE() >= now) return;
    const moved = await advance(attemptId, attempt.currentQuestionIndex, 'TIMED_OUT');
    if (!moved) {
      // someone else advanced; loop again to re-check the new current question
    }
  }
}

/** Defensive repair: an IN_PROGRESS attempt whose current question has no ACTIVE answer document. */
async function repairMissingActivation(attemptId: Types.ObjectId) {
  const attempt = await Attempt.findOne({ _id: attemptId, status: 'IN_PROGRESS' }).lean();
  if (!attempt) return;
  const existing = await Answer.findOne({ attemptId, questionIndex: attempt.currentQuestionIndex }).lean();
  if (existing) return; // closed but not advanced — next reconcile tick will handle via advance()
  const version = await InterviewVersion.findById(attempt.interviewVersionId, { questions: 1 }).lean();
  const q = version?.questions[attempt.currentQuestionIndex];
  if (!q) return;
  await Answer.create(activationFor(attempt._id, attempt.candidateId, q, attempt.currentQuestionIndex, new Date())).catch((err) => {
    if (err?.code !== 11000) throw err;
  });
}

// ───────────────────────────── candidate-facing operations ─────────────────────────────

/** The assignment that governs what the candidate sees: the open one, else the most recent. */
async function currentAssignment(candidateId: Types.ObjectId) {
  const open = await Assignment.findOne({ candidateId, isOpen: true }).lean();
  if (open) return open;
  return Assignment.findOne({ candidateId, status: { $ne: 'CANCELLED' } }).sort({ assignedAt: -1 }).lean();
}

function windowState(version: { availableFrom?: Date | null; availableUntil?: Date | null }, startDeadline?: Date | null) {
  const now = new Date();
  if (version.availableFrom && version.availableFrom > now) return 'NOT_YET_OPEN' as const;
  if (version.availableUntil && version.availableUntil < now) return 'CLOSED' as const;
  if (startDeadline && startDeadline < now) return 'CLOSED' as const;
  return 'OPEN' as const;
}

export async function getStatus(ctx: CandidateContext) {
  const { candidate, session } = ctx;
  let assignment = await currentAssignment(candidate._id);
  if (assignment?.status === 'IN_PROGRESS' && assignment.attemptId) {
    await reconcileAttempt(assignment.attemptId);
    assignment = await Assignment.findById(assignment._id).lean();
  }

  const base = {
    candidate: {
      fullName: candidate.fullName,
      candidateCode: candidate.candidateCode,
      characterName: candidate.characterName,
      appliedRole: candidate.appliedRole,
    },
    serverNow: new Date().toISOString(),
  };
  if (!assignment) return { ...base, state: 'NO_ASSIGNMENT' as const };

  const version = await InterviewVersion.findById(assignment.interviewVersionId, { title: 1, position: 1, totalQuestions: 1, totalTimeSeconds: 1, availableFrom: 1, availableUntil: 1 }).lean();
  const interview = version
    ? { title: version.title, position: version.position, totalQuestions: version.totalQuestions, totalTimeSeconds: version.totalTimeSeconds, availableFrom: version.availableFrom, availableUntil: version.availableUntil }
    : null;

  if (assignment.status === 'NOT_STARTED') {
    const resume = await resumeInfo(assignment.attemptId);
    const w = resume ? windowState({}, assignment.startDeadline) : version ? windowState(version, assignment.startDeadline) : 'CLOSED';
    return { ...base, state: 'NOT_STARTED' as const, window: w, startDeadline: assignment.startDeadline, interview, resume };
  }

  const attempt = assignment.attemptId ? await Attempt.findById(assignment.attemptId).lean() : null;
  if (assignment.status === 'IN_PROGRESS' && attempt) {
    const bound = String(attempt.sessionId) === String(session._id);
    return { ...base, state: 'IN_PROGRESS' as const, interview, attempt: { referenceCode: attempt.referenceCode, startedAt: attempt.startedAt, currentQuestionIndex: attempt.currentQuestionIndex, totalQuestions: attempt.totalQuestions, boundToThisSession: bound } };
  }
  if (attempt) {
    return { ...base, state: attempt.status as 'COMPLETED' | 'DISQUALIFIED' | 'EXPIRED', interview, result: terminalPayload(attempt as any) };
  }
  return { ...base, state: assignment.status as 'CANCELLED' | 'EXPIRED', interview };
}

export async function getInstructions(ctx: CandidateContext) {
  const assignment = await Assignment.findOne({ candidateId: ctx.candidate._id, status: 'NOT_STARTED' }).lean();
  if (!assignment) throw conflict('There is no interview awaiting your start', 'NO_PENDING_INTERVIEW');
  const v = await InterviewVersion.findById(assignment.interviewVersionId).lean();
  if (!v) throw conflict('Interview unavailable', 'NO_PENDING_INTERVIEW');
  const timers = v.questions.map((q) => q.timeLimitSeconds);
  const resume = await resumeInfo(assignment.attemptId);
  return {
    interview: {
      title: v.title,
      description: v.description,
      position: v.position,
      instructions: v.instructions,
      totalQuestions: v.totalQuestions,
      totalTimeSeconds: v.totalTimeSeconds,
      shortestTimerSeconds: Math.min(...timers),
      longestTimerSeconds: Math.max(...timers),
      // Category breakdown only; no question content before the attempt starts.
      categories: [...new Set(v.questions.map((q) => q.categoryName))],
      availableUntil: v.availableUntil,
    },
    window: resume ? windowState({}, assignment.startDeadline) : windowState(v, assignment.startDeadline),
    startDeadline: assignment.startDeadline,
    resume,
    policy: {
      heartbeatIntervalSeconds: env.HEARTBEAT_INTERVAL_SECONDS,
      heartbeatTimeoutSeconds: env.HEARTBEAT_TIMEOUT_SECONDS,
      heartbeatTimeoutAction: env.HEARTBEAT_TIMEOUT_ACTION,
      submissionGraceMs: env.SUBMISSION_GRACE_MS,
    },
  };
}

export async function startAttempt(ctx: CandidateContext, input: StartInput) {
  const { candidate, session } = ctx;
  if (!input.preflight.visibilityApi || !input.preflight.focused || !input.preflight.cookies) {
    throw badRequest('Your browser did not pass the required system checks', 'PREFLIGHT_FAILED');
  }

  const pending = await Assignment.findOne({ candidateId: candidate._id, isOpen: true }).lean();
  if (!pending) {
    const last = await currentAssignment(candidate._id);
    if (last?.attemptId) throw conflict('Your interview attempt has already been used', 'ATTEMPT_ALREADY_CONSUMED');
    throw conflict('There is no interview awaiting your start', 'NO_PENDING_INTERVIEW');
  }
  if (pending.status !== 'NOT_STARTED') {
    await logSecurityEvent({ eventType: 'STALE_SESSION_REQUEST', source: 'SERVER', severity: 'WARNING', candidateId: candidate._id, attemptId: pending.attemptId, message: 'Start requested for an attempt that already began' });
    throw conflict('Your interview attempt has already been used', 'ATTEMPT_ALREADY_CONSUMED');
  }
  if (pending.attemptId) return resumeAttempt(ctx, input, { _id: pending._id, attemptId: pending.attemptId, startDeadline: pending.startDeadline });
  const version = await InterviewVersion.findById(pending.interviewVersionId).lean();
  if (!version || !version.questions.length) throw conflict('Interview unavailable', 'NO_PENDING_INTERVIEW');
  const w = windowState(version, pending.startDeadline);
  if (w === 'NOT_YET_OPEN') throw forbidden('This interview is not open yet', 'WINDOW_NOT_OPEN');
  if (w === 'CLOSED') throw forbidden('The window for this interview has closed', 'WINDOW_CLOSED');

  const first = version.questions.find((q) => q.order === 0) ?? version.questions[0]!;
  let attemptId: Types.ObjectId | null = null;

  for (let tries = 0; tries < 3 && !attemptId; tries++) {
    try {
      attemptId = await withTransaction(async (tx) => {
        const now = new Date();
        // Atomic gate: exactly one request can move NOT_STARTED → IN_PROGRESS.
        const claimed = await Assignment.findOneAndUpdate(
          { _id: pending._id, candidateId: candidate._id, status: 'NOT_STARTED' },
          { $set: { status: 'IN_PROGRESS', startedAt: now } },
          { new: true, session: tx },
        );
        if (!claimed) throw conflict('Your interview attempt has already been used', 'ATTEMPT_ALREADY_CONSUMED');

        const ceilingMs = version.totalTimeSeconds * 1000 + version.totalQuestions * (GRACE() + 5000) + 60_000;
        const [attempt] = await Attempt.create(
          [
            {
              assignmentId: claimed._id,
              candidateId: candidate._id,
              templateId: claimed.templateId,
              interviewVersionId: version._id,
              attemptNumber: 1,
              referenceCode: `A${shortCode(5)}`,
              status: 'IN_PROGRESS',
              startedAt: now,
              expiresAt: new Date(now.getTime() + ceilingMs),
              currentQuestionIndex: 0,
              totalQuestions: version.totalQuestions,
              sessionId: session._id,
              instanceHash: instanceHash(input.instanceId),
              lastHeartbeatAt: now,
              acknowledgedRulesAt: now,
              preflight: input.preflight,
              candidateSnapshot: {
                candidateCode: candidate.candidateCode,
                fullName: candidate.fullName,
                discordUsername: candidate.discordUsername,
                discordId: candidate.discordId ?? null,
                characterName: candidate.characterName,
                appliedRole: candidate.appliedRole,
              },
              interviewSnapshot: {
                title: version.title,
                position: version.position,
                version: version.version,
                passingPercent: version.passingPercent,
                maxScore: version.maxScore,
                totalTimeSeconds: version.totalTimeSeconds,
              },
              scoring: { maxScore: version.maxScore, unansweredCount: version.totalQuestions },
            },
          ],
          { session: tx },
        );
        await Answer.create([activationFor(attempt!._id, candidate._id, first, 0, now)], { session: tx });
        await Assignment.updateOne({ _id: claimed._id }, { $set: { attemptId: attempt!._id } }, { session: tx });
        return attempt!._id;
      });
    } catch (err: any) {
      // Reference-code collision: retry with a fresh code. Anything else propagates.
      if (err?.code === 11000 && String(err?.message ?? '').includes('referenceCode')) continue;
      if (err?.code === 11000) throw conflict('Your interview attempt has already been used', 'ATTEMPT_ALREADY_CONSUMED');
      throw err;
    }
  }
  if (!attemptId) throw new AppError(500, 'START_FAILED', 'Unable to start the interview. Try again.');

  // Any other session this candidate holds is revoked: the exam is bound to this one.
  await revokeAllSessions('CANDIDATE', candidate._id, 'EXAM_BOUND_TO_OTHER_SESSION', { exceptId: session._id });
  await flushEvents({ _id: attemptId, candidateId: candidate._id }, [
    { eventType: 'INTERVIEW_STARTED', source: 'SERVER', message: `Interview started — ${version.title} v${version.version}`, metadata: { totalQuestions: version.totalQuestions, preflight: input.preflight } },
    { eventType: 'QUESTION_STARTED', source: 'SERVER', questionIndex: 0, questionId: first.questionId, message: 'Question 1 started', metadata: { allowedSeconds: first.timeLimitSeconds } },
  ]);
  return currentQuestion(ctx, input.instanceId);
}

/**
 * Loads the candidate's IN_PROGRESS attempt and verifies that the request comes from the
 * session *and* the page instance that started it. A different instance means the exam page
 * was reloaded or opened elsewhere, which the policy treats as leaving the examination.
 */
async function guardActive(ctx: CandidateContext, instanceId: string | undefined): Promise<AttemptDoc | ReturnType<typeof terminalPayload>> {
  const attempt = await Attempt.findOne({ candidateId: ctx.candidate._id, status: 'IN_PROGRESS' }).select('+instanceHash');
  if (!attempt) {
    const last = await Attempt.findOne({ candidateId: ctx.candidate._id }).sort({ startedAt: -1 }).lean();
    if (last) return terminalPayload(last as any);
    throw conflict('Your interview has not started', 'NOT_STARTED');
  }
  if (String(attempt.sessionId) !== String(ctx.session._id)) {
    await logSecurityEvent({ eventType: 'STALE_SESSION_REQUEST', source: 'SERVER', severity: 'CRITICAL', candidateId: attempt.candidateId, attemptId: attempt._id, message: 'Exam request from a session that does not own the attempt' });
    throw forbidden('This session does not own the active interview', 'EXAM_SESSION_MISMATCH');
  }
  if (!instanceId || !safeEqual(instanceHash(instanceId), attempt.instanceHash)) {
    await logSecurityEvent({
      eventType: 'PAGE_RELOAD_DETECTED',
      source: 'SERVER',
      severity: 'CRITICAL',
      candidateId: attempt.candidateId,
      attemptId: attempt._id,
      questionIndex: attempt.currentQuestionIndex,
      message: 'Exam request from a different page instance (reload, new tab or new window)',
    });
    await terminateAttempt(attempt._id, {
      status: 'DISQUALIFIED',
      endReason: 'FOCUS_VIOLATION',
      violation: { type: 'PAGE_RELOAD_DETECTED', source: 'SERVER', reason: VIOLATION_REASONS.PAGE_RELOAD_DETECTED!, questionIndex: attempt.currentQuestionIndex },
    });
    const ended = await Attempt.findById(attempt._id).lean();
    return terminalPayload(ended as any);
  }
  await reconcileAttempt(attempt._id);
  const fresh = await Attempt.findById(attempt._id);
  if (!fresh || fresh.status !== 'IN_PROGRESS') return terminalPayload((fresh ?? attempt) as any);
  return fresh;
}

const isTerminal = (v: unknown): v is ReturnType<typeof terminalPayload> => typeof v === 'object' && v !== null && 'state' in v;

export async function currentQuestion(ctx: CandidateContext, instanceId: string | undefined): Promise<ExamState> {
  const attempt = await guardActive(ctx, instanceId);
  if (isTerminal(attempt)) return attempt;
  const answer = await Answer.findOne({ attemptId: attempt._id, questionIndex: attempt.currentQuestionIndex, status: 'ACTIVE' });
  if (!answer) {
    await repairMissingActivation(attempt._id);
    const repaired = await Answer.findOne({ attemptId: attempt._id, questionIndex: attempt.currentQuestionIndex, status: 'ACTIVE' });
    if (!repaired) throw new AppError(503, 'EXAM_TRANSITIONING', 'The interview is updating. Retry momentarily.');
    return questionPayload(attempt, repaired);
  }
  return questionPayload(attempt, answer);
}

// Throttle ANSWER_SAVED events to one per question per 10 seconds per process.
const lastSaveLog = new Map<string, number>();

export async function saveAnswer(ctx: CandidateContext, instanceId: string | undefined, input: SaveInput) {
  const attempt = await guardActive(ctx, instanceId);
  if (isTerminal(attempt)) throw gone('This interview is no longer accepting answers', 'EXAM_ENDED', attempt);
  if (input.questionIndex !== attempt.currentQuestionIndex) {
    throw conflict('This question is closed', 'QUESTION_CLOSED', { currentQuestionIndex: attempt.currentQuestionIndex });
  }
  const current = await Answer.findOne({ attemptId: attempt._id, questionIndex: input.questionIndex }).lean();
  if (!current) throw conflict('This question is closed', 'QUESTION_CLOSED');
  const fields = answerPatch(current.question, input);
  const now = new Date();

  const res = await Answer.updateOne(
    {
      attemptId: attempt._id,
      questionIndex: input.questionIndex,
      status: 'ACTIVE',
      deadlineAt: { $gte: new Date(now.getTime() - GRACE()) },
      saveSeq: { $lt: input.seq },
    },
    { $set: { ...fields, saveSeq: input.seq, lastSavedAt: now, hasResponse: hasResponse(fields) }, $inc: { saveCount: 1 } },
  );

  if (res.modifiedCount === 1) {
    const key = `${attempt._id}:${input.questionIndex}`;
    if ((lastSaveLog.get(key) ?? 0) < now.getTime() - 10_000) {
      lastSaveLog.set(key, now.getTime());
      if (lastSaveLog.size > 5000) lastSaveLog.clear();
      void logSecurityEvent({ eventType: 'ANSWER_SAVED', source: 'SERVER', candidateId: attempt.candidateId, attemptId: attempt._id, questionIndex: input.questionIndex, message: 'Answer autosaved', metadata: { seq: input.seq, length: fields.answerText.length } });
    }
    return { saved: true, seq: input.seq, savedAt: now.toISOString(), stale: false };
  }

  const after = await Answer.findOne({ attemptId: attempt._id, questionIndex: input.questionIndex }).lean();
  if (!after || after.status !== 'ACTIVE' || after.deadlineAt.getTime() + GRACE() < now.getTime()) {
    await logSecurityEvent({ eventType: 'LATE_SUBMISSION_REJECTED', source: 'SERVER', severity: 'WARNING', candidateId: attempt.candidateId, attemptId: attempt._id, questionIndex: input.questionIndex, message: 'Autosave after question deadline rejected' });
    throw conflict('Submission closed for this question', 'QUESTION_CLOSED', { currentQuestionIndex: attempt.currentQuestionIndex });
  }
  // A newer save already landed — this one was delayed in transit and is ignored.
  return { saved: false, seq: after.saveSeq, savedAt: after.lastSavedAt?.toISOString() ?? null, stale: true };
}

export async function submitAnswer(ctx: CandidateContext, instanceId: string | undefined, input: SubmitInput) {
  const attempt = await guardActive(ctx, instanceId);
  if (isTerminal(attempt)) return { submission: 'CLOSED' as const, next: attempt };

  if (input.questionIndex !== attempt.currentQuestionIndex) {
    // The server already closed this question (deadline + grace elapsed). Report the live state.
    await logSecurityEvent({ eventType: 'LATE_SUBMISSION_REJECTED', source: 'SERVER', severity: 'WARNING', candidateId: attempt.candidateId, attemptId: attempt._id, questionIndex: input.questionIndex, message: 'Submission after question was closed' });
    return { submission: 'REJECTED_LATE' as const, next: await currentQuestion(ctx, instanceId) };
  }

  const current = await Answer.findOne({ attemptId: attempt._id, questionIndex: input.questionIndex, status: 'ACTIVE' }).lean();
  if (!current) return { submission: 'REJECTED_LATE' as const, next: await currentQuestion(ctx, instanceId) };
  const fields = answerPatch(current.question, input);
  const now = Date.now();
  const deadline = current.deadlineAt.getTime();

  let submission: 'ACCEPTED' | 'ACCEPTED_AT_DEADLINE' | 'REJECTED_LATE';
  if (now <= deadline + GRACE()) {
    const closeAs = now <= deadline && input.reason === 'MANUAL' ? 'SUBMITTED' : 'TIMED_OUT';
    await advance(attempt._id, input.questionIndex, closeAs, { seq: input.seq, fields });
    submission = closeAs === 'SUBMITTED' ? 'ACCEPTED' : 'ACCEPTED_AT_DEADLINE';
  } else {
    // Too late: the content is discarded, the last acknowledged autosave stands.
    await advance(attempt._id, input.questionIndex, 'TIMED_OUT');
    await logSecurityEvent({ eventType: 'LATE_SUBMISSION_REJECTED', source: 'SERVER', severity: 'WARNING', candidateId: attempt.candidateId, attemptId: attempt._id, questionIndex: input.questionIndex, message: 'Submission received after deadline; last autosave kept', metadata: { lateByMs: now - deadline } });
    submission = 'REJECTED_LATE';
  }
  return { submission, next: await currentQuestion(ctx, instanceId) };
}

export async function heartbeat(ctx: CandidateContext, instanceId: string | undefined, input: HeartbeatInput) {
  const attempt = await guardActive(ctx, instanceId);
  if (isTerminal(attempt)) return { state: attempt.state, terminal: attempt };

  if (!input.visible || !input.focused) {
    // Backup channel: an honest client reports focus loss here even if the dedicated event was lost.
    const type: ClientEventType = !input.visible ? 'TAB_HIDDEN' : 'WINDOW_BLURRED';
    await disqualifyForClientSignal(attempt, type, { trigger: 'heartbeat' }, null);
    const ended = await Attempt.findById(attempt._id).lean();
    return { state: ended!.status, terminal: terminalPayload(ended as any) };
  }

  const now = new Date();
  await Attempt.updateOne({ _id: attempt._id, status: 'IN_PROGRESS' }, { $set: { lastHeartbeatAt: now }, $inc: { heartbeatCount: 1 } });
  const active = await Answer.findOne({ attemptId: attempt._id, questionIndex: attempt.currentQuestionIndex, status: 'ACTIVE' }, { deadlineAt: 1 }).lean();
  return {
    state: 'IN_PROGRESS' as const,
    serverNow: now.toISOString(),
    currentQuestionIndex: attempt.currentQuestionIndex,
    deadlineAt: active?.deadlineAt.toISOString() ?? null,
    remainingMs: active ? Math.max(0, active.deadlineAt.getTime() - now.getTime()) : null,
  };
}

async function disqualifyForClientSignal(
  attempt: Pick<AttemptDoc, '_id' | 'candidateId' | 'currentQuestionIndex'>,
  type: ClientEventType,
  details: Record<string, unknown> | undefined,
  clientTimestamp: Date | null,
) {
  await logSecurityEvent({
    eventType: type,
    source: 'CLIENT_REPORTED',
    severity: 'CRITICAL',
    candidateId: attempt.candidateId,
    attemptId: attempt._id,
    questionIndex: attempt.currentQuestionIndex,
    clientTimestamp,
    message: VIOLATION_REASONS[type] ?? type,
    metadata: details ?? null,
  });
  return terminateAttempt(attempt._id, {
    status: 'DISQUALIFIED',
    endReason: 'FOCUS_VIOLATION',
    violation: { type, source: 'CLIENT_REPORTED', reason: VIOLATION_REASONS[type] ?? type, questionIndex: attempt.currentQuestionIndex, clientTimestamp, details: details ?? null },
  });
}

/**
 * Browser-reported security signal. Disqualifying signals end the attempt immediately and
 * irreversibly; warnings are logged. Duplicate or late signals are recorded but change nothing.
 */
export async function reportSecurityEvent(ctx: CandidateContext, input: SecurityEventInput) {
  const attempt = await Attempt.findOne({ candidateId: ctx.candidate._id, status: 'IN_PROGRESS' }).select('+instanceHash');
  const clientTimestamp = input.clientTimestamp ? new Date(input.clientTimestamp) : null;
  const details = { ...(input.details ?? {}) } as Record<string, unknown>;

  if (!attempt) {
    const last = await Attempt.findOne({ candidateId: ctx.candidate._id }).sort({ startedAt: -1 }).lean();
    if (last && (DISQUALIFYING_CLIENT_EVENTS as readonly string[]).includes(input.type)) {
      await logSecurityEvent({ eventType: input.type, source: 'CLIENT_REPORTED', severity: 'INFO', candidateId: ctx.candidate._id, attemptId: last._id, clientTimestamp, message: 'Signal received after attempt had already ended (ignored)', metadata: details });
    }
    return last ? { recorded: true, state: terminalPayload(last as any) } : { recorded: false, state: null };
  }
  if (String(attempt.sessionId) !== String(ctx.session._id)) throw forbidden('This session does not own the active interview', 'EXAM_SESSION_MISMATCH');
  details.instanceMatches = Boolean(input.instanceId && safeEqual(instanceHash(input.instanceId), attempt.instanceHash));

  if ((DISQUALIFYING_CLIENT_EVENTS as readonly string[]).includes(input.type)) {
    await disqualifyForClientSignal(attempt, input.type, details, clientTimestamp);
    const ended = await Attempt.findById(attempt._id).lean();
    return { recorded: true, state: terminalPayload(ended as any) };
  }

  await Attempt.updateOne({ _id: attempt._id, status: 'IN_PROGRESS' }, { $inc: { warningCount: 1 } });
  await logSecurityEvent({ eventType: input.type, source: 'CLIENT_REPORTED', severity: 'WARNING', candidateId: attempt.candidateId, attemptId: attempt._id, questionIndex: attempt.currentQuestionIndex, clientTimestamp, message: `Warning: ${input.type.replace(/_/g, ' ').toLowerCase()}`, metadata: details });
  return { recorded: true, state: { state: 'IN_PROGRESS' as const } };
}

// ───────────────────────────── administrative ─────────────────────────────

export async function adminTerminate(attemptId: string, reason: string) {
  const attempt = await Attempt.findOne({ _id: attemptId, status: 'IN_PROGRESS' });
  if (!attempt) throw conflict('Only attempts in progress can be terminated', 'ATTEMPT_NOT_ACTIVE');
  const ok = await terminateAttempt(attempt._id, {
    status: 'DISQUALIFIED',
    endReason: 'ADMIN_TERMINATED',
    violation: { type: 'ADMIN_TERMINATED', source: 'ADMIN', reason: `${VIOLATION_REASONS.ADMIN_TERMINATED} ${reason}`.trim() },
  });
  if (!ok) throw conflict('The attempt already ended', 'ATTEMPT_NOT_ACTIVE');
  return attempt;
}

// ───────────────────────────── background reconciliation ─────────────────────────────

export async function reconcileAll(): Promise<{ timedOut: number; heartbeats: number; expired: number }> {
  const now = Date.now();
  let timedOut = 0;
  let heartbeats = 0;
  let expired = 0;

  // 1. Questions whose deadline passed while the browser was silent.
  const due = await Answer.find({ status: 'ACTIVE', deadlineAt: { $lt: new Date(now - GRACE()) } }, { attemptId: 1 }).limit(500).lean();
  for (const id of new Set(due.map((d) => String(d.attemptId)))) {
    await reconcileAttempt(new Types.ObjectId(id)).catch((err) => logger.error({ err, id }, 'reconcile failed'));
    timedOut++;
  }

  // 2. Abandoned sessions: no heartbeat within the timeout.
  const stale = await Attempt.find({ status: 'IN_PROGRESS', lastHeartbeatAt: { $lt: new Date(now - env.HEARTBEAT_TIMEOUT_SECONDS * 1000) } }, { _id: 1, candidateId: 1, currentQuestionIndex: 1, lastHeartbeatAt: 1 }).limit(500).lean();
  for (const a of stale) {
    const silentMs = now - a.lastHeartbeatAt.getTime();
    const changed = await terminateAttempt(a._id, {
      status: env.HEARTBEAT_TIMEOUT_ACTION === 'DISQUALIFY' ? 'DISQUALIFIED' : 'EXPIRED',
      endReason: 'HEARTBEAT_TIMEOUT',
      violation: { type: 'HEARTBEAT_TIMEOUT', source: 'HEARTBEAT', reason: VIOLATION_REASONS.HEARTBEAT_TIMEOUT!, questionIndex: a.currentQuestionIndex, details: { silentMs, timeoutSeconds: env.HEARTBEAT_TIMEOUT_SECONDS } },
    });
    if (changed) {
      heartbeats++;
      await logSecurityEvent({ eventType: 'SESSION_TIMEOUT', source: 'HEARTBEAT', severity: 'CRITICAL', candidateId: a.candidateId, attemptId: a._id, questionIndex: a.currentQuestionIndex, message: `No heartbeat for ${Math.round(silentMs / 1000)}s`, metadata: { silentMs } });
    }
  }

  // 3. Attempts past their hard ceiling.
  const over = await Attempt.find({ status: 'IN_PROGRESS', expiresAt: { $lt: new Date(now) } }, { _id: 1 }).limit(500).lean();
  for (const a of over) {
    if (await terminateAttempt(a._id, { status: 'EXPIRED', endReason: 'EXAM_WINDOW_EXPIRED', violation: { type: 'EXAM_WINDOW_EXPIRED', source: 'SERVER', reason: VIOLATION_REASONS.EXAM_WINDOW_EXPIRED! } })) expired++;
  }
  return { timedOut, heartbeats, expired };
}

/** Unstarted assignments whose start deadline or availability window has passed. */
export async function expireStaleAssignments(): Promise<number> {
  const now = new Date();
  const closedVersions = await InterviewVersion.find({ availableUntil: { $ne: null, $lt: now } }, { _id: 1 }).lean();
  const res = await Assignment.updateMany(
    {
      status: 'NOT_STARTED',
      attemptId: null,
      $or: [{ startDeadline: { $ne: null, $lt: now } }, { interviewVersionId: { $in: closedVersions.map((v) => v._id) } }],
    },
    { $set: { status: 'EXPIRED', isOpen: false, closedAt: now } },
  );
  // A reopened attempt that was not continued in time simply goes back to how it ended.
  const lapsed = await Assignment.find({ status: 'NOT_STARTED', attemptId: { $ne: null }, startDeadline: { $ne: null, $lt: now } }, { attemptId: 1 }).lean();
  let withdrawn = 0;
  for (const a of lapsed) if (await withdrawResume(a.attemptId!, 'the candidate did not continue within the allowed time')) withdrawn++;
  return res.modifiedCount + withdrawn;
}

// ───────────────────────────── continuing after an interruption ─────────────────────────────

/** How long a candidate has to continue after staff allow it. */
export const RESUME_WINDOW_HOURS = 24;

async function resumeInfo(attemptId: Types.ObjectId | null | undefined) {
  if (!attemptId) return null;
  const a = await Attempt.findOne({ _id: attemptId, resumePending: true }, { interruptions: 1, totalQuestions: 1 }).lean();
  const last = a?.interruptions.at(-1);
  return a && last ? { fromQuestion: last.resumeFromIndex + 1, totalQuestions: a.totalQuestions } : null;
}

/**
 * Staff allow a candidate whose attempt was disqualified or ended by a disconnection to continue
 * it. The question they were on stays closed with whatever they had written (the evaluator scores
 * it); they continue from the next question with fresh timers. Answers already given cannot be
 * changed. The candidate has RESUME_WINDOW_HOURS to sign in again and continue.
 */
export async function allowResume(attemptId: string, actor: { _id: Types.ObjectId; fullName: string }, reason: string) {
  const out = await withTransaction(async (session) => {
    const now = new Date();
    const attempt = await Attempt.findById(attemptId).session(session);
    if (!attempt) throw notFound('Interview attempt not found');
    if (attempt.status !== 'DISQUALIFIED' && attempt.status !== 'EXPIRED') {
      throw conflict('Only disqualified or disconnected attempts can be continued', 'ATTEMPT_NOT_RESUMABLE');
    }
    if (attempt.resumePending) throw conflict('This candidate is already allowed to continue', 'RESUME_ALREADY_ALLOWED');
    if (attempt.evaluatedAt) throw conflict('This attempt has already been evaluated, so it can no longer be continued', 'ATTEMPT_ALREADY_EVALUATED');
    const candidate = await Candidate.findById(attempt.candidateId, { status: 1 }).session(session).lean();
    if (candidate?.status !== 'ACTIVE') throw badRequest('The candidate account is not active', 'CANDIDATE_INACTIVE');

    const reached = await Answer.exists({ attemptId: attempt._id, questionIndex: attempt.currentQuestionIndex }).session(session);
    const from = reached ? attempt.currentQuestionIndex + 1 : attempt.currentQuestionIndex;
    if (from >= attempt.totalQuestions) {
      throw conflict('The interview ended on its last question, so there is nothing left to continue', 'NO_QUESTIONS_LEFT');
    }

    const deadline = new Date(now.getTime() + RESUME_WINDOW_HOURS * 3600_000);
    const reopened = await Assignment.updateOne(
      { _id: attempt.assignmentId, status: attempt.status },
      { $set: { status: 'NOT_STARTED', isOpen: true, closedAt: null, startDeadline: deadline } },
      { session },
    ).catch((err) => {
      if (err?.code === 11000) throw conflict('This candidate has another open interview. Cancel it first.', 'ASSIGNMENT_EXISTS');
      throw err;
    });
    if (reopened.modifiedCount !== 1) throw conflict('This interview can no longer be reopened', 'ATTEMPT_NOT_RESUMABLE');

    const plain = attempt.toObject();
    const moved = await Attempt.updateOne(
      // $ne rather than false: attempts saved before this feature have no resumePending field.
      { _id: attempt._id, status: attempt.status, resumePending: { $ne: true } },
      {
        $set: { resumePending: true },
        $push: {
          interruptions: {
            status: plain.status,
            endReason: plain.endReason ?? null,
            endedAt: plain.endedAt ?? null,
            violation: plain.securityViolation ?? null,
            resumeFromIndex: from,
            allowedBy: actor._id,
            allowedByName: actor.fullName,
            allowedAt: now,
            reason,
          },
        },
      },
      { session },
    );
    if (moved.modifiedCount !== 1) throw new AppError(409, 'CONCURRENT_TRANSITION', 'The attempt changed, try again');
    return { attempt: plain, from, deadline };
  });

  await flushEvents(out.attempt, [
    {
      eventType: 'RESUME_ALLOWED',
      source: 'ADMIN',
      severity: 'WARNING',
      questionIndex: out.from,
      message: `${actor.fullName} allowed the candidate to continue from question ${out.from + 1} — ${reason}`,
      metadata: { previousStatus: out.attempt.status, deadline: out.deadline.toISOString() },
    },
  ]);
  return { attempt: out.attempt, fromQuestion: out.from + 1, deadline: out.deadline };
}

/** Takes back a permission to continue that was not used; the attempt returns to how it ended. */
export async function withdrawResume(attemptId: Types.ObjectId, why: string): Promise<boolean> {
  let ref: { _id: Types.ObjectId; candidateId: Types.ObjectId } | null = null;
  const done = await withTransaction(async (session) => {
    const attempt = await Attempt.findOne({ _id: attemptId, resumePending: true }).session(session);
    if (!attempt) return false;
    const now = new Date();
    const res = await Assignment.updateOne({ _id: attempt.assignmentId, status: 'NOT_STARTED' }, { $set: { status: attempt.status, isOpen: false, closedAt: now } }, { session });
    if (res.modifiedCount !== 1) return false;
    await Attempt.updateOne(
      { _id: attempt._id, resumePending: true },
      { $set: { resumePending: false, [`interruptions.${attempt.interruptions.length - 1}.withdrawnAt`]: now } },
      { session },
    );
    ref = { _id: attempt._id, candidateId: attempt.candidateId };
    return true;
  });
  if (done && ref) await flushEvents(ref, [{ eventType: 'RESUME_WITHDRAWN', source: 'SERVER', message: `Permission to continue withdrawn — ${why}` }]);
  return done;
}

async function resumeAttempt(ctx: CandidateContext, input: StartInput, pending: { _id: Types.ObjectId; attemptId: Types.ObjectId; startDeadline?: Date | null }) {
  const { candidate, session } = ctx;
  if (pending.startDeadline && pending.startDeadline < new Date()) throw forbidden('The time allowed to continue this interview has passed', 'WINDOW_CLOSED');
  const events: PendingEvent[] = [];

  await withTransaction(async (tx) => {
    events.length = 0;
    const now = new Date();
    const claimed = await Assignment.findOneAndUpdate({ _id: pending._id, candidateId: candidate._id, status: 'NOT_STARTED' }, { $set: { status: 'IN_PROGRESS' } }, { new: true, session: tx });
    if (!claimed) throw conflict('Your interview attempt has already been used', 'ATTEMPT_ALREADY_CONSUMED');
    const attempt = await Attempt.findOne({ _id: pending.attemptId, candidateId: candidate._id, resumePending: true }).session(tx);
    const last = attempt ? attempt.interruptions.length - 1 : -1;
    if (!attempt || last < 0) throw conflict('There is no interview awaiting your start', 'NO_PENDING_INTERVIEW');
    const from = attempt.interruptions[last]!.resumeFromIndex;

    const version = await InterviewVersion.findById(attempt.interviewVersionId, { questions: 1 }).session(tx).lean();
    const nextQ = version?.questions.find((q) => q.order === from) ?? version?.questions[from];
    if (!version || !nextQ) throw new AppError(500, 'VERSION_CORRUPT', 'Interview version is missing a question');
    const remaining = version.questions.slice(from);
    const ceilingMs = remaining.reduce((s, q) => s + q.timeLimitSeconds, 0) * 1000 + remaining.length * (GRACE() + 5000) + 60_000;

    const res = await Attempt.updateOne(
      { _id: attempt._id, resumePending: true },
      {
        $set: {
          status: 'IN_PROGRESS',
          endReason: null,
          endedAt: null,
          result: 'PENDING',
          securityViolation: null,
          currentQuestionIndex: from,
          sessionId: session._id,
          instanceHash: instanceHash(input.instanceId),
          lastHeartbeatAt: now,
          expiresAt: new Date(now.getTime() + ceilingMs),
          resumePending: false,
          [`interruptions.${last}.resumedAt`]: now,
        },
      },
      { session: tx },
    );
    if (res.modifiedCount !== 1) throw conflict('Your interview attempt has already been used', 'ATTEMPT_ALREADY_CONSUMED');
    await Answer.create([activationFor(attempt._id, candidate._id, nextQ, from, now)], { session: tx });
    events.push(
      { eventType: 'INTERVIEW_RESUMED', source: 'SERVER', severity: 'WARNING', questionIndex: from, message: `Interview continued from question ${from + 1} (allowed by ${attempt.interruptions[last]!.allowedByName})`, metadata: { preflight: input.preflight } },
      { eventType: 'QUESTION_STARTED', source: 'SERVER', questionIndex: from, questionId: nextQ.questionId, message: `Question ${from + 1} started`, metadata: { allowedSeconds: nextQ.timeLimitSeconds } },
    );
  });

  await revokeAllSessions('CANDIDATE', candidate._id, 'EXAM_BOUND_TO_OTHER_SESSION', { exceptId: session._id });
  await flushEvents({ _id: pending.attemptId, candidateId: candidate._id }, events);
  return currentQuestion(ctx, input.instanceId);
}
