# MaraAI

MaraAI – an AI companion platform with video reels, AI chat, trading academy, writers hub, and creator tools.

## Quick Start (Local Dev)

### Prerequisites
- Node.js 20+
- npm 10+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and edit as needed
cp .env.example .env

# 3. Start backend + frontend together
npm run dev
```

- **Frontend** → http://localhost:5173
- **Backend** → http://localhost:5000 (or next available port)
- **Health check** → http://localhost:5000/api/health

> **AI provider:** MaraAI tries Ollama first (self-hosted, free) and falls back to Anthropic Claude if Ollama isn't reachable. At least one of `OLLAMA_BASE_URL` (with a running Ollama) or `ANTHROPIC_API_KEY` must be set — otherwise chat returns a localised "I'm catching my breath" message. See [AI Providers](#ai-providers) below.

## Environment Variables

Copy `.env.example` to `.env` and set the following:

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: `5000`) |
| `NODE_ENV` | No | `development` or `production` |
| `SESSION_SECRET` | Production only | Random secret for sessions (auto-generated in dev) |
| `DATABASE_URL` | No | SQLite path (default: `./maraai.sqlite`) |
| `AUTH_MODE` | No | Set to `local` to bypass OAuth (dev-friendly default) |
| `OLLAMA_BASE_URL` | No¹ | Ollama server URL (e.g. `http://localhost:11434`). Leave empty to disable Ollama. |
| `OLLAMA_MODEL` | No | Ollama model tag (default: `llama3.1:8b`) |
| `OLLAMA_TIMEOUT_MS` | No | Request timeout in ms (default: `120000`) |
| `ANTHROPIC_API_KEY` | No¹ | Anthropic API key ([console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)) — used as fallback when Ollama is down |
| `ANTHROPIC_MODEL` | No | Claude model (default: `claude-sonnet-4-6`) |
| `ANTHROPIC_MAX_TOKENS` | No | Max output tokens per reply (default: `1024`) |
| `ANTHROPIC_TIMEOUT_MS` | No | Request timeout in ms (default: `120000`) |
| `PROCESS_AI_TASKS` | No | Set to `true` to enable autonomous Mara brain cycle |

¹ At least one of `OLLAMA_BASE_URL` (with a reachable Ollama) or `ANTHROPIC_API_KEY` must be set, otherwise the chat will return a localised "catching my breath" fallback message.

## AI Providers

Two providers are supported, picked at runtime by `server/lib/provider-router.ts`:

1. **Ollama** — primary. Self-hosted, no per-token cost, can run any open-weights model (`llama3.1:8b`, `mistral:7b`, `qwen2.5:14b`, …). Required env: `OLLAMA_BASE_URL`. The router probes `GET {OLLAMA_BASE_URL}/api/tags` (3s timeout, cached for 30s) before sending each request.
2. **Anthropic Claude** — paid fallback when Ollama isn't reachable. Required env: `ANTHROPIC_API_KEY`. Default model: `claude-sonnet-4-6`.
3. **Graceful degrade** — when neither is configured (or both fail), `/api/chat` returns a localised "I'm catching my breath" message as a normal chat bubble (not an HTTP 500), so the UI never shows a red error.

### Run Ollama locally

```bash
# 1. Install — see https://ollama.com/download
# 2. Pull a model and start the daemon:
ollama pull llama3.1:8b
ollama serve   # listens on http://localhost:11434
# 3. Point MaraAI at it:
echo 'OLLAMA_BASE_URL=http://localhost:11434' >> .env
echo 'OLLAMA_MODEL=llama3.1:8b' >> .env
npm run dev
```

### Recommended models

| Use case | Suggested model | Notes |
|---|---|---|
| General chat (Mara persona) | `llama3.1:8b` | Default. Good balance of quality/latency. |
| Faster on modest hardware | `llama3.2:3b` | Lower quality but ~2× faster. |
| Best open-weights quality | `qwen2.5:14b` | Needs ≥16 GB RAM / decent GPU. |
| Code-heavy generation | `qwen2.5-coder:7b` | Specialised for code. |

### Live health probe

