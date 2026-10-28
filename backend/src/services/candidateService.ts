import type { Request } from 'express';
import { Types, type ClientSession, type PipelineStage } from 'mongoose';
import type { z } from 'zod';
import { withTransaction } from '../config/database';
import { env } from '../config/env';
import {
  Assignment,
  Attempt,
  Candidate,
  CandidateNote,
  InterviewTemplate,
  InterviewVersion,
  SecurityEvent,
  nextSequence,
} from '../models';
import { hashPassword } from '../security/password';
import { revokeAllSessions } from '../security/sessions';
import { generatePassword } from '../utils/crypto';
import { badRequest, conflict, notFound } from '../utils/errors';
import { escapeRegex, paged } from '../utils/pagination';
import type { createCandidateSchema, listCandidatesSchema, updateCandidateSchema } from '../validators/candidates';
import { withdrawResume } from './examService';
import { audit, logSecurityEvent } from './logService';

type CreateInput = z.infer<typeof createCandidateSchema>;
type UpdateInput = z.infer<typeof updateCandidateSchema>;
type ListInput = z.infer<typeof listCandidatesSchema>;

export function formatCandidateCode(seq: number): string {
  return `${env.CANDIDATE_CODE_PREFIX}-${String(seq).padStart(4, '0')}`;
}

function candidateDto(c: any) {
  return {
    id: String(c._id),
    candidateCode: c.candidateCode,
    fullName: c.fullName,
    discordUsername: c.discordUsername,
    discordId: c.discordId,
    characterName: c.characterName,
    appliedRole: c.appliedRole,
    status: c.status,
    credentialsIssuedAt: c.credentialsIssuedAt,
    credentialVersion: c.credentialVersion,
    lastLoginAt: c.lastLoginAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdBy: c.createdBy?.fullName ? { id: String(c.createdBy._id), fullName: c.createdBy.fullName } : null,
  };
}

// ───────────────────────────── Assignments ─────────────────────────────

export async function createAssignment(
  req: Request,
  candidateId: Types.ObjectId,
  templateId: string,
  startDeadline: Date | null | undefined,
  session: ClientSession,
) {
  const t = await InterviewTemplate.findOne({ _id: templateId, isDeleted: false }).session(session);
  if (!t) throw badRequest('Interview not found', 'INTERVIEW_NOT_FOUND');
  if (!t.publishedVersionId) throw badRequest('Publish this interview before assigning it', 'INTERVIEW_NOT_PUBLISHED');
  if (!t.isActive) throw badRequest('This interview is inactive', 'INTERVIEW_INACTIVE');
  const version = await InterviewVersion.findById(t.publishedVersionId).session(session).lean();
  if (!version) throw badRequest('Published version missing', 'INTERVIEW_NOT_PUBLISHED');
  if (version.availableUntil && version.availableUntil < new Date()) throw badRequest('This interview is no longer available', 'INTERVIEW_WINDOW_CLOSED');
  if (startDeadline && startDeadline < new Date()) throw badRequest('The start deadline must be in the future', 'INVALID_DEADLINE');

  try {
    const [a] = await Assignment.create(
      [
        {
          candidateId,
          templateId: t._id,
          interviewVersionId: version._id,
          status: 'NOT_STARTED',
          isOpen: true,
          assignedBy: req.admin!.user._id,
          assignedAt: new Date(),
          startDeadline: startDeadline ?? null,
        },
      ],
      { session },
    );
    await audit(req, { action: 'INTERVIEW_ASSIGNED', targetType: 'Candidate', targetId: candidateId, targetLabel: t.title, details: { assignmentId: String(a!._id), templateId: String(t._id), version: version.version } }, session);
    return a!;
  } catch (err: any) {
    if (err?.code === 11000) throw conflict('This candidate already has an open interview assignment', 'ASSIGNMENT_EXISTS');
    throw err;
  }
}

