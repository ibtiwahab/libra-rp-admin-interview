# Architecture

## Overview

```
 Browser ──HTTPS──▶ Next.js (frontend, :3000)
                     ├─ pages / React UI
                     └─ /api/* rewrite ──▶ Express API (backend, :5000) ──▶ MongoDB replica set
                                            ├─ REST + SSE
                                            └─ reconciler job (deadlines, heartbeats, expiry)
```

* **Single origin.** The browser never calls the API host directly; Next.js proxies `/api/*`. Session cookies are therefore first-party, `HttpOnly`, `SameSite=Strict`, and there is no CORS surface to defend.
* **The server is the source of truth** for every examination transition. The client only renders the state it receives and reports browser signals.
* **MongoDB must be a replica set.** State transitions that touch several documents (start, advance, terminate, publish, evaluate) run inside multi-document transactions *and* use compare-and-set filters, so they stay correct even when transactions retry.

## Backend layout

| Folder | Responsibility |
|---|---|
| `config/` | Zod-validated environment, logger (pino), DB connection + `withTransaction` helper, enums/constants |
| `models/` | Mongoose schemas and indexes. `immutable.ts` makes collections append-only |
| `security/` | Argon2id hashing, server-side sessions, signed double-submit CSRF, TOTP |
| `middleware/` | `requireStaff` / `requireHeadAdmin` / `requireCandidate`, rate limiters, injection rejection, no-store, error handler |
| `validators/` | Strict Zod schemas for every request body/query (`.strict()` rejects unknown keys) |
| `services/` | Business logic — `examService` (state machine), `evaluationService`, `interviewService`, `questionService`, `candidateService`, `curatorService`, `analyticsService`, `monitorService`, `exportService`, `logService` |
| `controllers/` + `routes/` | Thin HTTP layer; RBAC applied per router |
| `jobs/reconciler.ts` | Periodic, idempotent enforcement of deadlines/heartbeats/expiry |
| `scripts/` | Bootstrap Head Admin, seed, local replica set, index sync, legal erasure |

## Data model (collections)

| Collection | Purpose | Key constraints |
|---|---|---|
| `users` | Head Admins & Support Curators (Argon2id hash, encrypted TOTP secret, lockout counters, soft-removal) | unique `username` |
| `candidates` | Candidate accounts (`LIBRA-ADMIN-0001`), created/issued-by references | unique `candidateCode`, unique `sequence` |
| `counters` | Atomic sequences (candidate numbering) | — |
| `categories` | Configurable question categories | unique `slug` |
| `questions` | Current head of each question (soft-deleted, ordered by `position`) | — |
| `question_versions` | **Immutable** snapshot of every revision (created/updated/deleted) | unique `(questionId, version)` |
| `interview_templates` | Editable interview drafts (question list + optional timer overrides, passing %, window) | — |
| `interview_versions` | **Immutable** published versions with full question snapshots (text, options, answer key, rubric, timer) | unique `(templateId, version)` |
| `interview_assignments` | Candidate ↔ published version; `NOT_STARTED → IN_PROGRESS → terminal` / `CANCELLED` / `EXPIRED` | **partial unique** `candidateId` where `isOpen` (one open assignment per candidate) |
| `interview_attempts` | The single attempt; candidate & interview snapshots, bound session + page instance, heartbeat, violation, scoring, result | **unique `assignmentId`** (one attempt per assignment), unique `referenceCode` |
| `interview_answers` | One document per *activated* question: frozen question copy, deadline, saved answer, save sequence, scores | unique `(attemptId, questionIndex)` |
| `interview_evaluations` | **Immutable** evaluation revisions (marks, decision, previous decision, evaluator) | unique `(attemptId, revision)` |
| `candidate_notes` | Free-form evaluation notes on a candidate | — |
| `security_events` | **Immutable** auth, lifecycle and browser-signal events; `serverTimestamp` is authoritative | indexed by attempt/candidate/type/time |
| `audit_logs` | **Immutable** administrative audit trail | indexed by actor/action/target/time |
| `sessions` | Server-side sessions (HMAC of token), revocation, idle/absolute expiry | unique `tokenHash`; TTL 30 days after absolute expiry |

Historical integrity: an attempt never reads the live `questions` collection. It reads the immutable `interview_versions` snapshot it was assigned, and each `interview_answers` document carries its own copy of the question as delivered. Editing or deleting a question, or editing/archiving an interview, can therefore never alter a recorded interview.

## Examination state machine

