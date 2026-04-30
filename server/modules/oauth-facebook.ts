/**
 * Facebook OAuth 2.0 (Authorization Code flow) — hand-rolled, mirrors
 * oauth-google.ts deliberately so the two flows behave identically from the
 * SPA's point of view (same redirect, same session shape, same `?oauth=<p>`
 * success param, same `?oauth_error=<code>` failure param).
 *
 * Flow:
 *   GET  /api/auth/facebook           → 302 to facebook.com/dialog/oauth with
 *                                       `state` stored in the session (CSRF).
 *   GET  /api/auth/facebook/callback  → exchange `code` with Graph, verify
 *                                       `state`, fetch `me`, upsert user,
 *                                       regenerate session as authenticated,
 *                                       redirect to `/` (`?oauth=facebook` or
 *                                       `?oauth_error=<code>`).
 *
 * Required env vars (lazily checked — missing keys return 302 →
 * `?oauth_error=oauth_not_configured` instead of crashing the boot, so dev
 * environments without Meta creds still work):
 *   FACEBOOK_APP_ID
 *   FACEBOOK_APP_SECRET
 *   OAUTH_REDIRECT_BASE   (optional — defaults to the current request origin)
 *
 * Graph API version is pinned so a future Meta release can't change field
 * shapes under us without us opting in.
 */

import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { users, oauthAccounts } from '../../shared/schema.js';
import { and, eq } from 'drizzle-orm';
import { setSessionUser } from './auth-api.js';

const FB_GRAPH_VERSION = 'v19.0';
const FB_AUTH_URL = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`;
const FB_TOKEN_URL = `https://graph.facebook.com/${FB_GRAPH_VERSION}/oauth/access_token`;
const FB_ME_URL = `https://graph.facebook.com/${FB_GRAPH_VERSION}/me`;

