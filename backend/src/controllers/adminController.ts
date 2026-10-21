import type { Request, Response } from 'express';
import { adminCtx } from '../middleware/auth';
import * as analytics from '../services/analyticsService';
import * as candidates from '../services/candidateService';
import * as categories from '../services/categoryService';
import * as curators from '../services/curatorService';
import * as evaluations from '../services/evaluationService';
import { adminTerminate } from '../services/examService';
import * as exportSvc from '../services/exportService';
import * as interviews from '../services/interviewService';
import { audit } from '../services/logService';
import * as logs from '../services/logQueryService';
import * as monitor from '../services/monitorService';
import * as questions from '../services/questionService';
import { idParams, objectId } from '../validators/common';
import { assignSchema, createCandidateSchema, listCandidatesSchema, noteSchema, terminateSchema, updateCandidateSchema } from '../validators/candidates';
import { listAttemptsSchema, saveEvaluationSchema } from '../validators/evaluations';
import { createInterviewSchema, listInterviewsSchema, updateInterviewSchema } from '../validators/interviews';
import { categorySchema, categoryUpdateSchema, createQuestionSchema, listQuestionsSchema, reorderSchema, updateQuestionSchema } from '../validators/questions';
import { analyticsRange, auditLogQuery, createCuratorSchema, listCuratorsSchema, securityLogQuery, updateCuratorSchema } from '../validators/admin';
import { z } from 'zod';
import { User } from '../models';

const id = (req: Request) => idParams.parse(req.params).id;

// ── Candidates ──
export const listCandidates = async (req: Request, res: Response) => res.json(await candidates.listCandidates(listCandidatesSchema.parse(req.query)));
export const createCandidate = async (req: Request, res: Response) => res.status(201).json(await candidates.createCandidate(req, createCandidateSchema.parse(req.body)));
export const getCandidate = async (req: Request, res: Response) => res.json(await candidates.getCandidate(id(req)));
export const updateCandidate = async (req: Request, res: Response) => res.json(await candidates.updateCandidate(req, id(req), updateCandidateSchema.parse(req.body)));
export const archiveCandidate = async (req: Request, res: Response) => {
  await candidates.archiveCandidate(req, id(req));
  res.status(204).end();
};
export const regenerateCredentials = async (req: Request, res: Response) => res.json({ credentials: await candidates.regenerateCredentials(req, id(req)) });
export const assignInterview = async (req: Request, res: Response) => {
  const input = assignSchema.parse(req.body);
  res.status(201).json(await candidates.assignInterview(req, id(req), input.templateId, input.startDeadline));
};
export const addNote = async (req: Request, res: Response) => {
  const input = noteSchema.parse(req.body);
  res.status(201).json(await candidates.addNote(req, id(req), input.body, input.attemptId));
};
export const cancelAssignment = async (req: Request, res: Response) => {
  await candidates.cancelAssignment(req, id(req));
  res.status(204).end();
};

// ── Attempts / history ──
export const listAttempts = async (req: Request, res: Response) => res.json(await evaluations.listAttempts(listAttemptsSchema.parse(req.query)));
export const terminateAttempt = async (req: Request, res: Response) => {
  const { reason } = terminateSchema.parse(req.body);
  const attempt = await adminTerminate(id(req), reason);
  await audit(req, { action: 'ATTEMPT_TERMINATED', targetType: 'InterviewAttempt', targetId: attempt._id, targetLabel: `${attempt.candidateSnapshot.candidateCode} · ${attempt.referenceCode}`, details: { reason } });
  res.status(204).end();
};

// ── Categories ──
export const listCategories = async (_req: Request, res: Response) => res.json({ items: await categories.listCategories() });
export const createCategory = async (req: Request, res: Response) => res.status(201).json(await categories.createCategory(req, categorySchema.parse(req.body)));
export const updateCategory = async (req: Request, res: Response) => res.json(await categories.updateCategory(req, id(req), categoryUpdateSchema.parse(req.body)));
export const deleteCategory = async (req: Request, res: Response) => res.json(await categories.deleteCategory(req, id(req)));

// ── Questions ──
export const listQuestions = async (req: Request, res: Response) => res.json(await questions.listQuestions(listQuestionsSchema.parse(req.query)));
export const getQuestion = async (req: Request, res: Response) => res.json(await questions.getQuestion(id(req)));
export const createQuestion = async (req: Request, res: Response) => res.status(201).json(await questions.createQuestion(req, createQuestionSchema.parse(req.body)));
export const updateQuestion = async (req: Request, res: Response) => res.json(await questions.updateQuestion(req, id(req), updateQuestionSchema.parse(req.body)));
export const deleteQuestion = async (req: Request, res: Response) => {
  await questions.deleteQuestion(req, id(req));
  res.status(204).end();
};
export const duplicateQuestion = async (req: Request, res: Response) => res.status(201).json(await questions.duplicateQuestion(req, id(req)));
export const reorderQuestions = async (req: Request, res: Response) => {
  await questions.reorderQuestions(req, reorderSchema.parse(req.body).orderedIds);
  res.status(204).end();
};

