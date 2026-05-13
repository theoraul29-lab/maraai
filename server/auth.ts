import type { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { randomBytes, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import connectSqlite3 from 'connect-sqlite3';

const isProduction = process.env.NODE_ENV === 'production';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

declare global {
  // Keep existing code compatible: req.user.uid
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string | null };
    }
  }
}

function makeId() {
  return `u_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Choose where to put the session SQLite file.
 *
 * Production default mirrors `server/db.ts`: write to /data when it
 * exists (Railway Volume), fall back to the repo root for local dev.
 * A dedicated file (`sessions.sqlite`) keeps the session store
 * independent from the application DB so cleanup/wipe of one doesn't
 * affect the other, and connect-sqlite3's blocking writes can't
 * contend with our better-sqlite3 connection.
 */
function resolveSessionStoreDir(): string {
  try {
    if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) {
      return '/data';
    }
  } catch {
    /* fall through */
  }
  // Repo root (one level up from server/).
  return path.resolve(process.cwd());
}

/**
 * Express middleware that enforces CSRF token validation for state-changing
 * requests (POST, PUT, PATCH, DELETE).
 *
 * The frontend should:
 *   1. Call GET /api/auth/me to receive the csrfToken in the response.
 *   2. Include it as the X-CSRF-Token header on all mutating requests.
 *
 * Validation is skipped when:
 *   - The request method is safe (GET, HEAD, OPTIONS).
 *   - NODE_ENV is not 'production' AND no CORS_ORIGINS are configured
 *     (local development without configured origins).
 */
// Public endpoints that have no session/auth implications and are
// expected to be POSTed from a plain static HTML page (the pre-launch
// landing page, in particular) without any CSRF token machinery.
//
// These endpoints are still protected against abuse by IP rate limits
// and per-handler input validation; CSRF doesn't add anything here.
const CSRF_EXEMPT_PATHS = new Set<string>([
  '/api/waitlist',
  '/api/webhooks/stripe',
]);

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // Skip in open-dev mode (no origins configured and not production)
  if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
    return next();
  }

  const sessionToken: string | undefined = (req.session as any)?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF validation failed. Reload the page and try again.' });
  }

  return next();
}

export function setupSessionAuth(app: Express) {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET environment variable is required in production. ' +
        'Set a long random string (e.g. openssl rand -hex 32).',
    );
  }

  // Railway terminates TLS at the edge (proxy). Needed for secure cookies.
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-not-for-production';

  // Persistent session store. The previous implementation relied on the
  // implicit MemoryStore, which has two problems in production:
  //   1. Sessions are lost on every redeploy / process restart, so users
  //      get silently logged out without the frontend knowing.
  //   2. Under load on Railway's slim CPU, MemoryStore's session writes
  //      have been observed to interleave badly with bcrypt and the
  //      application DB's WAL fsyncs, contributing to the signup hangs
  //      reported in #74.
  //
  // connect-sqlite3 uses its own sqlite3 connection pool (not our
  // better-sqlite3 instance) so it can't block on our application
  // database's write lock.
  const SQLiteStore = connectSqlite3(session) as unknown as new (
    options: { db?: string; dir?: string; table?: string; concurrentDB?: boolean },
  ) => session.Store;

  const sessionStore = new SQLiteStore({
    db: 'sessions.sqlite',
    dir: resolveSessionStoreDir(),
    table: 'sessions',
    // Keep WAL fsyncs out of the request critical path: connect-sqlite3
    // uses callback-based sqlite3 so a slow disk shows up as a hung
    // request handler with no diagnostic. concurrentDB=true is a no-op
    // here but documents intent.
    concurrentDB: true,
  });

  console.log('[auth] session store initialised', {
    backend: 'connect-sqlite3',
    dir: resolveSessionStoreDir(),
    file: 'sessions.sqlite',
  });

  app.use(
    session({
      secret: sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      // `rolling: true` resets the cookie's Max-Age on every authenticated
      // request, so the 30-day window is "30 days of inactivity" rather
      // than "30 days since first login". Combined with the persistent
      // SQLite session store this means a user who returns every few
      // weeks stays signed in indefinitely without re-entering credentials.
      rolling: true,
      name: 'connect.sid',
      cookie: {
        httpOnly: true,
        // 'lax' is the right default for first-party cookies — the auth
        // endpoints are same-origin (hellomara.net front + back) so
        // 'strict' would still work, but 'lax' is friendlier for OAuth
        // redirects landing on the SPA.
        sameSite: 'lax',
        secure: isProduction,
        // 30-day "remember me" by default. Users who explicitly log out
        // still get their session destroyed server-side via `destroy()`
        // in `/api/auth/logout`, so this is purely a passive-inactivity
        // window, not a security bypass.
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // Attach a stable anonymous user per session + generate CSRF token
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.session.userId) req.session.userId = makeId();
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
    req.user = { uid: req.session.userId, email: null };
    next();
  });
}
