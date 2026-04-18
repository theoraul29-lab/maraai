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

function setSessionUser(req: Request, userId: string) {
  req.session.userId = userId;
}

function flashBadRequest(res: Response, message: string) {
  return res.status(400).json({ message });
}

export async function signup(req: Request, res: Response) {
  const parsed = signupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'Email, password (min 8 chars) and name are required.');
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
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  } catch (err) {
    // bcrypt rarely fails, but we mustn't leak the error and hang the request.
    console.error('[auth] bcrypt.hash failed:', err);
    return res.status(500).json({ message: 'Failed to create account. Please try again.' });
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
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to create account. Please try again.' });
  }

  setSessionUser(req, user.id);
  return res.status(201).json(toPayload(user));
}

export async function login(req: Request, res: Response) {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return flashBadRequest(res, 'Email and password are required.');
  }

  const email = parsed.data.email.toLowerCase();
  const { password } = parsed.data;

  const creds = await findCredentialsByEmail(email);
  if (!creds) {
    // Uniform error message so we don't leak which emails exist.
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const ok = await bcrypt.compare(password, creds.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, creds.userId))
    .limit(1);
  if (!user[0]) {
    return res.status(500).json({ message: 'User record missing.' });
  }

  setSessionUser(req, user[0].id);
  return res.status(200).json(toPayload(user[0]));
}

export async function logout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) {
      // Session destroy failure shouldn't block the client — just warn.
      // The client clears local state anyway.
      return res.status(500).json({ message: 'Logout failed.' });
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
    return res.status(400).json({ message: 'Unsupported OAuth provider.' });
  }
  // Real OAuth wiring (Google/Facebook app + callback) tracked separately.
  return res.status(501).json({
    message: `OAuth (${provider}) not yet enabled. Use email + password for now.`,
  });
}

// Touch sql to avoid unused-import tree-shake complaint on strict tsc configs.
void sql;
