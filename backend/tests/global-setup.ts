import { MongoMemoryReplSet } from 'mongodb-memory-server';

let rs: MongoMemoryReplSet | undefined;

/** One real mongod replica set (transactions enabled) shared by all test files. */
export async function setup() {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await rs.waitUntilRunning();
  process.env.TEST_MONGO_URI = rs.getUri();
}

export async function teardown() {
  await rs?.stop();
}
