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

  // Attach a stable anonymous user per session
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.session.userId) req.session.userId = makeId();
    req.user = { uid: req.session.userId, email: null };
    next();
  });
}
