import type { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';

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
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function setupSessionAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Railway terminates TLS at the edge (proxy). Needed for secure cookies.
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

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // Attach a stable anonymous user per session
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.session.userId) req.session.userId = makeId();
    req.user = { uid: req.session.userId, email: null };
    next();
  });
}