function redirectUri(req: Request): string {
  const envBase = process.env.OAUTH_REDIRECT_BASE?.replace(/\/$/, '');
  if (envBase) return `${envBase}/api/auth/facebook/callback`;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}/api/auth/facebook/callback`;
}

function errorRedirect(res: Response, code: string): void {
  res.redirect(302, `/?oauth_error=${encodeURIComponent(code)}`);
}

export async function startFacebook(req: Request, res: Response): Promise<void> {
  const clientId = process.env.FACEBOOK_APP_ID;
  if (!clientId) {
    errorRedirect(res, 'oauth_not_configured');
    return;
  }

  // 32 bytes of CSRF state, base64url — stored in the session until the
  // callback matches. The session cookie is httpOnly + SameSite=lax so a
  // cross-origin request can't guess or replay it.
  const state = crypto.randomBytes(32).toString('base64url');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    // `email` + `public_profile` are the only two default-granted scopes.
    // Anything else (user_posts, user_photos, user_videos, ...) needs Meta
    // App Review and lives in a follow-up import PR.
    scope: 'email,public_profile',
    state,
    auth_type: 'rerequest',
  });

  req.session.save((err) => {
    if (err) {
      console.error('[oauth/facebook] session.save(pre-redirect) failed:', err);
      errorRedirect(res, 'session_save_failed');
      return;
    }
    res.redirect(302, `${FB_AUTH_URL}?${params.toString()}`);
  });
}

interface FacebookTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
}

interface FacebookMeResponse {
  id: string;
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  picture?: {
    data?: {
      url?: string;
      is_silhouette?: boolean;
    };
  };
}

async function exchangeCodeForProfile(
  code: string,
  redirect: string,
): Promise<FacebookMeResponse> {
  const clientId = process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET;
  if (!clientId || !clientSecret) throw new Error('oauth_not_configured');

  // 1) Exchange `code` for a short-lived access token.
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    code,
  });
  // Send credentials in the POST body (not the URL) so the app secret can't
  // leak into intermediate proxy logs, APM traces, or fetch error stacks.
  // Graph's /oauth/access_token accepts both GET and POST; matches the
  // Google pattern in oauth-google.ts.
  const tokenRes = await fetch(FB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });
  const token = (await tokenRes.json()) as FacebookTokenResponse;
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error?.message || 'token_exchange_failed');
  }

  // 2) Compute appsecret_proof (HMAC-SHA256 of the access_token with the
  //    app secret as the key). Meta requires this for server-side Graph
  //    calls when "Require App Secret" is enabled; sending it unconditionally
  //    is the recommended default.
  const appsecretProof = crypto
    .createHmac('sha256', clientSecret)
    .update(token.access_token)
    .digest('hex');

  // 3) Fetch the authenticated user's profile. Ask only for fields we
  //    actually use — Graph returns everything when not constrained.
  const meParams = new URLSearchParams({
    access_token: token.access_token,
    appsecret_proof: appsecretProof,
    fields: 'id,name,email,first_name,last_name,picture.type(large)',
  });
  const meRes = await fetch(`${FB_ME_URL}?${meParams.toString()}`);
  if (!meRes.ok) {
    const detail = await meRes.text().catch(() => '');
    console.error('[oauth/facebook] /me failed:', meRes.status, detail);
    throw new Error('userinfo_failed');
  }
  return (await meRes.json()) as FacebookMeResponse;
}

async function upsertUserFromFacebook(info: FacebookMeResponse): Promise<string> {
  const providerUserId = info.id;
  if (!providerUserId) throw new Error('missing_id');

  // Require an email. Unlike Google, Facebook's Graph response does NOT
  // include an `email_verified` flag — Meta only returns the email when the
  // user granted the `email` scope AND the address is verified on their
  // Facebook account. An empty/missing email here means the user declined
  // the scope (or their FB account has no verified email), so we refuse
  // rather than linking to a pre-existing local user by an unverified
  // address.
  if (!info.email) throw new Error('oauth_missing_email');
  const email = info.email.toLowerCase();

  // 1) Is this Facebook identity already linked?
  const linked = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, 'facebook'),
        eq(oauthAccounts.providerUserId, providerUserId),
      ),
    )
    .limit(1);
  if (linked[0]) return linked[0].userId;

  // Silhouettes are Facebook's placeholder avatar — don't import them as
  // the user's profile picture, leave the slot empty so the UI falls back
  // to initials.
  const rawPicture = info.picture?.data?.url;
  const isSilhouette = info.picture?.data?.is_silhouette === true;
  const picture = !isSilhouette && rawPicture ? rawPicture : null;

  const displayName = info.name || info.first_name || email.split('@')[0] || 'User';

  // 2) Is there an existing local user with this email? Link to it — same
  //    logic as Google. Safe because Meta only returns verified emails.
  {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      await db
        .insert(oauthAccounts)
        .values({ userId: existing[0].id, provider: 'facebook', providerUserId, email })
        .run();
      const patch: Record<string, string | null> = {};
      if (!existing[0].displayName) patch.displayName = displayName;
      if (!existing[0].profileImageUrl && picture) patch.profileImageUrl = picture;
      if (!existing[0].firstName && info.first_name) patch.firstName = info.first_name;
      if (!existing[0].lastName && info.last_name) patch.lastName = info.last_name;
      if (Object.keys(patch).length > 0) {
        await db.update(users).set(patch).where(eq(users.id, existing[0].id)).run();
      }
      return existing[0].id;
    }
  }

  // 3) No existing row — create fresh user + linkage in one transaction.
  const userId = db.transaction((tx) => {
    const inserted = tx
      .insert(users)
      .values({
        email,
        firstName: info.first_name ?? null,
        lastName: info.last_name ?? null,
        displayName,
        profileImageUrl: picture ?? undefined,
      })
      .returning()
      .all();
    const row = inserted[0];
    if (!row) throw new Error('users.insert returned no row');
    tx.insert(oauthAccounts)
      .values({ userId: row.id, provider: 'facebook', providerUserId, email })
      .run();
    return row.id;
  });

  return userId;
}

export async function facebookCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error, error_reason } = req.query as {
    code?: string;
    state?: string;
    error?: string;
    error_reason?: string;
  };

  if (error) {
    // `error_reason=user_denied` covers the "user clicked Cancel" path;
    // other codes (`access_denied`, etc.) are surfaced verbatim.
    errorRedirect(res, `facebook_${error_reason || error}`);
    return;
  }

  const expectedState = req.session.oauthState;
  req.session.oauthState = undefined;

  if (!expectedState || !state || state !== expectedState) {
    errorRedirect(res, 'oauth_state_mismatch');
    return;
  }
  if (!code) {
    errorRedirect(res, 'oauth_missing_code');
    return;
  }

  let profile: FacebookMeResponse;
  try {
    profile = await exchangeCodeForProfile(code, redirectUri(req));
  } catch (err) {
    console.error('[oauth/facebook] token/userinfo exchange failed:', err);
    errorRedirect(res, 'oauth_exchange_failed');
    return;
  }

  let userId: string;
  try {
    userId = await upsertUserFromFacebook(profile);
  } catch (err) {
    console.error('[oauth/facebook] upsert failed:', err);
    const msg = err instanceof Error ? err.message : '';
    errorRedirect(res, msg === 'oauth_missing_email' ? 'oauth_missing_email' : 'oauth_user_upsert_failed');
    return;
  }

  try {
    await setSessionUser(req, userId);
  } catch (err) {
    console.error('[oauth/facebook] session.regenerate failed:', err);
    errorRedirect(res, 'oauth_session_failed');
    return;
  }

  res.redirect(302, '/?oauth=facebook');
}