```bash
curl https://hellomara.net/api/ai/health
# { "provider": "ollama", "configured": true, "ok": true, "model": "llama3.1:8b",
#   "fallback": { "provider": "anthropic", "configured": true, "ok": true, "model": "claude-sonnet-4-6" } }
```

`provider` reports the one currently being used (Ollama if reachable, otherwise Anthropic). When neither is configured, the endpoint returns 503.

### Tuning

- For shorter/snappier Anthropic answers lower `ANTHROPIC_MAX_TOKENS` (e.g. `512`); for long-form replies raise it to `2048`+.
- Temperature is set per call in code (0.95 for chat, 0.7 for structured generation) and is propagated to whichever provider serves the call.

## Configuration Map

Canonical app configuration (used by root `npm` scripts):

- Scripts/dependencies: `package.json` (root)
- Runtime/env entry point: `server/index.ts` (loads `.env` via `dotenv`)
- Drizzle ORM schema: `shared/schema.ts`; migrations: `migrations/`
- Root Vite config: `vite.config.js` (currently only used by the root `dev` flow)
- Frontend bundler (React app): `frontend/vite.config.ts`
- Frontend TypeScript: `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`
- Frontend Tailwind/PostCSS: `frontend/tailwind.config.js`, `frontend/postcss.config.cjs`
- Frontend linting: `frontend/eslint.config.js` (plus `.eslintrc.js` / `.prettierrc.js` / `.stylelintrc.js` at root for editor integration)
- Container builds: `Dockerfile.nodejs` (app)
- Railway deployment: `railway.json`

Notes:

- Root `npm run dev` / `npm run start` runs `tsx server/index.ts`.
- Root `npm run build` runs `npm run build:frontend`, which installs and builds `frontend/` via its own Vite config.
- `backend/src/modules/*` is imported by the root server (`server/routes.ts`) and is part of the active runtime.
- `frontend/package.json` defines a standalone subproject workflow for the React app.

## Build for Production

```bash
npm run build   # builds the frontend (outputs to dist/public/)
npm start       # starts the backend serving the built frontend
```

## Deploy to Render (free tier)

1. Fork or connect this repo on [Render](https://render.com).
2. Render auto-detects `render.yaml` and creates a **Web Service** with a **persistent disk**.
3. Set `ANTHROPIC_API_KEY` in the Render dashboard under **Environment**.
4. Deploy — `SESSION_SECRET` is auto-generated by Render.

**Render build command:** `npm ci && npm run build`  
**Render start command:** `npm start`

> SQLite data is stored on a persistent 1 GB disk mounted at `/var/data/maraai.sqlite`.

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway, create a new project → **Deploy from GitHub repo**.
3. Railway will detect [railway.json](railway.json) and use `Dockerfile.nodejs`.
4. Add a **Volume** and mount it to `/data` so the SQLite file persists across deploys.
5. Set environment variables:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `5000` | Railway also injects `PORT` automatically |
| `AUTH_MODE` | `local` | |
| `SESSION_SECRET` | *(random secret)* | Use Railway's "Generate" button |
| `DATABASE_URL` | `sqlite:////data/maraai.sqlite` | Requires the Volume above. **Four** slashes encode an absolute path (`/data/...`); three slashes would be interpreted as relative to `CWD` and would not persist across redeploys. |
| `ANTHROPIC_API_KEY` | *(your key)* | Get one from https://console.anthropic.com/settings/keys |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Optional — defaults to this model |
| `PROCESS_AI_TASKS` | `false` | Set `true` to enable autonomous brain cycle |

### Verify after deploy

```bash
# App health
curl https://<your-railway-domain>/api/health
# Expected: {"status":"ok"}

# AI provider health (Anthropic key presence + model)
curl https://<your-railway-domain>/api/ai/health
# Expected: {"provider":"anthropic","configured":true,"ok":true,"model":"claude-sonnet-4-6"}
```

## Smoke Tests

```bash
# Start the backend first, then:
MARAAI_BASE_URL=http://localhost:5000 npm run smoke:runtime
```

Or run the full CI check:

```bash
npm run build
npm run start:backend &
sleep 10
npm run smoke:runtime
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:
1. Install dependencies
2. Build frontend
3. Start backend
4. Run smoke tests against `/api/health`, `/api/videos`, `/api/mara-feed`, etc.
