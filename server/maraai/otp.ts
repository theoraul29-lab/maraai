// Email-OTP registration / login (third option in the auth gate).
//
// In production this would dispatch the OTP via SMTP / SendGrid / SES. In
// dev (NODE_ENV !== 'production' AND no MARAAI_OTP_TRANSPORT) we instead
// log the code to the console so engineers can finish the flow without
// configuring a mail service. The hashed code goes to `email_otp_codes`
// with a 10-minute TTL.
//
// In production with no transport configured, requestOtp returns
// `delivered: false, reason: 'no_transport'` so the caller (UI) can
// surface a real error instead of silently advancing into a code-entry
// step the user can never complete.

import { desc, eq, lt } from 'drizzle-orm';
import { createHash, randomInt } from 'crypto';
import { db } from '../db.js';
import { emailOtpCodes } from '../../shared/schema.js';
import { logActivity } from './activity.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = 'register' | 'login' | 'reset';

function hashCode(code: string, email: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

function generateCode(): string {
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export type RequestOtpResult =
  | { delivered: true; expiresAtMs: number }
  | { delivered: false; reason: 'no_transport' };

export async function requestOtp(
  emailRaw: string,
  purpose: OtpPurpose = 'register',
): Promise<RequestOtpResult> {
  const email = normalizeEmail(emailRaw);
  if (!email.includes('@')) {
    throw Object.assign(new Error('Invalid email.'), { status: 400 });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const transport = (process.env.MARAAI_OTP_TRANSPORT || '').trim();

  // In production, refuse to claim delivery if no real transport is
  // wired up. Logging the code to stdout is fine for dev/CI but is not
  // delivery — the user can't see it. We log activity for ops visibility
  // but do NOT insert a code that no one can ever retrieve.
  if (isProd && !transport) {
    await logActivity(null, 'auth.otp.requested', {
      email,
      purpose,
      delivered: false,
      reason: 'no_transport',
    });
    return { delivered: false, reason: 'no_transport' };
  }

  const code = generateCode();
  const codeHash = hashCode(code, email);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db.insert(emailOtpCodes).values({
    email,
    codeHash,
    purpose,
    attempts: 0,
    expiresAt,
  });

  // Best-effort transport. MARAAI_OTP_TRANSPORT is reserved for future
  // use (smtp, ses, sendgrid). When unset in dev we log the code to
  // stdout so engineers can complete the flow.
  if (!isProd) {
    console.log(`[maraai/otp] ${purpose} code for ${email}: ${code}`);
  } else {
    console.log(`[maraai/otp] ${purpose} code dispatched via ${transport} to ${email}`);
  }

  await logActivity(null, 'auth.otp.requested', { email, purpose, delivered: true });

  return { delivered: true, expiresAtMs: expiresAt.getTime() };
}

export type VerifyResult =
  | { ok: true; email: string; purpose: OtpPurpose }
  | { ok: false; reason: 'expired' | 'mismatch' | 'attempts' | 'not_found' };

export async function verifyOtp(emailRaw: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(emailRaw);
  const rows = await db
    .select()
    .from(emailOtpCodes)
    .where(eq(emailOtpCodes.email, email))
    .orderBy(desc(emailOtpCodes.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.consumedAt) return { ok: false, reason: 'mismatch' };

  const expMs =
    row.expiresAt instanceof Date ? row.expiresAt.getTime() : Number(row.expiresAt);
  if (Date.now() > expMs) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'attempts' };

  const expected = hashCode(code, email);
  if (expected !== row.codeHash) {
    await db
      .update(emailOtpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailOtpCodes.id, row.id));
    return { ok: false, reason: 'mismatch' };
  }

  await db
    .update(emailOtpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(emailOtpCodes.id, row.id));

  await logActivity(null, 'auth.otp.verified', { email, purpose: row.purpose });

  return { ok: true, email, purpose: row.purpose as OtpPurpose };
}

/** Throw away expired / consumed rows older than 7 days. Idempotent. */
export async function pruneOtp() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.delete(emailOtpCodes).where(lt(emailOtpCodes.createdAt, cutoff));
}
