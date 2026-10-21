/** Builds/updates all MongoDB indexes. Run once per deployment (autoIndex is off in production). */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import '../models';

async function main() {
  await connectDatabase();
  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    await model.createCollection().catch(() => undefined);
    const dropped = await model.syncIndexes();
    console.log(`  ✓ ${model.collection.collectionName}${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`);
  }
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
