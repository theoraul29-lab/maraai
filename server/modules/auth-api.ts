/**
 * Email + password authentication endpoints (local auth mode).
 *
 * Backs the existing frontend `AuthContext` / `AuthModal`:
 *   POST /api/auth/signup         -> create user + credentials, set session
 *   POST /api/auth/login          -> verify credentials, set session
 *   POST /api/auth/logout         -> clear session, re-assign anonymous id
 *   GET  /api/auth/me             -> current user (null when anonymous)
 *   POST /api/auth/oauth/:provider -> 501 placeholder (wire real OAuth later)
 *   POST /api/auth/request-reset  -> send password-reset email (or log token in dev)
 *   POST /api/auth/confirm-reset  -> consume token + set new password
 *
 * Session cookie is already configured by `setupSessionAuth`. We only update
 * `req.session.userId` so that all downstream code (chat, subscriptions, etc.)
 * sees a stable, real user id.
 */

import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { users, localAuthCredentials, passwordResetTokens, userPreferences } from '../../shared/schema.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email.js';
import { eq, sql, and, gt } from 'drizzle-orm';
import { z } from 'zod';

// 8 rounds gives ~25-50ms hash on commodity Railway CPUs while still being
// well within the OWASP-recommended bcrypt cost. 10 rounds was burning
// ~200-500ms of event-loop time per signup with bcryptjs (pure JS), which
// is enough to cause cascading hangs when paired with a contended SQLite
// write lock on a slow volume.
const BCRYPT_ROUNDS = 8;

// Pre-computed bcrypt hash (of a random throwaway string) used only to
// equalise response timing in `login()` when the email does not exist, so
// attackers can't enumerate registered emails via timing side-channels.
// MUST stay at the same cost factor as BCRYPT_ROUNDS — bcrypt.compare reads
// the cost from the stored hash, so a mismatch reintroduces a timing
// side-channel between "email not found" and "wrong password".
const DUMMY_BCRYPT_HASH = '$2a$08$1Mfpb6XDnx22Ot53i699SuCNeo7xZFZhXBDpLgKqFhSsvzeRG5gHK';

const emailSchema = z.string().trim().email().max(320);
// Spec: password min length ≥ 6. We accept anything from 6 to 200 chars.
const passwordSchema = z.string().min(6).max(200);
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
  trialStartTime?: number | null;
  trialEndsAt?: number | null;
  avatar?: string | null;
  bio?: string | null;
  preferredLanguage?: string | null;
}

function toPayload(u: { id: string; email: string | null; displayName: string | null; firstName: string | null; bio: string | null; profileImageUrl: string | null; createdAt: Date | null | number | undefined; tier?: string | null; trialStartTime?: number | null; trialEndsAt?: number | null }): AuthUserPayload {
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
    tier: (u.tier as AuthUserPayload['tier']) || 'free',
    trialStartTime: u.trialStartTime ?? null,
    trialEndsAt: u.trialEndsAt ?? null,
    badges: [],
    earnings: 0,
    createdAt: createdAtMs,
    avatar: u.profileImageUrl,
    bio: u.bio,
    preferredLanguage: u.preferredLanguage ?? null,
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
 * Look up the user's stored language preference (BCP-47 code) from the
 * `user_preferences` table, or null if none has been written yet.
 *
 * Used to enrich the `/api/auth/me` / signup / login response so the
 * client can sync i18n state in a single round-trip after login (server
 * value wins over localStorage, per spec §2.5).
 *
 * Failures are swallowed and logged: missing/old preferences should
 * never block a session.
 */
async function fetchUserLanguage(userId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ language: userPreferences.language })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return rows[0]?.language ?? null;
  } catch (err) {
    console.warn('[auth] fetchUserLanguage failed:', err);
    return null;
  }
}

/**
 * Regenerate the session ID and attach the authenticated user id.
 *
 * Regenerating the id on login/signup prevents session fixation: the
 * anonymous session id the browser was using (assigned by
 * `setupSessionAuth`) is thrown away, and the authenticated state is
 * bound to a fresh, unpredictable id.
 */
