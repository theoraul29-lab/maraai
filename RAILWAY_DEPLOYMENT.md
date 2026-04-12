# Railway Deployment Guide — MaraAI

## Overview

MaraAI is deployed as a single Node.js service on Railway with a persistent SQLite
database stored on a Railway volume.

---

## Prerequisites

- [Railway account](https://railway.app)
- [Railway CLI](https://docs.railway.app/develop/cli)

```bash
npm install -g @railway/cli
```

---

## First-Time Setup

### 1. Login & link project

```bash
railway login
railway init          # create a new Railway project
# OR
railway link          # link to an existing Railway project
```

### 2. Add a persistent volume

SQLite data must be stored on a volume so it survives redeployments.

1. Open your project in the [Railway dashboard](https://railway.app/dashboard)
2. Go to your service → **Variables** → add:
   ```
   DATABASE_URL=sqlite:////data/maraai.sqlite
   ```
3. Go to **Volumes** → **New Volume** → mount at `/data`

### 3. Set environment variables

Either via the dashboard or CLI:

```bash
railway variables set NODE_ENV=production
railway variables set PORT=5000
railway variables set HOST=0.0.0.0
railway variables set AUTH_MODE=local
railway variables set SESSION_SECRET=$(openssl rand -hex 32)
railway variables set DATABASE_URL=sqlite:////data/maraai.sqlite
railway variables set CORS_ORIGINS=https://<your-project>.up.railway.app
# Optional AI key:
railway variables set GEMINI_API_KEY=your_key_here
```

> **Tip:** Copy `.env.railway` as a reference for all available variables.

### 4. Deploy

```bash
git push origin main   # Railway auto-deploys on push (if connected to GitHub)
# OR deploy manually:
railway up
```

---

## Day-to-Day Operations

### View live logs

```bash
railway logs
```

### Open the app in browser

```bash
railway open
```

### Run a one-off command (e.g. DB shell)

```bash
railway run node -e "const db=require('better-sqlite3')('/data/maraai.sqlite'); console.log(db.prepare('SELECT count(*) as c FROM users').get())"
```

---

## CORS Configuration

After your first deploy, Railway gives you a URL like:

```
https://maraai-production-abc123.up.railway.app
```

Set `CORS_ORIGINS` to include it:

```bash
railway variables set CORS_ORIGINS=https://maraai-production-abc123.up.railway.app
```

If you add a custom domain later, append it:

```
CORS_ORIGINS=https://maraai-production-abc123.up.railway.app,https://yourdomain.com
```

---

## Cost Estimate (2026)

| Plan | Price | Notes |
|------|-------|-------|
| Free / Hobby | $0–$5/mo | Good for side projects |
| Pro | ~$20/mo | Production workloads |

Railway charges only for actual usage (CPU + memory + egress). A lightly-used
MaraAI instance typically costs **$0–$5/month**.

---

## Troubleshooting

### Database not persisting

Ensure a volume is mounted at `/data` and `DATABASE_URL=sqlite:////data/maraai.sqlite`.

### WebSocket disconnects

Confirm `CORS_ORIGINS` includes the exact Railway URL (no trailing slash).

### Build fails

Check `railway logs` for the build output. Common issues:
- Missing `NODE_ENV=production` during build → set in Railway Variables
- `npm ci` fails → ensure `package-lock.json` is committed

### Port not binding

Railway injects `$PORT` automatically. The server defaults to `5000` if `PORT`
is not set; Railway overrides this at runtime.
