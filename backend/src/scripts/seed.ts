/**
 * Seeds the configurable question categories, a realistic starter question bank and a published
 * "LIBRA RP — ADMIN RECRUITMENT INTERVIEW". Creates no user accounts and no passwords.
 * Requires an existing Head Admin (run bootstrap:admin first). Idempotent.
 *
 *   npm run seed
 */
import type { Request } from 'express';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Category, InterviewTemplate, Question, User } from '../models';
import { createCategory } from '../services/categoryService';
import { createInterview, publishInterview } from '../services/interviewService';
import { createQuestion } from '../services/questionService';
import { createQuestionSchema } from '../validators/questions';

export const SEED_CATEGORIES = [
  ['General Administration', 'Day-to-day staff duties and server administration fundamentals.'],
  ['Roleplay Rules', 'Core roleplay standards: fear RP, value of life, new life rule.'],
  ['Server Rules', 'Libra RP community and server rules.'],
  ['Staff Responsibilities', 'What the community can expect from every staff member.'],
  ['Player Management', 'Handling players fairly, consistently and transparently.'],
  ['Conflict Resolution', 'De-escalation and mediation between players.'],
  ['Report Handling', 'Receiving, investigating and closing player reports.'],
  ['Leadership', 'Leading by example and supporting the staff team.'],
  ['Situational Judgment', 'Decision-making in realistic in-city scenarios.'],
  ['Communication', 'Clear, professional and respectful communication.'],
  ['Anti-Metagaming', 'Identifying and addressing out-of-character information in RP.'],
  ['Anti-Powergaming', 'Identifying unrealistic or forced roleplay.'],
  ['Staff Ethics', 'Integrity, impartiality and conflicts of interest.'],
] as const;

type Seed = {
  category: string;
  title: string;
  prompt: string;
  scenario?: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'MULTIPLE_CHOICE' | 'SCENARIO' | 'TRUE_FALSE';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  timeLimitSeconds: number;
  maxScore: number;
  rubric: string;
  options?: { key: string; text: string }[];
  correctOptionKeys?: string[];
  correctBoolean?: boolean;
};

