# Launch Deploy Guide — hellomara.net

Short, operational. For full deployment docs (history, every feature),
see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

This file covers the **20-day launch countdown** specifically: how the
landing page, the `/preview` gate, and the platform coexist on a single
Railway instance and a single domain (`hellomara.net`) before and after
the launch date.

---

## Architecture

```
                    ┌──────────────────────┐
                    │   hellomara.net      │
                    │  (Cloudflare proxy)  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Railway          │
                    │   Node 20 + tsx      │
                    │                      │
                    │  server/routes.ts    │
                    │  ┌────────────────┐  │
                    │  │ GET /          │  │  ← landing.html  (before 2026-06-01)
                    │  │                │  │  ← SPA index.html (after 2026-06-01)
                    │  │ GET /preview   │  │  ← token gate
                    │  │ GET /preview/* │  │  ← SPA for token holders
                    │  │ POST /api/*    │  │  ← API (incl. /api/waitlist)
                    │  └────────────────┘  │
                    │         │            │
                    │         ▼            │
                    │  sqlite ─ /data/     │  ← waitlist + brain state
                    └──────────────────────┘
```

There is no Netlify, no second domain, no DNS swap on launch day.
Everything is one Railway service serving one domain.

## The launch date check

`server/modules/launch-countdown.ts` reads the launch date from
`LAUNCH_DATE_ISO` (default `2026-06-01T00:00:00Z`). On every request
to `/`:

- If `new Date() < LAUNCH_DATE` → serves `public/landing.html`.
- If the caller has a valid `preview_token` cookie → falls through to
  the SPA (so the team never sees the landing).
- Otherwise → falls through to the SPA (post-launch behaviour).

This means launch day is **fully automatic** — no redeploy, no DNS
change, no manual flip. The server just starts returning the SPA at
midnight UTC on June 1st.

## Pre-launch testing

Anyone with the preview token can reach the full platform:

```
https://hellomara.net/preview?token=<PREVIEW_TOKEN>
```

After the first successful visit, a `preview_token` cookie is set for
7 days so subsequent navigation works against `/`, `/you`, `/trading`,
etc. without re-supplying the token.

If you forget the token, check the value of the `PREVIEW_TOKEN`
environment variable in the Railway dashboard.

## Required environment variables

Set these on the Railway service (Settings → Variables). Most are
unchanged from the existing deploy — only the last three are new for
the launch countdown.

```
NODE_ENV=production
PORT=5000
SESSION_SECRET=<openssl rand -hex 32>
AUTH_MODE=local
DATABASE_URL=sqlite:////data/maraai.sqlite
ANTHROPIC_API_KEY=<your key>
ANTHROPIC_MODEL=claude-sonnet-4-6
PROCESS_AI_TASKS=true
MARA_LEARNING_ENABLED=true
MARA_LEARNING_MAX_CALLS_PER_DAY=50
ADMIN_EMAILS=<your email>
CORS_ORIGINS=https://hellomara.net

# Launch countdown (new):
PREVIEW_TOKEN=<long random string>
# LAUNCH_DATE_ISO=2026-06-01T00:00:00Z   # only if you want to override
# WAITLIST_RL_MAX=5                       # POST /api/waitlist limit
# WAITLIST_RL_WINDOW_MS=900000            # 15 minutes
```

Generate a strong preview token:

```
openssl rand -hex 16
```

## Deploying

The codebase is already deployed to Railway. To ship the launch
countdown, merge the corresponding PR and Railway will redeploy
automatically (it watches `main`).

After the redeploy, smoke test from your laptop:

```
# 1. Landing serves at root
curl -sI https://hellomara.net/ | head -1
# expected: HTTP/1.1 200 OK + Content-Type: text/html

curl -s https://hellomara.net/ | grep -i "launching in"
# expected: matches countdown bar text

# 2. /preview without token → 403 + form
curl -sI https://hellomara.net/preview | head -1
# expected: HTTP/1.1 403 Forbidden

# 3. /preview with the correct token → 200 + SPA
curl -sI "https://hellomara.net/preview?token=YOUR_TOKEN" | head -1
# expected: HTTP/1.1 200 OK

# 4. Health endpoints still work
curl -s https://hellomara.net/api/health
# expected: {"status":"ok"}

curl -s https://hellomara.net/api/ai/health | head -c 200
# expected: JSON with provider info
```

## Waitlist

`POST /api/waitlist` accepts JSON or form-encoded:

```
curl -sX POST https://hellomara.net/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com","source":"landing"}'
# expected: {"ok":true}
```

It is **idempotent**: submitting the same email twice still returns
`{ok:true}`. The duplicate is silently discarded thanks to a unique
index on `mara_waitlist.email`.

Admin endpoints (gated by `ADMIN_EMAILS`):

```
GET  /api/admin/waitlist            → JSON list + counts
GET  /api/admin/waitlist/export.csv → CSV download
```

Admin UI lives at `/admin/waitlist` and pulls from the same endpoints.

## Launch day playbook

Nothing to do. Verify everything still works:

1. `curl -s https://hellomara.net/` → returns the SPA HTML (no longer
   the landing page).
2. `curl -s "https://hellomara.net/preview?token=YOUR_TOKEN"` →
   still works (testers don't get kicked out).
3. Open the admin waitlist page → download CSV → email everyone.

If anything is off, set `LAUNCH_DATE_ISO` to a future date to revert
the landing while you fix forward.
