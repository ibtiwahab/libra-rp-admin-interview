import { Answer, Attempt, AuditLog, Candidate, SecurityEvent } from '../models';

function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d;
}

function dayKeys(n: number) {
  const out: string[] = [];
  const start = daysAgo(n);
  for (let i = 0; i < n; i++) out.push(new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

export async function overview() {
  const monthStart = startOfMonth();
  const [totalCandidates, statusCounts, resultCounts, avg, thisMonth, pendingReviews, lastMonth] = await Promise.all([
    Candidate.countDocuments({ status: { $ne: 'ARCHIVED' } }),
    Attempt.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Attempt.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$result', n: { $sum: 1 } } }]),
    Attempt.aggregate<{ avg: number | null; n: number }>([{ $match: { 'scoring.percentage': { $ne: null }, result: { $in: ['PASSED', 'FAILED', 'UNDER_REVIEW'] } } }, { $group: { _id: null, avg: { $avg: '$scoring.percentage' }, n: { $sum: 1 } } }]),
    Attempt.countDocuments({ startedAt: { $gte: monthStart } }),
    Attempt.countDocuments({ status: { $ne: 'IN_PROGRESS' }, result: { $in: ['PENDING', 'UNDER_REVIEW'] } }),
    Attempt.countDocuments({ startedAt: { $gte: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1)), $lt: monthStart } }),
  ]);
  const s = Object.fromEntries(statusCounts.map((r) => [r._id, r.n]));
  const r = Object.fromEntries(resultCounts.map((x) => [x._id, x.n]));
  return {
    totalCandidates,
    activeInterviews: s.IN_PROGRESS ?? 0,
    completedInterviews: s.COMPLETED ?? 0,
    expiredInterviews: s.EXPIRED ?? 0,
    passedCandidates: r.PASSED ?? 0,
    failedCandidates: r.FAILED ?? 0,
    underReview: r.UNDER_REVIEW ?? 0,
    disqualifiedCandidates: s.DISQUALIFIED ?? 0,
    averageScore: avg[0]?.avg != null ? Math.round(avg[0].avg * 10) / 10 : null,
    scoredInterviews: avg[0]?.n ?? 0,
    interviewsThisMonth: thisMonth,
    interviewsLastMonth: lastMonth,
    pendingReviews,
  };
}