export function setSessionUser(req: Request, userId: string): Promise<void> {
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

async function signupHandler(req: Request, res: Response) {
  const t0 = Date.now();
  const parsed = signupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'signup_body_invalid', 'Email, password (min 6 chars) and name are required.');
  }

  const email = parsed.data.email.toLowerCase();
  const { password, name } = parsed.data;
  // Intentionally do NOT log `email` — that's PII under GDPR and the
  // log line would otherwise end up in Railway's stdout aggregator. The
  // user.id from post-tx is the safe correlator across signup phases.
  console.log('[auth] signup begin', { t: 0 });

  // Defence in depth: check both the users table and the credentials table.
  // A match in either means this email is unusable for a new signup (possibly
  // from a prior partial insert or a future OAuth-only user record).
  const [existingCreds, existingUser] = await Promise.all([
    findCredentialsByEmail(email),
    findUserByEmail(email),
  ]);
  console.log('[auth] signup post-existence-check', { ms: Date.now() - t0 });
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
  console.log('[auth] signup post-bcrypt', { ms: Date.now() - t0 });

  // Wrap both inserts in a single transaction so we never end up with an
  // orphaned `users` row if the `local_auth_credentials` insert fails. Drizzle
  // on better-sqlite3 exposes a synchronous transaction helper that rolls back
  // on any thrown error inside the callback.
  const trialStartTime = Date.now();
  const trialEndsAt = trialStartTime + 60 * 60 * 1000; // 1 hour trial
  let user: typeof users.$inferSelect;
  try {
    user = db.transaction((tx) => {
      const inserted = tx
        .insert(users)
        .values({
          email,
          firstName: name,
          displayName: name,
          tier: 'trial',
          trialStartTime,
          trialEndsAt,
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

  console.log('[auth] signup post-tx', { ms: Date.now() - t0, userId: user.id });

  try {
    await setSessionUser(req, user.id);
  } catch (err) {
    console.error('[auth] session.regenerate failed after signup:', err);
    return authError(res, 500, 'session_create_failed', 'Failed to create session. Please try again.');
  }
  console.log('[auth] signup done', { ms: Date.now() - t0, userId: user.id });
  void sendWelcomeEmail(email, name).catch((err) =>
    console.error('[auth] sendWelcomeEmail failed:', err),
  );
  // Brand-new user has no language preference yet; return null so the
  // client falls back to localStorage / browser-detected language.
  return res.status(201).json(toPayload({ ...user, preferredLanguage: null }));
}

async function loginHandler(req: Request, res: Response) {
  const t0 = Date.now();
  console.log('[auth] login begin', { t: 0 });
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    console.log('[auth] login body-invalid', { ms: Date.now() - t0 });
    return flashBadRequest(res, 'login_body_invalid', 'Email and password are required.');
  }

  const email = parsed.data.email.toLowerCase();
  const { password } = parsed.data;

  const creds = await findCredentialsByEmail(email);
  console.log('[auth] login post-creds-lookup', { ms: Date.now() - t0, found: Boolean(creds) });
  if (!creds) {
    // Uniform error message AND matching latency: run a dummy bcrypt.compare
    // so the "user not found" path takes the same ~100ms as a real compare.
    // Without this, an attacker could enumerate valid emails via timing.
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => false);
    console.log('[auth] login invalid-credentials (no user)', { ms: Date.now() - t0 });
    return authError(res, 401, 'invalid_credentials', 'Invalid email or password.');
  }

  const ok = await bcrypt.compare(password, creds.passwordHash);
  console.log('[auth] login post-bcrypt', { ms: Date.now() - t0, ok });
  if (!ok) {
    return authError(res, 401, 'invalid_credentials', 'Invalid email or password.');
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, creds.userId))
    .limit(1);
  if (!user[0]) {
    console.error('[auth] login user_missing — credentials row points to deleted user', { userId: creds.userId });
    return authError(res, 500, 'user_missing', 'User record missing.');
  }

  try {
    await setSessionUser(req, user[0].id);
  } catch (err) {
    console.error('[auth] session.regenerate failed after login:', err);
    return authError(res, 500, 'session_create_failed', 'Failed to create session. Please try again.');
  }
  console.log('[auth] login post-session', { ms: Date.now() - t0, userId: user[0].id });
  const language = await fetchUserLanguage(user[0].id);
  console.log('[auth] login done', { ms: Date.now() - t0, userId: user[0].id });
  return res.status(200).json(toPayload({ ...user[0], preferredLanguage: language }));
}

async function logoutHandler(req: Request, res: Response) {
  const t0 = Date.now();
  const previousUid = req.session?.userId;
  console.log('[auth] logout begin', {
    t: 0,
    uid: previousUid ? `${String(previousUid).slice(0, 8)}…` : 'anon',
  });
  req.session.destroy((err) => {
    if (err) {
      // Session destroy failure shouldn't block the client — just warn.
      // The client clears local state anyway.
      console.error('[auth] logout failed', { ms: Date.now() - t0, err });
      return authError(res, 500, 'logout_failed', 'Logout failed.');
    }
    res.clearCookie('connect.sid');
    console.log('[auth] logout done', { ms: Date.now() - t0 });
    return res.status(200).json({ ok: true });
  });
}

async function meHandler(req: Request, res: Response) {
  const t0 = Date.now();
  const uid = req.session?.userId;
  if (!uid) {
    console.log('[auth] me anon (no session userId)', { ms: Date.now() - t0 });
    return res.status(200).json({ user: null });
  }

  const row = await db
    .select()
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);
  console.log('[auth] me post-users-lookup', {
    ms: Date.now() - t0,
    uidPrefix: String(uid).slice(0, 8),
    found: Boolean(row[0]),
  });

  if (!row[0] || !row[0].email) {
    // Anonymous session id (not a real registered user).
    console.log('[auth] me anon (id is anonymous)', { ms: Date.now() - t0 });
    return res.status(200).json({ user: null, anonymousId: uid });
  }

  const language = await fetchUserLanguage(row[0].id);
  console.log('[auth] me done', { ms: Date.now() - t0, userId: row[0].id });
  return res.status(200).json({ user: toPayload({ ...row[0], preferredLanguage: language }) });
}

