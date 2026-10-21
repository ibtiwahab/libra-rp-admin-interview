# Security

This document describes the controls implemented, what browser-based monitoring **can and cannot** detect, and how contested decisions are supported with evidence.

## 1. Authentication & sessions

| Control | Implementation |
|---|---|
| Password storage | Argon2id (m = 19 MiB, t = 2, p = 1). Plaintext passwords are never stored or logged. Unknown usernames still run a dummy verification to equalise timing. |
| Candidate credentials | Server-generated (16 chars from a 56-symbol unambiguous alphabet ≈ 93 bits), displayed once, replaceable before the attempt starts (old password + sessions revoked). |
| Admin passwords | 12+ chars, three character classes. Generated passwords force a change at first sign-in. |
| MFA | TOTP (RFC 6238) for administrators; secrets encrypted at rest with AES-256-GCM (`MFA_ENCRYPTION_KEY`). Pending-MFA sessions grant no access and are rotated on success. |
| Sessions | Opaque random tokens; only an HMAC is stored. `HttpOnly`, `SameSite=Strict`, `Secure` in production. Idle + absolute expiry. Server-side revocation on logout, password change, disable, removal, disqualification, credential replacement. |
| Brute force | Per-IP login rate limit + per-account lockout (5 failures → 15 min, configurable), MFA attempt cap. All failures logged. |
| Isolation | Separate cookies and middleware for candidates and staff. Candidate tokens cannot reach any staff route (tested). |
| Bootstrap | First Head Admin created via CLI only; refuses to run if one exists (unless `--allow-additional`). No default passwords, no public registration. |

## 2. Authorisation

* `requireStaff` / `requireHeadAdmin` / `requireCandidate` run on the server for every route; the frontend guard is cosmetic.
* Curator management routes are mounted under `requireHeadAdmin` **and** every curator query is pinned to `role: 'SUPPORT_CURATOR'`, so a Head Admin account can never be targeted. No endpoint accepts a `role` field (strict schemas reject it), so privilege escalation through the API is impossible.
* Overturning a security disqualification requires a Head Admin and a written justification.

## 3. Request hardening

* CSRF: `SameSite=Strict` + Origin allow-list + **signed double-submit token** on every state-changing request. The page-exit beacon (which cannot set headers) carries the token in its body.
* Input: strict Zod schemas on every body/query; a middleware rejects any key starting with `$`, containing `.`, or named `__proto__`/`constructor`/`prototype` (NoSQL injection, prototype pollution).
* Output: React escaping; the API sends `Content-Security-Policy: default-src 'none'`; the web app sends CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, microphone, display-capture disabled). CSV exports neutralise spreadsheet formula injection.
* Caching: `Cache-Control: no-store` on every API response and on `/exam` and `/admin` pages.
* Errors: centralised handler, no stack traces or internal messages to clients.
* Rate limits: global, login, MFA, exam reads (anti-scraping), exam writes, exports.

## 4. Examination integrity

| Threat | Control |
|---|---|
| Extending a timer (edit JS, change device clock, tamper requests, refresh, reconnect, second session) | Deadlines are stored server-side at activation and enforced on every write; the reconciler closes them with no client involvement. Client display uses a monotonic clock. |
| Retrieving future questions | Only the active question is ever returned; future questions have no answer document until activated; question index parameters are ignored. |
| Seeing the answer key / rubric | Never serialised to candidates (tested). |
| Changing answers after submission | Writes require `status: ACTIVE` and the current index. |
| Second attempt / restart | Atomic CAS on the assignment + unique index on `attempt.assignmentId` (tested with 8 simultaneous starts). Logging out, clearing cookies or switching devices cannot reset state — it lives in MongoDB. |
| Concurrent / second browser | Sign-in is refused while an attempt is in progress (`CONCURRENT_LOGIN_ATTEMPT` logged); the attempt is bound to its session **and** page instance. |
| Reload / second tab | New page-instance id → server records `PAGE_RELOAD_DETECTED` and disqualifies. |
| Leaving the window | See §5. |
| Duplicate / delayed / forged signals | Idempotent terminal transitions; later signals are logged as "ignored" and never alter the recorded violation. |

## 5. Focus & visibility monitoring — what is, and is not, detectable

**Detected (browser APIs available to any web page):**

| Event | Signal | Typical cause |
|---|---|---|
| `TAB_HIDDEN` | `document.visibilitychange → hidden`, `freeze` | Switching tabs (Ctrl+Tab, click), minimising, OS lock screen, switching virtual desktops |
| `WINDOW_BLURRED` | `window blur` (window itself, not elements) | Alt+Tab / Cmd+Tab to another app or window, clicking another monitor's window, opening devtools in a separate window |
| `PAGE_EXIT` | `pagehide`, `beforeunload` (sent via `sendBeacon`) | Closing the tab/browser, reloading, navigating away |
| `PAGE_RELOAD_DETECTED` | Server-side: page-instance mismatch | Reloading, opening the exam in another tab/window |
| `SESSION_TIMEOUT` | Server-side: no heartbeat for `HEARTBEAT_TIMEOUT_SECONDS` | Browser killed, machine slept, network lost, client tampered to stop reporting |
| Warnings only | `fullscreenchange`, copy/cut/paste, context menu | Logged, never disqualifying |

**Not detectable by any website — and therefore not claimed:**

