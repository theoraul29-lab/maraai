import type { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { randomBytes } from 'crypto';

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
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
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
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

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

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
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
