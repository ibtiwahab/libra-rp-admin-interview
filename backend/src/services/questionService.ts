import type { Request } from 'express';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { withTransaction } from '../config/database';
import { Category, InterviewTemplate, Question, QuestionVersion, type QuestionDoc } from '../models';
import { badRequest, conflict, notFound } from '../utils/errors';
import { escapeRegex, paged } from '../utils/pagination';
import type { createQuestionSchema, listQuestionsSchema } from '../validators/questions';
import { audit } from './logService';

type QuestionInput = z.infer<typeof createQuestionSchema>;
type ListInput = z.infer<typeof listQuestionsSchema>;

const CONTENT_KEYS = [
  'title',
  'prompt',
  'scenario',
  'type',
  'difficulty',
  'timeLimitSeconds',
  'maxScore',
  'rubric',
  'options',
  'allowMultiple',
  'correctOptionKeys',
  'correctBoolean',
  'categoryId',
] as const;

function contentOf(q: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of CONTENT_KEYS) {
    const v = q[k];
    out[k] = v instanceof Types.ObjectId ? String(v) : v;
  }
  return JSON.parse(JSON.stringify(out));
}

async function requireCategory(categoryId: string) {
  const cat = await Category.findById(categoryId).lean();
  if (!cat) throw badRequest('Unknown category', 'CATEGORY_NOT_FOUND');
  if (!cat.isActive) throw badRequest('This category is inactive', 'CATEGORY_INACTIVE');
  return cat;
}

export function toQuestionDto(q: Record<string, any>) {
  return {
    id: String(q._id),
    title: q.title,
    prompt: q.prompt,
    scenario: q.scenario,
    type: q.type,
    difficulty: q.difficulty,
    timeLimitSeconds: q.timeLimitSeconds,
    maxScore: q.maxScore,
    rubric: q.rubric,
    options: q.options ?? [],
    allowMultiple: q.allowMultiple,
    correctOptionKeys: q.correctOptionKeys ?? [],
    correctBoolean: q.correctBoolean,
    category: q.categoryId && typeof q.categoryId === 'object' && 'name' in q.categoryId
      ? { id: String(q.categoryId._id), name: q.categoryId.name }
      : { id: String(q.categoryId), name: null },
    position: q.position,
    version: q.version,
    createdBy: q.createdBy && typeof q.createdBy === 'object' && 'fullName' in q.createdBy
      ? { id: String(q.createdBy._id), fullName: q.createdBy.fullName, username: q.createdBy.username }
      : null,
    updatedBy: q.updatedBy && typeof q.updatedBy === 'object' && 'fullName' in q.updatedBy
      ? { id: String(q.updatedBy._id), fullName: q.updatedBy.fullName }
      : null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

export async function listQuestions(input: ListInput) {
  const filter: Record<string, unknown> = { isDeleted: false };
  if (input.categoryId) filter.categoryId = new Types.ObjectId(input.categoryId);
  if (input.type) filter.type = input.type;
  if (input.difficulty) filter.difficulty = input.difficulty;
  if (input.search) {
    const rx = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ title: rx }, { prompt: rx }];
  }
  const all = input.all === 'true';
  const query = Question.find(filter)
    .sort({ position: 1, _id: 1 })
    .populate('categoryId', 'name')
    .populate('createdBy', 'fullName username')
    .populate('updatedBy', 'fullName')
    .lean();
  if (!all) query.skip((input.page - 1) * input.limit).limit(input.limit);
  else query.limit(2000);
  const [items, total] = await Promise.all([query, Question.countDocuments(filter)]);
  return paged(items.map(toQuestionDto), total, all ? { page: 1, limit: Math.max(total, 1) } : input);
}

export async function getQuestion(id: string) {
  const q = await Question.findOne({ _id: id, isDeleted: false })
    .populate('categoryId', 'name')
    .populate('createdBy', 'fullName username')
    .populate('updatedBy', 'fullName')
    .lean();
  if (!q) throw notFound('Question not found');
  const versions = await QuestionVersion.find({ questionId: q._id }, { version: 1, changeType: 1, createdAt: 1, createdBy: 1, title: 1, timeLimitSeconds: 1 })
    .sort({ version: -1 })
    .populate('createdBy', 'fullName')
    .lean();
  return {
    ...toQuestionDto(q),
    versions: versions.map((v: any) => ({
      version: v.version,
      changeType: v.changeType,
      title: v.title,
      timeLimitSeconds: v.timeLimitSeconds,
      createdAt: v.createdAt,
      createdBy: v.createdBy?.fullName ?? null,
    })),
  };
}

export async function createQuestion(req: Request, input: QuestionInput) {
  const cat = await requireCategory(input.categoryId);
  const actor = req.admin!.user._id;
  const q = await withTransaction(async (session) => {
    const last = await Question.findOne({ isDeleted: false }, { position: 1 }).sort({ position: -1 }).session(session).lean();
    const [doc] = await Question.create(
      [{ ...input, categoryId: cat._id, position: (last?.position ?? 0) + 1, version: 1, createdBy: actor }],
      { session },
    );
    await QuestionVersion.create(
      [{ ...input, questionId: doc!._id, version: 1, categoryId: cat._id, categoryName: cat.name, changeType: 'CREATED', createdBy: actor }],
      { session },
    );
    await audit(req, { action: 'QUESTION_CREATED', targetType: 'Question', targetId: doc!._id, targetLabel: doc!.title }, session);
    return doc!;
  });
  return getQuestion(String(q._id));
}

