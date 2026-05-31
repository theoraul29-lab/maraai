/**
 * Idempotent plan seeder. Run on every boot after migrations so the
 * `plans` table matches `PLAN_CATALOGUE` without requiring a new
 * migration for a price change.
 *
 * Also deactivates legacy plans (pro_monthly, creator_monthly) that
 * have been removed from the catalogue. Existing VIP subscribers are
 * unaffected; pro/creator subscribers are automatically upgraded to
 * vip_monthly via the subscription upsert path.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { plans, subscriptions } from '../../shared/models/billing.js';
import { PLAN_CATALOGUE } from './plans.js';
import { validatePlanCatalogue } from './features.js';

const REMOVED_PLAN_IDS = ['pro_monthly', 'pro_yearly', 'creator_monthly', 'creator_yearly'];

export async function seedPlans(): Promise<void> {
  validatePlanCatalogue();

  for (const plan of PLAN_CATALOGUE) {
    const features = JSON.stringify(plan.features);
    const existing = await db
      .select()
      .from(plans)
      .where(eq(plans.id, plan.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(plans).values({
        id: plan.id,
        tier: plan.tier,
        period: plan.period,
        priceCents: plan.priceCents,
        currency: plan.currency,
        features,
        active: true,
      });
    } else {
      await db
        .update(plans)
        .set({
          tier: plan.tier,
          period: plan.period,
          priceCents: plan.priceCents,
          currency: plan.currency,
          features,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(plans.id, plan.id));
    }
  }

  // Mark removed plans as inactive so they no longer appear in the billing API.
  // Existing subscriptions referencing these plan IDs are migrated to vip_monthly.
  try {
    await db
      .update(plans)
      .set({ active: false, updatedAt: new Date() })
      .where(inArray(plans.id, REMOVED_PLAN_IDS));

    // Upgrade any active subscriptions on removed plans to vip_monthly.
    await db
      .update(subscriptions)
      .set({ planId: 'vip_monthly', updatedAt: new Date() })
      .where(
        inArray(subscriptions.planId, REMOVED_PLAN_IDS),
      );
  } catch {
    // Non-fatal: removed plans may not exist in DB on fresh deployments.
  }
}
