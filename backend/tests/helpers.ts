import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/database';
import { Answer, Attempt, Category, User } from '../src/models';
import { hashPassword } from '../src/security/password';
import { SEED_CATEGORIES } from '../src/scripts/seed';

export const app = createApp();

/** Connects to an isolated database per test file and wipes it before each test. */
export function useDatabase() {
  beforeAll(async () => {
    const base = process.env.TEST_MONGO_URI!;
    const url = new URL(base);
    url.pathname = `/libra_test_${crypto.randomBytes(4).toString('hex')}`;
    await connectDatabase(url.toString());
    for (const name of mongoose.modelNames()) {
      const m = mongoose.model(name);
      await m.createCollection().catch(() => undefined);
      await m.syncIndexes();
    }
  });
  beforeEach(async () => {
    const db = mongoose.connection.db!;
    for (const c of await db.collections()) await c.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  });
}

/** A browser-like client: keeps cookies and echoes the CSRF token like the SPA does. */
export class Client {
  agent = request.agent(app);
  csrf = '';
  instanceId = crypto.randomBytes(16).toString('base64url');

  async init() {
    const res = await this.agent.get('/api/auth/csrf');
    this.csrf = res.body.csrfToken;
    return this;
  }
  get(path: string) {
    return this.agent.get(path).set('X-Exam-Instance', this.instanceId);
  }
  post(path: string, body?: object) {
    return this.agent.post(path).set('X-CSRF-Token', this.csrf).set('X-Exam-Instance', this.instanceId).send(body ?? {});
  }
  patch(path: string, body?: object) {
    return this.agent.patch(path).set('X-CSRF-Token', this.csrf).set('X-Exam-Instance', this.instanceId).send(body ?? {});
  }
  delete(path: string) {
    return this.agent.delete(path).set('X-CSRF-Token', this.csrf).set('X-Exam-Instance', this.instanceId);
  }
}

export const HEAD = { username: 'director', password: 'Head-Admin-Passw0rd!' };

export async function createAdmin(username = HEAD.username, password = HEAD.password, role: 'HEAD_ADMIN' | 'SUPPORT_CURATOR' = 'HEAD_ADMIN') {
  return User.create({ username, fullName: `${username} Name`, role, status: 'ACTIVE', passwordHash: await hashPassword(password) });
}

export async function adminClient(username = HEAD.username, password = HEAD.password) {
  const c = await new Client().init();
  const res = await c.post('/api/auth/login', { portal: 'admin', username, password });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

export async function headAdmin() {
  await createAdmin();
  return adminClient();
}

export async function seedCategories(c: Client) {
  for (const [name, description] of SEED_CATEGORIES.slice(0, 4)) {
    const r = await c.post('/api/categories', { name, description });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  }
  const cats = await Category.find().lean();
  return cats.map((x) => String(x._id));
}

export interface QSpec {
  type?: 'SHORT_TEXT' | 'LONG_TEXT' | 'MULTIPLE_CHOICE' | 'SCENARIO' | 'TRUE_FALSE';
  timeLimitSeconds?: number;
  maxScore?: number;
}

export async function createQuestion(c: Client, categoryId: string, i: number, spec: QSpec = {}) {
  const type = spec.type ?? 'LONG_TEXT';
  const body: Record<string, unknown> = {
    title: `Question ${i}`,
    prompt: `Prompt text for question ${i}?`,
    type,
    categoryId,
    difficulty: 'MEDIUM',
    timeLimitSeconds: spec.timeLimitSeconds ?? 45,
    maxScore: spec.maxScore ?? 10,
    rubric: `Rubric ${i} — confidential`,
  };
  if (type === 'MULTIPLE_CHOICE') {
    body.options = [
      { key: 'A', text: 'Alpha' },
      { key: 'B', text: 'Bravo' },
      { key: 'C', text: 'Charlie' },
    ];
    body.correctOptionKeys = ['B'];
  }
  if (type === 'TRUE_FALSE') body.correctBoolean = true;
  const r = await c.post('/api/questions', body);
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return r.body.id as string;
}

/** Creates N questions and a published interview containing them, in order. */
export async function publishedInterview(c: Client, specs: QSpec[] = [{}, {}, {}]) {
  const [cat] = await seedCategories(c);
  const ids: string[] = [];
  for (let i = 0; i < specs.length; i++) ids.push(await createQuestion(c, cat!, i + 1, specs[i]));
  const t = await c.post('/api/interviews', {
    title: 'LIBRA RP — ADMIN RECRUITMENT INTERVIEW',
    position: 'Administrator',
    passingPercent: 60,
    questions: ids.map((questionId) => ({ questionId, timeLimitSeconds: null })),
  });
  if (t.status !== 201) throw new Error(JSON.stringify(t.body));
  const p = await c.post(`/api/interviews/${t.body.id}/publish`);
  if (p.status !== 200) throw new Error(JSON.stringify(p.body));
  return { templateId: t.body.id as string, questionIds: ids, categoryId: cat! };
}

export async function createCandidate(c: Client, templateId?: string) {
  const r = await c.post('/api/candidates', {
    fullName: 'John Doe',
    discordUsername: 'johndoe',
    characterName: 'John Smith',
    appliedRole: 'Admin Assistant',
    ...(templateId ? { templateId } : {}),
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return r.body as { candidate: { id: string; candidateCode: string }; credentials: { username: string; password: string } };
}

export async function candidateClient(creds: { username: string; password: string }) {
  const c = await new Client().init();
  const r = await c.post('/api/auth/login', { portal: 'candidate', ...creds });
  if (r.status !== 200) throw new Error(`candidate login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

export const PREFLIGHT = { visibilityApi: true, focused: true, fullscreen: true, cookies: true, latencyMs: 12, viewport: { width: 1920, height: 1080 } };

export async function startExam(c: Client) {
  return c.post('/api/exam/start', { acknowledged: true, instanceId: c.instanceId, preflight: PREFLIGHT });
}

/** Full setup: head admin, published interview, assigned candidate, candidate signed in. */
export async function examScenario(specs?: QSpec[]) {
  const admin = await headAdmin();
  const interview = await publishedInterview(admin, specs);
  const cand = await createCandidate(admin, interview.templateId);
  const candidate = await candidateClient(cand.credentials);
  return { admin, interview, cand, candidate };
}

/** Simulates time passing for the active question by moving its deadline into the past. */
export async function expireActiveQuestion(attemptId: string, byMs = 5_000) {
  const a = await Answer.findOne({ attemptId, status: 'ACTIVE' });
  if (!a) throw new Error('no active answer');
  const shift = a.deadlineAt.getTime() - Date.now() + byMs;
  await Answer.collection.updateOne(
    { _id: a._id },
    { $set: { activatedAt: new Date(a.activatedAt.getTime() - shift), deadlineAt: new Date(a.deadlineAt.getTime() - shift) } },
  );
}

export async function currentAttempt(candidateCode: string) {
  return Attempt.findOne({ 'candidateSnapshot.candidateCode': candidateCode }).lean();
}