* Other applications, processes or browser tabs' *contents*; whether a second device or a phone camera is in use.
* Screen recorders and capture software (OBS, NVIDIA ShadowPlay, Windows Game Bar, macOS screen recording, capture cards).
* A second monitor showing notes while focus stays on the exam window; a person sitting next to the candidate.
* A technically skilled candidate who modifies the client to suppress signals. **Mitigation:** the heartbeat also reports visibility/focus, the server independently detects reloads/second tabs and silence, and the watermark makes leaks traceable — but a modified client that keeps heartbeating cannot be distinguished from a compliant one. This is an inherent limit of browser-based proctoring.

### False positives and onboarding

Focus can also be taken by OS notifications/toasts with focus stealing, permission or password-manager prompts, accessibility tools, antivirus pop-ups, IME candidate windows, or a browser update prompt. The platform therefore:

1. Explains these risks in the preparation briefing and asks candidates to close other apps and enable do-not-disturb.
2. Refuses to start unless the page is visible **and focused**, the connection is healthy and required APIs exist.
3. Arms monitoring only after the first question is delivered (≈0.5 s settle) and checks compliance at the moment of arming.
4. Records each violation with: type, source (*browser-reported* vs *server-confirmed* vs *heartbeat*), server timestamp, the client timestamp (evidence only), visibility state, focus state, elapsed time since arming, whether the page instance matched, and the full lifecycle timeline.
5. Lets a **Head Admin** set a contested disqualification to *Under review* / *Passed* / *Failed* with a mandatory written justification. The attempt itself remains terminal and the original violation record is untouched; every change is versioned.

The default policy remains strict, per Libra RP requirements. `HEARTBEAT_TIMEOUT_ACTION` controls whether silent browsers are recorded as `EXPIRED` (default) or `DISQUALIFIED`.

## 6. Screen recording & content protection

A normal website cannot detect or prevent screen recording. Instead the platform applies **deterrence and traceability**:

* A tiled diagonal watermark across the whole viewport with the candidate username, a candidate identifier, the attempt reference and a live UTC timestamp, plus corner stamps. Any screenshot, recording or phone photo of a question identifies the attempt.
* Questions are delivered one at a time, only to the bound session and page instance, rate-limited, `no-store`, never placed in `localStorage`/`sessionStorage`, never logged to the console.
* Copy, cut, paste, drag and context menu are blocked and logged; printing renders a blank "confidential" page. These are friction, not security boundaries.
* `Permissions-Policy: display-capture=()` prevents *this page* from using `getDisplayMedia`.

### Streaming (YouTube, Twitch, Discord screen-share, OBS)

If a candidate is live-streaming or screen-sharing, **the interview is shown on the stream as normal** — a website cannot pause, black out or detect another program capturing the screen. (Some browsers occasionally appear black in OBS *window* capture because of hardware acceleration, but that is a browser quirk the candidate controls, not a protection.) The platform therefore:

* makes "no streaming, screen-sharing or recording" an explicit rule that candidates must tick before starting;
* stamps every screen with the candidate's username, attempt reference and time, so any clip or VOD that leaks questions identifies who leaked it;
* lets staff review clips against the attempt reference and act (disqualify via evaluation, ban in-game).

A dedicated exam app (below) is the only way to make capture software record a black window.

### Optional future enhancement — dedicated examination client

Stronger guarantees require controlling the device rather than the page:

* **Electron kiosk app** — full-screen, always-on-top, no navigation chrome; uses OS APIs to block Alt+Tab/Win key, enumerate running processes and refuse to start when known capture tools are running; Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` / macOS `NSWindow.sharingType = .none` hide the window from most software capture; signed builds with attestation of the client to the API.
* **Managed kiosk environments** — Windows Assigned Access / Shell Launcher, macOS Automatic Assessment Configuration (AAC), ChromeOS kiosk or Safe Exam Browser with a config key verified by the server.

Even a dedicated client cannot stop a camera pointed at the screen or a capture card on the video output; watermarking remains the backstop.

## 7. Audit & logging

* `security_events` and `audit_logs` are append-only: Mongoose hooks reject update/delete, and no API mutates them.
* Admin actions recorded: question create/update/delete/duplicate/reorder, category changes, interview create/update/delete/publish, candidate create/update/archive/credential replacement/notes, assignment create/cancel, attempt termination, curator create/update/disable/reactivate/reset/remove, password/MFA changes, evaluations (with previous values), exports, data erasure.
* Logs include the actor, role, target, details and IP. Structured application logs (pino) redact cookies, CSRF tokens, passwords and codes.

## 8. Data retention and legal erasure

* **Default: indefinite retention.** Nothing in the application deletes interview attempts, answers, evaluations, events or audit entries. Archiving a candidate or removing a curator only revokes access.
* Expired session documents are purged by a TTL index 30 days after their absolute expiry (no examination data).
* When a lawful erasure request must be honoured, an operator runs:

  ```bash
  npm run retention:erase -- --candidate=LIBRA-ADMIN-0042 --confirm=LIBRA-ADMIN-0042 \
       --operator="Name (role)" --reason="Ticket / lawful basis" [--purge-responses] [--dry-run]
  ```

  It pseudonymises the candidate across `candidates`, attempt snapshots and event metadata (optionally blanking free-text responses and notes), deletes their sessions and writes an immutable `DATA_ERASURE` audit entry. Scores, timings and outcomes remain for statistics. Back-ups taken before the erasure must be handled by your back-up retention policy.

## 9. Secrets & configuration

* All secrets come from environment variables validated at start-up; the API refuses to start in production with placeholder values.
* No secrets are exposed to the frontend (the Next.js app only needs `BACKEND_URL`, server-side).
* Rotate `SESSION_SECRET` to invalidate every session; rotating `MFA_ENCRYPTION_KEY` requires admins to re-enrol MFA.
