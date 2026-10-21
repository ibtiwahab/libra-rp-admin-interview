import { request, type APIRequestContext } from '@playwright/test';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** An API client that behaves like the SPA: same-origin cookies + CSRF header. */
export async function adminApi(): Promise<{ ctx: APIRequestContext; call: (method: string, path: string, data?: unknown) => Promise<any> }> {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) throw new Error('Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD (a Head Admin without MFA on the dev stack).');
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } });
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken as string;
  const call = async (method: string, path: string, data?: unknown) => {
    const res = await ctx.fetch(`/api${path}`, { method, data, headers: { 'X-CSRF-Token': csrf } });
    const body = res.status() === 204 ? null : await res.json();
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${JSON.stringify(body)}`);
    return body;
  };
  await call('POST', '/auth/login', { portal: 'admin', username, password });
  return { ctx, call };
}

/** Creates a fresh 2-question interview (unique per run) and an assigned candidate. */
export async function freshCandidate(label: string) {
  const { ctx, call } = await adminApi();
  const stamp = Date.now().toString(36);
  const cats = (await call('GET', '/categories')).items as { id: string; isActive: boolean }[];
  const categoryId = cats.find((c) => c.isActive)?.id ?? (await call('POST', '/categories', { name: `E2E ${stamp}` })).id ?? (await call('GET', '/categories')).items[0].id;
  const q1 = await call('POST', '/questions', { title: `E2E written ${stamp}`, prompt: 'Describe how you would handle a player report.', type: 'LONG_TEXT', categoryId, timeLimitSeconds: 60, maxScore: 10, rubric: 'E2E rubric' });
  const q2 = await call('POST', '/questions', {
    title: `E2E choice ${stamp}`,
    prompt: 'Which option is correct?',
    type: 'MULTIPLE_CHOICE',
    categoryId,
    timeLimitSeconds: 60,
    maxScore: 5,
    options: [
      { key: 'A', text: 'Alpha' },
      { key: 'B', text: 'Bravo' },
    ],
    correctOptionKeys: ['B'],
  });
  const t = await call('POST', '/interviews', { title: `E2E INTERVIEW ${stamp}`, position: 'Administrator', questions: [{ questionId: q1.id, timeLimitSeconds: null }, { questionId: q2.id, timeLimitSeconds: null }] });
  await call('POST', `/interviews/${t.id}/publish`);
  const cand = await call('POST', '/candidates', { fullName: `E2E ${label}`, discordUsername: `e2e_${stamp}`, characterName: 'E2E Character', templateId: t.id });
  await ctx.dispose();
  return { username: cand.credentials.username as string, password: cand.credentials.password as string, candidateId: cand.candidate.id as string, title: t.title as string };
}
