import type { Express, Request } from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import { randomBytes, randomUUID } from 'crypto';

declare module 'express-session' {
	interface SessionData {
		uid?: string;
	}
}

export function setupSessionAuth(app: Express): void {
	const isProduction = process.env.NODE_ENV === 'production';

	if (isProduction) {
		app.set('trust proxy', 1);
	}

	const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
	if (!process.env.SESSION_SECRET) {
		if (isProduction) {
			throw new Error('SESSION_SECRET must be set in production');
		} else {
			console.warn('[auth] SESSION_SECRET not set — sessions will be invalidated on every restart. Set SESSION_SECRET for stable dev sessions.');
		}
	}

	const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
	const SqliteStore = connectSqlite3(session);

	app.use(
		session({
			secret: sessionSecret,
			store: new SqliteStore({
				db:
					process.env.DATABASE_URL?.replace(/^sqlite:\/\/\//, '') ||
					'maraai.sqlite',
				table: 'sessions',
				ttl: sessionTtl / 1000,
			}),
			resave: false,
			saveUninitialized: false,
			cookie: {
				httpOnly: true,
				secure: isProduction,
				sameSite: 'lax',
				maxAge: sessionTtl,
			},
		}),
	);

	// Assign a stable anonymous uid to every session.
	app.use((req: Request & { user?: any }, _res, next) => {
		if (!req.session.uid) {
			req.session.uid = randomUUID();
		}
		req.user = { uid: req.session.uid };
		next();
	});

	// Minimal auth endpoint
	app.get('/api/auth/me', (req: Request & { user?: any }, res) => {
		res.json({ uid: req.user?.uid ?? null });
	});

	app.get('/api/auth/mode', (_req, res) => {
		res.json({ mode: 'session' });
	});
}
