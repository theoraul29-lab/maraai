-- Creator Tools (PR G)
-- Adds a payout-request ledger for creators to withdraw accumulated
-- author-share earnings from writer_purchases (and future reel tips).
-- The payable balance is derived at query time: sum(authorShareCents) minus
-- sum(amountCents where status IN ('approved','paid')). No separate ledger
-- table is needed today.

CREATE TABLE IF NOT EXISTS `creator_payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL DEFAULT 'EUR',
	`method` text NOT NULL,
	`method_details` text NOT NULL DEFAULT '{}',
	`status` text NOT NULL DEFAULT 'requested',
	`notes` text,
	`requested_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_creator_payouts_user` ON `creator_payouts` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_creator_payouts_status` ON `creator_payouts` (`status`);