export async function interviewTrends(days: number) {
  const since = daysAgo(days);
  const [started, ended, byTemplate, results] = await Promise.all([
    Attempt.aggregate<{ _id: string; n: number }>([
      { $match: { startedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: 'UTC' } }, n: { $sum: 1 } } },
    ]),
    Attempt.aggregate<{ _id: { d: string; s: string }; n: number }>([
      { $match: { endedAt: { $gte: since } } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$endedAt', timezone: 'UTC' } }, s: '$status' }, n: { $sum: 1 } } },
    ]),
    Attempt.aggregate<{ _id: string; title: string; attempts: number; avg: number | null; passed: number; failed: number; disqualified: number }>([
      { $group: {
        _id: '$templateId',
        title: { $last: '$interviewSnapshot.title' },
        attempts: { $sum: 1 },
        avg: { $avg: '$scoring.percentage' },
        passed: { $sum: { $cond: [{ $eq: ['$result', 'PASSED'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$result', 'FAILED'] }, 1, 0] } },
        disqualified: { $sum: { $cond: [{ $eq: ['$status', 'DISQUALIFIED'] }, 1, 0] } },
      } },
      { $sort: { attempts: -1 } },
      { $limit: 10 },
    ]),
    Attempt.aggregate<{ _id: string; n: number }>([{ $match: { status: { $ne: 'IN_PROGRESS' } } }, { $group: { _id: '$result', n: { $sum: 1 } } }]),
  ]);
  const startedMap = new Map(started.map((x) => [x._id, x.n]));
  const endedMap = new Map(ended.map((x) => [`${x._id.d}:${x._id.s}`, x.n]));
  return {
    days,
    series: dayKeys(days).map((d) => ({
      date: d,
      started: startedMap.get(d) ?? 0,
      completed: endedMap.get(`${d}:COMPLETED`) ?? 0,
      disqualified: endedMap.get(`${d}:DISQUALIFIED`) ?? 0,
      expired: endedMap.get(`${d}:EXPIRED`) ?? 0,
    })),
    resultDistribution: ['PASSED', 'FAILED', 'UNDER_REVIEW', 'PENDING', 'DISQUALIFIED'].map((k) => ({ result: k, count: results.find((x) => x._id === k)?.n ?? 0 })),
    byInterview: byTemplate.map((t) => ({ templateId: String(t._id), title: t.title, attempts: t.attempts, averageScore: t.avg != null ? Math.round(t.avg * 10) / 10 : null, passed: t.passed, failed: t.failed, disqualified: t.disqualified })),
  };
}

export async function candidatePerformance() {
  const [buckets, top] = await Promise.all([
    Attempt.aggregate<{ _id: number | string; n: number }>([
      { $match: { 'scoring.percentage': { $ne: null } } },
      { $bucket: { groupBy: '$scoring.percentage', boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.0001], default: 'other', output: { n: { $sum: 1 } } } },
    ]),
    Attempt.find({ 'scoring.percentage': { $ne: null }, result: { $in: ['PASSED', 'FAILED', 'UNDER_REVIEW'] } }, { candidateSnapshot: 1, interviewSnapshot: 1, scoring: 1, result: 1, endedAt: 1, candidateId: 1 })
      .sort({ 'scoring.percentage': -1 })
      .limit(8)
      .lean(),
  ]);
  const labels = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100'];
  const bmap = new Map(buckets.map((b) => [b._id, b.n]));
  const bounds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  return {
    distribution: labels.map((label, i) => ({ range: label, count: bmap.get(bounds[i]!) ?? 0 })),
    topPerformers: top.map((a) => ({
      attemptId: String(a._id),
      candidateId: String(a.candidateId),
      fullName: a.candidateSnapshot.fullName,
      candidateCode: a.candidateSnapshot.candidateCode,
      interview: a.interviewSnapshot.title,
      percentage: a.scoring.percentage,
      result: a.result,
    })),
  };
}

export async function questionInsights() {
  const [difficult, byCategory, responseTime, timeouts] = await Promise.all([
    Answer.aggregate<{ _id: unknown; title: string; category: string; avgPct: number; n: number; maxScore: number }>([
      { $match: { awardedScore: { $ne: null } } },
      { $group: { _id: '$question.questionId', title: { $last: '$question.title' }, category: { $last: '$question.categoryName' }, maxScore: { $last: '$question.maxScore' }, avgPct: { $avg: { $divide: ['$awardedScore', '$question.maxScore'] } }, n: { $sum: 1 } } },
      { $sort: { avgPct: 1, n: -1 } },
      { $limit: 8 },
    ]),
    Answer.aggregate<{ _id: string; avgPct: number | null; n: number; avgMs: number | null }>([
      { $match: { status: { $in: ['SUBMITTED', 'TIMED_OUT', 'TERMINATED'] } } },
      { $group: {
        _id: '$question.categoryName',
        avgPct: { $avg: { $cond: [{ $ne: ['$awardedScore', null] }, { $divide: ['$awardedScore', '$question.maxScore'] }, null] } },
        avgMs: { $avg: { $subtract: ['$closedAt', '$activatedAt'] } },
        n: { $sum: 1 },
      } },
      { $sort: { n: -1 } },
    ]),
    Answer.aggregate<{ avgMs: number | null; avgAllowed: number | null; n: number }>([
      { $match: { status: { $in: ['SUBMITTED', 'TIMED_OUT'] }, closedAt: { $ne: null } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$closedAt', '$activatedAt'] } }, avgAllowed: { $avg: '$allowedSeconds' }, n: { $sum: 1 } } },
    ]),
    Answer.aggregate<{ _id: string; n: number }>([{ $match: { status: { $in: ['SUBMITTED', 'TIMED_OUT'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const tmap = Object.fromEntries(timeouts.map((t) => [t._id, t.n]));
  return {
    mostDifficult: difficult.map((d) => ({ questionId: String(d._id), title: d.title, category: d.category, averagePercent: Math.round(d.avgPct * 1000) / 10, responses: d.n })),
    categoryPerformance: byCategory.map((c) => ({ category: c._id, averagePercent: c.avgPct != null ? Math.round(c.avgPct * 1000) / 10 : null, averageResponseSeconds: c.avgMs != null ? Math.round(c.avgMs / 100) / 10 : null, responses: c.n })),
    averageResponseSeconds: responseTime[0]?.avgMs != null ? Math.round(responseTime[0].avgMs / 100) / 10 : null,
    averageAllowedSeconds: responseTime[0]?.avgAllowed != null ? Math.round(responseTime[0].avgAllowed * 10) / 10 : null,
    submittedEarly: tmap.SUBMITTED ?? 0,
    timedOut: tmap.TIMED_OUT ?? 0,
  };
}

export async function securityInsights(days: number) {
  const since = daysAgo(days);
  const [byType, daily, warnings] = await Promise.all([
    Attempt.aggregate<{ _id: string; n: number }>([{ $match: { securityViolation: { $ne: null } } }, { $group: { _id: '$securityViolation.type', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Attempt.aggregate<{ _id: string; n: number }>([
      { $match: { status: 'DISQUALIFIED', endedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$endedAt', timezone: 'UTC' } }, n: { $sum: 1 } } },
    ]),
    SecurityEvent.aggregate<{ _id: string; n: number }>([
      { $match: { serverTimestamp: { $gte: since }, severity: { $in: ['WARNING', 'CRITICAL'] } } },
      { $group: { _id: '$eventType', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
  ]);
  const dmap = new Map(daily.map((d) => [d._id, d.n]));
  return {
    violationsByType: byType.map((b) => ({ type: b._id, count: b.n })),
    disqualificationsSeries: dayKeys(days).map((d) => ({ date: d, count: dmap.get(d) ?? 0 })),
    eventsBySeverity: warnings.map((w) => ({ type: w._id, count: w.n })),
  };
}

/** Human-readable recent activity for the dashboard feed. */
export async function recentActivity(limit = 15) {
  const [audits, events] = await Promise.all([
    AuditLog.find({ action: { $in: ['CANDIDATE_CREATED', 'INTERVIEW_PUBLISHED', 'INTERVIEW_CREATED', 'CURATOR_CREATED', 'CURATOR_REMOVED', 'EVALUATION_SAVED', 'EVALUATION_MODIFIED', 'INTERVIEW_ASSIGNED'] } }).sort({ createdAt: -1 }).limit(limit).lean(),
    SecurityEvent.find({ eventType: { $in: ['INTERVIEW_STARTED', 'INTERVIEW_COMPLETED', 'INTERVIEW_DISQUALIFIED', 'INTERVIEW_EXPIRED', 'INTERVIEW_TERMINATED_BY_ADMIN'] } }).sort({ serverTimestamp: -1 }).limit(limit).lean(),
  ]);
  const candIds = [...new Set(events.map((e) => String(e.candidateId)))];
  const cands = await Candidate.find({ _id: { $in: candIds } }, { fullName: 1, candidateCode: 1 }).lean();
  const cmap = new Map(cands.map((c) => [String(c._id), c]));
  const attemptIds = events.map((e) => e.attemptId).filter(Boolean);
  const attempts = await Attempt.find({ _id: { $in: attemptIds } }, { interviewSnapshot: 1, securityViolation: 1 }).lean();
  const amap = new Map(attempts.map((a) => [String(a._id), a]));

  const auditLabel: Record<string, string> = {
    CANDIDATE_CREATED: 'added candidate',
    INTERVIEW_PUBLISHED: 'published interview',
    INTERVIEW_CREATED: 'created interview',
    CURATOR_CREATED: 'added Support Curator',
    CURATOR_REMOVED: 'removed Support Curator',
    EVALUATION_SAVED: 'evaluated',
    EVALUATION_MODIFIED: 'revised evaluation for',
    INTERVIEW_ASSIGNED: 'assigned',
  };
  const items = [
    ...audits.map((a) => ({
      id: String(a._id),
      kind: 'admin' as const,
      at: a.createdAt,
      actor: a.actorUsername,
      actorRole: a.actorRole,
      action: a.action,
      text: `${auditLabel[a.action] ?? a.action.toLowerCase()} ${a.targetLabel}`.trim(),
      tone: a.action === 'CURATOR_REMOVED' ? 'warning' : 'neutral',
    })),
    ...events.map((e) => {
      const c = cmap.get(String(e.candidateId));
      const at = amap.get(String(e.attemptId));
      const title = at?.interviewSnapshot.title ?? 'interview';
      const verb = {
        INTERVIEW_STARTED: `started ${title}`,
        INTERVIEW_COMPLETED: `completed ${title}`,
        INTERVIEW_DISQUALIFIED: `disqualified — ${(at?.securityViolation?.type ?? 'policy violation').replace(/_/g, ' ').toLowerCase()}`,
        INTERVIEW_EXPIRED: `attempt expired — ${(at?.securityViolation?.type ?? 'timeout').replace(/_/g, ' ').toLowerCase()}`,
        INTERVIEW_TERMINATED_BY_ADMIN: 'attempt terminated by management',
      }[e.eventType as string];
      return {
        id: String(e._id),
        kind: 'candidate' as const,
        at: e.serverTimestamp,
        actor: c?.fullName ?? 'Candidate',
        actorRole: c?.candidateCode ?? '',
        action: e.eventType,
        text: verb ?? e.message,
        tone: e.eventType === 'INTERVIEW_DISQUALIFIED' || e.eventType === 'INTERVIEW_TERMINATED_BY_ADMIN' ? 'critical' : e.eventType === 'INTERVIEW_COMPLETED' ? 'success' : e.eventType === 'INTERVIEW_EXPIRED' ? 'warning' : 'neutral',
      };
    }),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}
