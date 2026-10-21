# Testing

## Backend integration tests (Vitest + Supertest)

```bash
cd backend && npm test
```

The suite starts a **real `mongod` replica set** (mongodb-memory-server; the binary is downloaded once) so transactions, unique indexes and concurrency behave exactly as in production. Each test file uses an isolated database, wiped before every test. 70 tests:

**Authentication** — admin & candidate sign-in, hardened cookie flags, uniform invalid-credential errors, account lockout, CSRF (missing, forged, bad Origin), logout revocation, expired & server-revoked sessions, TOTP enrolment + MFA sign-in, Argon2id storage, candidate/admin isolation in both directions, credentials shown once, credential replacement, disabled accounts.

**Roles** — Head Admin creates/disables/reactivates/removes curators (sessions revoked, soft delete); curators cannot list/create/update/remove curators; no API can set `role`; Head Admins cannot be targeted; both roles manage questions, interviews and candidates; removed curators' evaluations are preserved.

**Question bank & versioning** — create/edit (version history)/duplicate/soft-delete, 30–60 s timer bounds and 45 s default, answer-key validation, persisted reordering + stale-order rejection, operator-injection rejection, immutable published versions, edits/deletions never altering what candidates received, publish/assignment rules, archiving keeps history.

**Examination engine** — instructions reveal no content; acknowledgement & preflight required; start delivers a server deadline; no rubric/answer key/future question leaks; **8 simultaneous starts → exactly one attempt**; second-device sign-in rejected and logged; sequential delivery, early submission, completion; no going back or skipping ahead; stale autosaves ignored; reconnect never resets the deadline; server-side timeout keeps the last saved answer; late saves/submissions rejected; grace-window submissions accepted; forged deadline fields rejected; reconciler advances/finishes silent attempts; **6 concurrent submissions advance exactly once**; auto-grading; answer validation; no restart after completion; unique index blocks a second attempt even if application checks are bypassed.

**Anti-cheating** — `TAB_HIDDEN`, `WINDOW_BLURRED`, `PAGE_EXIT` each disqualify, preserve saved answers, revoke the session, show the revoked state on re-login and refuse restart/answers; duplicate & delayed violation events don't corrupt state; terminal state can't be reopened by concurrent requests; warnings don't disqualify; reload/second-tab detection; heartbeat-reported focus loss; page-exit beacons (and forged beacons refused); heartbeat timeout → `EXPIRED` with distinct `HEARTBEAT` source; hard-ceiling expiry; admin termination via live monitoring.

**Evaluation & reporting** — review data (rubric, timing, timeline), scoring with revision history & optimistic concurrency, max-score and completeness rules, Head-Admin-only overturn with justification, CSV & PDF exports, analytics reflecting real data, immutable audit log.

## End-to-end (Playwright)

```bash
cd frontend
npx playwright install chromium          # once
E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_USERNAME=director E2E_ADMIN_PASSWORD=… npm run test:e2e
```

Runs against a live stack (MongoDB + API + web). Each test creates its own interview and candidate through the API.

1. Sign-in shows the security briefing and does **not** consume the attempt; start stays locked until rules are acknowledged.
2. Full interview: watermark present, autosave confirmation, sequential delivery, auto-graded choice, completion screen; verified through the admin API.
3. Window focus loss → *Interview terminated*; re-login → *Interview access revoked*, no restart; saved answer preserved.
4. Opening the exam in a second tab → server-side disqualification.
5. Admin console sign-in, live dashboard, live monitoring stream.

## Manual verification checklist

* Real tab switch / Alt+Tab during an interview → immediate termination screen (headless browsers do not emit real visibility changes, which is why test 3 dispatches the window `blur` event).
* Close the browser mid-question → within `HEARTBEAT_TIMEOUT_SECONDS` the live monitor shows the attempt ended with `SESSION_TIMEOUT`.
