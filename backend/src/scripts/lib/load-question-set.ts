/**
 * Shared loader for the written question sets: creates the categories and questions, then creates
 * and publishes the interview as the first active Head Admin. Skips if the interview already exists.
 */
import type { Request } from 'express';
import { connectDatabase, disconnectDatabase } from '../../config/database';
import { Category, InterviewTemplate, User } from '../../models';
import { createCategory, slugify } from '../../services/categoryService';
import { createInterview, publishInterview } from '../../services/interviewService';
import { createQuestion } from '../../services/questionService';
import { createQuestionSchema } from '../../validators/questions';
import type { SetSection } from '../data/admin-assistant';

export interface SetInterview {
  title: string;
  position: string;
  description: string;
  instructions: string;
  passingPercent: number;
}

export async function loadQuestionSet(interview: SetInterview, sections: SetSection[]) {
  await connectDatabase();
  try {
    const head = await User.findOne({ role: 'HEAD_ADMIN', status: 'ACTIVE' }).sort({ createdAt: 1 });
    if (!head) {
      console.error('No active Head Admin found. Create one first (npm run bootstrap:admin).');
      process.exit(2);
    }
    if (await InterviewTemplate.exists({ title: interview.title, isDeleted: false })) {
      console.log(`  • "${interview.title}" already exists — nothing to do.`);
      return;
    }
    const req = { admin: { user: head, session: null }, ip: '127.0.0.1', socket: {}, get: () => undefined } as unknown as Request;

    const questionIds: string[] = [];
    for (const section of sections) {
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
      ...interview,
      isActive: true,
      availableFrom: null,
      availableUntil: null,
      questions: questionIds.map((questionId) => ({ questionId, timeLimitSeconds: null })),
    });
    await publishInterview(req, t.id);
    console.log(`  ✓ Published "${interview.title}" — ${questionIds.length} questions`);
  } finally {
    await disconnectDatabase();
  }
}

export function run(interview: SetInterview, sections: SetSection[]) {
  loadQuestionSet(interview, sections).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
