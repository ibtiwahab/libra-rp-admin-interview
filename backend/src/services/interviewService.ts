import type { Request } from 'express';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { withTransaction } from '../config/database';
import {
  Assignment,
  Attempt,
  Category,
  InterviewTemplate,
  InterviewVersion,
  Question,
  type InterviewTemplateDoc,
} from '../models';
import { badRequest, conflict, notFound } from '../utils/errors';
import { escapeRegex, paged } from '../utils/pagination';
import type { createInterviewSchema, listInterviewsSchema, updateInterviewSchema } from '../validators/interviews';
import { audit } from './logService';

type CreateInput = z.infer<typeof createInterviewSchema>;
type UpdateInput = z.infer<typeof updateInterviewSchema>;

async function assertQuestionsUsable(ids: string[]) {
  if (!ids.length) return;
  const found = await Question.countDocuments({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, isDeleted: false });
  if (found !== ids.length) throw badRequest('One or more selected questions no longer exist', 'QUESTION_NOT_FOUND');
}

/** Resolves a template's draft question list against the live bank. */
async function resolveQuestions(template: Pick<InterviewTemplateDoc, 'questions'>) {
  const ids = template.questions.map((q) => q.questionId);
  const docs = await Question.find({ _id: { $in: ids }, isDeleted: false }).populate('categoryId', 'name').lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return template.questions
    .map((entry, idx) => {
      const q = byId.get(String(entry.questionId)) as any;
      if (!q) return null;
      const effective = entry.timeLimitSeconds ?? q.timeLimitSeconds;
      return {
        order: idx,
        questionId: String(q._id),
        title: q.title,
        prompt: q.prompt,
        scenario: q.scenario,
        type: q.type,
        difficulty: q.difficulty,
        category: { id: String(q.categoryId?._id ?? q.categoryId), name: q.categoryId?.name ?? 'Unknown' },
        maxScore: q.maxScore,
        questionTimeLimitSeconds: q.timeLimitSeconds,
        timeLimitOverride: entry.timeLimitSeconds ?? null,
        timeLimitSeconds: effective,
        options: q.options,
        allowMultiple: q.allowMultiple,
        correctOptionKeys: q.correctOptionKeys,
        correctBoolean: q.correctBoolean,
        rubric: q.rubric,
        version: q.version,
      };
    })
    .filter(<T>(x: T | null): x is T => x !== null);
}

function totals(items: { timeLimitSeconds: number; maxScore: number }[]) {
  return {
    totalQuestions: items.length,
    totalTimeSeconds: items.reduce((s, q) => s + q.timeLimitSeconds, 0),
    maxScore: items.reduce((s, q) => s + q.maxScore, 0),
  };
}

function templateDto(t: any, extra: Record<string, unknown> = {}) {
  return {
    id: String(t._id),
    title: t.title,
    description: t.description,
    position: t.position,
    instructions: t.instructions,
    status: t.status,
    isActive: t.isActive,
    availableFrom: t.availableFrom,
    availableUntil: t.availableUntil,
    passingPercent: t.passingPercent,
    publishedVersion: t.publishedVersion,
    publishedVersionId: t.publishedVersionId ? String(t.publishedVersionId) : null,
    publishedAt: t.publishedAt,
    hasUnpublishedChanges: t.hasUnpublishedChanges,
    createdBy: t.createdBy?.fullName ? { id: String(t.createdBy._id), fullName: t.createdBy.fullName } : null,
    updatedBy: t.updatedBy?.fullName ? { id: String(t.updatedBy._id), fullName: t.updatedBy.fullName } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...extra,
  };
}

