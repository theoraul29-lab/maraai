/**
 * Creator Tools (PR G).
 *
 * Endpoints for the "Creators" module:
 *
 *   - `GET  /api/creator/earnings`           — aggregated balance + per-page
 *                                              breakdown (requires
 *                                              `creator.revenue_share`).
 *   - `GET  /api/creator/earnings/history`   — per-sale list (same gate).
 *   - `GET  /api/creator/analytics`          — counts (posts / views / likes /
 *                                              followers) for the dashboard
 *                                              (requires `creator.analytics`).
 *   - `POST /api/creator/payouts`            — request a payout of available
 *                                              earnings (requires
 *                                              `creator.payouts`).
 *   - `GET  /api/creator/payouts`            — list my payout requests.
 *   - `GET  /api/admin/creator/payouts`      — admin: all payout requests.
 *   - `PATCH /api/admin/creator/payouts/:id` — admin: update status
 *                                              (approved / rejected / paid).
 *
 * Revenue share is fixed at 70/30 (`CREATOR_REVENUE_SHARE`) and is applied
 * upstream — the writer-purchase record persists both `authorShareCents` and
 * `platformShareCents`. This module only aggregates what's already tracked;
 * it never decides the split itself.
 *
 * Payments (real Stripe / PayPal payouts) are deliberately out of scope. The
 * `method_details` field is opaque JSON so the admin tooling / finance team
 * can attach IBANs, PayPal emails, etc. without forcing a schema change. Real
 * disbursement happens out-of-band once status transitions to `paid`.
 */

import type { Request, Response } from 'express';
import type { IStorage } from '../storage.js';
import { hasFeature, type FeatureKey } from '../billing/features.js';
import { suggestMission } from '../missions/engine.js';
import { rawSqlite } from '../db.js';

let deps: {
  storage: IStorage;
};

export function injectDeps(d: typeof deps) {
  deps = d;
}

// --- Helpers -----------------------------------------------------------------

function getUserId(req: Request): string | null {
  return (req as any).user?.uid ?? null;
}

// Creator status (revenue share, payouts, analytics) requires BOTH a VIP
// subscription (the `creator.*` feature keys, checked below) AND having
// actually reached an audience — paying €20/month alone was previously
// sufficient on its own, with no audience check anywhere, which let anyone
// request payouts the moment they subscribed. 1000 followers is the
// platform's real "you're a creator now" threshold.
const MIN_CREATOR_FOLLOWERS = 1000;

async function isEligibleCreator(userId: string): Promise<boolean> {
  const followers = await deps.storage.getFollowerCount(userId);
  return followers >= MIN_CREATOR_FOLLOWERS;
}

// --- Creator monetization activation ----------------------------------------
//
// Whether the Earnings tab shows live payout/earnings UI at all. Previously
// a hardcoded frontend date (creator.tsx: `new Date('2026-07-01T00:00:00Z')`)
// that silently "unlocked" the moment it passed, with zero connection to
// whether the business was actually ready to process real creator payouts —
// an admin now flips this explicitly from Control Center instead.
//
// system_config is also created independently by costGuard.ts / anthropic-key
// -store.ts on their own imports — see the comment there for why the
// duplication is intentional/harmless.
rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

function isCreatorMonetizationActive(): boolean {
  const row = rawSqlite.prepare(
    `SELECT value FROM system_config WHERE key = 'creator_monetization_active'`,
  ).get() as { value: string } | undefined;
  return row?.value === 'true';
}

