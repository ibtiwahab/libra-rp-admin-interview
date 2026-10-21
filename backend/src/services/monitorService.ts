import { env } from '../config/env';
import { Answer, Attempt, Candidate, SecurityEvent } from '../models';

export type ConnectionStatus = 'ONLINE' | 'UNSTABLE' | 'OFFLINE';

export function connectionStatus(lastHeartbeatAt: Date, now = Date.now()): ConnectionStatus {
  const age = now - lastHeartbeatAt.getTime();
  if (age <= env.HEARTBEAT_INTERVAL_SECONDS * 2_000 + 1_000) return 'ONLINE';
  if (age <= env.HEARTBEAT_TIMEOUT_SECONDS * 1_000) return 'UNSTABLE';
  return 'OFFLINE';
}

export async function activeInterviews() {
  const attempts = await Attempt.find({ status: 'IN_PROGRESS' }).sort({ startedAt: 1 }).lean();
  const answers = await Answer.find({ attemptId: { $in: attempts.map((a) => a._id) }, status: 'ACTIVE' }, { attemptId: 1, questionIndex: 1, deadlineAt: 1, allowedSeconds: 1, activatedAt: 1, saveCount: 1, 'question.title': 1, 'question.categoryName': 1 }).lean();
  const amap = new Map(answers.map((a) => [String(a.attemptId), a]));
  const now = Date.now();
  return {
    serverNow: new Date(now).toISOString(),
    heartbeatTimeoutSeconds: env.HEARTBEAT_TIMEOUT_SECONDS,
    items: attempts.map((a) => {
      const ans = amap.get(String(a._id));
      return {
        attemptId: String(a._id),
        candidateId: String(a.candidateId),
        referenceCode: a.referenceCode,
        candidate: a.candidateSnapshot,
        interviewTitle: a.interviewSnapshot.title,
        currentQuestion: a.currentQuestionIndex + 1,
        completed: a.currentQuestionIndex,
        totalQuestions: a.totalQuestions,
        startedAt: a.startedAt,
        lastHeartbeatAt: a.lastHeartbeatAt,
        connection: connectionStatus(a.lastHeartbeatAt, now),
        securityStatus: a.warningCount > 0 ? 'WARNING' : 'SECURE',
        warningCount: a.warningCount,
        question: ans ? { title: ans.question.title, category: ans.question.categoryName, allowedSeconds: ans.allowedSeconds, deadlineAt: ans.deadlineAt, activatedAt: ans.activatedAt, remainingMs: Math.max(0, ans.deadlineAt.getTime() - now), saveCount: ans.saveCount } : null,
      };
    }),
  };
}

export async function recentLiveEvents(limit = 60) {
  const events = await SecurityEvent.find({ eventType: { $ne: 'ANSWER_SAVED' }, candidateId: { $ne: null } }).sort({ serverTimestamp: -1 }).limit(limit).lean();
  const cands = await Candidate.find({ _id: { $in: [...new Set(events.map((e) => String(e.candidateId)))] } }, { fullName: 1, candidateCode: 1 }).lean();
  const cmap = new Map(cands.map((c) => [String(c._id), c]));
  return events.map((e) => ({
    id: String(e._id),
    eventType: e.eventType,
    severity: e.severity,
    source: e.source,
    candidateId: e.candidateId ? String(e.candidateId) : null,
    attemptId: e.attemptId ? String(e.attemptId) : null,
    questionIndex: e.questionIndex ?? null,
    message: e.message,
    serverTimestamp: e.serverTimestamp.toISOString(),
    candidateName: cmap.get(String(e.candidateId))?.fullName ?? null,
    candidateCode: cmap.get(String(e.candidateId))?.candidateCode ?? null,
  }));
}
