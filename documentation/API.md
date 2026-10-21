# API reference

Base path: `/api` (served by Express on `:5000`, proxied by Next.js on the public origin).

* All responses are JSON and `Cache-Control: no-store`. Errors: `{ "error": { "code", "message", "details?" } }`.
* State-changing requests need the `X-CSRF-Token` header equal to the `libra_csrf` cookie (obtain via `GET /auth/csrf`).
* Exam requests after start must include `X-Exam-Instance: <page-instance id>`.
* Auth: **S** = staff (Head Admin or Support Curator), **H** = Head Admin only, **C** = candidate, **–** = public.

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/csrf` | – | Issue CSRF token (cookie + body) |
| POST | `/auth/login` | – | `{ portal: 'admin'\|'candidate', username, password }` → `{ status: 'OK'\|'MFA_REQUIRED' }` |
| POST | `/auth/mfa/verify` | – (pending) | `{ code }` completes MFA sign-in |
| POST | `/auth/logout` | – | `{ portal }` revokes the session |
| GET | `/auth/me?portal=` | S / C | Current identity (+ exam status for candidates) |
| POST | `/auth/refresh` | S / C | `{ portal }` extends the idle window |
| POST | `/auth/password` | S | `{ currentPassword, newPassword }` |
| PATCH | `/auth/profile` | S | `{ fullName?, discordUsername?, email? }` |
| POST | `/auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` | S | TOTP enrolment (QR data URL), confirmation, removal |

## Candidate examination

| Method | Path | Description |
|---|---|---|
| GET | `/exam/status` | `NO_ASSIGNMENT` · `NOT_STARTED` (+window) · `IN_PROGRESS` · `COMPLETED` · `DISQUALIFIED` · `EXPIRED` · `CANCELLED` |
| GET | `/exam/assignment` | Assigned interview summary |
| GET | `/exam/instructions` | Title, instructions, question count, durations, categories, policy — **no question content** |
| POST | `/exam/start` | `{ acknowledged: true, instanceId, preflight }` → first question. Atomic; second call → `409 ATTEMPT_ALREADY_CONSUMED` |
| GET | `/exam/current-question` | Active question + `timing { activatedAt, deadlineAt, serverNow, remainingMs }` + saved answer + watermark data, or a terminal state |
| PATCH | `/exam/answer` | Autosave `{ questionIndex, seq, answerText \| selectedOptionKeys \| booleanAnswer }` → `{ saved, seq, stale }`; `409 QUESTION_CLOSED` after deadline |
| POST | `/exam/submit-answer` | `{ …answer, reason: 'MANUAL'\|'TIMEOUT' }` → `{ submission: ACCEPTED\|ACCEPTED_AT_DEADLINE\|REJECTED_LATE\|CLOSED, next }` |
| POST | `/exam/heartbeat` | `{ questionIndex, visible, focused }` → server time, current index, remaining ms (or terminal state) |
| POST | `/exam/security-event` | `{ type, questionIndex, clientTimestamp, details }` — `TAB_HIDDEN`/`WINDOW_BLURRED`/`PAGE_EXIT` disqualify; `FULLSCREEN_EXITED`/`CLIPBOARD_BLOCKED`/`CONTEXT_MENU_BLOCKED` warn |
| POST | `/exam/security-beacon` | Same as above, `text/plain` body with `csrfToken` (for `navigator.sendBeacon`) |

## Candidates & assignments (S)

| Method | Path | Description |
|---|---|---|
| GET | `/candidates` | `?search&status&interviewStatus&result&templateId&sort&page&limit` |
| POST | `/candidates` | Create; optional `templateId`, `startDeadline` → `{ candidate, credentials }` (password shown once) |
| GET | `/candidates/:id` | Full profile: assignments, attempts, notes, lifecycle & sign-in events |
| PATCH | `/candidates/:id` | Edit details / `status: ACTIVE\|DISABLED` |
| DELETE | `/candidates/:id` | Archive (access removed, history kept) |
| POST | `/candidates/:id/credentials` | Replace credentials → `{ credentials }` |
| POST | `/candidates/:id/assignments` | `{ templateId, startDeadline? }` |
| POST | `/candidates/:id/notes` | `{ body, attemptId? }` |
| DELETE | `/assignments/:id` | Cancel an unstarted assignment |
| GET | `/attempts` | History search: `?queue=all\|pending\|evaluated\|disqualified&search&templateId&status&result&evaluatorId&security&from&to&sort` |
| POST | `/attempts/:id/terminate` | `{ reason }` — admin termination of an attempt in progress |
| GET | `/staff` | Staff directory (evaluator filters) |

## Questions & categories (S)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/categories` | List (with counts) / create |
| PATCH/DELETE | `/categories/:id` | Rename / activate / delete (deactivates when in use) |
| GET | `/questions` | `?search&categoryId&type&difficulty&page&limit&all=true` |
| POST | `/questions` | Create (version 1) |
| GET | `/questions/:id` | With version history |
| PATCH | `/questions/:id` | New version (no-op if unchanged) |
| DELETE | `/questions/:id` | Soft delete; removed from drafts; history untouched |
| POST | `/questions/:id/duplicate` | Copy |
| PATCH | `/questions/reorder` | `{ orderedIds }` — complete set required (409 if stale) |

## Interviews (S)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/interviews` | List (`?status&publishedOnly&search`) / create draft |
| GET/PATCH/DELETE | `/interviews/:id` | Builder data / update draft / archive |
| POST | `/interviews/:id/publish` | Freeze an immutable version |
| GET | `/interviews/:id/versions/:versionId` | A published snapshot |

## Evaluation (S)

| Method | Path | Description |
|---|---|---|
| GET | `/evaluations` | Pending review queue (same filters as `/attempts`) |
| GET | `/evaluations/:attemptId` | Questions as delivered, answers, rubric, timings, revisions, timeline |
| PATCH | `/evaluations/:attemptId` | `{ expectedRevision, decision, overallNotes, marks[] }` → new revision (409 if stale) |

## Monitoring, analytics, logs, exports (S)

| Method | Path | Description |
|---|---|---|
| GET | `/monitor/active` | Attempts in progress with live timing and connection state |
| GET | `/monitor/events` | Recent lifecycle/security events |
| GET | `/monitor/stream` | Server-Sent Events (`hello`, `security`, `unauthorized`) |
| GET | `/analytics/overview` · `/interviews?days` · `/candidates` · `/questions` · `/security?days` · `/activity` | Dashboard data |
| GET | `/logs/security` | `?eventType&severity&source&candidateId&attemptId&from&to&page&limit` |
| GET | `/logs/audit` | `?action&actorId&targetType&from&to&page&limit` |
| GET | `/exports/attempts` | CSV (same filters as `/attempts`) |
| GET | `/exports/attempts/:id/pdf` | Branded PDF report |

## Support Curators (H)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/curators` | List (`?search&includeRemoved`) / create (generated or chosen password) |
| GET/PATCH/DELETE | `/curators/:id` | Profile with recent actions & evaluations / update (`status`, details — never `role`) / remove (soft) |
| POST | `/curators/:id/reset-password` | Generate a new temporary password |

## Health

`GET /health` → `{ status, db, time }` (503 when MongoDB is unavailable).
