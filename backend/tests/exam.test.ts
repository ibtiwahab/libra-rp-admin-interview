import { describe, expect, it } from 'vitest';
import { Answer, Assignment, Attempt, SecurityEvent, Session } from '../src/models';
import { reconcileAll } from '../src/services/examService';
import { Client, PREFLIGHT, candidateClient, examScenario, expireActiveQuestion, startExam, useDatabase } from './helpers';

useDatabase();

const save = (c: Client, questionIndex: number, seq: number, answerText: string) => c.patch('/api/exam/answer', { questionIndex, seq, answerText });
const submit = (c: Client, questionIndex: number, seq: number, answerText: string, reason: 'MANUAL' | 'TIMEOUT' = 'MANUAL') =>
  c.post('/api/exam/submit-answer', { questionIndex, seq, answerText, reason });

describe('preparation and start', () => {
  it('logging in does not start the attempt; instructions reveal no question content', async () => {
    const { candidate } = await examScenario();
    const status = await candidate.get('/api/exam/status');
    expect(status.body.state).toBe('NOT_STARTED');
    expect(await Attempt.countDocuments()).toBe(0);
    const ins = await candidate.get('/api/exam/instructions');
    expect(ins.status).toBe(200);
    expect(ins.body.interview.totalQuestions).toBe(3);
    expect(ins.body.interview.totalTimeSeconds).toBe(135);
    const raw = JSON.stringify(ins.body);
    expect(raw).not.toContain('Prompt text');
    expect(raw).not.toContain('Rubric');
  });

  it('requires explicit acknowledgement and passing preflight checks', async () => {
    const { candidate } = await examScenario();
    const noAck = await candidate.post('/api/exam/start', { acknowledged: false, instanceId: candidate.instanceId, preflight: PREFLIGHT });
    expect(noAck.status).toBe(400);
    const failedCheck = await candidate.post('/api/exam/start', { acknowledged: true, instanceId: candidate.instanceId, preflight: { ...PREFLIGHT, focused: false } });
    expect(failedCheck.status).toBe(400);
    expect(failedCheck.body.error.code).toBe('PREFLIGHT_FAILED');
    expect(await Attempt.countDocuments()).toBe(0);
  });

  it('starts once and delivers the first question with a server deadline', async () => {
    const { candidate } = await examScenario([{ timeLimitSeconds: 30 }, { timeLimitSeconds: 45 }, { timeLimitSeconds: 60 }]);
    const r = await startExam(candidate);
    expect(r.status).toBe(201);
    expect(r.body.state).toBe('IN_PROGRESS');
    expect(r.body.question.index).toBe(0);
    expect(r.body.question.timeLimitSeconds).toBe(30);
    const deadline = new Date(r.body.timing.deadlineAt).getTime();
    const activated = new Date(r.body.timing.activatedAt).getTime();
    expect(deadline - activated).toBe(30_000);
    expect(r.body.timing.remainingMs).toBeGreaterThan(28_000);
    expect(r.body.watermark.candidateCode).toMatch(/^LIBRA-ADMIN-/);
    expect(r.body.watermark.referenceCode).toMatch(/^A[A-Z0-9]{5}$/);
  });

  it('never exposes the answer key, rubric or future questions to the candidate', async () => {
    const { candidate } = await examScenario([{ type: 'MULTIPLE_CHOICE' }, { type: 'TRUE_FALSE' }, {}]);
    const r = await startExam(candidate);
    const raw = JSON.stringify(r.body);
    expect(raw).not.toContain('correctOptionKeys');
    expect(raw).not.toContain('correctBoolean');
    expect(raw).not.toContain('rubric');
    expect(raw).not.toContain('Rubric');
    expect(raw).not.toContain('Question 2');
    expect(r.body.question.options).toHaveLength(3);
    // Only the activated question exists as an answer document.
    expect(await Answer.countDocuments()).toBe(1);
  });

  it('duplicate simultaneous start requests create exactly one attempt', async () => {
    const { candidate } = await examScenario();
    const results = await Promise.all(Array.from({ length: 8 }, () => startExam(candidate)));
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).length).toBe(7);
    expect(await Attempt.countDocuments()).toBe(1);
    expect(await Answer.countDocuments()).toBe(1);
  });

  it('logging out and back in, or using another device, never resets the attempt', async () => {
    const { candidate, cand } = await examScenario();
    await startExam(candidate);
    // A second device is rejected while the attempt is in progress and gets no content.
    const other = await new Client().init();
    const login = await other.post('/api/auth/login', { portal: 'candidate', ...cand.credentials });
    expect(login.status).toBe(409);
    expect(login.body.error.code).toBe('EXAM_SESSION_ACTIVE');
    expect(JSON.stringify(login.body)).not.toContain('Prompt');
    expect(await SecurityEvent.countDocuments({ eventType: 'CONCURRENT_LOGIN_ATTEMPT' })).toBe(1);
    expect(await Attempt.countDocuments({ status: 'IN_PROGRESS' })).toBe(1);
  });
});

