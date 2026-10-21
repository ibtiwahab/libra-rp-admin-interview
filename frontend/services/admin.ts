import { api } from '@/lib/api';
import type {
  AdminUser,
  AttemptSummary,
  AuditRow,
  CandidateProfile,
  CandidateRow,
  Category,
  Credentials,
  Curator,
  EvaluationDetail,
  Interview,
  LiveInterview,
  Paged,
  Question,
  SecurityEventRow,
} from '@/lib/types';

type Q = Record<string, string | number | boolean | null | undefined>;

export const qk = {
  me: ['me'] as const,
  overview: ['analytics', 'overview'] as const,
  analytics: (k: string, q?: Q) => ['analytics', k, q] as const,
  candidates: (q: Q) => ['candidates', q] as const,
  candidate: (id: string) => ['candidate', id] as const,
  categories: ['categories'] as const,
  questions: (q: Q) => ['questions', q] as const,
  question: (id: string) => ['question', id] as const,
  interviews: (q: Q) => ['interviews', q] as const,
  interview: (id: string) => ['interview', id] as const,
  attempts: (q: Q) => ['attempts', q] as const,
  evaluation: (id: string) => ['evaluation', id] as const,
  curators: (q: Q) => ['curators', q] as const,
  curator: (id: string) => ['curator', id] as const,
  securityLog: (q: Q) => ['logs', 'security', q] as const,
  auditLog: (q: Q) => ['logs', 'audit', q] as const,
  monitor: ['monitor', 'active'] as const,
  monitorEvents: ['monitor', 'events'] as const,
};

