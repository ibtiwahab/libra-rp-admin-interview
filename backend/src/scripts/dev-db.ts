/**
 * Local development database for machines without MongoDB/Docker: launches a real `mongod`
 * single-node replica set (transactions supported) via mongodb-memory-server, persisting data to
 * backend/.data/mongo. The binary is downloaded once from fastdl.mongodb.org and cached.
 *
 *   npm run dev:db      →  mongodb://127.0.0.1:27017/libra_interviews?replicaSet=rs0
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  const dbPath = path.resolve(process.cwd(), '.data', 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });
  const port = Number(process.env.DEV_DB_PORT ?? 27017);

  const rs = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port, dbPath }],
  });
  await rs.waitUntilRunning();
  console.log(`\n  LIBRA RP dev MongoDB (replica set rs0) running`);
  console.log(`  MONGODB_URI=mongodb://127.0.0.1:${port}/libra_interviews?replicaSet=rs0`);
  console.log(`  Data directory: ${dbPath}\n  Press Ctrl+C to stop.\n`);

  const stop = async () => {
    await rs.stop({ doCleanup: false, force: false });
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