describe('sequential delivery and server-authoritative timers', () => {
  it('delivers questions in order, accepts early submission and completes', async () => {
    const { candidate } = await examScenario();
    const first = await startExam(candidate);
    expect(first.body.question.title).toBe('Question 1');

    const s1 = await submit(candidate, 0, 1, 'answer one');
    expect(s1.body.submission).toBe('ACCEPTED');
    expect(s1.body.next.question.index).toBe(1);
    expect(s1.body.next.question.title).toBe('Question 2');

    const s2 = await submit(candidate, 1, 1, 'answer two');
    expect(s2.body.next.question.title).toBe('Question 3');
    const s3 = await submit(candidate, 2, 1, 'answer three');
    expect(s3.body.next.state).toBe('COMPLETED');

    const attempt = await Attempt.findOne().lean();
    expect(attempt!.status).toBe('COMPLETED');
    expect(attempt!.endReason).toBe('ALL_QUESTIONS_ANSWERED');
    expect(attempt!.scoring.answeredCount).toBe(3);
    const answers = await Answer.find().sort({ questionIndex: 1 }).lean();
    expect(answers.map((a) => a.answerText)).toEqual(['answer one', 'answer two', 'answer three']);
    expect(answers.every((a) => a.status === 'SUBMITTED')).toBe(true);
    expect((await Assignment.findOne().lean())!.status).toBe('COMPLETED');
  });

  it('cannot go back to, or answer, earlier questions', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    await submit(candidate, 0, 1, 'first');
    const back = await save(candidate, 0, 5, 'rewrite history');
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('QUESTION_CLOSED');
    const resubmit = await submit(candidate, 0, 6, 'again');
    expect(resubmit.body.submission).toBe('REJECTED_LATE');
    expect((await Answer.findOne({ questionIndex: 0 }).lean())!.answerText).toBe('first');
  });

  it('cannot retrieve future questions by any parameter', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    const r = await candidate.get('/api/exam/current-question?questionIndex=2&index=2');
    expect(r.body.question.index).toBe(0);
    const skip = await save(candidate, 2, 1, 'skip ahead');
    expect(skip.status).toBe(409);
  });

  it('autosaves with stale-request protection', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    expect((await save(candidate, 0, 2, 'newer')).body.saved).toBe(true);
    const stale = await save(candidate, 0, 1, 'older delayed request');
    expect(stale.status).toBe(200);
    expect(stale.body.stale).toBe(true);
    expect((await Answer.findOne({ questionIndex: 0 }).lean())!.answerText).toBe('newer');
    // reconnecting does not reset the timer
    const before = (await candidate.get('/api/exam/current-question')).body.timing.deadlineAt;
    const after = (await candidate.get('/api/exam/current-question')).body.timing.deadlineAt;
    expect(after).toBe(before);
    expect((await candidate.get('/api/exam/current-question')).body.saved.answerText).toBe('newer');
  });

  it('closes an expired question server-side and preserves the last saved answer', async () => {
    const { candidate } = await examScenario();
    const start = await startExam(candidate);
    await save(candidate, 0, 1, 'partial answer');
    await expireActiveQuestion(start.body.attempt.id);
    const r = await candidate.get('/api/exam/current-question');
    expect(r.body.question.index).toBe(1);
    const a0 = await Answer.findOne({ questionIndex: 0 }).lean();
    expect(a0!.status).toBe('TIMED_OUT');
    expect(a0!.answerText).toBe('partial answer');
    expect(await SecurityEvent.countDocuments({ eventType: 'QUESTION_TIMEOUT' })).toBe(1);
  });

  it('rejects autosaves and submissions after the deadline (beyond network grace)', async () => {
    const { candidate } = await examScenario();
    const start = await startExam(candidate);
    await save(candidate, 0, 1, 'kept');
    await expireActiveQuestion(start.body.attempt.id, 3_000);
    const late = await submit(candidate, 0, 2, 'too late');
    expect(late.body.submission).toBe('REJECTED_LATE');
    expect(late.body.next.question.index).toBe(1);
    const a0 = await Answer.findOne({ questionIndex: 0 }).lean();
    expect(a0!.answerText).toBe('kept');
    expect(a0!.status).toBe('TIMED_OUT');
  });

  it('accepts a submission arriving within the grace window as a timed-out answer', async () => {
    const { candidate } = await examScenario();
    const start = await startExam(candidate);
    await expireActiveQuestion(start.body.attempt.id, 200); // 200ms past deadline, < 1500ms grace
    const r = await submit(candidate, 0, 1, 'final words', 'TIMEOUT');
    expect(r.body.submission).toBe('ACCEPTED_AT_DEADLINE');
    const a0 = await Answer.findOne({ questionIndex: 0 }).lean();
    expect(a0!.answerText).toBe('final words');
    expect(a0!.status).toBe('TIMED_OUT');
  });

  it('client-side clocks are irrelevant: the deadline is fixed at activation', async () => {
    const { candidate } = await examScenario([{ timeLimitSeconds: 30 }]);
    const s = await startExam(candidate);
    const stored = await Answer.findOne({ questionIndex: 0 }).lean();
    expect(stored!.deadlineAt.toISOString()).toBe(s.body.timing.deadlineAt);
    // A forged request body field cannot extend it (strict validation rejects unknown keys).
    const forged = await candidate.patch('/api/exam/answer', { questionIndex: 0, seq: 1, answerText: 'x', deadlineAt: '2099-01-01T00:00:00Z' });
    expect(forged.status).toBe(400);
  });

  it('the reconciler closes questions and finishes attempts with no browser communication', async () => {
    const { candidate } = await examScenario([{}, {}]);
    const s = await startExam(candidate);
    await expireActiveQuestion(s.body.attempt.id);
    await reconcileAll();
    let attempt = await Attempt.findById(s.body.attempt.id).lean();
    expect(attempt!.currentQuestionIndex).toBe(1);
    await expireActiveQuestion(s.body.attempt.id);
    await reconcileAll();
    attempt = await Attempt.findById(s.body.attempt.id).lean();
    expect(attempt!.status).toBe('COMPLETED');
    expect(attempt!.scoring.timedOutCount).toBe(2);
  });

  it('concurrent submissions for the same question advance exactly once', async () => {
    const { candidate } = await examScenario([{}, {}, {}]);
    await startExam(candidate);
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => submit(candidate, 0, i + 1, `try ${i}`)));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const attempt = await Attempt.findOne().lean();
    expect(attempt!.currentQuestionIndex).toBe(1);
    expect(await Answer.countDocuments()).toBe(2);
    expect(await Answer.countDocuments({ questionIndex: 1, status: 'ACTIVE' })).toBe(1);
  });

  it('auto-grades objective questions on close', async () => {
    const { candidate } = await examScenario([{ type: 'MULTIPLE_CHOICE', maxScore: 5 }, { type: 'TRUE_FALSE', maxScore: 3 }]);
    await startExam(candidate);
    await candidate.post('/api/exam/submit-answer', { questionIndex: 0, seq: 1, selectedOptionKeys: ['B'] });
    await candidate.post('/api/exam/submit-answer', { questionIndex: 1, seq: 1, booleanAnswer: false });
    const [mc, tf] = await Answer.find().sort({ questionIndex: 1 }).lean();
    expect(mc!.autoScore).toBe(5);
    expect(tf!.autoScore).toBe(0);
    expect((await Attempt.findOne().lean())!.scoring.autoScore).toBe(5);
  });

  it('validates answers against the delivered question', async () => {
    const { candidate } = await examScenario([{ type: 'MULTIPLE_CHOICE' }]);
    await startExam(candidate);
    expect((await candidate.patch('/api/exam/answer', { questionIndex: 0, seq: 1, selectedOptionKeys: ['H'] })).status).toBe(400);
    expect((await candidate.patch('/api/exam/answer', { questionIndex: 0, seq: 1, selectedOptionKeys: ['A', 'B'] })).status).toBe(400);
  });
});

