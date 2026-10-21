export type AdminRole = 'HEAD_ADMIN' | 'SUPPORT_CURATOR';
export type QuestionType = 'SHORT_TEXT' | 'LONG_TEXT' | 'MULTIPLE_CHOICE' | 'SCENARIO' | 'TRUE_FALSE';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AttemptStatus = 'IN_PROGRESS' | 'COMPLETED' | 'DISQUALIFIED' | 'EXPIRED';
export type AssignmentStatus = 'NOT_STARTED' | AttemptStatus | 'CANCELLED';
export type Result = 'PENDING' | 'PASSED' | 'FAILED' | 'UNDER_REVIEW' | 'DISQUALIFIED';
export type Decision = 'PASSED' | 'FAILED' | 'UNDER_REVIEW' | 'DISQUALIFIED';

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: AdminRole;
  discordUsername: string | null;
  email: string | null;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  questionCount: number;
}

export interface QuestionOption {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  title: string;
  prompt: string;
  scenario: string;
  type: QuestionType;
  difficulty: Difficulty;
  timeLimitSeconds: number;
  maxScore: number;
  rubric: string;
  options: QuestionOption[];
  allowMultiple: boolean;
  correctOptionKeys: string[];
  correctBoolean: boolean | null;
  category: { id: string; name: string | null };
  position: number;
  version: number;
  createdBy: { id: string; fullName: string; username: string } | null;
  updatedBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  versions?: { version: number; changeType: string; title: string; timeLimitSeconds: number; createdAt: string; createdBy: string | null }[];
}

export interface InterviewQuestion {
  order: number;
  questionId: string;
  title: string;
  prompt: string;
  scenario: string;
  type: QuestionType;
  difficulty: Difficulty;
  category: { id: string; name: string };
  maxScore: number;
  questionTimeLimitSeconds: number;
  timeLimitOverride: number | null;
  timeLimitSeconds: number;
  options: QuestionOption[];
  allowMultiple: boolean;
  correctOptionKeys: string[];
  correctBoolean: boolean | null;
  rubric: string;
  version: number;
}

export interface Interview {
  id: string;
  title: string;
  description: string;
  position: string;
  instructions: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isActive: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  passingPercent: number;
  publishedVersion: number;
  publishedVersionId: string | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  createdBy: { id: string; fullName: string } | null;
  updatedBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  totalQuestions: number;
  totalTimeSeconds: number;
  maxScore: number;
  assignmentCount?: number;
  attemptCount?: number;
  passingScore?: number;
  questions?: InterviewQuestion[];
  versions?: { id: string; version: number; publishedAt: string; publishedBy: string | null; totalQuestions: number; maxScore: number; totalTimeSeconds: number }[];
}

export interface CandidateRow {
  id: string;
  candidateCode: string;
  fullName: string;
  discordUsername: string;
  discordId: string | null;
  characterName: string;
  appliedRole: string;
  status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  credentialsIssuedAt: string;
  credentialVersion: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string } | null;
  assignment: { id: string; status: AssignmentStatus; templateId: string; interviewTitle: string | null; interviewVersion: number | null; assignedAt: string } | null;
  attempt: { id: string; status: AttemptStatus; result: Result; percentage: number | null; totalScore: number | null; maxScore: number | null; progress: number; totalQuestions: number; violation: string | null } | null;
}

export interface Violation {
  type: string;
  source: string;
  reason: string;
  detectedAt: string;
  questionIndex: number | null;
  clientTimestamp: string | null;
  details: Record<string, unknown> | null;
}

export interface Scoring {
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  answeredCount: number;
  unansweredCount: number;
  timedOutCount: number;
  autoScore: number;
}

export interface SecurityEventRow {
  id: string;
  eventType: string;
  source: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  attemptId: string | null;
  candidateId: string | null;
  questionIndex: number | null;
  serverTimestamp: string;
  clientTimestamp: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  candidate?: { fullName: string | null; candidateCode: string | null } | null;
  candidateName?: string | null;
  candidateCode?: string | null;
  ip?: string | null;
  subjectType?: 'ADMIN' | 'CANDIDATE' | null;
  subjectId?: string | null;
}

