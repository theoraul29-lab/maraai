# MaraAI Architecture

## Runtime overview

MaraAI is a monorepo with a React/Vite SPA in `frontend` and a session-based Express server in `server`.

```text
Browser SPA (React + Vite)
  ├─ Loads frontend/src/main.tsx
  ├─ Installs global CSRF-aware fetch/axios wrappers from frontend/src/csrf.ts
  └─ Calls /api/** on the same Express runtime

Express runtime (server/index.ts + server/routes.ts)
  ├─ Session auth + CSRF protection
  ├─ REST APIs for auth, billing, share, missions, media, messenger, admin
  ├─ WebSocket chat and compute-peer flows
  ├─ Mara brain / growth / mission subsystems
  └─ Static asset serving for the SPA

Persistence and integrations
  ├─ SQLite via better-sqlite3 + Drizzle
  ├─ Anthropic-backed AI helpers
  ├─ Stripe and PayPal billing providers
  └─ Local filesystem storage for uploads/media where configured
```

## Main backend entry points

- `server/index.ts`
  - Bootstraps Express, security middleware, sessions, health/runtime routes, WebSocket server, migrations, and static serving.
- `server/routes.ts`
  - Registers the application API surface and wires most feature modules into the main Express app.
- `server/auth.ts`
  - Session auth, CSRF enforcement, and request user hydration.
- `server/db.ts`
  - SQLite connection setup and database bootstrap helpers.
- `server/storage.ts`
  - Main persistence layer used by API handlers and background logic.

## Frontend structure

- `frontend/src/main.tsx`
  - SPA bootstrap, router mount, PWA registration, and CSRF wrapper initialization.
- `frontend/src/csrf.ts`
  - Canonical CSRF token source. Reads `csrfToken` from `GET /api/auth/me`, caches the token per session, injects headers into mutating `fetch`/`axios` requests, and retries once on CSRF failures.
- `frontend/src/components`
  - UI components including PayPal purchase, sharing, chat, and module-specific flows.
- `frontend/src/contexts/AuthContext.tsx`
  - Session-aware auth state and CSRF cache resets after login/signup/logout.

## Auth and request security

- Authentication is session-based, not JWT-centric.
- The authenticated user is attached to `req.user` from the session.
- CSRF protection is enforced server-side for mutating requests through `server/auth.ts`.
- The SPA obtains the CSRF token from `GET /api/auth/me` and should not rely on an ad-hoc cookie value.
- Admin-only routes are guarded in `server/routes.ts` by checking the authenticated session user against configured admin IDs.

## Rate limiting

- Application rate limiting is centralized in `server/rate-limit.ts`.
- The module contains:
  - chat message throttling,
  - auth/IP-based limiters,
  - per-user limiters for messenger, uploads, speech, P2P heartbeat, and related endpoints.
- Limits are in-memory and therefore process-local by design.

## Payments

- PayPal program purchase/capture logic lives in `server/billing/paypal.ts`.
- Frontend purchase initiation currently comes from `frontend/src/components/PayPalProgramButton.tsx`.
- Stripe and PayPal provider abstractions also exist under `backend/src/payments`.

## Mara subsystems

- `server/mara-brain`
  - Brain-cycle orchestration, learning, experiments, code indexing, alerts, and supporting agents.
- `server/mara-core`
  - Shared reasoning state such as executive context and objective tracking.
- `server/missions`
  - Mission engine, routing, and seeding.
- `server/maraai`
  - Additional Mara-specific routes and compute-peer coordination.

## Build and CI

- Root package scripts orchestrate repository-level commands.
- Frontend dependencies are installed separately from the root install.
- Frontend build runs from `frontend/package.json`.
- CI is defined in `.github/workflows/ci.yml` and is expected to validate install, typecheck, frontend lint, build, and smoke coverage.

## Current code organization note

`server/routes.ts` is still a large integration point. Future refactoring should split it gradually by domain (auth, admin, billing, media, Mara internals) while preserving current route behavior and middleware ordering.