export const adminApi = {
  me: () => api<{ user: AdminUser; session: { expiresAt: string; absoluteExpiresAt: string } }>('/auth/me', { query: { portal: 'admin' } }),
  logout: () => api('/auth/logout', { method: 'POST', body: { portal: 'admin' } }),

  // analytics
  overview: () => api<Overview>('/analytics/overview'),
  trends: (days: number) => api<Trends>('/analytics/interviews', { query: { days } }),
  candidatePerformance: () => api<CandidatePerformance>('/analytics/candidates'),
  questionInsights: () => api<QuestionInsights>('/analytics/questions'),
  securityInsights: (days: number) => api<SecurityInsights>('/analytics/security', { query: { days } }),
  activity: () => api<{ items: ActivityItem[] }>('/analytics/activity'),

  // candidates
  candidates: (q: Q) => api<Paged<CandidateRow>>('/candidates', { query: q }),
  candidate: (id: string) => api<CandidateProfile>(`/candidates/${id}`),
  createCandidate: (body: unknown) => api<{ candidate: CandidateRow; assignmentId: string | null; credentials: Credentials }>('/candidates', { method: 'POST', body }),
  updateCandidate: (id: string, body: unknown) => api<CandidateProfile>(`/candidates/${id}`, { method: 'PATCH', body }),
  archiveCandidate: (id: string) => api(`/candidates/${id}`, { method: 'DELETE' }),
  regenerateCredentials: (id: string) => api<{ credentials: Credentials }>(`/candidates/${id}/credentials`, { method: 'POST' }),
  assign: (id: string, body: unknown) => api(`/candidates/${id}/assignments`, { method: 'POST', body }),
  cancelAssignment: (id: string) => api(`/assignments/${id}`, { method: 'DELETE' }),
  addNote: (id: string, body: unknown) => api(`/candidates/${id}/notes`, { method: 'POST', body }),

  // categories
  categories: () => api<{ items: Category[] }>('/categories'),
  createCategory: (body: unknown) => api('/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: unknown) => api(`/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => api<{ deleted?: boolean; deactivated?: boolean }>(`/categories/${id}`, { method: 'DELETE' }),

  // questions
  questions: (q: Q) => api<Paged<Question>>('/questions', { query: q }),
  question: (id: string) => api<Question>(`/questions/${id}`),
  createQuestion: (body: unknown) => api<Question>('/questions', { method: 'POST', body }),
  updateQuestion: (id: string, body: unknown) => api<Question>(`/questions/${id}`, { method: 'PATCH', body }),
  deleteQuestion: (id: string) => api(`/questions/${id}`, { method: 'DELETE' }),
  duplicateQuestion: (id: string) => api<Question>(`/questions/${id}/duplicate`, { method: 'POST' }),
  reorderQuestions: (orderedIds: string[]) => api('/questions/reorder', { method: 'PATCH', body: { orderedIds } }),

  // interviews
  interviews: (q: Q) => api<Paged<Interview>>('/interviews', { query: q }),
  interview: (id: string) => api<Interview>(`/interviews/${id}`),
  createInterview: (body: unknown) => api<Interview>('/interviews', { method: 'POST', body }),
  updateInterview: (id: string, body: unknown) => api<Interview>(`/interviews/${id}`, { method: 'PATCH', body }),
  deleteInterview: (id: string) => api(`/interviews/${id}`, { method: 'DELETE' }),
  publishInterview: (id: string) => api<Interview & { published: { version: number } }>(`/interviews/${id}/publish`, { method: 'POST' }),

  // attempts / evaluations
  attempts: (q: Q) => api<Paged<AttemptSummary>>('/attempts', { query: q }),
  evaluation: (id: string) => api<EvaluationDetail>(`/evaluations/${id}`),
  saveEvaluation: (id: string, body: unknown) => api<EvaluationDetail>(`/evaluations/${id}`, { method: 'PATCH', body }),
  terminate: (attemptId: string, reason: string) => api(`/attempts/${attemptId}/terminate`, { method: 'POST', body: { reason } }),

  // curators
  curators: (q: Q) => api<Paged<Curator>>('/curators', { query: q }),
  curator: (id: string) => api<Curator>(`/curators/${id}`),
  createCurator: (body: unknown) => api<{ curator: Curator; credentials: Credentials | null }>('/curators', { method: 'POST', body }),
  updateCurator: (id: string, body: unknown) => api<Curator>(`/curators/${id}`, { method: 'PATCH', body }),
  removeCurator: (id: string) => api(`/curators/${id}`, { method: 'DELETE' }),
  resetCuratorPassword: (id: string) => api<{ credentials: Credentials }>(`/curators/${id}/reset-password`, { method: 'POST' }),

  // logs & monitor
  securityLog: (q: Q) => api<Paged<SecurityEventRow>>('/logs/security', { query: q }),
  auditLog: (q: Q) => api<Paged<AuditRow>>('/logs/audit', { query: q }),
  monitorActive: () => api<{ serverNow: string; heartbeatTimeoutSeconds: number; items: LiveInterview[] }>('/monitor/active'),
  monitorEvents: () => api<{ items: SecurityEventRow[] }>('/monitor/events'),

  // account
  updateProfile: (body: unknown) => api<{ user: AdminUser }>('/auth/profile', { method: 'PATCH', body }),
  changePassword: (body: unknown) => api('/auth/password', { method: 'POST', body }),
  mfaSetup: () => api<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/auth/mfa/setup', { method: 'POST' }),
  mfaEnable: (code: string) => api('/auth/mfa/enable', { method: 'POST', body: { code } }),
  mfaDisable: (body: unknown) => api('/auth/mfa/disable', { method: 'POST', body }),
};

export interface Overview {
  totalCandidates: number;
  activeInterviews: number;
  completedInterviews: number;
  expiredInterviews: number;
  passedCandidates: number;
  failedCandidates: number;
  underReview: number;
  disqualifiedCandidates: number;
  averageScore: number | null;
  scoredInterviews: number;
  interviewsThisMonth: number;
  interviewsLastMonth: number;
  pendingReviews: number;
}
export interface Trends {
  days: number;
  series: { date: string; started: number; completed: number; disqualified: number; expired: number }[];
  resultDistribution: { result: string; count: number }[];
  byInterview: { templateId: string; title: string; attempts: number; averageScore: number | null; passed: number; failed: number; disqualified: number }[];
}
export interface CandidatePerformance {
  distribution: { range: string; count: number }[];
  topPerformers: { attemptId: string; candidateId: string; fullName: string; candidateCode: string; interview: string; percentage: number; result: string }[];
}
export interface QuestionInsights {
  mostDifficult: { questionId: string; title: string; category: string; averagePercent: number; responses: number }[];
  categoryPerformance: { category: string; averagePercent: number | null; averageResponseSeconds: number | null; responses: number }[];
  averageResponseSeconds: number | null;
  averageAllowedSeconds: number | null;
  submittedEarly: number;
  timedOut: number;
}
export interface SecurityInsights {
  violationsByType: { type: string; count: number }[];
  disqualificationsSeries: { date: string; count: number }[];
  eventsBySeverity: { type: string; count: number }[];
}
export interface ActivityItem {
  id: string;
  kind: 'admin' | 'candidate';
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  text: string;
  tone: 'neutral' | 'success' | 'warning' | 'critical';
}
