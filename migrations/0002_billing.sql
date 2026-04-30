-- Billing / subscription tables (PR A).
--
-- All statements use `IF NOT EXISTS` so the migration is safe to re-run on
-- dev DBs that already have partial state. The runtime seeder
-- (server/billing/seed.ts) upserts the canonical plan rows on boot.

CREATE TABLE IF NOT EXISTS `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`tier` text NOT NULL,
	`period` text NOT NULL,
	`price_cents` integer NOT NULL DEFAULT 0,
	`currency` text NOT NULL DEFAULT 'EUR',
	`features` text NOT NULL DEFAULT '[]',
	`active` integer NOT NULL DEFAULT 1,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` integer DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `subscriptions` (
	`id` text PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`provider` text,
	`provider_subscription_id` text,
	`provider_customer_id` text,
	`period_start` integer DEFAULT (CURRENT_TIMESTAMP),
	`period_end` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` integer DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `IDX_subscription_user` ON `subscriptions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_subscription_status` ON `subscriptions` (`status`);