export async function assignInterview(req: Request, candidateId: string, templateId: string, startDeadline?: Date | null) {
  return withTransaction(async (session) => {
    const c = await Candidate.findById(candidateId).session(session);
    if (!c) throw notFound('Candidate not found');
    if (c.status !== 'ACTIVE') throw badRequest('Only active candidates can be assigned interviews', 'CANDIDATE_INACTIVE');
    const a = await createAssignment(req, c._id, templateId, startDeadline, session);
    return { id: String(a._id), status: a.status };
  });
}

export async function cancelAssignment(req: Request, assignmentId: string) {
  // A reopened attempt is not cancelled: the permission to continue is withdrawn instead.
  const reopened = await Assignment.findOne({ _id: assignmentId, status: 'NOT_STARTED', attemptId: { $ne: null } }).lean();
  if (reopened) {
    if (!(await withdrawResume(reopened.attemptId!, `withdrawn by ${req.admin!.user.fullName}`))) throw conflict('This permission to continue was already used or withdrawn', 'ASSIGNMENT_NOT_CANCELLABLE');
    await audit(req, { action: 'ASSIGNMENT_CANCELLED', targetType: 'Candidate', targetId: reopened.candidateId, details: { assignmentId, resumeWithdrawn: true } });
    return;
  }
  const a = await Assignment.findOneAndUpdate(
    { _id: assignmentId, status: 'NOT_STARTED' },
    { $set: { status: 'CANCELLED', isOpen: false, closedAt: new Date(), cancelledBy: req.admin!.user._id } },
    { new: true },
  );
  if (!a) throw conflict('Only assignments that have not started can be cancelled', 'ASSIGNMENT_NOT_CANCELLABLE');
  await audit(req, { action: 'ASSIGNMENT_CANCELLED', targetType: 'Candidate', targetId: a.candidateId, details: { assignmentId } });
}

export function interruptionDto(i: any) {
  return {
    status: i.status,
    endReason: i.endReason,
    endedAt: i.endedAt,
    violation: i.violation ?? null,
    resumeFromQuestion: i.resumeFromIndex + 1,
    allowedBy: i.allowedByName,
    allowedAt: i.allowedAt,
    reason: i.reason,
    resumedAt: i.resumedAt ?? null,
    withdrawnAt: i.withdrawnAt ?? null,
  };
}

// ───────────────────────────── Candidates ─────────────────────────────

export async function createCandidate(req: Request, input: CreateInput) {
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const actor = req.admin!.user._id;

  const { candidate, assignmentId } = await withTransaction(async (session) => {
    const seq = await nextSequence('candidate', session);
    const [c] = await Candidate.create(
      [
        {
          candidateCode: formatCandidateCode(seq),
          sequence: seq,
          fullName: input.fullName,
          discordUsername: input.discordUsername,
          discordId: input.discordId,
          characterName: input.characterName,
          appliedRole: input.appliedRole,
          passwordHash,
          credentialsIssuedAt: new Date(),
          credentialsIssuedBy: actor,
          createdBy: actor,
        },
      ],
      { session },
    );
    await audit(req, { action: 'CANDIDATE_CREATED', targetType: 'Candidate', targetId: c!._id, targetLabel: `${c!.candidateCode} · ${c!.fullName}` }, session);
    let assignmentId: string | null = null;
    if (input.templateId) {
      const a = await createAssignment(req, c!._id, input.templateId, input.startDeadline, session);
      assignmentId = String(a._id);
    }
    return { candidate: c!, assignmentId };
  });

  return {
    candidate: candidateDto(candidate.toObject()),
    assignmentId,
    // Shown to the administrator exactly once; only the Argon2id hash is stored.
    credentials: { username: candidate.candidateCode, password },
  };
}