function setCreatorMonetizationActive(active: boolean): void {
  rawSqlite.prepare(
    `INSERT INTO system_config (key, value, updated_at)
     VALUES ('creator_monetization_active', ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).run(active ? 'true' : 'false');
}

// GET-only, requireAuth (not admin): the Earnings tab itself needs this for
// every creator, not just admins. no-store: this can flip at any time from
// Control Center and must never be served from a stale cache (see the same
// fix on /api/control/* in routes.ts for the bug this class of caching caused).
export const getMonetizationStatus = requireAuth(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ active: isCreatorMonetizationActive() });
});

// Admin-only write side, called from Control Center's Integrations panel.
export function adminSetMonetizationStatus(req: Request, res: Response): void {
  const active = req.body?.active === true;
  setCreatorMonetizationActive(active);
  console.log(`[creators] Monetization ${active ? 'activated' : 'deactivated'} by admin`);
  res.json({ active });
}

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const adminIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
}

/**
 * Handler wrapper that enforces a feature gate inside the handler (not as
 * middleware). Same pattern as the writers / trading modules. Returns 401
 * for unauthenticated, 403 with a machine-readable `requiredFeature` code
 * when the active plan is missing the capability.
 */
function gate(featureKey: FeatureKey, handler: (req: Request, res: Response, userId: string) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'auth_required', code: 'auth_required' });
      return;
    }
    const ok = await hasFeature(userId, featureKey);
    if (!ok) {
      res.status(403).json({
        error: 'feature_required',
        code: 'feature_required',
        requiredFeature: featureKey,
      });
      return;
    }
    // VIP unlocks the *capability*; actually using it still requires having
    // reached a real audience. Checked separately from hasFeature() so the
    // error response can tell the difference (upgrade to VIP vs grow your
    // following) instead of a single generic "feature_required".
    if (featureKey.startsWith('creator.') && !(await isEligibleCreator(userId))) {
      const followers = await deps.storage.getFollowerCount(userId);
      res.status(403).json({
        error: 'creator_followers_required',
        code: 'creator_followers_required',
        requiredFollowers: MIN_CREATOR_FOLLOWERS,
        currentFollowers: followers,
      });
      return;
    }
    try {
      await handler(req, res, userId);
    } catch (err) {
      console.error(`[creators] ${featureKey} handler error:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', code: 'internal_error' });
      }
    }
  };
}

function requireAuth(handler: (req: Request, res: Response, userId: string) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'auth_required', code: 'auth_required' });
      return;
    }
    try {
      await handler(req, res, userId);
    } catch (err) {
      console.error('[creators] handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', code: 'internal_error' });
      }
    }
  };
}

function requireAdmin(handler: (req: Request, res: Response, userId: string) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId || !isAdmin(userId)) {
      res.status(403).json({ error: 'admin_required', code: 'admin_required' });
      return;
    }
    try {
      await handler(req, res, userId);
    } catch (err) {
      console.error('[creators] admin handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', code: 'internal_error' });
      }
    }
  };
}

// --- Handlers ----------------------------------------------------------------

export const getEarnings = gate('creator.revenue_share', async (_req, res, userId) => {
  const data = await deps.storage.getCreatorEarnings(userId);
  res.json({
    currency: 'EUR',
    ...data,
  });
});

export const getEarningsHistory = gate('creator.revenue_share', async (req, res, userId) => {
  const limit = clampInt(req.query.limit, 1, 200, 50);
  const offset = clampInt(req.query.offset, 0, 100_000, 0);
  const rows = await deps.storage.listCreatorEarningsHistory(userId, { limit, offset });
  res.json({ items: rows, limit, offset });
});

export const getAnalytics = gate('creator.analytics', async (_req, res, userId) => {
  const stats = await deps.storage.getCreatorAnalytics(userId);
  res.json(stats);
});

export const listMyPayouts = requireAuth(async (_req, res, userId) => {
  const rows = await deps.storage.listCreatorPayoutsByUser(userId);
  res.json({ items: rows });
});

