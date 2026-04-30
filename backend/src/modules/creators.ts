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
import type { IStorage } from '../../../server/storage';
import { hasFeature, type FeatureKey } from '../../../server/billing/features';

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

// --- Utils -------------------------------------------------------------------

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
