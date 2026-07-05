# MaraAI — Deployment Guide

MaraAI ships as a **single container**: the React SPA is built to static assets
and served by the same Express server that exposes the API, talks to SQLite, and
calls the Anthropic API. There is no separate Python/Flask backend, no Vertex AI,
and no PostgreSQL — those belonged to an earlier architecture that no longer
exists.

## Architecture at a glance

| Layer      | What it is                                                    |
|------------|---------------------------------------------------------------|
| Frontend   | React SPA (Vite build) under `frontend/`, served as static assets |
| Backend    | Express server in `server/` (entry `server/index.ts`)         |
| AI         | `server/ai.ts` → Anthropic Claude via `server/lib/provider-router.ts` (local fallback supported) |
| Mara Brain | `server/mara-brain/` — periodic background reasoning loop     |
| Missions   | `server/missions/` — mission/program engine (replaces the old Trading module) |
| Data       | SQLite (better-sqlite3 + Drizzle ORM). **SQLite in all environments** |
| Billing    | `server/billing/` — PayPal + Stripe, both lazy (return 503 when keys are absent). Plans: `free` and `vip_monthly` only |

## Prerequisites

```
Node.js 20+
npm 10+
ANTHROPIC_API_KEY (https://console.anthropic.com/settings/keys)
```

## Local development

```bash
# Install dependencies (deterministic)
npm ci
cd frontend && npm ci && cd ..

# Create .env (see "Environment variables" below)

# Run the server in dev (tsx, no build step):
npm run dev
# or the compiled entry after a build:
npm run start:backend
```

The server listens on `PORT` (default 5000). Open `http://localhost:5000`.

## Environment variables

```bash
NODE_ENV=production            # or development
PORT=5000
ANTHROPIC_API_KEY=your_key
ANTHROPIC_MODEL=claude-sonnet-4-6   # optional; this is the default
SESSION_SECRET=your_strong_random_secret

# SQLite location. DATABASE_URL may be a sqlite:// URL or a literal path.
# Default when unset: ./maraai.sqlite (dev) — in the container we use /data.
DATABASE_URL=sqlite:////data/maraai.sqlite   # four slashes = absolute /data/...

CORS_ORIGINS=https://hellomara.net

# Optional integrations (each is inert if its key is missing):
STRIPE_SECRET_KEY=...          # /subscribe returns 503 without it
PAYPAL_CLIENT_ID=...
SENTRY_DSN=...                 # error tracking; no-op if unset
```

## Build & start (production)

```bash
npm run build     # build:frontend (Vite) + build:server (esbuild → dist/)
npm run start     # node dist/server/index.js
```

The backend is compiled with esbuild and run as plain Node in production — `tsx`
is a dev-only dependency and is not used at runtime.

## Deploy: Railway (recommended)

1. Push to GitHub. Railway builds `Dockerfile.nodejs` (referenced from `railway.json`).
2. Set the environment variables above in the Railway dashboard.
3. Add a Volume mounted at `/data` for a persistent SQLite file, then set
   `DATABASE_URL=sqlite:////data/maraai.sqlite`.
4. Custom domain: Settings → Domains → add `hellomara.net`, then point DNS
   (`CNAME`) at the Railway URL.

## Deploy: Docker (any host)

```bash
docker build -t maraai:latest -f Dockerfile.nodejs .

docker run -p 5000:5000 \
  -e ANTHROPIC_API_KEY=your_key \
  -e SESSION_SECRET=your_secret \
  -e NODE_ENV=production \
  -e DATABASE_URL=sqlite:////data/maraai.sqlite \
  -v maraai-data:/data \
  maraai:latest
```

The image runs as an unprivileged `nodejs` user; the entrypoint fixes `/data`
permissions at start (Railway mounts volumes as root).

## Pre-deploy verification

There is no `verify:deploy` script — CI (`.github/workflows/ci.yml`) runs the
real gates, and you can run them locally:

```bash
npm run typecheck                       # server (tsc --noEmit)
npm run build                           # frontend + backend
cd frontend && npm run lint:ci && npm run test && cd ..
npm run smoke:runtime                   # + smoke:auth, smoke:credits, etc.
```

## Health checks

```bash
curl http://localhost:5000/api/health      # {"status":"ok"}
curl http://localhost:5000/api/health/db   # {"db":"ok"} or {"db":"corrupt",...}
```

The Docker `HEALTHCHECK` probes `/api/health`. `/api/health` and `/api/runtime`
are exempt from rate limiting so uptime probes are never throttled.

## Troubleshooting

- **"ANTHROPIC_API_KEY is not set"** — add it to the environment; AI calls fail without it.
- **`/subscribe` returns 503** — `STRIPE_SECRET_KEY` (or the relevant billing key) is not set; expected for deployments without payments.
- **SQLite is empty after redeploy** — you're not using a persistent Volume; mount `/data` and point `DATABASE_URL` at it.
- **Schema errors on boot** — the startup self-heal (`server/db.ts`) reconciles known columns; check the boot logs for `[db]` entries.