export const createPayout = gate('creator.payouts', async (req, res, userId) => {
  const { amountCents, method, methodDetails, currency } = req.body ?? {};

  const amount = Number.parseInt(String(amountCents ?? ''), 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'invalid_amount', code: 'invalid_amount' });
    return;
  }
  // 1_000_000 cents = 10,000 EUR — cap per payout request. Creators with
  // larger balances should file multiple requests until we wire Stripe Connect
  // for automated disbursement.
  if (amount > 1_000_000) {
    res.status(400).json({ error: 'amount_too_large', code: 'amount_too_large' });
    return;
  }

  const allowedMethods = new Set(['bank', 'paypal', 'stripe', 'crypto']);
  if (typeof method !== 'string' || !allowedMethods.has(method)) {
    res.status(400).json({ error: 'invalid_method', code: 'invalid_method' });
    return;
  }

  // Normalise method_details. Accept either a plain object (we JSON.stringify
  // for storage) or an already-stringified JSON value.
  let detailsJson = '{}';
  if (methodDetails != null) {
    if (typeof methodDetails === 'string') {
      try {
        JSON.parse(methodDetails); // validate
        detailsJson = methodDetails;
      } catch {
        res.status(400).json({ error: 'invalid_method_details', code: 'invalid_method_details' });
        return;
      }
    } else if (typeof methodDetails === 'object') {
      detailsJson = JSON.stringify(methodDetails);
    } else {
      res.status(400).json({ error: 'invalid_method_details', code: 'invalid_method_details' });
      return;
    }
  }

  // Atomic check + insert. Two concurrent requests from the same user cannot
  // both pass the balance check because the transaction serialises them at
  // SQLite's write-lock level — the second one re-reads the committed state
  // and observes the first payout as `pending`.
  const result = deps.storage.createCreatorPayoutAtomic({
    userId,
    amountCents: amount,
    currency: typeof currency === 'string' && currency.length === 3 ? currency : 'EUR',
    method,
    methodDetails: detailsJson,
    notes: null,
  });

  if (!result.ok) {
    res.status(400).json({
      error: result.code,
      code: result.code,
      availableCents: result.availableCents,
      requestedCents: result.requestedCents,
    });
    return;
  }

  res.status(201).json(result.payout);
});

// --- Admin -------------------------------------------------------------------

export const adminListPayouts = requireAdmin(async (req, res) => {
  const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
  const allowed = new Set(['requested', 'approved', 'rejected', 'paid']);
  const status = statusParam && allowed.has(statusParam) ? statusParam : undefined;

  const rows = await deps.storage.listAllCreatorPayouts({ status });
  res.json({ items: rows });
});

export const adminUpdatePayout = requireAdmin(async (req, res) => {
  const id = Number.parseInt(String(req.params.id ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'invalid_id', code: 'invalid_id' });
    return;
  }

  const { status, notes } = req.body ?? {};
  const allowed = new Set(['approved', 'rejected', 'paid']);
  if (typeof status !== 'string' || !allowed.has(status)) {
    res.status(400).json({ error: 'invalid_status', code: 'invalid_status' });
    return;
  }

  // Lifecycle guardrails: only 'paid' can follow 'approved'; 'rejected' /
  // 'approved' can only come from 'requested'. Prevents finance staff from
  // accidentally skipping steps.
  const current = await deps.storage.getCreatorPayoutById(id);
  if (!current) {
    res.status(404).json({ error: 'not_found', code: 'not_found' });
    return;
  }
  if (status === 'approved' || status === 'rejected') {
    if (current.status !== 'requested') {
      res.status(400).json({ error: 'invalid_transition', code: 'invalid_transition' });
      return;
    }
  }
  if (status === 'paid' && current.status !== 'approved') {
    res.status(400).json({ error: 'invalid_transition', code: 'invalid_transition' });
    return;
  }

  const updated = await deps.storage.updateCreatorPayoutStatus(
    id,
    status as 'approved' | 'rejected' | 'paid',
    typeof notes === 'string' ? notes : undefined,
  );
  if (!updated) {
    res.status(404).json({ error: 'not_found', code: 'not_found' });
    return;
  }
  res.json(updated);
});

// --- Creator Growth Path -----------------------------------------------------
//
// Deliberately NOT behind the `gate('creator.*', …)` wrapper: that wrapper
// also enforces MIN_CREATOR_FOLLOWERS, which would hide this from exactly
// the people it's meant to help — everyone still on their way to 1000
// followers. requireAuth only.
//
// `followers.created_at` is SQLite's CURRENT_TIMESTAMP default, which stores
// an ISO-8601-ish text string ("YYYY-MM-DD HH:MM:SS"), not a unix epoch —
// same quirk already documented on storage.ts's getReelsFeed. String
// comparison against datetime('now', …) still sorts correctly for that
// format, so no numeric coercion is needed here.
const GROWTH_MILESTONES = [100, 250, 500, 1000] as const;

