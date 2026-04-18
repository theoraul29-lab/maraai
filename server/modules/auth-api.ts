/**
 * Email + password authentication endpoints (local auth mode).
 *
 * Backs the existing frontend `AuthContext` / `AuthModal`:
 *   POST /api/auth/signup      -> create user + credentials, set session
 *   POST /api/auth/login       -> verify credentials, set session
 *   POST /api/auth/logout      -> clear session, re-assign anonymous id
 *   GET  /api/auth/me          -> current user (null when anonymous)
 *   POST /api/auth/oauth/:provider -> 501 placeholder (wire real OAuth later)
 *
 * Session cookie is already configured by `setupSessionAuth`. We only update
 * `req.session.userId` so that all downstream code (chat, subscriptions, etc.)
 * sees a stable, real user id.
 */

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { users, localAuthCredentials } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const BCRYPT_ROUNDS = 10;

// Pre-computed bcrypt hash (of a random throwaway string) used only to
// equalise response timing in `login()` when the email does not exist, so
// attackers can't enumerate registered emails via timing side-channels.
const DUMMY_BCRYPT_HASH = '$2a$10$zvolThg7zhnrni8khQnWXOaqChfBo1KU6L3uBzYFN0kr4VkDrbmJ.';

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(200);
const nameSchema = z.string().trim().min(1).max(120);

const signupBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

const loginBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  tier: 'free' | 'trial' | 'premium' | 'vip';
  badges: string[];
  earnings: number;
  createdAt: number;
  avatar?: string | null;
  bio?: string | null;
}

function toPayload(u: { id: string; email: string | null; displayName: string | null; firstName: string | null; bio: string | null; profileImageUrl: string | null; createdAt: Date | null | number | undefined }): AuthUserPayload {
  const displayName = u.displayName || u.firstName || (u.email ? u.email.split('@')[0] : 'User');
  const createdAtMs = u.createdAt instanceof Date
    ? u.createdAt.getTime()
    : typeof u.createdAt === 'number'
      ? u.createdAt
      : Date.now();
  return {
    id: u.id,
    email: u.email ?? '',
    name: displayName,
    tier: 'free',
    badges: [],
    earnings: 0,
    createdAt: createdAtMs,
    avatar: u.profileImageUrl,
    bio: u.bio,
  };
}

async function findUserByEmail(email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

async function findCredentialsByEmail(email: string) {
  const rows = await db
    .select()
    .from(localAuthCredentials)
    .where(eq(localAuthCredentials.email, email))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Regenerate the session ID and attach the authenticated user id.
 *
 * Regenerating the id on login/signup prevents session fixation: the
 * anonymous session id the browser was using (assigned by
 * `setupSessionAuth`) is thrown away, and the authenticated state is
 * bound to a fresh, unpredictable id.
 */
function setSessionUser(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve();
      });
    });
  });
}

/**
 * Stable machine-readable error codes returned alongside human-readable
 * English fallback messages. Frontend maps `code` to i18n keys (see
 * `frontend/src/i18n/locales/*.json -> auth.errors.<code>`), so adding a
 * new code here requires adding a matching translation entry.
 */
export type AuthErrorCode =
  | 'signup_body_invalid'
  | 'login_body_invalid'
  | 'email_exists'
  | 'invalid_credentials'
  | 'account_create_failed'
  | 'session_create_failed'
  | 'user_missing'
  | 'logout_failed'
  | 'oauth_unsupported'
  | 'oauth_not_enabled';

function authError(res: Response, status: number, code: AuthErrorCode, message: string, extra?: Record<string, unknown>) {
  return res.status(status).json({ code, message, ...extra });
}

function flashBadRequest(res: Response, code: AuthErrorCode, message: string) {
  return authError(res, 400, code, message);
}