// ── Interviews ──
export const listInterviews = async (req: Request, res: Response) => res.json(await interviews.listInterviews(listInterviewsSchema.parse(req.query)));
export const getInterview = async (req: Request, res: Response) => res.json(await interviews.getInterview(id(req)));
export const createInterview = async (req: Request, res: Response) => res.status(201).json(await interviews.createInterview(req, createInterviewSchema.parse(req.body)));
export const updateInterview = async (req: Request, res: Response) => res.json(await interviews.updateInterview(req, id(req), updateInterviewSchema.parse(req.body)));
export const deleteInterview = async (req: Request, res: Response) => {
  await interviews.deleteInterview(req, id(req));
  res.status(204).end();
};
export const publishInterview = async (req: Request, res: Response) => res.json(await interviews.publishInterview(req, id(req)));
export const getInterviewVersion = async (req: Request, res: Response) => {
  const p = z.object({ id: objectId, versionId: objectId }).parse(req.params);
  res.json(await interviews.getInterviewVersion(p.id, p.versionId));
};

// ── Evaluations ──
export const listEvaluations = async (req: Request, res: Response) => res.json(await evaluations.listAttempts(listAttemptsSchema.parse({ queue: 'pending', ...req.query })));
export const getEvaluation = async (req: Request, res: Response) => res.json(await evaluations.getEvaluation(z.object({ attemptId: objectId }).parse(req.params).attemptId));
export const saveEvaluation = async (req: Request, res: Response) =>
  res.json(await evaluations.saveEvaluation(req, z.object({ attemptId: objectId }).parse(req.params).attemptId, saveEvaluationSchema.parse(req.body)));

// ── Curators (Head Admin) ──
export const listCurators = async (req: Request, res: Response) => res.json(await curators.listCurators(listCuratorsSchema.parse(req.query)));
export const getCurator = async (req: Request, res: Response) => res.json(await curators.getCurator(id(req)));
export const createCurator = async (req: Request, res: Response) => res.status(201).json(await curators.createCurator(req, createCuratorSchema.parse(req.body)));
export const updateCurator = async (req: Request, res: Response) => res.json(await curators.updateCurator(req, id(req), updateCuratorSchema.parse(req.body)));
export const removeCurator = async (req: Request, res: Response) => {
  await curators.removeCurator(req, id(req));
  res.status(204).end();
};
export const resetCuratorPassword = async (req: Request, res: Response) => res.json({ credentials: await curators.resetCuratorPassword(req, id(req)) });

// ── Staff directory (evaluator filters) ──
export const staffDirectory = async (_req: Request, res: Response) => {
  const users = await User.find({}, { fullName: 1, username: 1, role: 1, status: 1 }).sort({ fullName: 1 }).lean();
  res.json({ items: users.map((u) => ({ id: String(u._id), fullName: u.fullName, username: u.username, role: u.role, status: u.status })) });
};

// ── Analytics ──
export const analyticsOverview = async (_req: Request, res: Response) => res.json(await analytics.overview());
export const analyticsInterviews = async (req: Request, res: Response) => res.json(await analytics.interviewTrends(analyticsRange.parse(req.query).days));
export const analyticsCandidates = async (_req: Request, res: Response) => res.json(await analytics.candidatePerformance());
export const analyticsQuestions = async (_req: Request, res: Response) => res.json(await analytics.questionInsights());
export const analyticsSecurity = async (req: Request, res: Response) => res.json(await analytics.securityInsights(analyticsRange.parse(req.query).days));
export const analyticsActivity = async (_req: Request, res: Response) => res.json({ items: await analytics.recentActivity(15) });

// ── Logs ──
export const securityLog = async (req: Request, res: Response) => res.json(await logs.querySecurityLog(securityLogQuery.parse(req.query)));
export const auditLog = async (req: Request, res: Response) => res.json(await logs.queryAuditLog(auditLogQuery.parse(req.query)));

// ── Monitor ──
export const monitorActive = async (_req: Request, res: Response) => res.json(await monitor.activeInterviews());
export const monitorEvents = async (_req: Request, res: Response) => res.json({ items: await monitor.recentLiveEvents(80) });

// ── Exports ──
export const exportCsv = async (req: Request, res: Response) => {
  const input = listAttemptsSchema.parse({ ...req.query, page: 1, limit: 100 });
  const { csv, count } = await exportSvc.attemptsCsv(input);
  await audit(req, { action: 'EXPORT_GENERATED', targetType: 'Export', targetLabel: 'attempts.csv', details: { rows: count, filters: req.query } });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="libra-rp-interviews-${stamp}.csv"`);
  res.send('﻿' + csv);
};

export const exportPdf = async (req: Request, res: Response) => {
  const { user } = adminCtx(req);
  const { doc, filename } = await exportSvc.attemptPdf(id(req), `${user.fullName} (@${user.username})`);
  await audit(req, { action: 'EXPORT_GENERATED', targetType: 'InterviewAttempt', targetId: null, targetLabel: filename, details: { attemptId: id(req) } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
};
