# MaraAI Local Setup (VS Code)

## Prerequisites
- Node.js 20+
- npm 10+

## Install
```bash
npm install
```

## Run (frontend + backend)
```bash
npm run dev
```

## URLs
- Frontend: `http://localhost:5173`
- Backend runtime info: `http://localhost:3001/api/runtime` (or fallback port shown in logs)
- Health check: `http://localhost:3001/api/health` (or fallback port)

The backend automatically falls back to the next free port if the configured `PORT` is already in use.

## Local Auth Mode
Local mode is enabled by `.env`:
- `AUTH_MODE=local`

This avoids hard dependency on Replit OAuth and creates a local development user for authenticated routes.

## Troubleshooting
- If frontend is up but backend moved to a fallback port, check `/api/runtime` to see the active backend URL.
- If you changed dependencies/config, restart `npm run dev`.
