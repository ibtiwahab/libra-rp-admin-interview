import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  /** Optional comma-separated additional trusted origins (e.g. a second dev port). */
  EXTRA_ORIGINS: z.string().default(''),
  BACKEND_PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/libra_interviews?replicaSet=rs0'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  MFA_ENCRYPTION_KEY: z.string().min(32, 'MFA_ENCRYPTION_KEY must be at least 32 characters'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.string().default('loopback'),
  COOKIE_SECURE: bool.optional(),

  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
  ADMIN_SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  CANDIDATE_SESSION_HOURS: z.coerce.number().int().positive().default(4),

  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().min(2).max(30).default(5),
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(300).default(25),
  HEARTBEAT_TIMEOUT_ACTION: z.enum(['EXPIRE', 'DISQUALIFY']).default('EXPIRE'),
  SUBMISSION_GRACE_MS: z.coerce.number().int().min(0).max(5000).default(1500),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),

  CANDIDATE_CODE_PREFIX: z.string().regex(/^[A-Z0-9-]{2,24}$/).default('LIBRA-ADMIN'),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  DISABLE_JOBS: bool.optional(),
  /** Optional comma-separated DNS servers for Node (e.g. when the OS resolver refuses SRV lookups for mongodb+srv URIs). */
  DNS_SERVERS: z.string().default(''),
});

// Hosting platforms (Render, Railway, Heroku…) assign the port via PORT; it takes precedence.
const parsed = schema.safeParse({ ...process.env, BACKEND_PORT: process.env.PORT || process.env.BACKEND_PORT });
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
  jobsDisabled: e.DISABLE_JOBS ?? false,
  allowedOrigins: [e.FRONTEND_URL, ...e.EXTRA_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)].map((o) => new URL(o).origin),
};

if (env.isProd && /REPLACE|changeme|example/i.test(env.SESSION_SECRET + env.MFA_ENCRYPTION_KEY)) {
  // eslint-disable-next-line no-console
  console.error('Refusing to start in production with placeholder secrets.');
  process.exit(1);
}

export type Env = typeof env;
