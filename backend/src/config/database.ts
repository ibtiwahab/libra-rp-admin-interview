import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  const servers = env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length) dns.setServers(servers);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  const conn = await mongoose.connect(uri, {
    autoIndex: !env.isProd,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 50,
  });
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  if (conn.connection.name === 'test') {
    logger.warn('MONGODB_URI has no database name, so MongoDB is using "test". Add one, e.g. …mongodb.net/libra_interviews?retryWrites=true&w=majority');
  }
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Runs `fn` inside a MongoDB transaction (requires a replica set).
 * Retries transient transaction errors automatically via withTransaction.
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}
