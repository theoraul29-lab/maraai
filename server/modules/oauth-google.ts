/**
 * Google OAuth 2.0 (Authorization Code flow) — hand-rolled, no passport dep.
 *
 * Why not passport-google-oauth20?
 *   The rest of the app already has its own session layer (setupSessionAuth)
 *   plus a stable `setSessionUser(req, userId)` contract that we reuse from
 *   `auth-api.ts`. Adding passport + a strategy + serializers on top of that
 *   is strictly more moving parts than this single file. A Google login is
 *   just: redirect, verify `state`, exchange `code` for an ID token, read
 *   `sub`/`email`/`name`/`picture`, upsert the user, and bind the session.
 *
 * Flow:
 *   GET  /api/auth/google           → 302 to accounts.google.com with `state`
 *                                     stored in the session (CSRF protection)
 *   GET  /api/auth/google/callback  → exchange `code` with Google, verify
 *                                     `state`, find-or-create user, regenerate
 *                                     the session as authenticated, redirect
 *                                     back to `/` (or `?oauth_error=<code>`).
 *
 * Required env vars (only checked lazily — missing keys return 503 instead
 * of crashing the boot, so dev environments without OAuth still work):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   OAUTH_REDIRECT_BASE   (optional — defaults to the current request origin)
 */

import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { users, oauthAccounts } from '../../shared/schema.js';
import { and, eq } from 'drizzle-orm';

declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
  }
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function redirectUri(req: Request): string {
  const envBase = process.env.OAUTH_REDIRECT_BASE?.replace(/\/$/, '');
  if (envBase) return `${envBase}/api/auth/google/callback`;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}/api/auth/google/callback`;
}

function errorRedirect(res: Response, code: string): void {
  res.redirect(302, `/?oauth_error=${encodeURIComponent(code)}`);
}

/**
 * Mirror of `setSessionUser` in `auth-api.ts` — duplicated here (instead of
 * exported) so the two modules stay independent, but kept behaviour-identical
 * (session.regenerate prevents session fixation).
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

export async function startGoogle(req: Request, res: Response): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    errorRedirect(res, 'oauth_not_configured');
    return;
  }

  // 32 bytes of CSRF state, base64url — stored in the session until the
  // callback matches it. The session cookie is httpOnly + SameSite=lax so a
  // cross-origin request cannot guess or replay it.
  const state = crypto.randomBytes(32).toString('base64url');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  // Save the session synchronously so the `state` is persisted before we
  // hand control to Google. Without this there's a tiny window where the
  // callback could land before the state write commits.
  req.session.save((err) => {
    if (err) {
      console.error('[oauth/google] session.save(pre-redirect) failed:', err);
      errorRedirect(res, 'session_save_failed');
      return;
    }
    res.redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
  });
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

async function exchangeCodeForUserInfo(
  code: string,
  redirect: string,
): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('oauth_not_configured');

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const token = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error || 'token_exchange_failed');
  }

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) throw new Error('userinfo_failed');
  return (await profileRes.json()) as GoogleUserInfo;
}

async function upsertUserFromGoogle(info: GoogleUserInfo): Promise<string> {
  const providerUserId = info.sub;
  if (!providerUserId) throw new Error('missing_sub');

  // Require a verified email. Two reasons:
  //   (a) /api/auth/me treats any user row with email=NULL as "anonymous" and
  //       the frontend will never surface them. Creating an OAuth user without
  //       email would silently strand them in a half-authenticated state.
  //   (b) Linking to an existing local row by email is only safe when Google
  //       has itself verified the user controls that address — otherwise a
  //       malicious Google account with a spoofed email claim could take over
  //       a pre-existing email+password account.
  // We request the `email` scope so Google returns both fields on any normal
  // consent. Missing/unverified email falls through to explicit errors.
  if (!info.email) throw new Error('oauth_missing_email');
  if (info.email_verified === false) throw new Error('oauth_email_not_verified');
  const email = info.email.toLowerCase();

  // 1) Is this Google account already linked?
  const linked = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, 'google'),
        eq(oauthAccounts.providerUserId, providerUserId),
      ),
    )
    .limit(1);
  if (linked[0]) return linked[0].userId;

  const displayName = info.name || info.given_name || email.split('@')[0] || 'User';
  const picture = info.picture || null;

  // 2) Is there an existing local user with this email? Link to it so users
  //    who previously signed up with email + password don't get duplicated
  //    when they click "Continue with Google" later. Safe because we already
  //    required email_verified above.
  {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      await db
        .insert(oauthAccounts)
        .values({ userId: existing[0].id, provider: 'google', providerUserId, email })
        .run();
      // Backfill missing profile fields (don't overwrite anything the user
      // may have set manually).
      const patch: Record<string, string | null> = {};
      if (!existing[0].displayName) patch.displayName = displayName;
      if (!existing[0].profileImageUrl && picture) patch.profileImageUrl = picture;
      if (!existing[0].firstName && info.given_name) patch.firstName = info.given_name;
      if (Object.keys(patch).length > 0) {
        await db.update(users).set(patch).where(eq(users.id, existing[0].id)).run();
      }
      return existing[0].id;
    }
  }

  // 3) No existing row — create a fresh user + linkage in one transaction.
  const userId = db.transaction((tx) => {
    const inserted = tx
      .insert(users)
      .values({
        email,
        firstName: info.given_name ?? null,
        lastName: info.family_name ?? null,
        displayName,
        profileImageUrl: picture ?? undefined,
      })
      .returning()
      .all();
    const row = inserted[0];
    if (!row) throw new Error('users.insert returned no row');
    tx.insert(oauthAccounts)
      .values({ userId: row.id, provider: 'google', providerUserId, email })
      .run();
    return row.id;
  });

  return userId;
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (error) {
    // The user pressed "Cancel" or Google rejected the app — carry the code
    // through so the UI can surface the specific provider error.
    errorRedirect(res, `google_${error}`);
    return;
  }

  const expectedState = req.session.oauthState;
  // Always clear the one-shot state, even if verification fails, so an
  // attacker can't retry with a leaked `state` value.
  req.session.oauthState = undefined;

  if (!expectedState || !state || state !== expectedState) {
    errorRedirect(res, 'oauth_state_mismatch');
    return;
  }
  if (!code) {
    errorRedirect(res, 'oauth_missing_code');
    return;
  }

  let userInfo: GoogleUserInfo;
  try {
    userInfo = await exchangeCodeForUserInfo(code, redirectUri(req));
  } catch (err) {
    console.error('[oauth/google] token/userinfo exchange failed:', err);
    errorRedirect(res, 'oauth_exchange_failed');
    return;
  }

  let userId: string;
  try {
    userId = await upsertUserFromGoogle(userInfo);
  } catch (err) {
    console.error('[oauth/google] upsert failed:', err);
    errorRedirect(res, 'oauth_user_upsert_failed');
    return;
  }

  try {
    await setSessionUser(req, userId);
  } catch (err) {
    console.error('[oauth/google] session.regenerate failed:', err);
    errorRedirect(res, 'oauth_session_failed');
    return;
  }

  // Success — redirect to the SPA root; the AuthContext's `/api/auth/me`
  // fetch on mount picks up the new session and promotes the UI.
  res.redirect(302, '/?oauth=google');
}
