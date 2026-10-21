import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { globalLimiter } from './middleware/rateLimit';
import { noStore, rejectOperatorInjection } from './middleware/security';
import { apiRouter, beaconRouter } from './routes';
import { csrfProtection } from './security/csrf';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  // The SPA normally reaches the API through the Next.js same-origin proxy; direct cross-origin
  // access is limited to the configured frontend origin.
  app.use(cors({ origin: env.allowedOrigins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Exam-Instance'] }));

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/exam/heartbeat' },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) },
      }),
    );
  }

  app.get('/api/health', async (_req, res) => {
    const db = mongoose.connection.readyState === 1;
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db, time: new Date().toISOString() });
  });

  app.use('/api', noStore);
  app.use(cookieParser());
  app.use('/api', globalLimiter);
  app.use('/api', beaconRouter());
  app.use(express.json({ limit: '64kb' }));
  app.use(rejectOperatorInjection);
  app.use('/api', csrfProtection());
  app.use('/api', apiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
