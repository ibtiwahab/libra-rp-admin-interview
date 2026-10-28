import { ApiError, api, ensureCsrf } from '@/lib/api';
import type { QuestionType } from '@/lib/types';

/**
 * Identifies this in-memory page instance. It lives only in a module variable — never in
 * storage — so a reload or a second tab produces a different id, which the server treats as
 * leaving the examination.
 */
let instanceId: string | null = null;
export function getInstanceId(): string {
  if (!instanceId) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    instanceId = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return instanceId;
}

const H = () => ({ 'X-Exam-Instance': getInstanceId() });

export interface InterviewSummary {
  title: string;
  position: string;
  totalQuestions: number;
  totalTimeSeconds: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
}

export interface TerminalState {
  state: 'COMPLETED' | 'DISQUALIFIED' | 'EXPIRED';
  referenceCode: string;
  endedAt: string | null;
  title: string;
  totalQuestions: number;
  answeredCount: number;
  reason: 'EXAMINATION_SECURITY_POLICY' | 'SESSION_EXPIRED' | null;
}

export type ExamStatus =
  | { state: 'NO_ASSIGNMENT'; candidate: CandidateInfo; serverNow: string }
  | { state: 'NOT_STARTED'; candidate: CandidateInfo; serverNow: string; window: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED'; startDeadline: string | null; interview: InterviewSummary | null; resume: ResumeInfo | null }
  | { state: 'IN_PROGRESS'; candidate: CandidateInfo; serverNow: string; interview: InterviewSummary | null; attempt: { referenceCode: string; startedAt: string; currentQuestionIndex: number; totalQuestions: number; boundToThisSession: boolean } }
  | { state: 'COMPLETED' | 'DISQUALIFIED' | 'EXPIRED'; candidate: CandidateInfo; serverNow: string; interview: InterviewSummary | null; result: TerminalState }
  | { state: 'CANCELLED'; candidate: CandidateInfo; serverNow: string; interview: InterviewSummary | null };

export interface ResumeInfo {
  fromQuestion: number;
  totalQuestions: number;
}

export interface CandidateInfo {
  fullName: string;
  candidateCode: string;
  characterName: string;
  appliedRole: string;
}

export interface Instructions {
  interview: InterviewSummary & { description: string; instructions: string; shortestTimerSeconds: number; longestTimerSeconds: number; categories: string[] };
  window: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED';
  startDeadline: string | null;
  /** Set when staff allowed the candidate to continue an interrupted interview. */
  resume: ResumeInfo | null;
  policy: { heartbeatIntervalSeconds: number; heartbeatTimeoutSeconds: number; heartbeatTimeoutAction: 'EXPIRE' | 'DISQUALIFY'; submissionGraceMs: number };
}

export interface QuestionState {
  state: 'IN_PROGRESS';
  attempt: { id: string; referenceCode: string; currentQuestionIndex: number; totalQuestions: number; startedAt: string; title: string };
  question: { index: number; title: string; prompt: string; scenario: string; type: QuestionType; category: string; difficulty: string; maxScore: number; timeLimitSeconds: number; allowMultiple: boolean; options: { key: string; text: string }[] };
  timing: { activatedAt: string; deadlineAt: string; serverNow: string; remainingMs: number };
  saved: { answerText: string; selectedOptionKeys: string[]; booleanAnswer: boolean | null; saveSeq: number; lastSavedAt: string | null };
  watermark: { candidateCode: string; candidateRef: string; referenceCode: string };
  heartbeatIntervalSeconds: number;
}

export type ExamState = QuestionState | TerminalState;

export interface AnswerPayload {
  answerText?: string;
  selectedOptionKeys?: string[];
  booleanAnswer?: boolean | null;
}

export interface Preflight {
  visibilityApi: boolean;
  focused: boolean;
  fullscreen: boolean;
  cookies: boolean;
  latencyMs: number | null;
  viewport: { width: number; height: number };
}

export type ClientSignal = 'TAB_HIDDEN' | 'WINDOW_BLURRED' | 'PAGE_EXIT' | 'FULLSCREEN_EXITED' | 'CLIPBOARD_BLOCKED' | 'CONTEXT_MENU_BLOCKED';

export const examApi = {
  status: () => api<ExamStatus>('/exam/status'),
  instructions: () => api<Instructions>('/exam/instructions'),
  start: (preflight: Preflight) => api<QuestionState | TerminalState>('/exam/start', { method: 'POST', body: { acknowledged: true, instanceId: getInstanceId(), preflight }, headers: H() }),
  current: () => api<ExamState>('/exam/current-question', { headers: H() }),
  save: (questionIndex: number, seq: number, answer: AnswerPayload) => api<{ saved: boolean; seq: number; savedAt: string | null; stale: boolean }>('/exam/answer', { method: 'PATCH', body: { questionIndex, seq, ...answer }, headers: H() }),
  submit: (questionIndex: number, seq: number, answer: AnswerPayload, reason: 'MANUAL' | 'TIMEOUT') =>
    api<{ submission: 'ACCEPTED' | 'ACCEPTED_AT_DEADLINE' | 'REJECTED_LATE' | 'CLOSED'; next: ExamState }>('/exam/submit-answer', { method: 'POST', body: { questionIndex, seq, ...answer, reason }, headers: H() }),
  heartbeat: (questionIndex: number | null) =>
    api<{ state: 'IN_PROGRESS'; serverNow: string; currentQuestionIndex: number; deadlineAt: string | null; remainingMs: number | null } | { state: 'COMPLETED' | 'DISQUALIFIED' | 'EXPIRED'; terminal: TerminalState }>('/exam/heartbeat', {
      method: 'POST',
      body: { questionIndex, visible: document.visibilityState === 'visible', focused: document.hasFocus() },
      headers: H(),
    }),
  signal: (type: ClientSignal, questionIndex: number | null, details: Record<string, unknown>, keepalive = false) =>
    api<{ recorded: boolean; state: TerminalState | { state: 'IN_PROGRESS' } | null }>('/exam/security-event', {
      method: 'POST',
      body: { type, questionIndex, clientTimestamp: new Date().toISOString(), instanceId: getInstanceId(), details },
      headers: H(),
      keepalive,
    }),
  logout: () => api('/auth/logout', { method: 'POST', body: { portal: 'candidate' } }),
};

/**
 * Fire-and-forget page-exit signal for `pagehide`/`beforeunload`, when an awaited fetch cannot
 * complete. sendBeacon cannot set headers, so the CSRF token travels in the body.
 */
export function sendExitBeacon(type: ClientSignal, questionIndex: number | null, details: Record<string, unknown>) {
  const csrf = document.cookie.match(/(?:^|; )libra_csrf=([^;]*)/)?.[1];
  const body = JSON.stringify({ type, questionIndex, clientTimestamp: new Date().toISOString(), instanceId: getInstanceId(), details, csrfToken: csrf ? decodeURIComponent(csrf) : undefined });
  let sent = false;
  try {
    sent = navigator.sendBeacon('/api/exam/security-beacon', new Blob([body], { type: 'text/plain;charset=UTF-8' }));
  } catch {
    sent = false;
  }
  if (!sent) {
    void fetch('/api/exam/security-beacon', { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(() => undefined);
  }
}

export async function prepareExamClient() {
  getInstanceId();
  await ensureCsrf();
}

export function isTerminal(s: ExamState | null | undefined): s is TerminalState {
  return !!s && s.state !== 'IN_PROGRESS';
}

export { ApiError };
