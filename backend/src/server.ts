import mongoose from 'mongoose';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { startReconciler } from './jobs/reconciler';
import './models';

async function main() {
  await connectDatabase();
  if (env.isProd) {
    // autoIndex is disabled in production; the unique indexes are security-critical (one attempt
    // per assignment, one open assignment per candidate), so make sure they exist before serving.
    for (const name of mongoose.modelNames()) await mongoose.model(name).createIndexes();
    logger.info('MongoDB indexes verified');
  }
  const app = createApp();
  const server = app.listen(env.BACKEND_PORT, () => {
    logger.info(`LIBRA RP API listening on :${env.BACKEND_PORT} (${env.NODE_ENV})`);
  });
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 61_000;

  const stopJobs = env.jobsDisabled ? () => undefined : startReconciler();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopJobs();
    server.close();
    await disconnectDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
