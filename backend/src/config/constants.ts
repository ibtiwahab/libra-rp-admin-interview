export const ADMIN_ROLES = ['HEAD_ADMIN', 'SUPPORT_CURATOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_STATUSES = ['ACTIVE', 'DISABLED', 'REMOVED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

/** The only staff roles candidates can apply for. */
export const APPLIED_ROLES = ['Admin Assistant', 'Admin'] as const;
export type AppliedRole = (typeof APPLIED_ROLES)[number];

export const CANDIDATE_STATUSES = ['ACTIVE', 'DISABLED', 'ARCHIVED'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const QUESTION_TYPES = ['SHORT_TEXT', 'LONG_TEXT', 'MULTIPLE_CHOICE', 'SCENARIO', 'TRUE_FALSE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const TIMER_MIN_SECONDS = 30;
export const TIMER_MAX_SECONDS = 60;
export const TIMER_DEFAULT_SECONDS = 45;

export const TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Attempt lifecycle. COMPLETED / DISQUALIFIED / EXPIRED are terminal. */
export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'DISQUALIFIED', 'EXPIRED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export const TERMINAL_ATTEMPT_STATUSES: AttemptStatus[] = ['COMPLETED', 'DISQUALIFIED', 'EXPIRED'];

/** Assignment status mirrors the attempt once started; NOT_STARTED and CANCELLED exist only here. */
export const ASSIGNMENT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DISQUALIFIED', 'EXPIRED', 'CANCELLED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ATTEMPT_END_REASONS = [
  'ALL_QUESTIONS_ANSWERED',
  'FOCUS_VIOLATION',
  'HEARTBEAT_TIMEOUT',
  'EXAM_WINDOW_EXPIRED',
  'ADMIN_TERMINATED',
] as const;
export type AttemptEndReason = (typeof ATTEMPT_END_REASONS)[number];

export const ANSWER_STATUSES = ['ACTIVE', 'SUBMITTED', 'TIMED_OUT', 'TERMINATED'] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const RESULTS = ['PENDING', 'PASSED', 'FAILED', 'UNDER_REVIEW', 'DISQUALIFIED'] as const;
export type Result = (typeof RESULTS)[number];
export const EVALUATION_DECISIONS = ['PASSED', 'FAILED', 'UNDER_REVIEW', 'DISQUALIFIED'] as const;
export type EvaluationDecision = (typeof EVALUATION_DECISIONS)[number];

export const SECURITY_EVENT_TYPES = [
  // authentication
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'ACCOUNT_LOCKED',
  'MFA_FAILED',
  'LOGOUT',
  'SESSION_REVOKED',
  'CONCURRENT_LOGIN_ATTEMPT',
  'SESSION_TIMEOUT',
  // lifecycle
  'INTERVIEW_STARTED',
  'QUESTION_STARTED',
  'ANSWER_SAVED',
  'QUESTION_SUBMITTED',
  'QUESTION_TIMEOUT',
  'INTERVIEW_COMPLETED',
  'INTERVIEW_DISQUALIFIED',
  'INTERVIEW_EXPIRED',
  'INTERVIEW_TERMINATED_BY_ADMIN',
  // browser-reported signals
  'TAB_HIDDEN',
  'WINDOW_BLURRED',
  'PAGE_EXIT',
  'PAGE_RELOAD_DETECTED',
  'FULLSCREEN_EXITED',
  'CLIPBOARD_BLOCKED',
  'CONTEXT_MENU_BLOCKED',
  // other
  'STALE_SESSION_REQUEST',
  'LATE_SUBMISSION_REJECTED',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/** Browser signals that immediately disqualify an active attempt. */
export const DISQUALIFYING_CLIENT_EVENTS = ['TAB_HIDDEN', 'WINDOW_BLURRED', 'PAGE_EXIT'] as const;
/** Browser signals that are logged as warnings only. */
export const WARNING_CLIENT_EVENTS = ['FULLSCREEN_EXITED', 'CLIPBOARD_BLOCKED', 'CONTEXT_MENU_BLOCKED'] as const;
export const CLIENT_EVENT_TYPES = [...DISQUALIFYING_CLIENT_EVENTS, ...WARNING_CLIENT_EVENTS] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export const SECURITY_EVENT_SOURCES = ['CLIENT_REPORTED', 'SERVER', 'HEARTBEAT', 'ADMIN'] as const;
export type SecurityEventSource = (typeof SECURITY_EVENT_SOURCES)[number];

export const SECURITY_EVENT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type SecurityEventSeverity = (typeof SECURITY_EVENT_SEVERITIES)[number];

export const SUBJECT_TYPES = ['ADMIN', 'CANDIDATE'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const AUDIT_ACTIONS = [
  'ADMIN_BOOTSTRAPPED',
  'CURATOR_CREATED',
  'CURATOR_UPDATED',
  'CURATOR_DISABLED',
  'CURATOR_REACTIVATED',
  'CURATOR_REMOVED',
  'CURATOR_PASSWORD_RESET',
  'ADMIN_PASSWORD_CHANGED',
  'ADMIN_MFA_ENABLED',
  'ADMIN_MFA_DISABLED',
  'CANDIDATE_CREATED',
  'CANDIDATE_UPDATED',
  'CANDIDATE_ARCHIVED',
  'CANDIDATE_CREDENTIALS_REGENERATED',
  'CANDIDATE_NOTE_ADDED',
  'INTERVIEW_ASSIGNED',
  'ASSIGNMENT_CANCELLED',
  'ATTEMPT_TERMINATED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'QUESTION_CREATED',
  'QUESTION_UPDATED',
  'QUESTION_DELETED',
  'QUESTION_DUPLICATED',
  'QUESTIONS_REORDERED',
  'INTERVIEW_CREATED',
  'INTERVIEW_UPDATED',
  'INTERVIEW_DELETED',
  'INTERVIEW_PUBLISHED',
  'EVALUATION_SAVED',
  'EVALUATION_MODIFIED',
  'EXPORT_GENERATED',
  'DATA_ERASURE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
