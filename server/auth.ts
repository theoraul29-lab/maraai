import type { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { randomUUID } from 'crypto';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
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

export function setupSessionAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Railway terminates TLS at the edge (proxy). Needed for secure cookies
  // and for express-session to consider the request HTTPS so it's willing
  // to set the Secure cookie attribute.
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  const configuredSecret = process.env.SESSION_SECRET;
  if (isProduction && !configuredSecret) {
    throw new Error(
      'SESSION_SECRET is required in production. Set a long random string in the environment.',
    );
  }
  const sessionSecret = configuredSecret || 'dev-secret-not-for-production';

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
      name: 'connect.sid',
      cookie: {
        httpOnly: true,
        // 'lax' is the right default for first-party cookies — the auth
        // endpoints are same-origin (hellomara.net front + back) so
        // 'strict' would still work, but 'lax' is friendlier for OAuth
        // redirects landing on the SPA.
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // Lightweight session-read log. Lets us correlate "user disappeared on
  // refresh" reports with what the server actually saw on /api/auth/me.
  // Only fires for /api routes so we don't spam static asset reads.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/auth/')) {
      const sid = req.sessionID ? `${req.sessionID.slice(0, 8)}…` : 'none';
      const uid = req.session?.userId ? `${String(req.session.userId).slice(0, 8)}…` : 'anon';
      console.log('[auth] session read', { path: req.path, sid, uid });
    }
    next();
  });

  // Attach a stable anonymous user per session. Lots of downstream
  // endpoints (analytics, voting, reels watch tracking) depend on
  // req.user.uid being non-null even for unauthenticated browsers, so
  // we keep this behaviour but log when a brand-new anonymous id is
  // minted for an /api/auth/* request.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      req.session.userId = makeId();
      if (req.path.startsWith('/api/auth/')) {
        console.log('[auth] anonymous id minted', {
          path: req.path,
          uid: `${String(req.session.userId).slice(0, 8)}…`,
        });
      }
    }
    req.user = { uid: req.session.userId, email: null };
    next();
  });
}
