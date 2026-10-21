# LIBRA RP — Admin Recruitment System

> *Integrity. Authority. Excellence.*

A secure, production-grade interview and examination platform for recruiting Libra RP administrators. Candidates sit a strictly timed, server-authoritative interview under focus and visibility monitoring. Head Admins and Support Curators author questions, build and publish interviews, issue credentials, watch interviews live, evaluate answers and keep a permanent, auditable record.

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Radix/shadcn-style components · Motion · TanStack Query · React Hook Form + Zod · Recharts · dnd-kit (server state lives in TanStack Query, so no extra client store was needed) |
| **Backend** | Node.js · Express 5 · TypeScript · Mongoose 8 · Zod · Argon2id · otplib (TOTP MFA) · pino · PDFKit · Server-Sent Events |
| **Database** | MongoDB 7 **replica set** (multi-document transactions) |
| **Tests** | Vitest + Supertest against a real `mongod` replica set (70 integration tests) · Playwright end-to-end (5 browser tests) |

---

## Quick start (local development)

Requirements: **Node.js 20+** (22/24 recommended). MongoDB is optional — the project ships a one-command local replica set.

```bash
# 1. Install
cd backend  && npm install
cd ../frontend && npm install

# 2. Configure the API
cd ../backend
cp .env.example .env
#    then set SESSION_SECRET and MFA_ENCRYPTION_KEY, e.g.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Start MongoDB as a replica set (leave running in its own terminal)
npm run dev:db             # real mongod via mongodb-memory-server, data persisted in backend/.data
#    …or use your own:  mongod --replSet rs0  (then rs.initiate())  /  docker compose up mongo

# 4. Create the first Head Admin (prints a one-time password)
npm run bootstrap:admin -- --username=director --name="Server Director"

# 5. Optional: categories, 16 realistic questions and a published interview
npm run seed

# 6. Run the API and the web app (two terminals)
npm run dev                          # backend  → http://localhost:5000
cd ../frontend && npm run dev        # frontend → http://localhost:3000
```

* Staff console: **http://localhost:3000/admin/login**
* Candidate portal: **http://localhost:3000/login**

The browser only ever talks to the Next.js origin; `/api/*` is proxied to Express so session cookies are first-party, `HttpOnly`, `SameSite=Strict`.

> **Atlas on Windows:** if the API fails with `querySrv ECONNREFUSED`, set `DNS_SERVERS=1.1.1.1,8.8.8.8` in `backend/.env`. If it fails with *IP isn't whitelisted*, add your current public IP under Atlas → Network Access.

### Running with Docker

```bash
cp .env.example .env        # fill in SESSION_SECRET and MFA_ENCRYPTION_KEY
docker compose up -d --build
docker compose run --rm api node dist/scripts/bootstrap-head-admin.js --username=director --name="Server Director"
docker compose run --rm api node dist/scripts/seed.js    # optional
```

The compose stack runs MongoDB 7 as a single-node replica set (auto-initiated), the API and the standalone Next.js server. See [documentation/DEPLOYMENT.md](documentation/DEPLOYMENT.md) for TLS, reverse proxies, backups and scaling.

---

## Commands

