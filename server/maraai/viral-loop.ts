// Viral referral loop — active only when isViralLoopActive() returns true.
//
// Each user gets a unique referral code stored in referral_codes.
// When a new user signs up via a referral link (?ref=CODE):
//   - referrals row is created
//   - referrer earns 50 XP + 2 Mara Credits
//   - referred user earns 25 XP (welcome bonus)
//
// Endpoints (all gated via isViralLoopActive()):
//   GET  /api/growth/referral        — get or create my referral code + stats
//   POST /api/growth/referral/apply  — apply a code at signup (called by auth)
//   GET  /api/growth/referral/stats  — admin: top referrers

import { randomUUID } from 'crypto';
import { rawSqlite } from '../db.js';
import { awardCredits, CREDIT_AMOUNTS, CREDIT_REASONS } from './credits.js';
import { logActivity } from './activity.js';

const XP_REFERRER = 50;
const XP_REFERRED = 25;
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
  xpEarned: number;
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
      'SELECT COUNT(*) as cnt, SUM(xp_awarded) as xp FROM referrals WHERE referrer_id = ?',
    )
    .get(userId) as { cnt: number; xp: number | null } | undefined;

  return {
    code,
    referralCount: stats?.cnt ?? 0,
    xpEarned: stats?.xp ?? 0,
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
      'INSERT INTO referrals (id, referrer_id, referred_user_id, code, xp_awarded) VALUES (?, ?, ?, ?, ?)',
    )
    .run(randomUUID(), referrerId, referredUserId, code.toUpperCase(), XP_REFERRER);

  // Award XP to referrer (upsert user_xp)
  const xpRow = rawSqlite
    .prepare('SELECT xp FROM user_xp WHERE user_id = ?')
    .get(referrerId) as { xp: number } | undefined;
  const newXp = (xpRow?.xp ?? 0) + XP_REFERRER;
  const newLevel = Math.floor(newXp / 1000) + 1;
  if (xpRow) {
    rawSqlite
      .prepare('UPDATE user_xp SET xp = ?, level = ?, last_activity_at = unixepoch() WHERE user_id = ?')
      .run(newXp, newLevel, referrerId);
  } else {
    rawSqlite
      .prepare('INSERT INTO user_xp (user_id, xp, level, streak) VALUES (?, ?, ?, 0)')
      .run(referrerId, newXp, newLevel);
  }

  // Award XP welcome bonus to referred user
  const refXpRow = rawSqlite
    .prepare('SELECT xp FROM user_xp WHERE user_id = ?')
    .get(referredUserId) as { xp: number } | undefined;
  const refNewXp = (refXpRow?.xp ?? 0) + XP_REFERRED;
  const refNewLevel = Math.floor(refNewXp / 1000) + 1;
  if (refXpRow) {
    rawSqlite
      .prepare('UPDATE user_xp SET xp = ?, level = ?, last_activity_at = unixepoch() WHERE user_id = ?')
      .run(refNewXp, refNewLevel, referredUserId);
  } else {
    rawSqlite
      .prepare('INSERT INTO user_xp (user_id, xp, level, streak) VALUES (?, ?, ?, 0)')
      .run(referredUserId, refNewXp, refNewLevel);
  }

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
    xpGained: XP_REFERRER,
    creditsGained: CREDITS_REFERRER,
  }).catch(() => {});

  await logActivity(referredUserId, 'referral.used', {
    referrerId,
    xpGained: XP_REFERRED,
    code,
  }).catch(() => {});

  return { ok: true, message: `Cod aplicat! +${XP_REFERRED} XP bonus de bun-venit.` };
}

export function getTopReferrers(limit = 10): Array<{
  userId: string;
  referralCount: number;
  xpEarned: number;
}> {
  const rows = rawSqlite
    .prepare(
      `SELECT referrer_id as userId, COUNT(*) as referralCount, SUM(xp_awarded) as xpEarned
       FROM referrals
       GROUP BY referrer_id
       ORDER BY referralCount DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{ userId: string; referralCount: number; xpEarned: number }>;
  return rows;
}
