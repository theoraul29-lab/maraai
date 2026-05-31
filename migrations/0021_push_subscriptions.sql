-- Phase 2 P2.1.4 — Web Push subscriptions.
--
-- One row per (user, endpoint). Endpoint is the PushSubscription.endpoint
-- URL emitted by the browser; it is globally unique so we UPSERT on it and
-- GC the row when web-push reports 404/410 (subscription expired).

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `user_agent` text,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `push_subscriptions_endpoint_unique`
  ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_push_subs_user`
  ON `push_subscriptions` (`user_id`);
