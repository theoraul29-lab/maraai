# MaraAI QA Checklist

Use this checklist to validate that the platform is functional for real-user web testing.

## Test Environment

Replace `<base>` with your environment's origin (local dev or the deployed
Railway domain). In local dev the frontend runs on `http://localhost:5173`
and the backend on `http://localhost:5000` (or the next free port).

- Frontend URL: `<base>` (e.g. `http://localhost:5173`)
- Backend health: `<base>/api/health`
- Runtime info: `<base>/api/runtime`

## Pre-Check

1. Open frontend URL.
2. Confirm landing page loads without errors.
3. Confirm backend health returns `{ "status": "ok" }`.

Expected:
- Frontend is reachable.
- Backend health endpoint returns HTTP `200`.

## Authentication

1. On landing page, switch to `Create account`.
2. Enter first name, last name, email, and password (8+ chars).
3. Submit registration.
4. Confirm you are logged in and redirected into app experience.
5. Logout from user menu/header.
6. Confirm unauthenticated state (landing page) appears.
7. Switch to `Login` and sign in with the same account.

Expected:
- Register works.
- Login works.
- Logout clears session.
- Login restores session.

## Core Interaction

1. Open feed/home and confirm video cards appear.
2. Send a message in chat.
3. Reload page.
4. Confirm chat history still loads.

Expected:
- Feed loads.
- Chat endpoint responds.
- Chat history persists per account.

Note:
- AI is served by Ollama (primary) with Anthropic Claude as fallback. If
  neither `OLLAMA_BASE_URL` (with a reachable Ollama) nor `ANTHROPIC_API_KEY`
  is configured, chat returns a graceful localised fallback message instead
  of full AI output (not an HTTP error).

## Creator Flow

1. Go to `/creator`.
2. Post a reel with:
   - URL: `https://example.com/reel.mp4`
   - Title: any non-empty title
   - Type: `creator`
3. Open `My Videos` and confirm the new reel appears.
4. Go to feed and save that video.
5. Open saved videos and confirm it appears.
6. Unsave it.
7. Delete the creator video.

Expected:
- Reel creation works.
- Saved/unsaved state updates correctly.
- Creator delete works.

## Writer Flow

1. Go to `/writers`.
2. Create a new page (pen name, title, content).
3. Confirm it appears in `My Pages`.
4. Open the page and update title/content.
5. Refresh and confirm updates persisted.

Expected:
- Writer create/read/update works.
- No server errors during publish/list actions.

## Profile Flow

1. Open your profile page.
2. Confirm user details load.
3. Confirm profile videos endpoint-backed sections load.

Expected:
- Profile route loads.
- Profile video list loads.

## Session and Refresh Behavior

1. Refresh browser on `/`, `/creator`, and `/writers` while logged in.
2. Open app in a new tab.

Expected:
- Session remains valid.
- No forced logout on simple refresh/new tab.

## Smoke API Matrix (Optional)

Expected HTTP status in normal conditions:

- `GET /api/health` -> `200`
- `GET /api/runtime` -> `200`
- `GET /api/auth/me` -> `200` when logged in, `401` when logged out
- `GET /api/videos` -> `200`
- `GET /api/mara-feed` -> `200`
- `POST /api/chat` -> `200` when logged in
- `GET /api/writers/published` -> `200`
- `GET /api/notifications` -> `200` when logged in

## Sign-Off

Mark complete when all sections above pass:

- [ ] Pre-Check
- [ ] Authentication
- [ ] Core Interaction
- [ ] Creator Flow
- [ ] Writer Flow
- [ ] Profile Flow
- [ ] Session and Refresh Behavior
