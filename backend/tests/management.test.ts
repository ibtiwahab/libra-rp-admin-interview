import { describe, expect, it } from 'vitest';
import { Answer, AuditLog, Evaluation, InterviewTemplate, InterviewVersion, Question, QuestionVersion, Session, User } from '../src/models';
import {
  Client,
  adminClient,
  createCandidate,
  createQuestion,
  examScenario,
  headAdmin,
  publishedInterview,
  seedCategories,
  startExam,
  useDatabase,
} from './helpers';

useDatabase();

async function withCurator(head: Client) {
  const r = await head.post('/api/curators', { fullName: 'Alex Curator', username: 'alex', generatePassword: true });
  expect(r.status).toBe(201);
  const curator = await adminClient('alex', r.body.credentials.password);
  // Generated passwords are temporary: nothing works until the curator changes it.
  const blocked = await curator.get('/api/candidates');
  expect(blocked.status).toBe(403);
  expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  const password = 'Curator-Own-Passw0rd!';
  expect((await curator.post('/api/auth/password', { currentPassword: r.body.credentials.password, newPassword: password })).status).toBe(204);
  return { curator, id: r.body.curator.id as string, password };
}

describe('roles and permissions', () => {
  it('Head Admin can create, disable, reactivate and remove Support Curators', async () => {
    const head = await headAdmin();
    const { curator, id } = await withCurator(head);
    expect((await head.get('/api/curators')).body.items).toHaveLength(1);

    expect((await head.patch(`/api/curators/${id}`, { status: 'DISABLED' })).status).toBe(200);
    expect((await curator.get('/api/candidates')).status).toBe(401); // sessions revoked
    expect((await head.patch(`/api/curators/${id}`, { status: 'ACTIVE' })).status).toBe(200);

    expect((await head.delete(`/api/curators/${id}`)).status).toBe(204);
    const u = await User.findById(id).lean();
    expect(u!.status).toBe('REMOVED'); // soft delete: historical references stay valid
    expect(await Session.countDocuments({ subjectId: u!._id, status: 'ACTIVE' })).toBe(0);
    expect(await AuditLog.countDocuments({ action: { $in: ['CURATOR_CREATED', 'CURATOR_DISABLED', 'CURATOR_REACTIVATED', 'CURATOR_REMOVED'] } })).toBe(4);
  });

  it('Support Curators cannot manage Support Curators or elevate privileges', async () => {
    const head = await headAdmin();
    const { curator, id } = await withCurator(head);
    expect((await curator.get('/api/curators')).status).toBe(403);
    expect((await curator.post('/api/curators', { fullName: 'Evil', username: 'evil' })).status).toBe(403);
    expect((await curator.patch(`/api/curators/${id}`, { status: 'ACTIVE' })).status).toBe(403);
    expect((await curator.delete(`/api/curators/${id}`)).status).toBe(403);
    // the API has no way to set a role, even for a Head Admin
    expect((await head.patch(`/api/curators/${id}`, { role: 'HEAD_ADMIN' })).status).toBe(400);
    const headUser = await User.findOne({ role: 'HEAD_ADMIN' }).lean();
    expect((await head.patch(`/api/curators/${headUser!._id}`, { status: 'DISABLED' })).status).toBe(404);
    expect((await User.findById(id).lean())!.role).toBe('SUPPORT_CURATOR');
  });

  it('both administrative roles can manage questions, interviews and candidates', async () => {
    const head = await headAdmin();
    const { curator } = await withCurator(head);
    for (const c of [head, curator]) {
      const { templateId } = await publishedInterview(c, [{}]);
      expect((await c.get(`/api/interviews/${templateId}`)).status).toBe(200);
      const cand = await createCandidate(c, templateId);
      expect(cand.credentials.password).toBeTruthy();
      await InterviewTemplate.deleteMany({});
      await Question.deleteMany({});
      const db = Question.db;
      await db.collection('categories').deleteMany({});
      await db.collection('interview_assignments').deleteMany({});
    }
  });

  it('removing a curator preserves their evaluations', async () => {
    const { admin, candidate } = await examScenario([{}]);
    const { curator, id } = await withCurator(admin);
    const s = await startExam(candidate);
    await candidate.post('/api/exam/submit-answer', { questionIndex: 0, seq: 1, answerText: 'answer' });
    const ev = await curator.patch(`/api/evaluations/${s.body.attempt.id}`, { expectedRevision: 0, decision: 'PASSED', marks: [{ questionIndex: 0, awardedScore: 8, notes: 'good' }] });
    expect(ev.status).toBe(200);
    await admin.delete(`/api/curators/${id}`);
    const detail = await admin.get(`/api/evaluations/${s.body.attempt.id}`);
    expect(detail.body.attempt.evaluatedBy.fullName).toBe('Alex Curator');
    expect(detail.body.revisions[0].evaluator).toBe('Alex Curator');
  });
});

