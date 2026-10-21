import { expect, test, type Page } from '@playwright/test';
import { adminApi, freshCandidate } from './api';

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('LIBRA-ADMIN-0001').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/exam$/);
}

async function beginInterview(page: Page) {
  await expect(page.getByText('Answer out of character (OOC)')).toBeVisible();
  await page.getByText('I have read and understood').click();
  await page.getByText('I understand that leaving').click();
  const begin = page.getByRole('button', { name: /start interview/i });
  await expect(begin).toBeEnabled();
  await begin.click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/question 1 of 2/i)).toBeVisible();
}

test('signing in shows the preparation briefing without starting the attempt', async ({ page }) => {
  const c = await freshCandidate('prep');
  await signIn(page, c.username, c.password);
  await expect(page.getByRole('heading', { name: c.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
  await expect(page.getByText('Attempt available')).toBeVisible();
  // the begin button stays locked until the rules are acknowledged
  await expect(page.getByRole('button', { name: /start interview/i })).toBeDisabled();
  const { call, ctx } = await adminApi();
  const profile = await call('GET', `/candidates/${c.candidateId}`);
  expect(profile.assignments[0].status).toBe('NOT_STARTED');
  await ctx.dispose();
});

test('a candidate completes the interview: autosave, sequential delivery, completion screen', async ({ page }) => {
  const c = await freshCandidate('complete');
  await signIn(page, c.username, c.password);
  await beginInterview(page);

  // watermark carries the candidate identity
  await expect(page.getByText(new RegExp(`${c.username} · #A`))).toBeVisible();

  await page.getByLabel('Your answer').fill('I would gather evidence and hear both sides before acting.');
  await expect(page.getByText('Answer saved')).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: /submit answer/i }).click();

  await expect(page.getByText(/question 2 of 2/i)).toBeVisible();
  await page.getByRole('radio', { name: /bravo/i }).click();
  await page.getByRole('button', { name: /submit and finish/i }).click();

  await expect(page.getByRole('heading', { name: /interview successfully submitted/i })).toBeVisible();
  await expect(page.getByText('Your responses have been securely recorded.')).toBeVisible();

  const { call, ctx } = await adminApi();
  const profile = await call('GET', `/candidates/${c.candidateId}`);
  const attempt = profile.assignments[0].attempt;
  expect(attempt.status).toBe('COMPLETED');
  expect(attempt.scoring.answeredCount).toBe(2);
  const review = await call('GET', `/evaluations/${attempt.id}`);
  expect(review.questions[0].answerText).toContain('gather evidence');
  expect(review.questions[1].autoScore).toBe(5);
  await ctx.dispose();
});

test('losing window focus disqualifies immediately and permanently', async ({ page }) => {
  const c = await freshCandidate('violation');
  await signIn(page, c.username, c.password);
  await beginInterview(page);
  await page.getByLabel('Your answer').fill('Partial answer before leaving');
  await expect(page.getByText('Answer saved')).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(700); // monitoring arms shortly after the first question appears

  // Equivalent to the browser reporting that the window lost focus (Alt+Tab).
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));

  await expect(page.getByRole('heading', { name: /interview terminated/i })).toBeVisible();
  await expect(page.getByText('Security policy violation')).toBeVisible();

  // The session was revoked server-side; signing in again shows the revoked state, no restart.
  await signIn(page, c.username, c.password);
  await expect(page.getByRole('heading', { name: /interview access revoked/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /start interview/i })).toHaveCount(0);

  const { call, ctx } = await adminApi();
  const profile = await call('GET', `/candidates/${c.candidateId}`);
  const attempt = profile.assignments[0].attempt;
  expect(attempt.status).toBe('DISQUALIFIED');
  expect(attempt.securityViolation.type).toBe('WINDOW_BLURRED');
  const review = await call('GET', `/evaluations/${attempt.id}`);
  expect(review.questions[0].answerText).toBe('Partial answer before leaving');
  await ctx.dispose();
});

test('a second tab is detected as leaving the examination', async ({ page, context }) => {
  const c = await freshCandidate('second-tab');
  await signIn(page, c.username, c.password);
  await beginInterview(page);
  // Opening the exam in another tab creates a new page instance; the server treats it as a reload/exit.
  const other = await context.newPage();
  await other.goto('/exam');
  await expect(other.getByRole('heading', { name: /interview terminated|session ended/i })).toBeVisible();
  const { call, ctx } = await adminApi();
  const profile = await call('GET', `/candidates/${c.candidateId}`);
  expect(profile.assignments[0].attempt.status).toBe('DISQUALIFIED');
  await ctx.dispose();
});

test('the admin console signs in and shows live dashboard data', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByPlaceholder('your.username').fill(process.env.E2E_ADMIN_USERNAME!);
  await page.locator('#a-password').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Awaiting review' })).toBeVisible();
  await page.getByRole('link', { name: 'Live Monitoring' }).click();
  await expect(page.getByText(/stream live|connecting|reconnecting/i)).toBeVisible();
});
