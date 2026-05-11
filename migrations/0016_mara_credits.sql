-- Mara Credits — internal economy for P2P contribution rewards.
--
-- Tables:
--   * user_credits         — running balance + lifetime totals per user
--   * credit_transactions  — append-only audit trail; balance is derived from
--                             this in the long run, the user_credits row is a
--                             materialised cache for cheap reads.
--
-- Awards are idempotent on (user_id, idempotency_key) so that retried WebSocket
-- jobs or duplicated signup-bonus events never double-credit a user.

CREATE TABLE IF NOT EXISTS `user_credits` (
  `user_id` text PRIMARY KEY NOT NULL,
  `balance` integer DEFAULT 0 NOT NULL,
  `lifetime_earned` integer DEFAULT 0 NOT NULL,
  `lifetime_spent` integer DEFAULT 0 NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `credit_transactions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `delta` integer NOT NULL,
  `reason` text NOT NULL,
  `idempotency_key` text,
  `meta` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_credit_tx_user_time` ON `credit_transactions` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_credit_tx_idempotency` ON `credit_transactions` (`user_id`, `idempotency_key`);