export interface CandidateProfile extends Omit<CandidateRow, 'assignment' | 'attempt'> {
  assignments: {
    id: string;
    status: AssignmentStatus;
    assignedAt: string;
    assignedBy: string | null;
    startDeadline: string | null;
    interview: { versionId: string; templateId: string; title: string; version: number; totalQuestions: number; totalTimeSeconds: number; maxScore: number; passingPercent: number } | null;
    attempt: {
      id: string;
      referenceCode: string;
      status: AttemptStatus;
      endReason: string | null;
      startedAt: string;
      endedAt: string | null;
      currentQuestionIndex: number;
      totalQuestions: number;
      scoring: Scoring;
      result: Result;
      securityViolation: Violation | null;
      warningCount: number;
      evaluatedBy: string | null;
      evaluatedAt: string | null;
    } | null;
  }[];
  notes: { id: string; body: string; attemptId: string | null; author: { fullName: string; role: string } | null; createdAt: string }[];
  events: SecurityEventRow[];
  authEvents: SecurityEventRow[];
}

export interface AttemptSummary {
  id: string;
  referenceCode: string;
  candidateId: string;
  candidate: { candidateCode: string; fullName: string; discordUsername: string; discordId: string | null; characterName: string; appliedRole: string };
  interview: { title: string; position: string; version: number; passingPercent: number; maxScore: number; totalTimeSeconds: number; templateId: string; versionId: string };
  status: AttemptStatus;
  endReason: string | null;
  startedAt: string;
  endedAt: string | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  scoring: Scoring;
  result: Result;
  securityViolation: Violation | null;
  warningCount: number;
  evaluatedBy: { id: string; fullName: string } | null;
  evaluatedAt: string | null;
  evaluationRevision: number;
}

export interface EvaluationQuestion {
  index: number;
  question: {
    questionId: string;
    questionVersion: number;
    title: string;
    prompt: string;
    scenario: string;
    type: QuestionType;
    difficulty: Difficulty;
    categoryName: string;
    timeLimitSeconds: number;
    maxScore: number;
    rubric: string;
    options: QuestionOption[];
    allowMultiple: boolean;
    correctOptionKeys: string[];
    correctBoolean: boolean | null;
  };
  reached: boolean;
  status: 'ACTIVE' | 'SUBMITTED' | 'TIMED_OUT' | 'TERMINATED' | 'NOT_REACHED';
  answerText: string;
  selectedOptionKeys: string[];
  booleanAnswer: boolean | null;
  hasResponse: boolean;
  activatedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  allowedSeconds: number;
  responseMs: number | null;
  saveCount: number;
  autoScore: number | null;
  awardedScore: number | null;
  evaluatorNotes: string;
  scoredBy: string | null;
}

export interface EvaluationDetail {
  attempt: AttemptSummary;
  passingScore: number;
  questions: EvaluationQuestion[];
  revisions: { id: string; revision: number; evaluator: string; decision: Decision; previousDecision: Result; totalScore: number; maxScore: number; percentage: number; overallNotes: string; marks: { questionIndex: number; awardedScore: number; maxScore: number; notes: string }[]; createdAt: string }[];
  timeline: SecurityEventRow[];
  autosaveEventCount: number;
  notes: { id: string; body: string; author: string | null; createdAt: string }[];
}

export interface Curator {
  id: string;
  username: string;
  fullName: string;
  discordUsername: string | null;
  email: string | null;
  role: AdminRole;
  status: 'ACTIVE' | 'DISABLED' | 'REMOVED';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  removedAt: string | null;
  createdBy: string | null;
  interviewsEvaluated: number;
  recentActions?: { id: string; action: string; targetLabel: string; targetType: string; createdAt: string }[];
  recentEvaluations?: { id: string; candidate: string; candidateCode: string; interview: string; result: Result; percentage: number | null; evaluatedAt: string }[];
}

export interface Credentials {
  username: string;
  password: string;
}

export interface AuditRow {
  id: string;
  action: string;
  actorId: string | null;
  actorUsername: string;
  actorRole: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface LiveInterview {
  attemptId: string;
  candidateId: string;
  referenceCode: string;
  candidate: AttemptSummary['candidate'];
  interviewTitle: string;
  currentQuestion: number;
  completed: number;
  totalQuestions: number;
  startedAt: string;
  lastHeartbeatAt: string;
  connection: 'ONLINE' | 'UNSTABLE' | 'OFFLINE';
  securityStatus: 'SECURE' | 'WARNING';
  warningCount: number;
  question: { title: string; category: string; allowedSeconds: number; deadlineAt: string; activatedAt: string; remainingMs: number; saveCount: number } | null;
}
