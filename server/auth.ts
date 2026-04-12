import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

interface JwtPayload {
	uid: string;
	email?: string;
	iat?: number;
	exp?: number;
}

// Minimal HMAC-SHA256 JWT implementation — no external dependency needed.
function base64UrlEncode(data: string | Buffer): string {
	const buf = typeof data === 'string' ? Buffer.from(data) : data;
	return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
	return Buffer.from(str, 'base64url').toString();
}

export function signJwt(payload: JwtPayload, expiresInSeconds = 86400): string {
	const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const now = Math.floor(Date.now() / 1000);
	const body = base64UrlEncode(
		JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }),
	);
	const signature = base64UrlEncode(
		crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest(),
	);
	return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;

	const [header, body, signature] = parts;
	const expected = base64UrlEncode(
		crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest(),
	);
	if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
		return null;
	}

	try {
		const payload: JwtPayload = JSON.parse(base64UrlDecode(body));
		if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
			return null; // expired
		}
		return payload;
	} catch {
		return null;
	}
}

// Validates JWT Bearer token if present, sets req.user.
// Anonymous requests (no Authorization header) pass through silently.
export const authMiddleware = async (
	req: Request & { user?: any },
	_res: Response,
	next: NextFunction,
): Promise<void> => {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith('Bearer ')) {
		return next();
	}

	const token = authHeader.slice(7);
	const decoded = verifyJwt(token);
	if (decoded) {
		req.user = {
			uid: decoded.uid,
			email: decoded.email || null,
			claims: { sub: decoded.uid, email: decoded.email },
		};
	} else {
		console.warn('[auth] Token verification failed');
	}
	return next();
};