describe('one-time attempt', () => {
  it('a completed interview cannot be restarted', async () => {
    const { candidate } = await examScenario([{}]);
    await startExam(candidate);
    await submit(candidate, 0, 1, 'done');
    const again = await startExam(candidate);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ATTEMPT_ALREADY_CONSUMED');
    expect(await Attempt.countDocuments()).toBe(1);
  });

  it('the unique index enforces one attempt per assignment even if application checks are bypassed', async () => {
    const { candidate } = await examScenario([{}]);
    await startExam(candidate);
    const a = await Attempt.findOne().lean();
    const { _id, referenceCode, ...rest } = a as any;
    await expect(Attempt.collection.insertOne({ ...rest, referenceCode: 'AXXXXX' })).rejects.toThrow(/duplicate key/);
  });
});

describe('anti-tab-switching enforcement', () => {
  for (const type of ['TAB_HIDDEN', 'WINDOW_BLURRED', 'PAGE_EXIT'] as const) {
    it(`${type} immediately disqualifies, locks the attempt and revokes the session`, async () => {
      const { candidate, cand } = await examScenario();
      const s = await startExam(candidate);
      await save(candidate, 0, 1, 'saved before violation');
      const r = await candidate.post('/api/exam/security-event', { type, questionIndex: 0, clientTimestamp: new Date().toISOString(), details: { trigger: 'test' } });
      expect(r.status).toBe(200);
      expect(r.body.state.state).toBe('DISQUALIFIED');
      expect(r.body.state.reason).toBe('EXAMINATION_SECURITY_POLICY');

      const attempt = await Attempt.findById(s.body.attempt.id).lean();
      expect(attempt!.status).toBe('DISQUALIFIED');
      expect(attempt!.endReason).toBe('FOCUS_VIOLATION');
      expect(attempt!.result).toBe('DISQUALIFIED');
      expect(attempt!.securityViolation!.type).toBe(type);
      expect(attempt!.securityViolation!.source).toBe('CLIENT_REPORTED');
      expect(attempt!.securityViolation!.detectedAt).toBeInstanceOf(Date);
      // saved answers are preserved
      const a0 = await Answer.findOne({ questionIndex: 0 }).lean();
      expect(a0!.answerText).toBe('saved before violation');
      expect(a0!.status).toBe('TERMINATED');
      // session revoked — every further request is refused
      expect((await candidate.get('/api/exam/current-question')).status).toBe(401);
      expect((await save(candidate, 0, 2, 'after')).status).toBe(401);
      expect(await Session.countDocuments({ subjectType: 'CANDIDATE', status: 'ACTIVE' })).toBe(0);

      // signing in again shows the revoked state and cannot restart
      const back = await candidateClient(cand.credentials);
      const st = await back.get('/api/exam/status');
      expect(st.body.state).toBe('DISQUALIFIED');
      expect((await startExam(back)).status).toBe(409);
      expect((await back.get('/api/exam/current-question')).body.state).toBe('DISQUALIFIED');
      expect((await back.post('/api/exam/submit-answer', { questionIndex: 0, seq: 9, answerText: 'x' })).body.submission).toBe('CLOSED');
    });
  }

  it('duplicate and delayed violation events do not corrupt the attempt state', async () => {
    const { candidate, cand } = await examScenario();
    await startExam(candidate);
    const events = await Promise.all([
      candidate.post('/api/exam/security-event', { type: 'TAB_HIDDEN', questionIndex: 0 }),
      candidate.post('/api/exam/security-event', { type: 'WINDOW_BLURRED', questionIndex: 0 }),
      candidate.post('/api/exam/security-event', { type: 'PAGE_EXIT', questionIndex: 0 }),
    ]);
    expect(events.some((e) => e.status === 200)).toBe(true);
    const attempts = await Attempt.find().lean();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.status).toBe('DISQUALIFIED');
    expect(await SecurityEvent.countDocuments({ eventType: 'INTERVIEW_DISQUALIFIED' })).toBe(1);

    // a late event from a fresh session after the attempt ended changes nothing
    const back = await candidateClient(cand.credentials);
    const late = await back.post('/api/exam/security-event', { type: 'TAB_HIDDEN' });
    expect(late.body.state.state).toBe('DISQUALIFIED');
    const after = await Attempt.findOne().lean();
    expect(after!.securityViolation!.type).toBe(attempts[0]!.securityViolation!.type);
    expect(after!.endedAt!.getTime()).toBe(attempts[0]!.endedAt!.getTime());
  });

  it('a terminal attempt can never return to IN_PROGRESS through the API', async () => {
    const { candidate, cand } = await examScenario();
    await startExam(candidate);
    await candidate.post('/api/exam/security-event', { type: 'TAB_HIDDEN' });
    const back = await candidateClient(cand.credentials);
    await Promise.all([startExam(back), back.post('/api/exam/heartbeat', { questionIndex: 0, visible: true, focused: true }), back.get('/api/exam/current-question')]);
    expect((await Attempt.findOne().lean())!.status).toBe('DISQUALIFIED');
  });

  it('warning-level signals are logged without disqualifying', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    const r = await candidate.post('/api/exam/security-event', { type: 'FULLSCREEN_EXITED' });
    expect(r.body.state.state).toBe('IN_PROGRESS');
    const a = await Attempt.findOne().lean();
    expect(a!.status).toBe('IN_PROGRESS');
    expect(a!.warningCount).toBe(1);
  });

  it('a reload / second tab (different page instance) is detected server-side', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    candidate.instanceId = 'a-completely-different-instance-id';
    const r = await candidate.get('/api/exam/current-question');
    expect(r.body.state).toBe('DISQUALIFIED');
    const a = await Attempt.findOne().lean();
    expect(a!.securityViolation!.type).toBe('PAGE_RELOAD_DETECTED');
    expect(a!.securityViolation!.source).toBe('SERVER');
  });

  it('the heartbeat reports hidden/unfocused state as a backup channel', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    const r = await candidate.post('/api/exam/heartbeat', { questionIndex: 0, visible: false, focused: true });
    expect(r.body.state).toBe('DISQUALIFIED');
    expect((await Attempt.findOne().lean())!.securityViolation!.type).toBe('TAB_HIDDEN');
  });

  it('page-exit beacons (text/plain, token in body) disqualify', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    const r = await candidate.agent
      .post('/api/exam/security-beacon')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(JSON.stringify({ type: 'PAGE_EXIT', questionIndex: 0, csrfToken: candidate.csrf, instanceId: candidate.instanceId, details: { trigger: 'pagehide' } }));
    expect(r.status).toBe(200);
    expect((await Attempt.findOne().lean())!.status).toBe('DISQUALIFIED');
  });

  it('beacons without a valid CSRF token are refused', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    const r = await candidate.agent.post('/api/exam/security-beacon').set('Content-Type', 'text/plain').send(JSON.stringify({ type: 'PAGE_EXIT', csrfToken: 'forged.token' }));
    expect(r.status).toBe(403);
    expect((await Attempt.findOne().lean())!.status).toBe('IN_PROGRESS');
  });
});