export const SEED_QUESTIONS: Seed[] = [
  {
    category: 'Report Handling',
    title: 'Handling a rule-break report',
    prompt: 'What would you do if a player reported another player for breaking server rules?',
    type: 'LONG_TEXT',
    difficulty: 'EASY',
    timeLimitSeconds: 60,
    maxScore: 10,
    rubric: 'Acknowledge the report promptly; gather evidence (clips, logs); hear both parties; stay impartial; apply the rule set consistently; document the outcome and inform the reporter.',
  },
  {
    category: 'Anti-Metagaming',
    title: 'Define metagaming',
    prompt: 'In one or two sentences, define metagaming and give one example.',
    type: 'SHORT_TEXT',
    difficulty: 'EASY',
    timeLimitSeconds: 45,
    maxScore: 5,
    rubric: 'Using out-of-character information (Discord, streams, OOC chat) in character. Example: locating a player because you watched their stream.',
  },
  {
    category: 'Anti-Powergaming',
    title: 'Identify powergaming',
    prompt: 'Which of the following is the clearest example of powergaming?',
    type: 'MULTIPLE_CHOICE',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 30,
    maxScore: 5,
    rubric: 'C — forcing an outcome with no chance for the other party to respond.',
    options: [
      { key: 'A', text: 'Calling a mechanic after your vehicle breaks down' },
      { key: 'B', text: 'Surrendering when three armed officers have you at gunpoint' },
      { key: 'C', text: '"/me knocks him out instantly and takes all his items" with no chance to react' },
      { key: 'D', text: 'Using your phone in character to call for an ambulance' },
    ],
    correctOptionKeys: ['C'],
  },
  {
    category: 'Roleplay Rules',
    title: 'Fear roleplay',
    prompt: 'True or false: a character held at gunpoint by multiple attackers is expected to value their life and comply.',
    type: 'TRUE_FALSE',
    difficulty: 'EASY',
    timeLimitSeconds: 30,
    maxScore: 3,
    rubric: 'True — value of life / fear RP.',
    correctBoolean: true,
  },
  {
    category: 'Situational Judgment',
    title: 'Friend breaking rules',
    prompt: 'You are on duty and discover that a close friend of yours is clearly breaking a server rule. What do you do?',
    scenario: 'Your friend is RDMing players at Legion Square. Several players have already filed reports and are asking in the help channel why no staff have responded.',
    type: 'SCENARIO',
    difficulty: 'HARD',
    timeLimitSeconds: 60,
    maxScore: 10,
    rubric: 'Declare the conflict of interest; hand the case to another staff member or handle it with the same standard as anyone else; never cover for friends; document; communicate with affected players.',
  },
  {
    category: 'Conflict Resolution',
    title: 'Heated OOC argument',
    prompt: 'Two players are arguing aggressively out of character in a public channel. How do you de-escalate?',
    type: 'LONG_TEXT',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 60,
    maxScore: 10,
    rubric: 'Move them to a private channel; stay calm and neutral; listen to each side separately; refocus on rules not personalities; set clear expectations; follow up and log.',
  },
  {
    category: 'Staff Ethics',
    title: 'Using staff tools for personal gain',
    prompt: 'True or false: it is acceptable for a staff member to spawn a vehicle for themselves for personal roleplay if no one notices.',
    type: 'TRUE_FALSE',
    difficulty: 'EASY',
    timeLimitSeconds: 30,
    maxScore: 3,
    rubric: 'False — abuse of staff permissions.',
    correctBoolean: false,
  },
  {
    category: 'Staff Responsibilities',
    title: 'Being on duty',
    prompt: 'List three responsibilities you have whenever you are on staff duty.',
    type: 'SHORT_TEXT',
    difficulty: 'EASY',
    timeLimitSeconds: 45,
    maxScore: 6,
    rubric: 'Respond to reports promptly; remain impartial; follow and enforce rules consistently; communicate professionally; document actions; protect player experience.',
  },
  {
    category: 'Player Management',
    title: 'Choosing a sanction',
    prompt: 'A first-time player breaks a minor rule out of ignorance. Which response is most appropriate?',
    type: 'MULTIPLE_CHOICE',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 40,
    maxScore: 5,
    rubric: 'B — education first, proportionate response.',
    options: [
      { key: 'A', text: 'Permanent ban to set an example' },
      { key: 'B', text: 'Explain the rule, issue a verbal warning and note it on their record' },
      { key: 'C', text: 'Ignore it entirely' },
      { key: 'D', text: 'Kick them without explanation' },
    ],
    correctOptionKeys: ['B'],
  },
  {
    category: 'Leadership',
    title: 'Mentoring a new staff member',
    prompt: 'A newly promoted moderator keeps making procedural mistakes. How would you support them?',
    type: 'LONG_TEXT',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 60,
    maxScore: 10,
    rubric: 'Private, constructive feedback; shadowing; point to documentation; check-ins; escalate to management only if no improvement; lead by example.',
  },
  {
    category: 'Communication',
    title: 'Explaining a ban',
    prompt: 'Write the message you would send to a player explaining why they received a temporary ban.',
    type: 'LONG_TEXT',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 60,
    maxScore: 8,
    rubric: 'Professional tone; states the rule broken; evidence reference; duration; how to appeal; no sarcasm or personal remarks.',
  },
  {
    category: 'Server Rules',
    title: 'Combat logging',
    prompt: 'What is combat logging and why is it against the rules?',
    type: 'SHORT_TEXT',
    difficulty: 'EASY',
    timeLimitSeconds: 45,
    maxScore: 5,
    rubric: 'Disconnecting during an active RP situation to avoid consequences; it denies other players a fair outcome.',
  },
  {
    category: 'Situational Judgment',
    title: 'Mass RDM during an event',
    prompt: 'During a city-wide event a modded player starts killing everyone. You are the only staff member online. Prioritise your actions.',
    scenario: 'There are 120 players in the city. The player is teleporting and has an explosive weapon. Players are flooding the reports channel.',
    type: 'SCENARIO',
    difficulty: 'EXPERT',
    timeLimitSeconds: 60,
    maxScore: 10,
    rubric: 'Stop the threat first (spectate, freeze/ban); capture evidence; alert senior staff/devs; reassure players; revive/compensate per policy; full write-up afterwards.',
  },
  {
    category: 'Anti-Metagaming',
    title: 'Stream sniping',
    prompt: 'Which of these is metagaming?',
    type: 'MULTIPLE_CHOICE',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 30,
    maxScore: 5,
    rubric: 'A and D.',
    options: [
      { key: 'A', text: 'Finding a player because you watched their live stream' },
      { key: 'B', text: 'Recognising a character because you met them in character yesterday' },
      { key: 'C', text: 'Calling 911 in character after hearing gunshots' },
      { key: 'D', text: 'Knowing a gang\'s plan because they discussed it in Discord' },
    ],
    allowMultiple: true,
    correctOptionKeys: ['A', 'D'],
  } as Seed & { allowMultiple: boolean },
  {
    category: 'General Administration',
    title: 'Why do you want to be an admin?',
    prompt: 'Why do you want to join the Libra RP administration team, and what would you bring to it?',
    type: 'LONG_TEXT',
    difficulty: 'EASY',
    timeLimitSeconds: 60,
    maxScore: 10,
    rubric: 'Genuine motivation centred on the community; relevant experience; availability; understands responsibility over status.',
  },
  {
    category: 'Staff Ethics',
    title: 'Confidential information',
    prompt: 'A player asks you privately what punishment another player received. How do you respond?',
    type: 'SHORT_TEXT',
    difficulty: 'MEDIUM',
    timeLimitSeconds: 45,
    maxScore: 5,
    rubric: 'Politely decline — sanctions are confidential; confirm the report was handled.',
  },
];