```
                 assignment NOT_STARTED
                          │  POST /exam/start  (atomic CAS: NOT_STARTED → IN_PROGRESS,
                          │                     unique index on attempt.assignmentId)
                          ▼
                   attempt IN_PROGRESS ─────────────┐
       submit / timer     │                          │ browser signal (TAB_HIDDEN, WINDOW_BLURRED, PAGE_EXIT)
       (CAS on index)     │                          │ page-instance mismatch (reload / 2nd tab)
                          │                          │ admin termination
        last question ────┤                          ▼
                          ▼                     DISQUALIFIED  (session revoked)
                      COMPLETED
                          ▲               heartbeat silence ≥ timeout ─▶ EXPIRED (or DISQUALIFIED, configurable)
                          │               hard ceiling exceeded       ─▶ EXPIRED
```

* `COMPLETED`, `DISQUALIFIED` and `EXPIRED` are **terminal**. Every mutation filters on `status: 'IN_PROGRESS'`, so no request — duplicate, delayed or malicious — can move an attempt out of a terminal state.
* `advance()` closes question *i* and activates *i+1* inside one transaction, guarded by `currentQuestionIndex === i` and `answer.status === 'ACTIVE'`. Concurrent submit + timer + reconciler calls advance exactly once (tested).
* `terminateAttempt()` is idempotent: the first caller wins, later calls are no-ops. Saved answers are preserved; the active question is frozen (`TERMINATED`) with its last saved content.

## Timing model

* On activation the server stores `activatedAt`, `deadlineAt = activatedAt + timeLimit`, and `allowedSeconds`.
* Responses carry `remainingMs` computed on the server. The client anchors that value to `performance.now()` (monotonic), so changing the device clock or time zone has no effect. Heartbeats re-sync drift above 1.2 s.
* Autosave is accepted while `now ≤ deadlineAt + SUBMISSION_GRACE_MS` (default 1.5 s, to absorb network latency) **and** `seq > savedSeq`. A late or stale save never overwrites a newer one.
* A submission arriving after the grace window is recorded as `REJECTED_LATE`; the last acknowledged autosave stands.
* Reloads/reconnects re-read the same deadline — they can never reset a timer.
* The **reconciler** (every `RECONCILE_INTERVAL_MS`) closes overdue questions and advances attempts even when no browser is talking to the server, ends attempts whose heartbeat stopped (`HEARTBEAT_TIMEOUT_SECONDS`), expires attempts past their hard ceiling, and expires unstarted assignments past their window. All operations are CAS-guarded, so several API instances may run it concurrently.

## Sessions & identity binding

* Cookies hold a random 256-bit token; the database stores only `HMAC-SHA256(SESSION_SECRET, token)`.
* Admin sessions: idle timeout (sliding) + absolute lifetime; MFA creates a short `MFA_PENDING` session that is rotated on success.
* Candidate sessions: separate cookie (`libra_candidate`) and separate middleware — candidate tokens can never authenticate admin routes and vice versa.
* **Exam binding**: when an attempt starts it records the session id and the HMAC of a random *page-instance id* that exists only in the page's memory. Every exam request must present both. A reload or a second tab produces a new instance id → treated as leaving the exam. A second browser cannot even sign in while an attempt is `IN_PROGRESS`.

## Real-time monitoring

`logService` publishes every non-chatty security event to an in-process bus; `GET /api/monitor/stream` relays it as Server-Sent Events (re-validating the admin session every 60 s). The dashboard additionally polls `/api/monitor/active` every few seconds, so monitoring stays correct even behind proxies that buffer SSE.

**Multi-instance note:** replace the in-process bus with Redis pub/sub or a MongoDB change stream on `security_events` (already a replica set) so every API instance sees every event; switch the rate-limiter store to Redis.

## Frontend layout

| Folder | Contents |
|---|---|
| `app/` | Routes: `/login`, `/exam`, `/admin/login`, `/admin/(console)/*` |
| `components/ui` | Design-system primitives (button, inputs, select, dialog, tabs, table, badges, counters…) |
| `components/brand` | Original Libra mark/wordmark and the procedural city skyline |
| `components/admin` | Console screens |
| `components/exam` | Preparation, runner, countdown, watermark, outcome screens |
| `hooks/` | `use-exam-guard` (focus/visibility enforcement), live stream, admin queries |
| `lib/` | API client (CSRF, typed errors), types, formatting |
| `services/` | Typed API wrappers (`admin.ts`, `exam.ts`) |
| `proxy.ts` | Optimistic route guard (UX only — every API call is authorised server-side) |

## Performance

* Timers render locally; the client never polls every second. Each candidate sends one heartbeat every 5 s plus debounced autosaves — about 0.3–0.5 requests/s per candidate, i.e. ~40 req/s for 100 concurrent candidates.
* All hot queries are indexed (attempt status + heartbeat, answer status + deadline, candidate/attempt lookups, event timelines).
* Lists are paginated server-side; analytics use aggregation pipelines.
