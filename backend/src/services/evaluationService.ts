import type { Request } from 'express';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { withTransaction } from '../config/database';
import { Answer, Attempt, CandidateNote, Evaluation, InterviewVersion, SecurityEvent } from '../models';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { escapeRegex, paged } from '../utils/pagination';
import type { listAttemptsSchema, saveEvaluationSchema } from '../validators/evaluations';
import { eventDto, interruptionDto } from './candidateService';
import { audit } from './logService';

type SaveInput = z.infer<typeof saveEvaluationSchema>;
type ListInput = z.infer<typeof listAttemptsSchema>;

export function attemptFilter(input: Partial<ListInput>) {
  const f: Record<string, unknown> = {};
  if (input.queue === 'pending') {
    f.status = { $in: ['COMPLETED', 'EXPIRED', 'DISQUALIFIED'] };
    f.result = { $in: ['PENDING', 'UNDER_REVIEW'] };
  } else if (input.queue === 'evaluated') {
    f.result = { $in: ['PASSED', 'FAILED'] };
  } else if (input.queue === 'disqualified') {
    f.status = 'DISQUALIFIED';
  }
  if (input.status) f.status = input.status;
  if (input.result) f.result = input.result;
  if (input.templateId) f.templateId = new Types.ObjectId(input.templateId);
  if (input.evaluatorId) f.evaluatedBy = new Types.ObjectId(input.evaluatorId);
  if (input.security === 'VIOLATION') f.$and = [{ $or: [{ securityViolation: { $ne: null } }, { 'interruptions.0': { $exists: true } }] }];
  if (input.security === 'WARNINGS') Object.assign(f, { securityViolation: null, 'interruptions.0': { $exists: false }, warningCount: { $gt: 0 } });
  if (input.security === 'CLEAN') Object.assign(f, { securityViolation: null, 'interruptions.0': { $exists: false }, warningCount: 0 });
  if (input.from || input.to) {
    f.startedAt = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) };
  }
  if (input.search) {
    const rx = new RegExp(escapeRegex(input.search), 'i');
    f.$or = [
      { 'candidateSnapshot.fullName': rx },
      { 'candidateSnapshot.candidateCode': rx },
      { 'candidateSnapshot.discordUsername': rx },
      { 'candidateSnapshot.characterName': rx },
      { 'interviewSnapshot.title': rx },
      { referenceCode: rx },
    ];
  }
  return f;
}

export function attemptSummaryDto(a: any) {
  return {
    id: String(a._id),
    referenceCode: a.referenceCode,
    candidateId: String(a.candidateId),
    candidate: a.candidateSnapshot,
    interview: { ...a.interviewSnapshot, templateId: String(a.templateId), versionId: String(a.interviewVersionId) },
    status: a.status,
    endReason: a.endReason,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    currentQuestionIndex: a.currentQuestionIndex,
    totalQuestions: a.totalQuestions,
    scoring: a.scoring,
    result: a.result,
    securityViolation: a.securityViolation,
    warningCount: a.warningCount,
    resumePending: a.resumePending ?? false,
    interruptions: (a.interruptions ?? []).map(interruptionDto),
    evaluatedBy: a.evaluatedBy?.fullName ? { id: String(a.evaluatedBy._id), fullName: a.evaluatedBy.fullName } : null,
    evaluatedAt: a.evaluatedAt,
    evaluationRevision: a.evaluationRevision,
  };
}

export async function listAttempts(input: ListInput) {
  const filter = attemptFilter(input);
  const sort: Record<string, 1 | -1> =
    input.sort === 'oldest' ? { startedAt: 1 } : input.sort === 'score_desc' ? { 'scoring.percentage': -1, startedAt: -1 } : input.sort === 'score_asc' ? { 'scoring.percentage': 1, startedAt: -1 } : { startedAt: -1 };
  const [items, total] = await Promise.all([
    Attempt.find(filter).sort(sort).skip((input.page - 1) * input.limit).limit(input.limit).populate('evaluatedBy', 'fullName').lean(),
    Attempt.countDocuments(filter),
  ]);
  return paged(items.map(attemptSummaryDto), total, input);
}

