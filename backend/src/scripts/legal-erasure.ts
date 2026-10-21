/**
 * Authorized data-retention / legal-erasure procedure.
 *
 * Interview records are retained indefinitely by default and the application offers NO way to
 * delete them. When a lawful erasure request must be honoured, an operator with database access
 * runs this command. It pseudonymises the candidate everywhere their personal data appears,
 * optionally blanks their free-text responses, and records an immutable DATA_ERASURE audit entry.
 * Statistical integrity is preserved (scores, timings and outcomes remain).
 *
 *   npm run retention:erase -- --candidate=LIBRA-ADMIN-0001 --confirm=LIBRA-ADMIN-0001 \
 *        --operator="Jane Doe (DPO)" --reason="Erasure request #123" [--purge-responses] [--dry-run]
 *
 * Immutable collections are modified through the raw driver on purpose: this is the only
 * sanctioned path and it is fully audited.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Candidate } from '../models';

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const code = arg('candidate')?.toUpperCase();
  const confirm = arg('confirm')?.toUpperCase();
  const operator = arg('operator');
  const reason = arg('reason');
  const purge = process.argv.includes('--purge-responses');
  const dry = process.argv.includes('--dry-run');

  if (!code || !operator || !reason || (reason?.length ?? 0) < 5) {
    console.error('Usage: npm run retention:erase -- --candidate=<CODE> --confirm=<CODE> --operator="<name>" --reason="<lawful basis / ticket>" [--purge-responses] [--dry-run]');
    process.exit(2);
  }
  if (!dry && confirm !== code) {
    console.error('Refusing: --confirm must repeat the candidate code exactly.');
    process.exit(3);
  }

  await connectDatabase();
  const db = mongoose.connection.db!;
  try {
    const c = await Candidate.findOne({ candidateCode: code }).lean();
    if (!c) {
      console.error(`No candidate ${code}`);
      process.exit(4);
    }
    const pseudonym = `Erased candidate ${String(c._id).slice(-6).toUpperCase()}`;
    const attempts = await db.collection('interview_attempts').find({ candidateId: c._id }, { projection: { _id: 1, status: 1 } }).toArray();
    if (attempts.some((a) => a.status === 'IN_PROGRESS')) {
      console.error('Refusing: an attempt is in progress.');
      process.exit(5);
    }
    const attemptIds = attempts.map((a) => a._id);
    const plan = {
      candidate: code,
      attempts: attemptIds.length,
      answers: await db.collection('interview_answers').countDocuments({ attemptId: { $in: attemptIds } }),
      notes: await db.collection('candidate_notes').countDocuments({ candidateId: c._id }),
      securityEvents: await db.collection('security_events').countDocuments({ candidateId: c._id }),
      purgeResponses: purge,
    };
    console.log('Erasure plan:', plan);
    if (dry) return;

    await db.collection('candidates').updateOne(
      { _id: c._id },
      { $set: { fullName: pseudonym, discordUsername: 'erased', discordId: null, characterName: 'erased', status: 'ARCHIVED', archivedAt: new Date(), passwordHash: '!erased' } },
    );
    await db.collection('interview_attempts').updateMany(
      { candidateId: c._id },
      { $set: { 'candidateSnapshot.fullName': pseudonym, 'candidateSnapshot.discordUsername': 'erased', 'candidateSnapshot.discordId': null, 'candidateSnapshot.characterName': 'erased', preflight: null } },
    );
    if (purge) {
      await db.collection('interview_answers').updateMany({ attemptId: { $in: attemptIds } }, { $set: { answerText: '[erased]', evaluatorNotes: '' } });
      await db.collection('candidate_notes').updateMany({ candidateId: c._id }, { $set: { body: '[erased]' } });
    }
    await db.collection('security_events').updateMany({ candidateId: c._id }, { $set: { ip: null, 'metadata.userAgent': null } });
    await db.collection('sessions').deleteMany({ subjectType: 'CANDIDATE', subjectId: c._id });
    await db.collection('audit_logs').insertOne({
      action: 'DATA_ERASURE',
      actorId: null,
      actorUsername: `operator:${operator}`,
      actorRole: 'SYSTEM',
      targetType: 'Candidate',
      targetId: c._id,
      targetLabel: pseudonym,
      details: { reason, ...plan },
      ip: null,
      createdAt: new Date(),
    });
    console.log(`Erasure complete. Candidate now appears as "${pseudonym}".`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