export async function regenerateCredentials(req: Request, id: string) {
  const c = await Candidate.findById(id);
  if (!c) throw notFound('Candidate not found');
  if (c.status === 'ARCHIVED') throw badRequest('Archived candidates cannot receive credentials', 'CANDIDATE_ARCHIVED');
  if (await Attempt.exists({ candidateId: c._id, status: 'IN_PROGRESS' })) {
    throw conflict('Credentials cannot be replaced while an interview is in progress', 'EXAM_IN_PROGRESS');
  }
  const password = generatePassword();
  await Candidate.updateOne(
    { _id: c._id },
    {
      $set: { passwordHash: await hashPassword(password), credentialsIssuedAt: new Date(), credentialsIssuedBy: req.admin!.user._id, failedLoginAttempts: 0, lockUntil: null },
      $inc: { credentialVersion: 1 },
    },
  );
  const revoked = await revokeAllSessions('CANDIDATE', c._id, 'CREDENTIALS_REPLACED');
  if (revoked) await logSecurityEvent({ eventType: 'SESSION_REVOKED', source: 'ADMIN', candidateId: c._id, message: 'Sessions revoked after credential replacement' });
  await audit(req, { action: 'CANDIDATE_CREDENTIALS_REGENERATED', targetType: 'Candidate', targetId: c._id, targetLabel: c.candidateCode, details: { credentialVersion: c.credentialVersion + 1 } });
  return { username: c.candidateCode, password };
}

export async function updateCandidate(req: Request, id: string, input: UpdateInput) {
  const c = await Candidate.findById(id);
  if (!c) throw notFound('Candidate not found');
  if (c.status === 'ARCHIVED') throw badRequest('Archived candidates cannot be edited', 'CANDIDATE_ARCHIVED');
  if (input.status === 'DISABLED' && c.status !== 'DISABLED') {
    if (await Attempt.exists({ candidateId: c._id, status: 'IN_PROGRESS' })) {
      throw conflict('Terminate the in-progress interview before disabling this candidate', 'EXAM_IN_PROGRESS');
    }
  }
  const set: Record<string, unknown> = { updatedBy: req.admin!.user._id };
  for (const [k, v] of Object.entries(input)) if (v !== undefined) set[k] = v;
  await Candidate.updateOne({ _id: c._id }, { $set: set });
  if (input.status === 'DISABLED') await revokeAllSessions('CANDIDATE', c._id, 'ACCOUNT_DISABLED');
  await audit(req, { action: 'CANDIDATE_UPDATED', targetType: 'Candidate', targetId: c._id, targetLabel: c.candidateCode, details: { fields: Object.keys(input) } });
  return getCandidate(id);
}

/** Removes access but never interview history: the account is archived, not deleted. */
export async function archiveCandidate(req: Request, id: string) {
  await withTransaction(async (session) => {
    const c = await Candidate.findById(id).session(session);
    if (!c) throw notFound('Candidate not found');
    if (c.status === 'ARCHIVED') return;
    if (await Attempt.exists({ candidateId: c._id, status: 'IN_PROGRESS' }).session(session)) {
      throw conflict('Terminate the in-progress interview before archiving this candidate', 'EXAM_IN_PROGRESS');
    }
    await Assignment.updateMany(
      { candidateId: c._id, status: 'NOT_STARTED' },
      { $set: { status: 'CANCELLED', isOpen: false, closedAt: new Date(), cancelledBy: req.admin!.user._id } },
      { session },
    );
    await Candidate.updateOne({ _id: c._id }, { $set: { status: 'ARCHIVED', archivedAt: new Date(), archivedBy: req.admin!.user._id } }, { session });
    await revokeAllSessions('CANDIDATE', c._id, 'ACCOUNT_ARCHIVED', { dbSession: session });
    await audit(req, { action: 'CANDIDATE_ARCHIVED', targetType: 'Candidate', targetId: c._id, targetLabel: c.candidateCode }, session);
  });
}