export async function signup(req: Request, res: Response) {
  const parsed = signupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'signup_body_invalid', 'Email, password (min 8 chars) and name are required.');
  }

  const email = parsed.data.email.toLowerCase();
  const { password, name } = parsed.data;

  // Defence in depth: check both the users table and the credentials table.
  // A match in either means this email is unusable for a new signup (possibly
  // from a prior partial insert or a future OAuth-only user record).
  const [existingCreds, existingUser] = await Promise.all([
    findCredentialsByEmail(email),
    findUserByEmail(email),
  ]);
  if (existingCreds || existingUser) {
    return authError(res, 409, 'email_exists', 'An account with this email already exists.');
  }

  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  } catch (err) {
    // bcrypt rarely fails, but we mustn't leak the error and hang the request.
    console.error('[auth] bcrypt.hash failed:', err);
    return authError(res, 500, 'account_create_failed', 'Failed to create account. Please try again.');
  }

  // Wrap both inserts in a single transaction so we never end up with an
  // orphaned `users` row if the `local_auth_credentials` insert fails. Drizzle
  // on better-sqlite3 exposes a synchronous transaction helper that rolls back
  // on any thrown error inside the callback.
  let user: typeof users.$inferSelect;
  try {
    user = db.transaction((tx) => {
      const inserted = tx
        .insert(users)
        .values({
          email,
          firstName: name,
          displayName: name,
        })
        .returning()
        .all();
      const row = inserted[0];
      if (!row) {
        throw new Error('users.insert returned no row');
      }
      tx.insert(localAuthCredentials)
        .values({
          userId: row.id,
          email,
          passwordHash,
        })
        .run();
      return row;
    });
  } catch (err) {
    // UNIQUE constraint race (another signup completed between our check and
    // this insert) or any other DB failure — do not leak error details.
    console.error('[auth] signup transaction failed:', err);
    const msg = String((err as Error)?.message || '');
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return authError(res, 409, 'email_exists', 'An account with this email already exists.');
    }
    return authError(res, 500, 'account_create_failed', 'Failed to create account. Please try again.');
  }

  try {
    await setSessionUser(req, user.id);
  } catch (err) {
    console.error('[auth] session.regenerate failed after signup:', err);
    return authError(res, 500, 'session_create_failed', 'Failed to create session. Please try again.');
  }
  return res.status(201).json(toPayload(user));
}

export async function login(req: Request, res: Response) {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'login_body_invalid', 'Email and password are required.');
  }

  const email = parsed.data.email.toLowerCase();
  const { password } = parsed.data;

  const creds = await findCredentialsByEmail(email);
  if (!creds) {
    // Uniform error message AND matching latency: run a dummy bcrypt.compare
    // so the "user not found" path takes the same ~100ms as a real compare.
    // Without this, an attacker could enumerate valid emails via timing.
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => false);
    return authError(res, 401, 'invalid_credentials', 'Invalid email or password.');
  }

  const ok = await bcrypt.compare(password, creds.passwordHash);
  if (!ok) {
    return authError(res, 401, 'invalid_credentials', 'Invalid email or password.');
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, creds.userId))
    .limit(1);
  if (!user[0]) {
    return authError(res, 500, 'user_missing', 'User record missing.');
  }

  try {
    await setSessionUser(req, user[0].id);
  } catch (err) {
    console.error('[auth] session.regenerate failed after login:', err);
    return authError(res, 500, 'session_create_failed', 'Failed to create session. Please try again.');
  }
  return res.status(200).json(toPayload(user[0]));
}

export async function logout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) {
      // Session destroy failure shouldn't block the client — just warn.
      // The client clears local state anyway.
      return authError(res, 500, 'logout_failed', 'Logout failed.');
    }
    res.clearCookie('connect.sid');
    return res.status(200).json({ ok: true });
  });
}

export async function me(req: Request, res: Response) {
  const uid = req.session?.userId;
  if (!uid) {
    return res.status(200).json({ user: null });
  }

  const row = await db
    .select()
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);

  if (!row[0] || !row[0].email) {
    // Anonymous session id (not a real registered user).
    return res.status(200).json({ user: null, anonymousId: uid });
  }

  return res.status(200).json({ user: toPayload(row[0]) });
}

export async function oauth(req: Request, res: Response) {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!['google', 'facebook'].includes(provider)) {
    return authError(res, 400, 'oauth_unsupported', 'Unsupported OAuth provider.');
  }
  // Real OAuth wiring (Google/Facebook app + callback) tracked separately.
  return authError(res, 501, 'oauth_not_enabled', `OAuth (${provider}) not yet enabled. Use email + password for now.`, { provider });
}

// Touch sql to avoid unused-import tree-shake complaint on strict tsc configs.
void sql;
