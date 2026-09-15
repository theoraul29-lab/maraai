/**
 * One-time program/bundle/book purchases — separate from the VIP
 * subscription (`subscriptions` table, recurring).
 *
 * Builds on the `program_purchases` table already defined in server/db.ts
 * (id, user_id, program_id, amount_cents, currency, paypal_order_id,
 * status: pending|completed|refunded, + a unique index preventing two
 * completed rows for the same user+program_id). That table existed from
 * earlier scaffolding — nothing had ever queried or written to it (grep
 * confirmed zero non-DDL references) until this module. `program_id` holds
 * any PurchasableItemId — an individual program, the bundle, or the book —
 * despite the column name, since it's just a free-text key.
 */

import { rawSqlite } from '../db.js';
import {
  PROGRAM_CATALOGUE,
  PROGRAM_BUNDLE,
  TRANSFORMATION_BOOK,
  type ProgramId,
  type PurchasableItemId,
} from './plans.js';

export interface PurchasableItem {
  id: PurchasableItemId;
  name: string;
  priceCents: number;
  currency: 'EUR';
}

/** Full purchasable-item catalogue: the 4 paid programs + the bundle + the book. */
export function purchasableItems(): PurchasableItem[] {
  const items: PurchasableItem[] = PROGRAM_CATALOGUE
    .filter((p) => p.priceCents > 0)
    .map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, currency: 'EUR' }));
  items.push({ id: PROGRAM_BUNDLE.id, name: PROGRAM_BUNDLE.name, priceCents: PROGRAM_BUNDLE.priceCents, currency: 'EUR' });
  items.push({ id: TRANSFORMATION_BOOK.id, name: TRANSFORMATION_BOOK.name, priceCents: TRANSFORMATION_BOOK.priceCents, currency: 'EUR' });
  return items;
}

export function findPurchasableItem(item: string): PurchasableItem | null {
  return purchasableItems().find((i) => i.id === item) ?? null;
}

function hasCompletedPurchase(userId: string, item: string): boolean {
  const row = rawSqlite
    .prepare(`SELECT 1 FROM program_purchases WHERE user_id = ? AND program_id = ? AND status = 'completed' LIMIT 1`)
    .get(userId, item);
  return !!row;
}

/** All item ids the user has completed a purchase for (raw, no bundle expansion). */
export function purchasedItemIds(userId: string): string[] {
  const rows = rawSqlite
    .prepare(`SELECT DISTINCT program_id FROM program_purchases WHERE user_id = ? AND status = 'completed'`)
    .all(userId) as Array<{ program_id: string }>;
  return rows.map((r) => r.program_id);
}

/** Whether the user can access the given program — free programs always yes. */
export function hasPurchasedProgram(userId: string, programId: ProgramId): boolean {
  const def = PROGRAM_CATALOGUE.find((p) => p.id === programId);
  if (!def) return false;
  if (def.priceCents === 0) return true;
  return hasCompletedPurchase(userId, programId) || hasCompletedPurchase(userId, PROGRAM_BUNDLE.id);
}

/** Whether the user has purchased the New You transformation book. */
export function hasPurchasedBook(userId: string): boolean {
  return hasCompletedPurchase(userId, TRANSFORMATION_BOOK.id);
}

/**
 * Record a completed purchase, idempotently (the unique index on
 * (user_id, program_id) WHERE status='completed' is the hard backstop —
 * this check just avoids a pointless duplicate-key error in the common case
 * of the PayPal return_url and a webhook both landing here).
 */
export function markPurchaseCompleted(params: {
  userId: string;
  item: string;
  priceCents: number;
  paypalOrderId: string;
}): void {
  if (hasCompletedPurchase(params.userId, params.item)) return;

  const pending = rawSqlite
    .prepare(`SELECT id FROM program_purchases WHERE paypal_order_id = ? LIMIT 1`)
    .get(params.paypalOrderId) as { id: string } | undefined;

  if (pending) {
    rawSqlite
      .prepare(`UPDATE program_purchases SET status = 'completed', completed_at = unixepoch() WHERE id = ?`)
      .run(pending.id);
    return;
  }

  rawSqlite
    .prepare(
      `INSERT INTO program_purchases
         (id, user_id, program_id, amount_cents, currency, paypal_order_id, status, completed_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'EUR', ?, 'completed', unixepoch())`,
    )
    .run(params.userId, params.item, params.priceCents, params.paypalOrderId);
}

/** Record a pending purchase before redirecting the user to PayPal. */
export function createPendingPurchase(params: {
  userId: string;
  item: string;
  priceCents: number;
  paypalOrderId: string;
}): void {
  rawSqlite
    .prepare(
      `INSERT INTO program_purchases
         (id, user_id, program_id, amount_cents, currency, paypal_order_id, status)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'EUR', ?, 'pending')`,
    )
    .run(params.userId, params.item, params.priceCents, params.paypalOrderId);
}