export async function listCandidates(input: ListInput) {
  const match: Record<string, unknown> = {};
  if (input.status) match.status = input.status;
  else match.status = { $ne: 'ARCHIVED' };
  if (input.search) {
    const rx = new RegExp(escapeRegex(input.search), 'i');
    match.$or = [{ fullName: rx }, { discordUsername: rx }, { characterName: rx }, { candidateCode: rx }, { discordId: rx }];
  }

  const post: Record<string, unknown> = {};
  if (input.interviewStatus === 'NONE') post.assignment = null;
  else if (input.interviewStatus) post['assignment.status'] = input.interviewStatus;
  if (input.result) post['attempt.result'] = input.result;
  if (input.templateId) post['assignment.templateId'] = new Types.ObjectId(input.templateId);

  const sort: Record<string, 1 | -1> =
    input.sort === 'oldest' ? { createdAt: 1 } : input.sort === 'name' ? { fullName: 1 } : input.sort === 'score' ? { 'attempt.scoring.percentage': -1, createdAt: -1 } : { createdAt: -1 };

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'interview_assignments',
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$candidateId', '$$cid'] } } }, { $sort: { assignedAt: -1 } }, { $limit: 1 }],
        as: 'assignment',
      },
    },
    { $set: { assignment: { $ifNull: [{ $first: '$assignment' }, null] } } },
    { $lookup: { from: 'interview_versions', localField: 'assignment.interviewVersionId', foreignField: '_id', as: 'version', pipeline: [{ $project: { title: 1, version: 1, totalQuestions: 1 } }] } },
    { $lookup: { from: 'interview_attempts', localField: 'assignment.attemptId', foreignField: '_id', as: 'attempt', pipeline: [{ $project: { status: 1, result: 1, scoring: 1, currentQuestionIndex: 1, totalQuestions: 1, startedAt: 1, endedAt: 1, securityViolation: 1 } }] } },
    { $set: { version: { $first: '$version' }, attempt: { $ifNull: [{ $first: '$attempt' }, null] } } },
    ...(Object.keys(post).length ? [{ $match: post } as PipelineStage] : []),
    { $sort: sort },
    {
      $facet: {
        items: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, { $project: { passwordHash: 0 } }],
        total: [{ $count: 'n' }],
      },
    },
  ];
  const [res] = await Candidate.aggregate(pipeline);
  const items = (res?.items ?? []).map((c: any) => ({
    ...candidateDto(c),
    assignment: c.assignment
      ? {
          id: String(c.assignment._id),
          status: c.assignment.status,
          templateId: String(c.assignment.templateId),
          interviewTitle: c.version?.title ?? null,
          interviewVersion: c.version?.version ?? null,
          assignedAt: c.assignment.assignedAt,
        }
      : null,
    attempt: c.attempt
      ? {
          id: String(c.attempt._id),
          status: c.attempt.status,
          result: c.attempt.result,
          percentage: c.attempt.scoring?.percentage ?? null,
          totalScore: c.attempt.scoring?.totalScore ?? null,
          maxScore: c.attempt.scoring?.maxScore ?? null,
          progress: c.attempt.currentQuestionIndex,
          totalQuestions: c.attempt.totalQuestions,
          violation: c.attempt.securityViolation?.type ?? null,
        }
      : null,
  }));
  return paged(items, res?.total?.[0]?.n ?? 0, input);
}

