import session from 'express-session';
import type { Express, RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import { authStorage } from './replit_integrations/auth/storage.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'path';

// ---------------------------------------------------------------------------
// Minimal SQLite session store backed by better-sqlite3 (no connect-sqlite3)
// ---------------------------------------------------------------------------

class BetterSqliteStore extends session.Store {
  private db: Database.Database;

  constructor() {
    super();
    const rawUrl = process.env.DATABASE_URL || '';
    // Accept sqlite:///path or sqlite://path or plain path
    const dbPath =
      rawUrl.replace(/^sqlite:\/\/\//, '/').replace(/^sqlite:\/\//, '') ||
      path.resolve(process.cwd(), 'maraai.sqlite');

    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid        TEXT    PRIMARY KEY,
        sess       TEXT    NOT NULL,
        expired_at INTEGER NOT NULL
      )
    `);

    // Purge expired sessions every minute
    setInterval(() => {
      try {
        this.db.prepare('DELETE FROM sessions WHERE expired_at <= ?').run(Date.now());
      } catch {
        // Ignore cleanup errors
      }
    }, 60_000).unref();
  }

  get(sid: string, callback: (err: any, session?: session.SessionData | null) => void) {
    try {
      const row = this.db
        .prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?')
        .get(sid) as { sess: string; expired_at: number } | undefined;

      if (!row || row.expired_at <= Date.now()) {
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void) {
    try {
      const ttl = sessionData.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + ttl;
      this.db
        .prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sessionData), expiredAt);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: any) => void) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, sessionData: session.SessionData, callback?: () => void) {
    try {
      const ttl = sessionData.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + ttl;
      this.db
        .prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?')
        .run(expiredAt, sid);
    } catch {
      // Ignore touch errors
    }
    callback?.();
  }
}

// ---------------------------------------------------------------------------
// Session data type augmentation
// ---------------------------------------------------------------------------

declare module 'express-session' {
  interface SessionData {
    localUserId?: string;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build and return an express-session middleware backed by SQLite. */
export function getSession() {
  const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }

  return session({
    secret: sessionSecret,
    store: new BetterSqliteStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  });
}

/** Validation schema for local auth endpoints. */
const localAuthPayloadSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
});

/**
 * Set up session middleware, user hydration, and local auth routes on app.
 * Must be called before registering application routes.
 */
export async function setupAuth(app: Express) {
  app.set('trust proxy', 1);

  // 1. Session middleware
  app.use(getSession());

  // 2. Hydrate req.user from session on every request
  app.use(async (req: any, _res, next) => {
    const userId = req.session?.localUserId;
    if (!userId) return next();

    try {
      const user = await authStorage.getUser(userId);
      if (!user) {
        req.session.localUserId = undefined;
        return next();
      }

      req.user = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
        },
        expires_at: Number.MAX_SAFE_INTEGER,
      };
    } catch {
      // Session hydration failure is non-fatal
    }
    return next();
  });

  // 3. Auth mode indicator
  app.get('/api/auth/mode', (_req, res) => {
    res.json({ mode: 'local' });
  });

  // 4. Registration
  app.post('/api/auth/register', async (req: any, res: any) => {
    const parsed = localAuthPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await authStorage.createLocalUserAccount({
        email: parsed.data.email,
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
      });

      req.session.localUserId = user.id;
      req.session.save(() => {
        res.status(201).json(user);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register';
      if (message.includes('exists')) {
        return res.status(409).json({ message: 'Email already exists' });
      }
      return res.status(500).json({ message: 'Failed to register' });
    }
  });

  // 5. Login
  app.post('/api/auth/login', async (req: any, res: any) => {
    const parsed = localAuthPayloadSchema
      .omit({ firstName: true, lastName: true })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    try {
      const user = await authStorage.verifyLocalUserCredentials({
        email: parsed.data.email,
        password: parsed.data.password,
        comparePassword: bcrypt.compare,
      });

      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      req.session.localUserId = user.id;
      req.session.save(() => {
        res.status(200).json(user);
      });
    } catch {
      return res.status(500).json({ message: 'Failed to login' });
    }
  });

  // 6. Logout (GET and POST)
  const logoutHandler = (req: any, res: any) => {
    req.session.localUserId = undefined;
    req.session.save(() => {
      res.status(204).end();
    });
  };
  app.get('/api/logout', logoutHandler);
  app.post('/api/auth/logout', logoutHandler);

  // 7. Legacy redirect routes (keep paths working)
  app.get('/api/login', (_req, res: any) => res.redirect('/'));
  app.get('/api/callback', (_req, res: any) => res.redirect('/'));
}

/** Middleware that rejects unauthenticated requests with 401. */
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  const userId = req.session?.localUserId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await authStorage.getUser(userId);
    if (!user) {
      req.session.localUserId = undefined;
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = {
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
      },
      expires_at: Number.MAX_SAFE_INTEGER,
    };
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }

  return next();
};

/** Register auth-specific routes (current user lookup, etc.). */
export function registerAuthRoutes(app: Express) {
  app.get('/api/auth/user', isAuthenticated, async (req: any, res: any) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Failed to fetch user' });
    }
  });
}
