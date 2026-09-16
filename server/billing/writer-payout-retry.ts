/**
 * Retries Writers Hub payouts that didn't go out on the first try — a
 * PayPal outage, a bad address, or (the common case) the author hadn't set
 * their PayPal email yet at the moment of sale. The sale itself is never
 * undone by a payout failure (see writers.ts's captureArticlePurchase), so
 * without this the owed amount would just sit as payout_status='failed' /
 * 'no_payout_email' forever — this is what actually closes that loop once
 * the underlying problem clears (PayPal recovers, or the author finally
 * sets an email), without needing an admin to do anything.
 *
 * Same idempotency key as the original attempt (writer-payout-<purchaseId>)
 * — safe to resend: if the first attempt actually succeeded on PayPal's
 * side but we failed to record it (e.g. a crash mid-request), PayPal's own
 * idempotency handling dedupes it rather than double-paying.
 */
import { rawSqlite } from '../db.js';
import { storage } from '../storage.js';
import { sendPayPalPayout } from './paypal.js';

const RETRY_INTERVAL_MS = 15 * 60 * 1000; // 15 min

interface PendingPayoutRow {
  id: number;
  page_id: number;
  author_share_cents: number;
  currency: string;
}

async function retryPendingPayouts(): Promise<void> {
  let rows: PendingPayoutRow[];
  try {
    rows = rawSqlite
      .prepare(
        `SELECT id, page_id, author_share_cents, currency FROM writer_purchases WHERE payout_status IN ('failed', 'no_payout_email')`,
      )
      .all() as PendingPayoutRow[];
  } catch (err) {
    console.error('[writer-payout-retry] failed to query pending payouts:', err);
    return;
  }
  if (rows.length === 0) return;

  console.log(`[writer-payout-retry] ${rows.length} payout(s) to retry`);
  for (const row of rows) {
    try {
      const page = await storage.getWriterPageById(row.page_id);
      if (!page) continue;
      const author = await storage.getUserById(page.userId);
      if (!author?.paypalPayoutEmail) continue; // still nothing to send to — try again next cycle

      const payout = await sendPayPalPayout({
        recipientEmail: author.paypalPayoutEmail,
        amountCents: row.author_share_cents,
        currency: row.currency,
        note: `Mara Writers Hub — "${page.title}"`,
        senderItemId: `writer-payout-${row.id}`,
      });
      if (payout.ok) {
        await storage.updateWriterPurchasePayoutStatus(row.id, 'sent', payout.payoutBatchId);
        console.log(`[writer-payout-retry] purchase ${row.id} sent on retry`);
      } else {
        console.warn(`[writer-payout-retry] purchase ${row.id} still failing: ${payout.error}`);
      }
    } catch (err) {
      console.error(`[writer-payout-retry] retry failed for purchase ${row.id}:`, err);
    }
  }
}

export function startWriterPayoutRetryChecker(): void {
  void retryPendingPayouts();
  setInterval(() => { void retryPendingPayouts(); }, RETRY_INTERVAL_MS);
}