export async function getEvaluation(attemptId: string) {
  const attempt = await Attempt.findById(attemptId).populate('evaluatedBy', 'fullName').lean();
  if (!attempt) throw notFound('Interview attempt not found');
  const [answers, version, revisions, events, notes] = await Promise.all([
    Answer.find({ attemptId: attempt._id }).sort({ questionIndex: 1 }).populate('scoredBy', 'fullName').lean(),
    InterviewVersion.findById(attempt.interviewVersionId, { questions: 1, version: 1 }).lean(),
    Evaluation.find({ attemptId: attempt._id }).sort({ revision: -1 }).lean(),
    SecurityEvent.find({ attemptId: attempt._id }).sort({ serverTimestamp: 1 }).limit(2000).lean(),
    CandidateNote.find({ attemptId: attempt._id }).sort({ createdAt: -1 }).populate('authorId', 'fullName').lean(),
  ]);
  const byIndex = new Map(answers.map((a) => [a.questionIndex, a]));
  const questions = (version?.questions ?? []).map((q, idx) => {
    const a: any = byIndex.get(idx);
    const snap = a?.question ?? q;
    return {
      index: idx,
      question: snap,
      reached: Boolean(a),
      status: a?.status ?? 'NOT_REACHED',
      answerText: a?.answerText ?? '',
      selectedOptionKeys: a?.selectedOptionKeys ?? [],
      booleanAnswer: a?.booleanAnswer ?? null,
      hasResponse: a?.hasResponse ?? false,
      activatedAt: a?.activatedAt ?? null,
      deadlineAt: a?.deadlineAt ?? null,
      submittedAt: a?.submittedAt ?? null,
      closedAt: a?.closedAt ?? null,
      allowedSeconds: a?.allowedSeconds ?? snap.timeLimitSeconds,
      responseMs: a?.closedAt && a?.activatedAt ? new Date(a.closedAt).getTime() - new Date(a.activatedAt).getTime() : null,
      saveCount: a?.saveCount ?? 0,
      autoScore: a?.autoScore ?? null,
      awardedScore: a?.awardedScore ?? null,
      evaluatorNotes: a?.evaluatorNotes ?? '',
      scoredBy: a?.scoredBy?.fullName ?? null,
    };
  });
  const answeredSaves = events.filter((e) => e.eventType === 'ANSWER_SAVED').length;
  return {
    attempt: attemptSummaryDto(attempt),
    passingScore: Math.ceil((attempt.scoring.maxScore * attempt.interviewSnapshot.passingPercent) / 100),
    questions,
    revisions: revisions.map((r) => ({
      id: String(r._id),
      revision: r.revision,
      evaluator: r.evaluatorName,
      decision: r.decision,
      previousDecision: r.previousDecision,
      totalScore: r.totalScore,
      maxScore: r.maxScore,
      percentage: r.percentage,
      overallNotes: r.overallNotes,
      marks: r.marks,
      createdAt: r.createdAt,
    })),
    timeline: events.filter((e) => e.eventType !== 'ANSWER_SAVED').map(eventDto),
    autosaveEventCount: answeredSaves,
    notes: notes.map((n: any) => ({ id: String(n._id), body: n.body, author: n.authorId?.fullName ?? null, createdAt: n.createdAt })),
  };
}