| Where | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | API with hot reload |
| backend | `npm run dev:db` | Local MongoDB replica set |
| backend | `npm run bootstrap:admin -- --username=… --name="…"` | Create the first Head Admin (no default passwords) |
| backend | `npm run seed` | Starter categories, questions and a published interview |
| backend | `npm run seed:admin-assistant` | Load the 34-question **Admin Assistant** interview (sections A1–A5, written answers, 1 mark each) and publish it |
| backend | `npm test` | 70 integration tests on a real `mongod` replica set |
| backend | `npm run build && npm start` | Production build / start |
| backend | `npm run indexes:sync` | Build MongoDB indexes explicitly |
| backend | `npm run retention:erase -- …` | Audited legal-erasure procedure ([SECURITY.md](documentation/SECURITY.md#data-retention-and-legal-erasure)) |
| frontend | `npm run dev` / `npm run build` / `npm start` | Next.js |
| frontend | `npm run typecheck` | TypeScript |
| frontend | `E2E_ADMIN_USERNAME=… E2E_ADMIN_PASSWORD=… npm run test:e2e` | Playwright against a running stack (`npx playwright install chromium` once) |

---

## What's inside

### Candidates
* No public registration. Management creates the account and the system generates `LIBRA-ADMIN-0001`-style usernames plus a high-entropy password, **shown once**, stored only as an Argon2id hash. Credentials can be replaced before an interview starts.
* Cinematic sign-in, then a **security briefing** with interview details, the ten examination rules, consequences, live **system checks** (APIs, focus/visibility, latency, attempt availability, fullscreen) and two explicit acknowledgements. A confirmation dialog consumes the single attempt only when the candidate presses **Start interview**.
* One question at a time with a **server-authoritative** per-question timer (30 s – 5 min, default 3 min), circular + digital countdown (gold → amber < 15s → red < 10s → pulse ≤ 5s), debounced autosave with stale-write protection, automatic submission at zero, no going back.
* Tab hidden / window blur / page exit → interface freezes, the server **disqualifies, locks the attempt and revokes the session**. Reloading or opening a second tab is detected server-side. Closing the browser or losing connection is caught by **heartbeat expiry**.
* Diagonal forensic **watermark** (username, candidate ID, attempt reference, live UTC timestamp), copy/paste/context-menu/print blocking (logged as warnings, not as primary controls).
* Completion, *Interview terminated*, *Interview access revoked* and *Session expired* screens.

### Staff (Head Admin + Support Curator)
* **Dashboard** — KPIs, completion trends, outcome distribution, score histogram, hardest questions, category performance, response timing, disqualification trend, live activity feed — all from real data.
* **Candidates** — searchable/filterable list, full profile (identity, assignments, attempt summary, security evidence, lifecycle timeline, sign-in history, evaluation notes), assign/cancel interviews, replace credentials, disable/archive (history is never deleted).
* **Question bank** — create/edit (versioned)/duplicate/delete (soft), 5 question types, configurable categories, difficulty, 30 s – 5 min timer, max score, rubric/answer key, candidate-view preview, drag-and-drop reordering.
* **Interview builder** — three-panel visual builder (bank · sequence · settings), per-interview timer overrides, passing threshold, availability window, preview, **immutable published versions**.
* **Live monitoring** — SSE-driven table of active interviews (progress, live per-question countdown, heartbeat connection state, warnings) and a real-time event log; terminate an attempt with a recorded reason.
* **Evaluation** — side-by-side answer/rubric review, per-question marks and notes, auto-graded objective items, decision (Passed / Failed / Under review / Disqualified), optimistic concurrency, append-only **revision history**. Only a Head Admin can overturn a disqualification, with justification.
* **History, Results, Disqualifications** — filter by candidate, Discord, interview, date range, result, evaluator, security status; **CSV export** and branded **PDF reports**.
* **Activity logs** — security events (browser-reported vs server-confirmed vs heartbeat vs administrative) and the immutable administrative audit trail.
* **Account** — profile, password change, **TOTP two-step verification**.

### Head Admin only
* **Support Curator management** — create (generated or chosen password), disable, reactivate, reset password, remove (soft: access revoked instantly, evaluations and audit history preserved). Enforced by backend middleware; curators cannot see or call it, and no API can change a role.

---

## Documentation

* [Architecture](documentation/ARCHITECTURE.md) — components, data model, state machine, timing model, real-time, scaling
* [Security](documentation/SECURITY.md) — controls, threat model, **browser-detection limitations**, recording deterrents, false positives, kiosk option, data retention
* [API reference](documentation/API.md)
* [Deployment & operations](documentation/DEPLOYMENT.md) — configuration, TLS/proxy, backups & restore, monitoring, scaling
* [Testing](documentation/TESTING.md) — what is covered and how to run it

## Project structure

```
libra-rp-interviews/
├── backend/          Express API (src/{config,controllers,middleware,models,routes,services,validators,security,jobs,utils,scripts}, tests/)
├── frontend/         Next.js app (app/, components/, hooks/, lib/, services/, styles/, public/, e2e/)
├── documentation/
├── docker-compose.yml
└── README.md
```
