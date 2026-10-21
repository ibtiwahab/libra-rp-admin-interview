/**
 * Sets the timer of every question in an interview, republishes it, and moves candidates who have
 * not started yet onto the new version. Question edits are versioned and audited as usual;
 * interviews already taken keep the timers they ran with.
 *
 *   npm run set-timers -- --seconds=180 [--interview="LIBRA RP — ADMIN ASSISTANT INTERVIEW"] [--dry-run]
 */
import type { Request } from 'express';
import { TIMER_MAX_SECONDS, TIMER_MIN_SECONDS } from '../config/constants';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Assignment, InterviewTemplate, Question, User } from '../models';
import { publishInterview, updateInterview } from '../services/interviewService';
import { audit } from '../services/logService';
import { updateQuestion } from '../services/questionService';
import { createQuestionSchema } from '../validators/questions';

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const seconds = Number(arg('seconds'));
  const title = arg('interview') ?? 'LIBRA RP — ADMIN ASSISTANT INTERVIEW';
  const dry = process.argv.includes('--dry-run');
  if (!Number.isInteger(seconds) || seconds < TIMER_MIN_SECONDS || seconds > TIMER_MAX_SECONDS) {
    console.error(`Usage: npm run set-timers -- --seconds=<${TIMER_MIN_SECONDS}-${TIMER_MAX_SECONDS}> [--interview="<title>"] [--dry-run]`);
    process.exit(2);
  }

  await connectDatabase();
  try {
    const head = await User.findOne({ role: 'HEAD_ADMIN', status: 'ACTIVE' }).sort({ createdAt: 1 });
    if (!head) throw new Error('No active Head Admin found.');
    const req = { admin: { user: head, session: null }, ip: '127.0.0.1', socket: {}, get: () => undefined } as unknown as Request;

    const t = await InterviewTemplate.findOne({ title, isDeleted: false });
    if (!t) throw new Error(`Interview "${title}" not found.`);
    const questions = await Question.find({ _id: { $in: t.questions.map((q) => q.questionId) }, isDeleted: false }).lean();
    const toChange = questions.filter((q) => q.timeLimitSeconds !== seconds);
    const overrides = t.questions.filter((q) => q.timeLimitSeconds !== null).length;
    const waiting = await Assignment.countDocuments({ templateId: t._id, status: 'NOT_STARTED' });
    console.log(`Interview: ${t.title} (published v${t.publishedVersion})`);
    console.log(`Questions: ${questions.length} — ${toChange.length} to change to ${seconds}s; per-interview overrides to clear: ${overrides}`);
    console.log(`Candidates waiting to start (will get the new version): ${waiting}`);
    if (dry) return;

    for (const q of toChange) {
      const input = createQuestionSchema.parse({
        title: q.title,
        prompt: q.prompt,
        scenario: q.scenario ?? '',
        type: q.type,
        categoryId: String(q.categoryId),
        difficulty: q.difficulty,
        timeLimitSeconds: seconds,
        maxScore: q.maxScore,
        rubric: q.rubric ?? '',
        options: (q.options ?? []).map((o) => ({ key: o.key, text: o.text })),
        allowMultiple: q.allowMultiple ?? false,
        correctOptionKeys: q.correctOptionKeys ?? [],
        correctBoolean: q.correctBoolean ?? null,
      });
      await updateQuestion(req, String(q._id), input);
    }
    if (overrides) {
      await updateInterview(req, String(t._id), { questions: t.questions.map((q) => ({ questionId: String(q.questionId), timeLimitSeconds: null })) });
    }
    const published = await publishInterview(req, String(t._id));
    const moved = await Assignment.updateMany(
      { templateId: t._id, status: 'NOT_STARTED' },
      { $set: { interviewVersionId: published.published.versionId } },
    );
    await audit(req, {
      action: 'INTERVIEW_UPDATED',
      targetType: 'InterviewTemplate',
      targetId: t._id,
      targetLabel: t.title,
      details: { timersSetTo: seconds, questionsChanged: toChange.length, newVersion: published.published.version, assignmentsMoved: moved.modifiedCount },
    });
    console.log(`Done: published v${published.published.version}, total time ${Math.round((questions.length * seconds) / 60)} min; ${moved.modifiedCount} waiting candidate(s) moved to it.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
