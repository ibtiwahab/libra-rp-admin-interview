import { request } from '@playwright/test';
import { BASE } from './api';

export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: BASE });
  const res = await ctx.get('/api/health').catch(() => null);
  if (!res || !res.ok()) throw new Error(`The stack is not reachable at ${BASE} (GET /api/health). Start MongoDB, the API and the frontend first.`);
  await ctx.dispose();
}
