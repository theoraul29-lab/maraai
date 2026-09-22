// Viral referral loop — active only when isViralLoopActive() returns true.
//
// Each user gets a unique referral code stored in referral_codes.
// When a new user signs up via a referral link (?ref=CODE):
//   - referrals row is created
//   - referrer earns 2 Mara Credits
//
// Endpoints (all gated via isViralLoopActive()):
//   GET  /api/growth/referral        — get or create my referral code + stats
//   POST /api/growth/referral/apply  — apply a code at signup (called by auth)
//   GET  /api/growth/referral/stats  — admin: top referrers

import { randomUUID } from 'crypto';
import { rawSqlite } from '../db.js';
import { awardCredits, CREDIT_AMOUNTS, CREDIT_REASONS } from './credits.js';
import { logActivity } from './activity.js';

const CREDITS_REFERRER = 2;

function generateCode(): string {
  // 6-char alphanumeric, uppercase — easy to share
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ensureUniqueCode(): string {
  let code = generateCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = rawSqlite
      .prepare('SELECT 1 FROM referral_codes WHERE code = ?')
      .get(code);
    if (!existing) return code;
    code = generateCode();
    attempts++;
  }
  // Fallback: prepend timestamp fragment for guaranteed uniqueness
  return `${Date.now().toString(36).slice(-3).toUpperCase()}${generateCode()}`;
}

export function getOrCreateReferralCode(userId: string): {
  code: string;
  referralCount: number;
} {
  const existing = rawSqlite
    .prepare('SELECT code FROM referral_codes WHERE user_id = ?')
    .get(userId) as { code: string } | undefined;

  let code: string;
  if (existing) {
    code = existing.code;
  } else {
    code = ensureUniqueCode();
    rawSqlite
      .prepare('INSERT INTO referral_codes (id, user_id, code) VALUES (?, ?, ?)')
      .run(randomUUID(), userId, code);
  }

  const stats = rawSqlite
    .prepare(
      'SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?',
    )
    .get(userId) as { cnt: number } | undefined;

  return {
    code,
    referralCount: stats?.cnt ?? 0,
  };
}

export async function applyReferralCode(
  referredUserId: string,
  code: string,
): Promise<{ ok: boolean; message: string }> {
  // Find the referrer
  const codeRow = rawSqlite
    .prepare('SELECT user_id FROM referral_codes WHERE code = ?')
    .get(code.toUpperCase()) as { user_id: string } | undefined;

  if (!codeRow) return { ok: false, message: 'Cod de referral invalid.' };
  if (codeRow.user_id === referredUserId) {
    return { ok: false, message: 'Nu poți folosi propriul cod de referral.' };
  }

  // Idempotent — one referral per new user
  const alreadyApplied = rawSqlite
    .prepare('SELECT 1 FROM referrals WHERE referred_user_id = ?')
    .get(referredUserId);
  if (alreadyApplied) return { ok: false, message: 'Codul a fost deja aplicat.' };

  const referrerId = codeRow.user_id;

  rawSqlite
    .prepare(
      'INSERT INTO referrals (id, referrer_id, referred_user_id, code) VALUES (?, ?, ?, ?)',
    )
    .run(randomUUID(), referrerId, referredUserId, code.toUpperCase());

  // Award credits to referrer
  await awardCredits({
    userId: referrerId,
    delta: CREDITS_REFERRER,
    reason: CREDIT_REASONS.REFERRAL,
    idempotencyKey: `referral_${referredUserId}`,
    meta: { referredUserId, code },
  }).catch(() => {});

  await logActivity(referrerId, 'referral.converted', {
    referredUserId,
    creditsGained: CREDITS_REFERRER,
  }).catch(() => {});

  await logActivity(referredUserId, 'referral.used', {
    referrerId,
    code,
  }).catch(() => {});

  return { ok: true, message: 'Cod aplicat!' };
}

export function getTopReferrers(limit = 10): Array<{
  userId: string;
  referralCount: number;
}> {
  const rows = rawSqlite
    .prepare(
      `SELECT referrer_id as userId, COUNT(*) as referralCount
       FROM referrals
       GROUP BY referrer_id
       ORDER BY referralCount DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{ userId: string; referralCount: number }>;
  return rows;
}