export async function getCandidate(id: string) {
  const c = await Candidate.findById(id).populate('createdBy', 'fullName').lean();
  if (!c) throw notFound('Candidate not found');

  const [assignments, notes] = await Promise.all([
    Assignment.find({ candidateId: c._id })
      .sort({ assignedAt: -1 })
      .populate('assignedBy', 'fullName')
      .populate('interviewVersionId', 'title version totalQuestions totalTimeSeconds maxScore passingPercent')
      .populate({ path: 'attemptId', select: '-instanceHash', populate: { path: 'evaluatedBy', select: 'fullName' } })
      .lean(),
    CandidateNote.find({ candidateId: c._id }).sort({ createdAt: -1 }).populate('authorId', 'fullName role').lean(),
  ]);

  const attemptIds = assignments.map((a: any) => a.attemptId?._id).filter(Boolean);
  const events = attemptIds.length
    ? await SecurityEvent.find({ attemptId: { $in: attemptIds }, eventType: { $ne: 'ANSWER_SAVED' } }).sort({ serverTimestamp: 1 }).limit(500).lean()
    : [];
  const authEvents = await SecurityEvent.find({ candidateId: c._id, attemptId: null }).sort({ serverTimestamp: -1 }).limit(50).lean();

  return {
    ...candidateDto(c),
    assignments: assignments.map((a: any) => {
      const t = a.attemptId;
      return {
        id: String(a._id),
        status: a.status,
        assignedAt: a.assignedAt,
        assignedBy: a.assignedBy?.fullName ?? null,
        startDeadline: a.startDeadline,
        interview: a.interviewVersionId
          ? {
              versionId: String(a.interviewVersionId._id),
              templateId: String(a.templateId),
              title: a.interviewVersionId.title,
              version: a.interviewVersionId.version,
              totalQuestions: a.interviewVersionId.totalQuestions,
              totalTimeSeconds: a.interviewVersionId.totalTimeSeconds,
              maxScore: a.interviewVersionId.maxScore,
              passingPercent: a.interviewVersionId.passingPercent,
            }
          : null,
        attempt: t
          ? {
              id: String(t._id),
              referenceCode: t.referenceCode,
              status: t.status,
              endReason: t.endReason,
              startedAt: t.startedAt,
              endedAt: t.endedAt,
              currentQuestionIndex: t.currentQuestionIndex,
              totalQuestions: t.totalQuestions,
              scoring: t.scoring,
              result: t.result,
              securityViolation: t.securityViolation,
              warningCount: t.warningCount,
              resumePending: t.resumePending ?? false,
              interruptions: (t.interruptions ?? []).map(interruptionDto),
              evaluatedBy: t.evaluatedBy?.fullName ?? null,
              evaluatedAt: t.evaluatedAt,
            }
          : null,
      };
    }),
    notes: notes.map((n: any) => ({
      id: String(n._id),
      body: n.body,
      attemptId: n.attemptId ? String(n.attemptId) : null,
      author: n.authorId ? { fullName: n.authorId.fullName, role: n.authorId.role } : null,
      createdAt: n.createdAt,
    })),
    events: events.map(eventDto),
    authEvents: authEvents.map(eventDto),
  };
}

export function eventDto(e: any) {
  return {
    id: String(e._id),
    eventType: e.eventType,
    source: e.source,
    severity: e.severity,
    attemptId: e.attemptId ? String(e.attemptId) : null,
    candidateId: e.candidateId ? String(e.candidateId) : null,
    questionIndex: e.questionIndex,
    serverTimestamp: e.serverTimestamp,
    clientTimestamp: e.clientTimestamp,
    message: e.message,
    metadata: e.metadata,
  };
}

export async function addNote(req: Request, candidateId: string, body: string, attemptId?: string) {
  const c = await Candidate.findById(candidateId, { _id: 1, candidateCode: 1 }).lean();
  if (!c) throw notFound('Candidate not found');
  if (attemptId && !(await Attempt.exists({ _id: attemptId, candidateId: c._id }))) throw badRequest('Attempt does not belong to this candidate');
  const n = await CandidateNote.create({ candidateId: c._id, body, attemptId: attemptId ?? null, authorId: req.admin!.user._id });
  await audit(req, { action: 'CANDIDATE_NOTE_ADDED', targetType: 'Candidate', targetId: c._id, targetLabel: c.candidateCode, details: { noteId: String(n._id) } });
  return { id: String(n._id), body: n.body, createdAt: n.createdAt };
}
