import express, { Router, type NextFunction, type Request, type Response } from 'express';
import * as admin from '../controllers/adminController';
import * as auth from '../controllers/authController';
import * as exam from '../controllers/examController';
import { monitorStream } from '../controllers/monitorStream';
import { requireCandidate, requireHeadAdmin, requireStaff } from '../middleware/auth';
import { examReadLimiter, examWriteLimiter, exportLimiter, loginLimiter, mfaLimiter } from '../middleware/rateLimit';
import { csrfProtection } from '../security/csrf';
import { badRequest } from '../utils/errors';

/**
 * navigator.sendBeacon cannot set headers or JSON content-type, so the page-exit signal arrives
 * as text/plain with the CSRF token inside the body. Mounted before the global CSRF middleware.
 */
export function beaconRouter(): Router {
  const r = Router();
  r.post(
    '/exam/security-beacon',
    express.text({ type: ['text/plain', 'application/json'], limit: '4kb' }),
    (req: Request, _res: Response, next: NextFunction) => {
      if (typeof req.body === 'string') {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          return next(badRequest('Malformed beacon'));
        }
      }
      next();
    },
    csrfProtection({ bodyTokenField: 'csrfToken' }),
    requireCandidate,
    exam.securityEvent,
  );
  return r;
}

export function apiRouter(): Router {
  const r = Router();

  // ── Authentication ──
  r.get('/auth/csrf', auth.csrf);
  r.post('/auth/login', loginLimiter, auth.login);
  r.post('/auth/mfa/verify', mfaLimiter, auth.verifyMfa);
  r.post('/auth/logout', auth.logout);
  r.get('/auth/me', auth.me);
  r.post('/auth/refresh', auth.refresh);
  r.post('/auth/password', requireStaff, auth.changePassword);
  r.patch('/auth/profile', requireStaff, auth.updateProfile);
  r.post('/auth/mfa/setup', requireStaff, auth.mfaSetup);
  r.post('/auth/mfa/enable', requireStaff, mfaLimiter, auth.mfaEnable);
  r.post('/auth/mfa/disable', requireStaff, mfaLimiter, auth.mfaDisable);

  // ── Candidate examination (candidate session only) ──
  const ex = Router();
  ex.use(requireCandidate);
  ex.get('/status', exam.status);
  ex.get('/assignment', exam.assignment);
  ex.get('/instructions', exam.instructions);
  ex.post('/start', examWriteLimiter, exam.start);
  ex.get('/current-question', examReadLimiter, exam.currentQuestion);
  ex.patch('/answer', examWriteLimiter, exam.saveAnswer);
  ex.post('/submit-answer', examWriteLimiter, exam.submitAnswer);
  ex.post('/security-event', examWriteLimiter, exam.securityEvent);
  ex.post('/heartbeat', examWriteLimiter, exam.heartbeat);
  r.use('/exam', ex);

  // ── Staff (Head Admin + Support Curator) ──
  const staff = Router();
  staff.use(requireStaff);

  staff.get('/candidates', admin.listCandidates);
  staff.post('/candidates', admin.createCandidate);
  staff.get('/candidates/:id', admin.getCandidate);
  staff.patch('/candidates/:id', admin.updateCandidate);
  staff.delete('/candidates/:id', admin.archiveCandidate);
  staff.post('/candidates/:id/credentials', admin.regenerateCredentials);
  staff.post('/candidates/:id/assignments', admin.assignInterview);
  staff.post('/candidates/:id/notes', admin.addNote);
  staff.delete('/assignments/:id', admin.cancelAssignment);

  staff.get('/attempts', admin.listAttempts);
  staff.post('/attempts/:id/terminate', admin.terminateAttempt);

  staff.get('/categories', admin.listCategories);
  staff.post('/categories', admin.createCategory);
  staff.patch('/categories/:id', admin.updateCategory);
  staff.delete('/categories/:id', admin.deleteCategory);

  staff.get('/questions', admin.listQuestions);
  staff.post('/questions', admin.createQuestion);
  staff.patch('/questions/reorder', admin.reorderQuestions);
  staff.get('/questions/:id', admin.getQuestion);
  staff.patch('/questions/:id', admin.updateQuestion);
  staff.delete('/questions/:id', admin.deleteQuestion);
  staff.post('/questions/:id/duplicate', admin.duplicateQuestion);

  staff.get('/interviews', admin.listInterviews);
  staff.post('/interviews', admin.createInterview);
  staff.get('/interviews/:id', admin.getInterview);
  staff.patch('/interviews/:id', admin.updateInterview);
  staff.delete('/interviews/:id', admin.deleteInterview);
  staff.post('/interviews/:id/publish', admin.publishInterview);
  staff.get('/interviews/:id/versions/:versionId', admin.getInterviewVersion);

  staff.get('/evaluations', admin.listEvaluations);
  staff.get('/evaluations/:attemptId', admin.getEvaluation);
  staff.patch('/evaluations/:attemptId', admin.saveEvaluation);

  staff.get('/staff', admin.staffDirectory);

  staff.get('/analytics/overview', admin.analyticsOverview);
  staff.get('/analytics/interviews', admin.analyticsInterviews);
  staff.get('/analytics/candidates', admin.analyticsCandidates);
  staff.get('/analytics/questions', admin.analyticsQuestions);
  staff.get('/analytics/security', admin.analyticsSecurity);
  staff.get('/analytics/activity', admin.analyticsActivity);

  staff.get('/logs/security', admin.securityLog);
  staff.get('/logs/audit', admin.auditLog);

  staff.get('/monitor/active', admin.monitorActive);
  staff.get('/monitor/events', admin.monitorEvents);
  staff.get('/monitor/stream', monitorStream);

  staff.get('/exports/attempts', exportLimiter, admin.exportCsv);
  staff.get('/exports/attempts/:id/pdf', exportLimiter, admin.exportPdf);

  // ── Head Admin only ──
  const head = Router();
  head.use(requireHeadAdmin);
  head.get('/', admin.listCurators);
  head.post('/', admin.createCurator);
  head.get('/:id', admin.getCurator);
  head.patch('/:id', admin.updateCurator);
  head.delete('/:id', admin.removeCurator);
  head.post('/:id/reset-password', admin.resetCuratorPassword);
  r.use('/curators', head);

  // Staff router is mounted last so that the candidate/curator sub-routers above resolve first;
  // unknown paths fall through to its auth check and then the 404 handler.
  r.use(staff);
  return r;
}