export async function listInterviews(input: z.infer<typeof listInterviewsSchema>) {
  const filter: Record<string, unknown> = { isDeleted: false };
  if (input.status) filter.status = input.status;
  if (input.publishedOnly === 'true') filter.publishedVersionId = { $ne: null };
  if (input.search) filter.title = new RegExp(escapeRegex(input.search), 'i');

  const [items, total] = await Promise.all([
    InterviewTemplate.find(filter)
      .sort({ updatedAt: -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .populate('createdBy', 'fullName')
      .populate('updatedBy', 'fullName')
      .lean(),
    InterviewTemplate.countDocuments(filter),
  ]);

  const ids = items.map((t) => t._id);
  const [assignmentCounts, attemptCounts, versionTotals] = await Promise.all([
    Assignment.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { templateId: { $in: ids }, status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$templateId', n: { $sum: 1 } } }]),
    Attempt.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { templateId: { $in: ids } } }, { $group: { _id: '$templateId', n: { $sum: 1 } } }]),
    Promise.all(items.map((t) => resolveQuestions(t as any).then(totals))),
  ]);
  const aMap = new Map(assignmentCounts.map((a) => [String(a._id), a.n]));
  const tMap = new Map(attemptCounts.map((a) => [String(a._id), a.n]));

  return paged(
    items.map((t, i) =>
      templateDto(t, {
        ...versionTotals[i],
        assignmentCount: aMap.get(String(t._id)) ?? 0,
        attemptCount: tMap.get(String(t._id)) ?? 0,
      }),
    ),
    total,
    input,
  );
}

export async function getInterview(id: string) {
  const t = await InterviewTemplate.findOne({ _id: id, isDeleted: false }).populate('createdBy', 'fullName').populate('updatedBy', 'fullName').lean();
  if (!t) throw notFound('Interview not found');
  const questions = await resolveQuestions(t as any);
  const versions = await InterviewVersion.find({ templateId: t._id }, { version: 1, publishedAt: 1, publishedBy: 1, totalQuestions: 1, maxScore: 1, totalTimeSeconds: 1 })
    .sort({ version: -1 })
    .populate('publishedBy', 'fullName')
    .lean();
  return templateDto(t, {
    questions,
    ...totals(questions),
    passingScore: Math.ceil((totals(questions).maxScore * t.passingPercent) / 100),
    versions: versions.map((v: any) => ({
      id: String(v._id),
      version: v.version,
      publishedAt: v.publishedAt,
      publishedBy: v.publishedBy?.fullName ?? null,
      totalQuestions: v.totalQuestions,
      maxScore: v.maxScore,
      totalTimeSeconds: v.totalTimeSeconds,
    })),
  });
}

export async function createInterview(req: Request, input: CreateInput) {
  await assertQuestionsUsable(input.questions.map((q) => q.questionId));
  const t = await InterviewTemplate.create({
    ...input,
    questions: input.questions.map((q) => ({ questionId: new Types.ObjectId(q.questionId), timeLimitSeconds: q.timeLimitSeconds })),
    status: 'DRAFT',
    hasUnpublishedChanges: true,
    createdBy: req.admin!.user._id,
  });
  await audit(req, { action: 'INTERVIEW_CREATED', targetType: 'InterviewTemplate', targetId: t._id, targetLabel: t.title });
  return getInterview(String(t._id));
}

export async function updateInterview(req: Request, id: string, input: UpdateInput) {
  const t = await InterviewTemplate.findOne({ _id: id, isDeleted: false });
  if (!t) throw notFound('Interview not found');
  if (input.questions) await assertQuestionsUsable(input.questions.map((q) => q.questionId));

  const from = input.availableFrom !== undefined ? input.availableFrom : t.availableFrom;
  const until = input.availableUntil !== undefined ? input.availableUntil : t.availableUntil;
  if (from && until && from >= until) throw badRequest('Availability end must be after the start', 'INVALID_WINDOW');

  const set: Record<string, unknown> = { ...input, updatedBy: req.admin!.user._id, hasUnpublishedChanges: true };
  if (input.questions) {
    set.questions = input.questions.map((q) => ({ questionId: new Types.ObjectId(q.questionId), timeLimitSeconds: q.timeLimitSeconds }));
  }
  // Toggling only the active flag does not require republishing.
  const keys = Object.keys(input);
  if (keys.length === 1 && keys[0] === 'isActive') set.hasUnpublishedChanges = t.hasUnpublishedChanges;

  await InterviewTemplate.updateOne({ _id: t._id }, { $set: set });
  await audit(req, { action: 'INTERVIEW_UPDATED', targetType: 'InterviewTemplate', targetId: t._id, targetLabel: input.title ?? t.title, details: { fields: keys } });
  return getInterview(id);
}

