/**
 * Idempotent plan seeder. Run on every boot after migrations so the
 * `plans` table matches `PLAN_CATALOGUE` without requiring a new
 * migration for a price change.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { plans } from '../../shared/models/billing.js';
import { PLAN_CATALOGUE } from './plans.js';
import { validatePlanCatalogue } from './features.js';

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
}