export const getGrowthPath = requireAuth(async (_req, res, userId) => {
  const followerCount = (rawSqlite.prepare(
    'SELECT COUNT(*) as cnt FROM followers WHERE following_id = ?',
  ).get(userId) as { cnt: number }).cnt;

  const last7d = (rawSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM followers WHERE following_id = ? AND created_at >= datetime('now', '-7 days')",
  ).get(userId) as { cnt: number }).cnt;
  const prior7d = (rawSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM followers WHERE following_id = ? AND created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')",
  ).get(userId) as { cnt: number }).cnt;

  const bySourceRows = rawSqlite.prepare(
    'SELECT source_kind as sourceKind, COUNT(*) as cnt FROM followers WHERE following_id = ? GROUP BY source_kind',
  ).all(userId) as { sourceKind: string | null; cnt: number }[];
  const bySource = { spark: 0, writers: 0, other: 0 };
  for (const row of bySourceRows) {
    if (row.sourceKind === 'spark') bySource.spark = row.cnt;
    else if (row.sourceKind === 'writers') bySource.writers = row.cnt;
    else bySource.other += row.cnt;
  }

  const milestones = GROWTH_MILESTONES.map((threshold) => ({
    threshold,
    reached: followerCount >= threshold,
  }));
  const nextMilestone = GROWTH_MILESTONES.find((m) => followerCount < m) ?? null;
  const prevFloor = [0, ...GROWTH_MILESTONES].filter((m) => m <= followerCount).pop() ?? 0;
  const progressToNext = nextMilestone
    ? (followerCount - prevFloor) / (nextMilestone - prevFloor)
    : 1;

  // A single consistency nudge, not a "grow your audience" trick — Missions
  // are a personal-growth system (discipline/creativity/self/…), not a
  // marketing playbook, so we frame this as "keep going," reusing the same
  // recommendation logic already used elsewhere for mission suggestions.
  let suggestedMission: { id: string; title: string; pillar: string } | null = null;
  try {
    const m = suggestMission(userId);
    if (m) suggestedMission = { id: m.id, title: m.title, pillar: m.pillar };
  } catch {
    // Non-critical — the panel just omits the suggestion.
  }

  res.json({
    followers: followerCount,
    isCreator: followerCount >= MIN_CREATOR_FOLLOWERS,
    milestones,
    nextMilestone,
    progressToNext,
    velocity: { last7d, prior7d },
    bySource,
    suggestedMission,
  });
});

export const shareToYou = requireAuth(async (req, res, userId) => {
  const { content, imageUrl, sourceKind, sourceId } = req.body ?? {};
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'content_required' });
    return;
  }
  await deps.storage.createUserPost({
    userId,
    content: content.slice(0, 2000),
    imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
    sourceKind: ['writers', 'missions', 'reel'].includes(sourceKind) ? sourceKind : null,
    sourceId: typeof sourceId === 'number' ? sourceId : null,
  });
  res.json({ success: true });
});

export const getMyComments = requireAuth(async (req, res, userId) => {
  const limit = Math.min(Number.parseInt(String(req.query.limit ?? '50'), 10), 100);
  const offset = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10), 0);
  const comments = rawSqlite.prepare(`
    SELECT vc.id, vc.content, vc.created_at as createdAt,
           v.id as videoId, v.title as videoTitle,
           u.display_name as userName, u.profile_image_url as userAvatar
    FROM video_comments vc
    JOIN videos v ON v.id = vc.video_id
    LEFT JOIN users u ON u.id = vc.user_id
    WHERE v.creator_id = ?
    ORDER BY vc.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
  res.json({ items: comments });
});

// --- Utils -------------------------------------------------------------------

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
