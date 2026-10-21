# Deployment & operations

## 0. Recommended free setup: Vercel + Render + MongoDB Atlas

```
Browser ──▶ Vercel (Next.js, /api/* proxied) ──▶ Render (Express API) ──▶ MongoDB Atlas
```

### Step 1 — MongoDB Atlas
1. **Network Access → Add IP Address → Allow Access from Anywhere (`0.0.0.0/0`).** Render's free tier has no fixed outgoing IP, so it cannot be allow-listed individually. Use a long random database-user password.
2. Copy the connection string and **add a database name** before the `?`:
   `mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/libra_interviews?retryWrites=true&w=majority`
3. Atlas M0 (free) supports the transactions the API needs. It does **not** include backups — see §6.

### Step 2 — Render (API)
1. Push the repository to GitHub.
2. Render → **New → Blueprint** → pick the repo. It reads `render.yaml` (root dir `backend`, build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`, secrets generated automatically).
3. Enter the two prompted values: `MONGODB_URI` (from step 1) and `FRONTEND_URL` (your Vercel production URL, no trailing slash — you can fill it after step 3 and redeploy).
4. Note the service URL, e.g. `https://libra-rp-api.onrender.com`. Check `https://…onrender.com/api/health` returns `{"status":"ok","db":true}`.

### Step 3 — Vercel (web)
1. Vercel → **Add New → Project** → import the repo → **Root Directory: `frontend`** (framework auto-detected as Next.js).
2. Environment variable: `BACKEND_URL=https://libra-rp-api.onrender.com` (no trailing slash). It is read **at build time**; the build fails on purpose if it is missing. Redeploy after changing it.
3. Use the **production** URL (`https://<project>.vercel.app` or your custom domain) and put exactly that in Render's `FRONTEND_URL`. Preview-deployment URLs are rejected by the API unless added to `EXTRA_ORIGINS`.

### Step 4 — First accounts and questions
Render's free tier has no shell, so run the one-off commands **from your PC** with `backend/.env` pointing at Atlas (your IP must be allowed — step 1 allows all):

```bash
cd backend
npm run bootstrap:admin -- --username=director --name="Server Director"   # only if you have no Head Admin yet
npm run seed:admin-assistant                                               # loads the 34 Admin Assistant questions
```

Then sign in at `https://<your-vercel-url>/admin/login`. Accounts created with a temporary password must set their own password before anything else works.

### Step 5 — Rehearse once
Create a test candidate, take the interview on the live site, leave the window once to confirm disqualification, score an attempt, download a PDF. Delete nothing — archive the test candidate.

### Free-tier realities
| | Effect | What to do |
|---|---|---|
| Render free sleeps after 15 min idle | First request after a pause takes 30–60 s; the site may show "server unreachable" briefly | Open the site a few minutes before interviews, or ping `/api/health` every 10 min with a free uptime monitor (e.g. UptimeRobot). Paid Render ($7/mo) removes this. During an interview the heartbeats keep it awake; timers are stored in the database, so a restart never extends or loses them. |
| Atlas M0 has no automatic backups | Records are meant to be kept forever | Run `mongodump` weekly (§6) or upgrade to a tier with snapshots |
| Live-monitor stream through Vercel | The SSE stream may be closed by the proxy | The page falls back to refreshing every few seconds automatically |
| Requests reach Render through two proxies | Client IPs depend on `TRUST_PROXY=2` | Rate limits are keyed by session, so a wrong IP setting cannot throttle candidates; check Render logs show real visitor IPs for sign-in auditing |

## 1. Configuration

### API (`backend/.env`, see `.env.example`)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables Secure cookies, JSON logs, HSTS, start-up index verification |
| `FRONTEND_URL` | `http://localhost:3000` | Public origin; used for the Origin allow-list |
| `EXTRA_ORIGINS` | – | Optional comma-separated extra trusted origins |
| `BACKEND_PORT` | `5000` | |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/libra_interviews?replicaSet=rs0` | **Must be a replica set** |
| `SESSION_SECRET` | – | ≥ 32 chars, random. Rotating it signs everyone out |
| `MFA_ENCRYPTION_KEY` | – | ≥ 32 chars, random. Encrypts TOTP seeds |
| `TRUST_PROXY` | `loopback` | Hop count / `true` behind load balancers so rate limits see client IPs |
| `COOKIE_SECURE` | prod: `true` | |
| `ADMIN_SESSION_IDLE_MINUTES` / `ADMIN_SESSION_ABSOLUTE_HOURS` | 60 / 12 | |
| `CANDIDATE_SESSION_HOURS` | 4 | |
| `HEARTBEAT_INTERVAL_SECONDS` / `HEARTBEAT_TIMEOUT_SECONDS` | 5 / 25 | |
| `HEARTBEAT_TIMEOUT_ACTION` | `EXPIRE` | or `DISQUALIFY` |
| `SUBMISSION_GRACE_MS` | 1500 | Network latency allowance after a deadline |
| `RECONCILE_INTERVAL_MS` | 2000 | Deadline/heartbeat sweep cadence |
| `CANDIDATE_CODE_PREFIX` | `LIBRA-ADMIN` | Username prefix |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_MINUTES` | 5 / 15 | Account lockout |
| `DISABLE_JOBS` | false | Set `true` on extra API replicas if you want a single reconciler (optional — it is concurrency-safe) |

### Web (`frontend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `BACKEND_URL` | `http://localhost:5000` | Server-side only. Read at **build time** for the `/api` rewrite |

## 2. MongoDB

Transactions require a replica set. Options:

* **Local dev:** `npm run dev:db` (backend) — real `mongod`, data in `backend/.data/mongo`.
* **Docker:** `docker compose up mongo` (auto-initiated `rs0`).
* **Self-hosted:** `mongod --replSet rs0` then `rs.initiate()`; use three members in production.
* **Managed:** MongoDB Atlas (any tier is a replica set).

Indexes are created automatically in development and verified at start-up in production. To build them explicitly: `npm run indexes:sync`.

## 3. First Head Admin

```bash
npm run bootstrap:admin -- --username=director --name="Server Director" [--discord=handle]
# docker: docker compose run --rm api node dist/scripts/bootstrap-head-admin.js --username=… --name="…"
```

A random password is printed once (or supply `BOOTSTRAP_PASSWORD` in the environment). The command refuses to run if a Head Admin already exists unless `--allow-additional` is passed. Sign in, change the password and enable two-step verification immediately.

## 4. Building & running

```bash
# API
cd backend && npm ci && npm run build && NODE_ENV=production node dist/server.js
# Web
cd frontend && npm ci && BACKEND_URL=http://api.internal:5000 npm run build && npm start
```

Or `docker compose up -d --build` (see README).

## 5. Reverse proxy & TLS

Terminate TLS in front of the **web** service only; the API should not be publicly reachable (the web app proxies `/api`). Requirements:

* Forward `X-Forwarded-For` / `X-Forwarded-Proto`; set `TRUST_PROXY` accordingly on the API.
* **Disable buffering for `/api/monitor/stream`** (SSE). nginx example:

```nginx
location /api/monitor/stream {
    proxy_pass http://web:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
location / {
    proxy_pass http://web:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

* Enable HSTS at the edge. The live monitor falls back to polling if SSE is buffered.

## 6. Back-ups & recovery

Interview records are retained indefinitely; back them up.

```bash
# Nightly logical back-up (consistent across the replica set)
mongodump --uri="$MONGODB_URI" --oplog --gzip --archive=/backups/libra-$(date +%F).archive.gz

# Restore into an empty deployment
mongorestore --uri="$MONGODB_URI" --oplogReplay --gzip --archive=/backups/libra-2026-10-20.archive.gz
```

Docker:

```bash
docker compose exec mongo mongodump --oplog --gzip --archive > libra-$(date +%F).archive.gz
docker compose exec -T mongo mongorestore --oplogReplay --gzip --archive < libra-2026-10-20.archive.gz
```

Recommendations: keep ≥ 30 daily + 12 monthly copies off-site and encrypted, test a restore quarterly, and use Atlas continuous back-up / point-in-time recovery where available. After restoring, run `npm run indexes:sync`.

## 7. Monitoring

* `GET /api/health` for liveness/readiness (checks MongoDB).
* Structured JSON logs (pino) — ship to your log stack; heartbeat requests are excluded from access logs.
* Alert on: 5xx rate, `reconciler tick failed`, MongoDB disconnects, spikes of `LOGIN_FAILED`/`ACCOUNT_LOCKED`.

## 8. Scaling

A single API instance comfortably handles 100+ concurrent candidates (~0.3–0.5 req/s each). To run several:

1. Put the API instances behind the web service (or a load balancer reachable only from it).
2. Replace the in-process live-event bus with Redis pub/sub or a MongoDB change stream on `security_events`.
3. Use a shared rate-limit store (e.g. `rate-limit-redis`).
4. The reconciler can run on every instance (all transitions are compare-and-set) or only on one (`DISABLE_JOBS=true` elsewhere).