export async function saveEvaluation(req: Request, attemptId: string, input: SaveInput) {
  const actor = req.admin!.user;
  await withTransaction(async (session) => {
    const attempt = await Attempt.findById(attemptId).session(session);
    if (!attempt) throw notFound('Interview attempt not found');
    if (attempt.status === 'IN_PROGRESS') throw conflict('Interviews can only be evaluated after they end', 'ATTEMPT_ACTIVE');
    if (attempt.evaluationRevision !== input.expectedRevision) {
      throw conflict('Another evaluator saved changes to this interview. Reload to see the latest evaluation.', 'STALE_EVALUATION');
    }
    if (attempt.status === 'DISQUALIFIED' && input.decision !== 'DISQUALIFIED') {
      if (actor.role !== 'HEAD_ADMIN') throw forbidden('Only a Head Admin can overturn a security disqualification', 'OVERTURN_FORBIDDEN');
      if (input.overallNotes.trim().length < 10) throw badRequest('Provide a justification (at least 10 characters) when overturning a disqualification', 'JUSTIFICATION_REQUIRED');
    }

    const answers = await Answer.find({ attemptId: attempt._id }).session(session);
    const byIndex = new Map(answers.map((a) => [a.questionIndex, a]));
    const seen = new Set<number>();
    for (const m of input.marks) {
      if (seen.has(m.questionIndex)) throw badRequest(`Duplicate mark for question ${m.questionIndex + 1}`);
      seen.add(m.questionIndex);
      const a = byIndex.get(m.questionIndex);
      if (!a) throw badRequest(`Question ${m.questionIndex + 1} was never reached and cannot be scored`, 'NOT_REACHED');
      if (m.awardedScore > a.question.maxScore) throw badRequest(`Question ${m.questionIndex + 1} allows at most ${a.question.maxScore} marks`, 'SCORE_EXCEEDS_MAX');
    }
    if (input.decision === 'PASSED' || input.decision === 'FAILED') {
      const unscored = answers.filter((a) => !seen.has(a.questionIndex) && a.awardedScore === null);
      if (unscored.length) throw badRequest(`Score every reached question before finalising (${unscored.length} remaining)`, 'INCOMPLETE_EVALUATION');
    }

    const now = new Date();
    for (const m of input.marks) {
      const a = byIndex.get(m.questionIndex)!;
      await Answer.updateOne({ _id: a._id }, { $set: { awardedScore: m.awardedScore, evaluatorNotes: m.notes, scoredBy: actor._id, scoredAt: now } }, { session });
      a.awardedScore = m.awardedScore;
    }
    const total = answers.reduce((s, a) => s + (a.awardedScore ?? 0), 0);
    const max = attempt.scoring.maxScore;
    const percentage = max > 0 ? Math.round((total / max) * 1000) / 10 : 0;
    const revision = attempt.evaluationRevision + 1;
    const previous = { decision: attempt.result, totalScore: attempt.scoring.totalScore, percentage: attempt.scoring.percentage };

    const res = await Attempt.updateOne(
      { _id: attempt._id, evaluationRevision: input.expectedRevision },
      { $set: { result: input.decision, 'scoring.totalScore': total, 'scoring.percentage': percentage, evaluatedBy: actor._id, evaluatedAt: now, evaluationRevision: revision } },
      { session },
    );
    if (res.modifiedCount !== 1) throw conflict('Another evaluator saved changes to this interview. Reload to see the latest evaluation.', 'STALE_EVALUATION');

    await Evaluation.create(
      [
        {
          attemptId: attempt._id,
          candidateId: attempt.candidateId,
          revision,
          evaluatorId: actor._id,
          evaluatorName: actor.fullName,
          decision: input.decision,
          previousDecision: attempt.result,
          marks: input.marks.map((m) => ({ ...m, maxScore: byIndex.get(m.questionIndex)!.question.maxScore })),
          overallNotes: input.overallNotes,
          totalScore: total,
          maxScore: max,
          percentage,
        },
      ],
      { session },
    );
    await audit(
      req,
      {
        action: revision === 1 ? 'EVALUATION_SAVED' : 'EVALUATION_MODIFIED',
        targetType: 'InterviewAttempt',
        targetId: attempt._id,
        targetLabel: `${attempt.candidateSnapshot.candidateCode} · ${attempt.interviewSnapshot.title}`,
        details: { revision, decision: input.decision, totalScore: total, percentage, previous },
      },
      session,
    );
  });
  return getEvaluation(attemptId);
}