describe('abrupt exits and heartbeats', () => {
  it('a silent browser (closed / disconnected) is ended by heartbeat timeout, recorded distinctly', async () => {
    const { candidate } = await examScenario();
    const s = await startExam(candidate);
    await save(candidate, 0, 1, 'work so far');
    await Attempt.updateOne({ _id: s.body.attempt.id }, { $set: { lastHeartbeatAt: new Date(Date.now() - 60_000) } });
    const r = await reconcileAll();
    expect(r.heartbeats).toBe(1);
    const a = await Attempt.findById(s.body.attempt.id).lean();
    expect(a!.status).toBe('EXPIRED');
    expect(a!.endReason).toBe('HEARTBEAT_TIMEOUT');
    expect(a!.securityViolation!.type).toBe('HEARTBEAT_TIMEOUT');
    expect(a!.securityViolation!.source).toBe('HEARTBEAT');
    expect(await SecurityEvent.countDocuments({ eventType: 'SESSION_TIMEOUT' })).toBe(1);
    expect((await Answer.findOne({ questionIndex: 0 }).lean())!.answerText).toBe('work so far');
    expect((await candidate.get('/api/exam/current-question')).status).toBe(401);
  });

  it('regular heartbeats keep the attempt alive and return the server deadline', async () => {
    const { candidate } = await examScenario();
    await startExam(candidate);
    const hb = await candidate.post('/api/exam/heartbeat', { questionIndex: 0, visible: true, focused: true });
    expect(hb.body.state).toBe('IN_PROGRESS');
    expect(typeof hb.body.remainingMs).toBe('number');
    await reconcileAll();
    expect((await Attempt.findOne().lean())!.status).toBe('IN_PROGRESS');
  });

  it('an attempt past its hard ceiling expires', async () => {
    const { candidate } = await examScenario();
    const s = await startExam(candidate);
    await Attempt.updateOne({ _id: s.body.attempt.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await reconcileAll();
    const a = await Attempt.findById(s.body.attempt.id).lean();
    expect(a!.status).toBe('EXPIRED');
    expect(a!.endReason).toBe('EXAM_WINDOW_EXPIRED');
  });
});

describe('administrative termination', () => {
  it('staff can terminate an attempt in progress from live monitoring', async () => {
    const { admin, candidate } = await examScenario();
    const s = await startExam(candidate);
    const live = await admin.get('/api/monitor/active');
    expect(live.body.items).toHaveLength(1);
    expect(live.body.items[0].connection).toBe('ONLINE');
    const t = await admin.post(`/api/attempts/${s.body.attempt.id}/terminate`, { reason: 'Candidate reported using notes' });
    expect(t.status).toBe(204);
    const a = await Attempt.findById(s.body.attempt.id).lean();
    expect(a!.status).toBe('DISQUALIFIED');
    expect(a!.endReason).toBe('ADMIN_TERMINATED');
    expect((await admin.get('/api/monitor/active')).body.items).toHaveLength(0);
  });
});
