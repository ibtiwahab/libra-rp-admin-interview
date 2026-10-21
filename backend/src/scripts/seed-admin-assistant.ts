/**
 * Loads the Admin Assistant question set (34 written questions in 5 sections) and publishes the
 * "LIBRA RP — ADMIN ASSISTANT INTERVIEW". Requires an active Head Admin. Safe to re-run: it
 * skips if the interview already exists.
 *
 *   npm run seed:admin-assistant
 */
import type { Request } from 'express';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Category, InterviewTemplate, User } from '../models';
import { createCategory, slugify } from '../services/categoryService';
import { createInterview, publishInterview } from '../services/interviewService';
import { createQuestion } from '../services/questionService';
import { createQuestionSchema } from '../validators/questions';
import { ADMIN_ASSISTANT_INTERVIEW, ADMIN_ASSISTANT_SECTIONS } from './data/admin-assistant';

async function main() {
  await connectDatabase();
  try {
    const head = await User.findOne({ role: 'HEAD_ADMIN', status: 'ACTIVE' }).sort({ createdAt: 1 });
    if (!head) {
      console.error('No active Head Admin found. Create one first (npm run bootstrap:admin).');
      process.exit(2);
    }
    if (await InterviewTemplate.exists({ title: ADMIN_ASSISTANT_INTERVIEW.title, isDeleted: false })) {
      console.log('  • Admin Assistant interview already exists — nothing to do.');
      return;
    }
    const req = { admin: { user: head, session: null }, ip: '127.0.0.1', socket: {}, get: () => undefined } as unknown as Request;

    const questionIds: string[] = [];
    for (const section of ADMIN_ASSISTANT_SECTIONS) {
      let cat = await Category.findOne({ slug: slugify(section.category) });
      if (!cat) cat = await createCategory(req, { name: section.category, description: section.description, isActive: true });
      for (const q of section.questions) {
        const created = await createQuestion(
          req,
          createQuestionSchema.parse({
            title: q.title,
            prompt: q.prompt,
            type: section.type,
            categoryId: String(cat._id),
            difficulty: 'EASY',
            timeLimitSeconds: q.timeLimitSeconds,
            maxScore: 1,
            rubric: q.rubric ?? '',
          }),
        );
        questionIds.push(created.id);
      }
      console.log(`  ✓ ${section.category}: ${section.questions.length} questions`);
    }

    const t = await createInterview(req, {
      ...ADMIN_ASSISTANT_INTERVIEW,
      isActive: true,
      availableFrom: null,
      availableUntil: null,
      questions: questionIds.map((questionId) => ({ questionId, timeLimitSeconds: null })),
    });
    await publishInterview(req, t.id);
    console.log(`  ✓ Published "${ADMIN_ASSISTANT_INTERVIEW.title}" — ${questionIds.length} questions`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