async function oauthHandler(req: Request, res: Response) {
  const provider = String(req.params.provider || '').toLowerCase();
  if (provider !== 'google') {
    return authError(res, 400, 'oauth_unsupported', 'Unsupported OAuth provider.');
  }
  // Real OAuth wiring (Google/Facebook app + callback) tracked separately.
  return authError(res, 501, 'oauth_not_enabled', `OAuth (${provider}) not yet enabled. Use email + password for now.`, { provider });
}

const requestResetSchema = z.object({ email: emailSchema });
const confirmResetSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});

/**
 * POST /api/auth/request-reset
 * Generates a one-time token for the given email. In production, send this
 * token via email (see TODO below). In dev, the token is included in the
 * response so it can be used directly without email infrastructure.
 */
export async function requestReset(req: Request, res: Response) {
  const parsed = requestResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'signup_body_invalid', 'A valid email address is required.');
  }

  const email = parsed.data.email.toLowerCase();

  // Always respond with 200 to avoid email enumeration
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return res.status(200).json({ ok: true });
  }

  // Invalidate any existing unexpired tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    // Dev mode: surface the token so it can be used without email infrastructure.
    console.log(`[auth] password-reset token for ${email}: ${token}`);
    return res.status(200).json({ ok: true, devToken: token });
  }

  await sendPasswordResetEmail(email, token).catch((err) =>
    console.error('[auth] sendPasswordResetEmail failed:', err),
  );
  return res.status(200).json({ ok: true });
}

/**
 * POST /api/auth/confirm-reset
 * Validates the token and updates the password.
 */
export async function confirmReset(req: Request, res: Response) {
  const parsed = confirmResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'login_body_invalid', 'Token and a new password (min 8 chars) are required.');
  }

  const { token, password } = parsed.data;
  const now = new Date();

  const [tokenRow] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!tokenRow || tokenRow.usedAt) {
    return authError(res, 400, 'login_body_invalid', 'Invalid or expired password reset token.');
  }

  const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Mark token as used and update password in a single transaction
  db.transaction((tx) => {
    tx.update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, tokenRow.id))
      .run();
    tx.update(localAuthCredentials)
      .set({ passwordHash: newHash })
      .where(eq(localAuthCredentials.userId, tokenRow.userId))
      .run();
  });

  return res.status(200).json({ ok: true });
}

// Touch sql/and/gt to avoid unused-import tree-shake complaint on strict tsc configs.
void sql; void and; void gt;

/**
 * Thin async error-catcher so Express 4 (which doesn't handle async
 * route errors natively) doesn't silently swallow rejections. The
 * individual handlers already catch expected errors and send responses;
 * this is purely the last-resort safety net for *unexpected* failures.
 */
function wrapAsync(
  phase: string,
  handler: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error(`[auth] ${phase} unhandled error:`, err);
      if (!res.headersSent) {
        res.status(500).json({
          code: 'internal_error',
          message: 'An unexpected error occurred. Please try again.',
        });
      }
    });
  };
}

export const signup = wrapAsync('signup', signupHandler);
export const login = wrapAsync('login', loginHandler);
export const logout = wrapAsync('logout', logoutHandler);
export const me = wrapAsync('me', meHandler);
export const oauth = wrapAsync('oauth', oauthHandler);