function systemReq(user: InstanceType<typeof User>): Request {
  return { admin: { user, session: null }, ip: '127.0.0.1', socket: {}, get: () => undefined } as unknown as Request;
}

async function main() {
  await connectDatabase();
  try {
    const head = await User.findOne({ role: 'HEAD_ADMIN', status: 'ACTIVE' }).sort({ createdAt: 1 });
    if (!head) {
      console.error('No active Head Admin found. Run `npm run bootstrap:admin` first.');
      process.exit(2);
    }
    const req = systemReq(head);

    for (const [name, description] of SEED_CATEGORIES) {
      if (!(await Category.exists({ name }))) await createCategory(req, { name, description, isActive: true });
    }
    console.log(`  ✓ ${SEED_CATEGORIES.length} categories`);

    if ((await Question.countDocuments({ isDeleted: false })) > 0) {
      console.log('  • Question bank already populated — skipping questions and interview.');
      return;
    }
    const cats = new Map((await Category.find().lean()).map((c) => [c.name, String(c._id)]));
    const ids: string[] = [];
    for (const s of SEED_QUESTIONS) {
      const input = createQuestionSchema.parse({
        title: s.title,
        prompt: s.prompt,
        scenario: s.scenario ?? '',
        type: s.type,
        categoryId: cats.get(s.category),
        difficulty: s.difficulty,
        timeLimitSeconds: s.timeLimitSeconds,
        maxScore: s.maxScore,
        rubric: s.rubric,
        options: s.options ?? [],
        allowMultiple: (s as { allowMultiple?: boolean }).allowMultiple ?? false,
        correctOptionKeys: s.correctOptionKeys ?? [],
        correctBoolean: s.correctBoolean ?? null,
      });
      const q = await createQuestion(req, input);
      ids.push(q.id);
    }
    console.log(`  ✓ ${ids.length} questions`);

    if (!(await InterviewTemplate.exists({ isDeleted: false }))) {
      const t = await createInterview(req, {
        title: 'LIBRA RP — ADMIN RECRUITMENT INTERVIEW',
        description: 'Standard assessment for candidates applying to the Libra RP administration team.',
        position: 'Administrator',
        instructions:
          'Answer every question in your own words. Each question has its own strict timer; when it reaches zero your latest saved answer is submitted automatically and the next question begins. You cannot return to previous questions.',
        passingPercent: 70,
        isActive: true,
        availableFrom: null,
        availableUntil: null,
        questions: ids.slice(0, 12).map((questionId) => ({ questionId, timeLimitSeconds: null })),
      });
      await publishInterview(req, t.id);
      console.log('  ✓ Published "LIBRA RP — ADMIN RECRUITMENT INTERVIEW"');
    }
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