export async function updateQuestion(req: Request, id: string, input: QuestionInput) {
  const cat = await requireCategory(input.categoryId);
  const actor = req.admin!.user._id;
  await withTransaction(async (session) => {
    const existing = await Question.findOne({ _id: id, isDeleted: false }).session(session);
    if (!existing) throw notFound('Question not found');
    const before = contentOf(existing.toObject());
    const after = contentOf({ ...input, categoryId: cat._id });
    if (JSON.stringify(before) === JSON.stringify(after)) return;

    const version = existing.version + 1;
    const res = await Question.updateOne(
      { _id: existing._id, version: existing.version, isDeleted: false },
      { $set: { ...input, categoryId: cat._id, version, updatedBy: actor } },
      { session },
    );
    if (res.modifiedCount !== 1) throw conflict('This question was modified by someone else. Reload and try again.', 'STALE_WRITE');
    await QuestionVersion.create(
      [{ ...input, questionId: existing._id, version, categoryId: cat._id, categoryName: cat.name, changeType: 'UPDATED', createdBy: actor }],
      { session },
    );
    await InterviewTemplate.updateMany(
      { 'questions.questionId': existing._id, isDeleted: false },
      { $set: { hasUnpublishedChanges: true } },
      { session },
    );
    const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    await audit(req, { action: 'QUESTION_UPDATED', targetType: 'Question', targetId: existing._id, targetLabel: input.title, details: { version, changed } }, session);
  });
  return getQuestion(id);
}

/**
 * Soft-deletes a question and removes it from every interview template draft.
 * Published interview versions and recorded answers keep their own immutable snapshots.
 */
export async function deleteQuestion(req: Request, id: string) {
  const actor = req.admin!.user._id;
  await withTransaction(async (session) => {
    const q = await Question.findOne({ _id: id, isDeleted: false }).session(session);
    if (!q) throw notFound('Question not found');
    const cat = await Category.findById(q.categoryId).session(session).lean();
    const version = q.version + 1;
    await Question.updateOne({ _id: q._id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actor, version } }, { session });
    const snap = q.toObject() as Record<string, any>;
    delete snap._id;
    delete snap.createdAt;
    delete snap.updatedAt;
    await QuestionVersion.create(
      [{ ...contentOf(snap), categoryId: q.categoryId, questionId: q._id, version, categoryName: cat?.name ?? 'Unknown', changeType: 'DELETED', createdBy: actor }],
      { session },
    );
    const affected = await InterviewTemplate.updateMany(
      { 'questions.questionId': q._id },
      { $pull: { questions: { questionId: q._id } }, $set: { hasUnpublishedChanges: true } },
      { session },
    );
    await audit(req, { action: 'QUESTION_DELETED', targetType: 'Question', targetId: q._id, targetLabel: q.title, details: { removedFromTemplates: affected.modifiedCount } }, session);
  });
}

export async function duplicateQuestion(req: Request, id: string) {
  const src = await Question.findOne({ _id: id, isDeleted: false }).lean();
  if (!src) throw notFound('Question not found');
  const content = contentOf(src) as QuestionInput;
  const copy = await createQuestion(req, { ...content, title: `${src.title} (Copy)`.slice(0, 160) });
  await audit(req, { action: 'QUESTION_DUPLICATED', targetType: 'Question', targetId: new Types.ObjectId(copy.id), targetLabel: copy.title, details: { sourceId: String(src._id) } });
  return copy;
}

/**
 * Persists a new bank order. The client must send the complete current set of question ids so
 * that concurrent additions/deletions are detected rather than silently mis-ordered.
 */
export async function reorderQuestions(req: Request, orderedIds: string[]) {
  if (new Set(orderedIds).size !== orderedIds.length) throw badRequest('Duplicate ids in order', 'INVALID_ORDER');
  await withTransaction(async (session) => {
    const active = await Question.find({ isDeleted: false }, { _id: 1 }).session(session).lean();
    const activeIds = new Set(active.map((q) => String(q._id)));
    if (activeIds.size !== orderedIds.length || !orderedIds.every((i) => activeIds.has(i))) {
      throw conflict('The question bank changed while you were reordering. Reload and try again.', 'ORDER_OUT_OF_DATE');
    }
    await Question.bulkWrite(
      orderedIds.map((qid, idx) => ({ updateOne: { filter: { _id: new Types.ObjectId(qid) }, update: { $set: { position: idx + 1 } } } })),
      { session },
    );
    await audit(req, { action: 'QUESTIONS_REORDERED', targetType: 'QuestionBank', details: { count: orderedIds.length } }, session);
  });
}

export type { QuestionDoc };
