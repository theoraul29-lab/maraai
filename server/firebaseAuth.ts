import type { Request, Response, NextFunction } from 'express';

// Lazily initialized Firebase Admin auth instance
let _auth: any = null;

async function getAdminAuth(): Promise<any> {
	if (_auth) return _auth;
	try {
		const admin = (await import('firebase-admin')).default;
		if (!admin.apps.length) {
			admin.initializeApp({
				projectId:
					process.env.FIREBASE_PROJECT_ID ||
					process.env.GOOGLE_CLOUD_PROJECT ||
					undefined,
			});
		}
		_auth = admin.auth();
	} catch (err) {
		console.warn(
			'[firebaseAuth] Firebase Admin SDK unavailable. Continuing without Firebase auth.',
			err instanceof Error ? err.message : err,
		);
	}
	return _auth;
}

// Validates Firebase Bearer token if present, sets req.user.
// Anonymous requests (no Authorization header) pass through silently.
export const firebaseAuthMiddleware = async (
	req: Request & { user?: any },
	_res: Response,
	next: NextFunction,
): Promise<void> => {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith('Bearer ')) {
		return next();
	}

	const token = authHeader.slice(7);
	try {
		const auth = await getAdminAuth();
		if (auth) {
			const decoded = await auth.verifyIdToken(token);
			req.user = {
				uid: decoded.uid,
				email: decoded.email || null,
				claims: { sub: decoded.uid, email: decoded.email },
			};
		}
	} catch (err) {
		// Invalid or expired token — treat as anonymous, do not block.
		console.warn(
			'[firebaseAuth] Token verification failed:',
			err instanceof Error ? err.message : err,
		);
	}
	return next();
};
