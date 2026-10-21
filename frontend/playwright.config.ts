import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the real stack (Next.js + API + MongoDB). Start everything first
 * (see README), then:
 *
 *   E2E_ADMIN_USERNAME=director E2E_ADMIN_PASSWORD=... npm run test:e2e
 *
 * Optional: E2E_BASE_URL (default http://localhost:3000).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
