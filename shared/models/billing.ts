import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// plans  — canonical catalogue of subscription tiers.
//
// Populated on boot by `server/billing/seed.ts` so the runtime and the DB
// agree on prices and feature scope. We intentionally model one row per
// (tier, period) pair (e.g. `pro_monthly`, `pro_yearly`) so the foreign
// key from `subscriptions.plan_id` points at a single, immutable offering.
// ---------------------------------------------------------------------------
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(), // e.g. 'free', 'pro_monthly', 'vip_yearly'
  tier: text('tier').notNull(), // 'free' | 'pro' | 'vip' | 'creator'
  period: text('period').notNull(), // 'monthly' | 'yearly' | 'none' (free)
  priceCents: integer('price_cents').notNull().default(0),
  currency: text('currency').notNull().default('EUR'),
  // JSON-encoded array of feature-keys granted (see server/billing/features.ts)
  features: text('features').notNull().default('[]'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// ---------------------------------------------------------------------------
// subscriptions — one row per (user, plan) subscription instance.
//
// `status` is the simple state-machine we expose to the app: 'active',
// 'cancelled' (access retained until periodEnd), 'past_due', 'incomplete'.
// Provider identifiers are nullable until a real Stripe/PayPal subscription
// is created (when PAYMENTS_ENABLED=true and keys are configured).
// ---------------------------------------------------------------------------
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id')
      .primaryKey()
      .default(sql`lower(hex(randomblob(16)))`),
    userId: text('user_id').notNull(),
    planId: text('plan_id').notNull(),
    status: text('status').notNull().default('active'),
    provider: text('provider'), // 'stripe' | 'paypal' | null (free)
    providerSubscriptionId: text('provider_subscription_id'),
    providerCustomerId: text('provider_customer_id'),
    periodStart: integer('period_start', { mode: 'timestamp' }).default(
      sql`CURRENT_TIMESTAMP`,
    ),
    periodEnd: integer('period_end', { mode: 'timestamp' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`CURRENT_TIMESTAMP`,
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(
      sql`CURRENT_TIMESTAMP`,
    ),
  },
  (table) => [
    index('IDX_subscription_user').on(table.userId),
    index('IDX_subscription_status').on(table.status),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