export async function deleteInterview(req: Request, id: string) {
  await withTransaction(async (session) => {
    const t = await InterviewTemplate.findOne({ _id: id, isDeleted: false }).session(session);
    if (!t) throw notFound('Interview not found');
    if (await Assignment.exists({ templateId: t._id, status: 'IN_PROGRESS' }).session(session)) {
      throw conflict('This interview has attempts in progress and cannot be deleted right now', 'INTERVIEW_IN_USE');
    }
    const cancelled = await Assignment.updateMany(
      { templateId: t._id, status: 'NOT_STARTED' },
      { $set: { status: 'CANCELLED', isOpen: false, closedAt: new Date(), cancelledBy: req.admin!.user._id } },
      { session },
    );
    await InterviewTemplate.updateOne(
      { _id: t._id },
      { $set: { isDeleted: true, status: 'ARCHIVED', isActive: false, deletedAt: new Date(), deletedBy: req.admin!.user._id } },
      { session },
    );
    await audit(req, { action: 'INTERVIEW_DELETED', targetType: 'InterviewTemplate', targetId: t._id, targetLabel: t.title, details: { cancelledAssignments: cancelled.modifiedCount } }, session);
  });
}

/**
 * Freezes the current draft into an immutable InterviewVersion. Every question is copied in full
 * (text, options, answer key, rubric, timer) so later edits can never alter what candidates received.
 */
export async function publishInterview(req: Request, id: string) {
  const result = await withTransaction(async (session) => {
    const t = await InterviewTemplate.findOne({ _id: id, isDeleted: false }).session(session);
    if (!t) throw notFound('Interview not found');
    if (!t.questions.length) throw badRequest('Add at least one question before publishing', 'NO_QUESTIONS');

    const ids = t.questions.map((q) => q.questionId);
    const docs = await Question.find({ _id: { $in: ids }, isDeleted: false }).session(session).lean();
    if (docs.length !== ids.length) throw conflict('Some questions were deleted. Review the question list before publishing.', 'QUESTION_NOT_FOUND');
    const cats = await Category.find({ _id: { $in: docs.map((d) => d.categoryId) } }).session(session).lean();
    const catName = new Map(cats.map((c) => [String(c._id), c.name]));
    const byId = new Map(docs.map((d) => [String(d._id), d]));

    const questions = t.questions.map((entry, order) => {
      const q = byId.get(String(entry.questionId))!;
      return {
        questionId: q._id,
        questionVersion: q.version,
        order,
        title: q.title,
        prompt: q.prompt,
        scenario: q.scenario ?? '',
        type: q.type,
        difficulty: q.difficulty,
        categoryId: q.categoryId,
        categoryName: catName.get(String(q.categoryId)) ?? 'Unknown',
        timeLimitSeconds: entry.timeLimitSeconds ?? q.timeLimitSeconds,
        maxScore: q.maxScore,
        rubric: q.rubric ?? '',
        options: q.options ?? [],
        allowMultiple: q.allowMultiple ?? false,
        correctOptionKeys: q.correctOptionKeys ?? [],
        correctBoolean: q.correctBoolean ?? null,
      };
    });
    const sum = totals(questions);
    const version = (t.publishedVersion ?? 0) + 1;
    const now = new Date();
    const [v] = await InterviewVersion.create(
      [
        {
          templateId: t._id,
          version,
          title: t.title,
          description: t.description,
          position: t.position,
          instructions: t.instructions,
          passingPercent: t.passingPercent,
          availableFrom: t.availableFrom,
          availableUntil: t.availableUntil,
          questions,
          ...sum,
          publishedBy: req.admin!.user._id,
          publishedAt: now,
        },
      ],
      { session },
    );
    const upd = await InterviewTemplate.updateOne(
      { _id: t._id, publishedVersion: t.publishedVersion },
      { $set: { status: 'PUBLISHED', publishedVersionId: v!._id, publishedVersion: version, publishedAt: now, hasUnpublishedChanges: false, updatedBy: req.admin!.user._id } },
      { session },
    );
    if (upd.modifiedCount !== 1) throw conflict('This interview was published concurrently. Reload and try again.', 'STALE_WRITE');
    await audit(req, { action: 'INTERVIEW_PUBLISHED', targetType: 'InterviewTemplate', targetId: t._id, targetLabel: t.title, details: { version, ...sum } }, session);
    return { version, versionId: String(v!._id) };
  });
  return { ...(await getInterview(id)), published: result };
}

export async function getInterviewVersion(templateId: string, versionId: string) {
  const v = await InterviewVersion.findOne({ _id: versionId, templateId }).populate('publishedBy', 'fullName').lean();
  if (!v) throw notFound('Interview version not found');
  return v;
}