describe('production rules', () => {
  it('candidates can only apply for Admin Assistant or Admin', async () => {
    const c = await headAdmin();
    const base = { fullName: 'Role Test', discordUsername: 'roletest', characterName: 'Role Char' };
    expect((await c.post('/api/candidates', { ...base, appliedRole: 'Moderator' })).status).toBe(400);
    expect((await c.post('/api/candidates', { ...base, appliedRole: 'Senior Admin' })).status).toBe(400);
    const ok = await c.post('/api/candidates', { ...base, appliedRole: 'Admin' });
    expect(ok.status).toBe(201);
    expect(ok.body.candidate.appliedRole).toBe('Admin');
    const def = await c.post('/api/candidates', { ...base, discordUsername: 'roletest2' });
    expect(def.body.candidate.appliedRole).toBe('Admin Assistant');
    expect((await c.patch(`/api/candidates/${ok.body.candidate.id}`, { appliedRole: 'Moderator' })).status).toBe(400);
  });

  it('a temporary password blocks everything except changing it', async () => {
    const head = await headAdmin();
    const r = await head.post('/api/curators', { fullName: 'Temp Pass', username: 'temp.pass', generatePassword: true });
    const c = await adminClient('temp.pass', r.body.credentials.password);
    expect((await c.get('/api/auth/me?portal=admin')).body.user.mustChangePassword).toBe(true);
    for (const path of ['/api/candidates', '/api/questions', '/api/analytics/overview']) {
      expect((await c.get(path)).body.error.code, path).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    expect((await c.post('/api/auth/password', { currentPassword: r.body.credentials.password, newPassword: 'Brand-New-Passw0rd!' })).status).toBe(204);
    expect((await c.get('/api/candidates')).status).toBe(200);
  });
});

describe('question bank', () => {
  it('creates, edits with versioning, duplicates and soft-deletes questions', async () => {
    const c = await headAdmin();
    const [cat] = await seedCategories(c);
    const id = await createQuestion(c, cat!, 1);
    const edit = await c.patch(`/api/questions/${id}`, {
      title: 'Question 1 (edited)',
      prompt: 'New prompt text?',
      type: 'LONG_TEXT',
      categoryId: cat,
      timeLimitSeconds: 60,
      maxScore: 10,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.version).toBe(2);
    expect(edit.body.versions.map((v: any) => v.version)).toEqual([2, 1]);

    const dup = await c.post(`/api/questions/${id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.title).toContain('(Copy)');

    expect((await c.delete(`/api/questions/${id}`)).status).toBe(204);
    expect((await c.get(`/api/questions/${id}`)).status).toBe(404);
    expect(await Question.countDocuments({ _id: id, isDeleted: true })).toBe(1);
    expect(await QuestionVersion.countDocuments({ questionId: id })).toBe(3);
  });

  it('enforces the 30–60 second timer range and defaults to 45 seconds', async () => {
    const c = await headAdmin();
    const [cat] = await seedCategories(c);
    const base = { title: 'Timer test', prompt: 'Timer prompt?', type: 'SHORT_TEXT', categoryId: cat };
    expect((await c.post('/api/questions', { ...base, timeLimitSeconds: 29 })).status).toBe(400);
    expect((await c.post('/api/questions', { ...base, timeLimitSeconds: 61 })).status).toBe(400);
    expect((await c.post('/api/questions', { ...base, timeLimitSeconds: 30 })).status).toBe(201);
    expect((await c.post('/api/questions', { ...base, timeLimitSeconds: 60 })).status).toBe(201);
    const def = await c.post('/api/questions', base);
    expect(def.body.timeLimitSeconds).toBe(45);
  });

  it('validates multiple-choice and true/false answer keys', async () => {
    const c = await headAdmin();
    const [cat] = await seedCategories(c);
    const mc = { title: 'MC question', prompt: 'Pick one?', type: 'MULTIPLE_CHOICE', categoryId: cat, options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] };
    expect((await c.post('/api/questions', { ...mc, correctOptionKeys: [] })).status).toBe(400);
    expect((await c.post('/api/questions', { ...mc, correctOptionKeys: ['C'] })).status).toBe(400);
    expect((await c.post('/api/questions', { ...mc, correctOptionKeys: ['A', 'B'] })).status).toBe(400);
    expect((await c.post('/api/questions', { ...mc, correctOptionKeys: ['A'] })).status).toBe(201);
    expect((await c.post('/api/questions', { title: 'TF question', prompt: 'True or false?', type: 'TRUE_FALSE', categoryId: cat })).status).toBe(400);
  });

  it('persists reordering and rejects stale orders', async () => {
    const c = await headAdmin();
    const [cat] = await seedCategories(c);
    const ids = [await createQuestion(c, cat!, 1), await createQuestion(c, cat!, 2), await createQuestion(c, cat!, 3)];
    const reversed = [...ids].reverse();
    expect((await c.patch('/api/questions/reorder', { orderedIds: reversed })).status).toBe(204);
    const list = await c.get('/api/questions?all=true');
    expect(list.body.items.map((q: any) => q.id)).toEqual(reversed);
    expect((await c.patch('/api/questions/reorder', { orderedIds: reversed.slice(0, 2) })).status).toBe(409);
  });

  it('rejects MongoDB operator injection', async () => {
    const c = await headAdmin();
    const r = await c.post('/api/questions', { title: { $gt: '' }, prompt: 'x' });
    expect(r.status).toBe(400);
    const nested = await c.post('/api/candidates', { fullName: 'Eve Doe', discordUsername: 'eve', characterName: 'Eve', discordId: { $gt: '' } });
    expect(nested.status).toBe(400);
    // Express 5's simple query parser never builds nested objects from bracket syntax.
    const q = await c.get('/api/candidates?status[$ne]=ARCHIVED');
    expect(q.status).toBe(200);
  });
});

describe('interview versioning and historical integrity', () => {
  it('publishing freezes an immutable version; edits do not alter it', async () => {
    const c = await headAdmin();
    const { templateId, questionIds, categoryId } = await publishedInterview(c, [{ timeLimitSeconds: 30 }, { timeLimitSeconds: 60 }]);
    const v1 = await InterviewVersion.findOne({ templateId }).lean();
    expect(v1!.version).toBe(1);
    expect(v1!.totalTimeSeconds).toBe(90);
    expect(v1!.questions.map((q) => q.title)).toEqual(['Question 1', 'Question 2']);

    await c.patch(`/api/questions/${questionIds[0]}`, { title: 'Rewritten', prompt: 'Completely new prompt?', type: 'LONG_TEXT', categoryId, timeLimitSeconds: 45 });
    const t = await c.get(`/api/interviews/${templateId}`);
    expect(t.body.hasUnpublishedChanges).toBe(true);
    expect((await InterviewVersion.findById(v1!._id).lean())!.questions[0]!.title).toBe('Question 1');

    const p2 = await c.post(`/api/interviews/${templateId}/publish`);
    expect(p2.body.published.version).toBe(2);
    expect(await InterviewVersion.countDocuments({ templateId })).toBe(2);
    await expect(InterviewVersion.updateOne({ _id: v1!._id }, { $set: { title: 'tamper' } })).rejects.toThrow(/immutable/);
  });

  it('candidates keep the exact question text they received after edits and deletions', async () => {
    const { admin, interview, candidate } = await examScenario([{}, {}]);
    await startExam(candidate);
    await candidate.post('/api/exam/submit-answer', { questionIndex: 0, seq: 1, answerText: 'my answer' });
    await admin.patch(`/api/questions/${interview.questionIds[0]}`, { title: 'Edited later', prompt: 'Edited prompt?', type: 'LONG_TEXT', categoryId: interview.categoryId });
    await admin.delete(`/api/questions/${interview.questionIds[1]}`);
    const a0 = await Answer.findOne({ questionIndex: 0 }).lean();
    expect(a0!.question.title).toBe('Question 1');
    expect(a0!.question.prompt).toBe('Prompt text for question 1?');
    // deleted question was removed from the draft but the attempt still receives it
    expect((await InterviewTemplate.findById(interview.templateId).lean())!.questions).toHaveLength(1);
    const q2 = await candidate.get('/api/exam/current-question');
    expect(q2.body.question.title).toBe('Question 2');
  });

  it('only published, active interviews can be assigned; one open assignment per candidate', async () => {
    const c = await headAdmin();
    const [cat] = await seedCategories(c);
    const q = await createQuestion(c, cat!, 1);
    const draft = await c.post('/api/interviews', { title: 'Draft interview', position: 'Moderator', questions: [{ questionId: q, timeLimitSeconds: null }] });
    const cand = await createCandidate(c);
    expect((await c.post(`/api/candidates/${cand.candidate.id}/assignments`, { templateId: draft.body.id })).body.error.code).toBe('INTERVIEW_NOT_PUBLISHED');
    await c.post(`/api/interviews/${draft.body.id}/publish`);
    expect((await c.post(`/api/candidates/${cand.candidate.id}/assignments`, { templateId: draft.body.id })).status).toBe(201);
    const dup = await c.post(`/api/candidates/${cand.candidate.id}/assignments`, { templateId: draft.body.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ASSIGNMENT_EXISTS');
  });

  it('archiving a candidate removes access but keeps interview history', async () => {
    const { admin, cand, candidate } = await examScenario([{}]);
    const s = await startExam(candidate);
    await candidate.post('/api/exam/submit-answer', { questionIndex: 0, seq: 1, answerText: 'kept forever' });
    expect((await admin.delete(`/api/candidates/${cand.candidate.id}`)).status).toBe(204);
    const fresh = await new Client().init();
    expect((await fresh.post('/api/auth/login', { portal: 'candidate', ...cand.credentials })).status).toBe(403);
    const history = await admin.get('/api/attempts');
    expect(history.body.items.map((a: any) => a.id)).toContain(s.body.attempt.id);
    expect((await Answer.findOne().lean())!.answerText).toBe('kept forever');
  });
});

describe('evaluation', () => {
  async function completed() {
    const ctx = await examScenario([{ maxScore: 10 }, { type: 'MULTIPLE_CHOICE', maxScore: 5 }]);
    const s = await startExam(ctx.candidate);
    await ctx.candidate.post('/api/exam/submit-answer', { questionIndex: 0, seq: 1, answerText: 'I would collect evidence and hear both sides.' });
    await ctx.candidate.post('/api/exam/submit-answer', { questionIndex: 1, seq: 1, selectedOptionKeys: ['B'] });
    return { ...ctx, attemptId: s.body.attempt.id as string };
  }

  it('review screen includes answers, rubric and timing for staff', async () => {
    const { admin, attemptId } = await completed();
    const r = await admin.get(`/api/evaluations/${attemptId}`);
    expect(r.status).toBe(200);
    expect(r.body.questions[0].question.rubric).toContain('Rubric');
    expect(r.body.questions[0].answerText).toContain('collect evidence');
    expect(r.body.questions[1].autoScore).toBe(5);
    expect(r.body.questions[0].responseMs).toBeGreaterThanOrEqual(0);
    expect(r.body.timeline.length).toBeGreaterThan(3);
    const pending = await admin.get('/api/evaluations');
    expect(pending.body.items.map((x: any) => x.id)).toContain(attemptId);
  });

  it('scores subjective answers, records revisions and preserves previous values', async () => {
    const { admin, attemptId } = await completed();
    const first = await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 0, decision: 'PASSED', overallNotes: 'Strong candidate', marks: [{ questionIndex: 0, awardedScore: 8, notes: 'Good procedure' }] });
    expect(first.status).toBe(200);
    expect(first.body.attempt.result).toBe('PASSED');
    expect(first.body.attempt.scoring.totalScore).toBe(13);
    expect(first.body.attempt.scoring.percentage).toBeCloseTo(86.7, 1);

    const stale = await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 0, decision: 'FAILED', marks: [] });
    expect(stale.status).toBe(409);

    const second = await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 1, decision: 'FAILED', overallNotes: 'Re-reviewed', marks: [{ questionIndex: 0, awardedScore: 2, notes: 'Missed impartiality' }] });
    expect(second.body.attempt.result).toBe('FAILED');
    expect(second.body.revisions.map((r: any) => r.revision)).toEqual([2, 1]);
    expect(second.body.revisions[1].decision).toBe('PASSED');
    expect(second.body.revisions[0].previousDecision).toBe('PASSED');
    expect(await Evaluation.countDocuments({ attemptId })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'EVALUATION_MODIFIED' })).toBe(1);
  });

  it('rejects scores above the maximum and incomplete final decisions', async () => {
    const { admin, attemptId } = await completed();
    expect((await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 0, decision: 'PASSED', marks: [{ questionIndex: 0, awardedScore: 11 }] })).status).toBe(400);
    const incomplete = await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 0, decision: 'PASSED', marks: [] });
    expect(incomplete.body.error.code).toBe('INCOMPLETE_EVALUATION');
    expect((await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 0, decision: 'UNDER_REVIEW', marks: [] })).status).toBe(200);
  });

  it('only a Head Admin may overturn a disqualification, with justification', async () => {
    const { admin, candidate } = await examScenario([{}]);
    const s = await startExam(candidate);
    await candidate.post('/api/exam/security-event', { type: 'WINDOW_BLURRED' });
    const { curator } = await withCurator(admin);
    const byCurator = await curator.patch(`/api/evaluations/${s.body.attempt.id}`, { expectedRevision: 0, decision: 'UNDER_REVIEW', overallNotes: 'OS notification popped up', marks: [] });
    expect(byCurator.status).toBe(403);
    const noReason = await admin.patch(`/api/evaluations/${s.body.attempt.id}`, { expectedRevision: 0, decision: 'UNDER_REVIEW', marks: [] });
    expect(noReason.body.error.code).toBe('JUSTIFICATION_REQUIRED');
    const ok = await admin.patch(`/api/evaluations/${s.body.attempt.id}`, { expectedRevision: 0, decision: 'UNDER_REVIEW', overallNotes: 'Windows notification evidence reviewed', marks: [] });
    expect(ok.status).toBe(200);
    expect(ok.body.attempt.status).toBe('DISQUALIFIED'); // the attempt itself stays terminal
  });

  it('exports CSV and branded PDF reports', async () => {
    const { admin, attemptId } = await completed();
    const csv = await admin.get('/api/exports/attempts');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('LIBRA-ADMIN-0001');
    const pdf = await admin.get(`/api/exports/attempts/${attemptId}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('analytics reflect real database state', async () => {
    const { admin, attemptId } = await completed();
    await admin.patch(`/api/evaluations/${attemptId}`, { expectedRevision: 0, decision: 'PASSED', marks: [{ questionIndex: 0, awardedScore: 10 }] });
    const o = await admin.get('/api/analytics/overview');
    expect(o.body).toMatchObject({ totalCandidates: 1, completedInterviews: 1, passedCandidates: 1, activeInterviews: 0, interviewsThisMonth: 1 });
    expect(o.body.averageScore).toBe(100);
    for (const p of ['interviews', 'candidates', 'questions', 'security', 'activity']) {
      expect((await admin.get(`/api/analytics/${p}`)).status, p).toBe(200);
    }
  });

  it('audit logs are immutable through the data layer', async () => {
    const { admin } = await completed();
    const log = await admin.get('/api/logs/audit');
    expect(log.body.items.length).toBeGreaterThan(0);
    await expect(AuditLog.updateOne({}, { $set: { action: 'QUESTION_CREATED' } })).rejects.toThrow(/immutable/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/immutable/);
  });
});
