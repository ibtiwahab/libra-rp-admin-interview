/**
 * LIBRA RP — Admin Assistant interview question set.
 * Every question is answered in writing and scored manually by a Head Admin or Support Curator
 * (1 mark each: ✗ = 0, ½ = 0.5, ✓ = 1).
 *
 * Rubrics are filled only for general roleplay terms; server-specific answers (limits, locations,
 * prices…) are left for staff to add in the Question Bank.
 */

export interface SetQuestion {
  title: string;
  prompt: string;
  timeLimitSeconds: number;
  rubric?: string;
}

export interface SetSection {
  category: string;
  description: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT';
  questions: SetQuestion[];
}

export const ADMIN_ASSISTANT_INTERVIEW = {
  title: 'LIBRA RP — ADMIN ASSISTANT INTERVIEW',
  position: 'Admin Assistant',
  description: 'Written interview for players and faction leaders applying for the Admin Assistant staff role.',
  instructions: 'A Head Admin or Support Curator will review and score your answers after the interview.',
  passingPercent: 70,
};

export const ADMIN_ASSISTANT_SECTIONS: SetSection[] = [
  {
    category: 'A1 · Roleplay Rules',
    description: 'Core roleplay terms every staff member must explain clearly.',
    type: 'LONG_TEXT',
    questions: [
      { title: 'Fail RP', prompt: 'What is Fail RP? Give an example.', timeLimitSeconds: 60, rubric: 'Unrealistic roleplay that breaks immersion or ignores what a real person would do. Example given.' },
      { title: 'Fear RP', prompt: 'What is Fear RP? Give an example.', timeLimitSeconds: 60, rubric: 'Not valuing your life — failing to show fear when threatened (e.g. resisting while held at gunpoint by several people). Example given.' },
      { title: 'Meta Gaming', prompt: 'What is Meta Gaming? Give an example.', timeLimitSeconds: 60, rubric: 'Using out-of-character information (Discord, streams, OOC chat) in character. Example given.' },
      { title: 'Power Gaming', prompt: 'What is Power Gaming? Give an example.', timeLimitSeconds: 60, rubric: 'Forcing actions on others or doing unrealistic things with no chance to respond / abusing game mechanics. Example given.' },
      { title: 'VDM (Vehicle Deathmatch)', prompt: 'What is VDM (Vehicle Deathmatch)?', timeLimitSeconds: 45, rubric: 'Using a vehicle as a weapon to run over / kill players without valid roleplay.' },
      { title: 'Mixing', prompt: 'What is Mixing?', timeLimitSeconds: 45, rubric: 'Mixing IC and OOC — bringing OOC matters into roleplay or IC matters into OOC.' },
      { title: 'NLR (New Life Rule)', prompt: 'What is NLR (New Life Rule)?', timeLimitSeconds: 45, rubric: 'After dying you forget the events leading to your death and must not return to the scene / seek revenge.' },
    ],
  },
  {
    category: 'A2 · Account & Technical',
    description: 'Account rules and server limits.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'Twink while main is banned', prompt: 'Can you play on your twink if your main is banned?', timeLimitSeconds: 45 },
      { title: 'Daily exchange limit', prompt: 'What is the daily exchange limit?', timeLimitSeconds: 45 },
      { title: '"Side of the Law" rule for alts', prompt: 'What is the "Side of the Law" rule for alts?', timeLimitSeconds: 45 },
    ],
  },
  {
    category: 'A3 · True/False',
    description: 'State true or false and explain briefly.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'State org car for personal errands', prompt: 'True or false: I can use a state org car for personal errands. Explain briefly.', timeLimitSeconds: 45 },
      { title: 'Robbing a bus or taxi driver', prompt: 'True or false: It is okay to rob a bus driver or taxi driver. Explain briefly.', timeLimitSeconds: 45 },
      { title: 'Synonyms like "Headache" for lag', prompt: 'True or false: You can use synonyms like "Headache" for lag. Explain briefly.', timeLimitSeconds: 45 },
    ],
  },
  {
    category: 'A4 · Misc.',
    description: 'Miscellaneous server rules.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'Hostage ransom limits', prompt: 'What are the hostage ransom limits?', timeLimitSeconds: 45 },
      { title: 'Snipers in events', prompt: 'Can you use snipers in events?', timeLimitSeconds: 45 },
      { title: 'Speed boosting', prompt: 'Is speed boosting allowed?', timeLimitSeconds: 45 },
    ],
  },
  {
    category: 'A5 · IC Questions',
    description: 'Helping players with in-game questions.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'Zipties / Lock Picks', prompt: 'Where do you get Zipties / Lock Picks?', timeLimitSeconds: 45 },
      { title: 'Buying a car / bike', prompt: 'Where can I buy a car / bike?', timeLimitSeconds: 45 },
      { title: 'Gun license', prompt: 'How can I get a gun license?', timeLimitSeconds: 45 },
      { title: 'Gas canister', prompt: 'How do I get a gas canister?', timeLimitSeconds: 45 },
      { title: 'Joining a clan', prompt: 'How do I join a clan?', timeLimitSeconds: 45 },
      { title: 'Getting married', prompt: 'Where do I get married?', timeLimitSeconds: 45 },
      { title: 'Changing facial features', prompt: "How do I change my character's facial features?", timeLimitSeconds: 45 },
      { title: 'Joining a gang', prompt: 'How do I join a gang?', timeLimitSeconds: 45 },
      { title: 'Joining a state org', prompt: 'How do I join a state org?', timeLimitSeconds: 45 },
      { title: 'Health insurance / medkits', prompt: 'Where can I buy health insurance / medkits?', timeLimitSeconds: 45 },
      { title: 'Insurance / Anti-Theft protection', prompt: 'Where can I buy Insurance / Anti-Theft protection?', timeLimitSeconds: 45 },
      { title: 'Getting Libra coins', prompt: 'How do I get Libra coins? What is the ratio?', timeLimitSeconds: 45 },
      { title: 'Using Libra coins', prompt: 'What can I do with Libra coins?', timeLimitSeconds: 45 },
      { title: 'Changing name', prompt: 'How do I change my name?', timeLimitSeconds: 45 },
      { title: 'Fixing / upgrading car engine', prompt: 'How do I fix / upgrade my car engine?', timeLimitSeconds: 45 },
      { title: 'Joining events', prompt: 'How do I join events like Chicken Run / Tank Royale?', timeLimitSeconds: 45 },
      { title: 'Retrieving a stolen car', prompt: "How do I retrieve my car if it's stolen?", timeLimitSeconds: 45 },
      { title: 'Level 2+ job equipment', prompt: 'How do I get level 2+ equipment for the jobs?', timeLimitSeconds: 45 },
    ],
  },
];
