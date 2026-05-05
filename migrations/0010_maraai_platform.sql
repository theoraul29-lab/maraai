-- MaraAI hybrid-platform layer (Phase 3).
--
-- Tables:
--   * consent_records      — per-user GDPR consent + selected mode + kill switch
--   * p2p_nodes            — registered devices participating in the P2P mesh
--   * activity_log         — transparency log surfaced to the user (no hidden activity)
--   * ai_route_log         — which route (local/central/p2p) handled each AI call
--   * email_otp_codes      — short-lived OTP codes for email-OTP registration
--
-- All features that consume these tables MUST gracefully degrade when the
-- row is missing or consent is denied. The default for an authenticated user
-- with no consent_records row is "centralized mode, no P2P, no background".

CREATE TABLE IF NOT EXISTS `consent_records` (
  `user_id` text PRIMARY KEY NOT NULL,
  `mode` text DEFAULT 'centralized' NOT NULL,
  `p2p_enabled` integer DEFAULT 0 NOT NULL,
  `bandwidth_share_gb_month` integer DEFAULT 0 NOT NULL,
  `background_node` integer DEFAULT 0 NOT NULL,
  `advanced_ai_routing` integer DEFAULT 0 NOT NULL,
  `notifications_enabled` integer DEFAULT 0 NOT NULL,
  `kill_switch` integer DEFAULT 0 NOT NULL,
  `consent_version` integer DEFAULT 1 NOT NULL,
  `accepted_terms_at` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `p2p_nodes` (
  `node_id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `device_label` text,
  `status` text DEFAULT 'offline' NOT NULL,
  `score` integer DEFAULT 0 NOT NULL,
  `uptime_sec` integer DEFAULT 0 NOT NULL,
  `bytes_in` integer DEFAULT 0 NOT NULL,
  `bytes_out` integer DEFAULT 0 NOT NULL,
  `last_seen_at` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_p2p_nodes_user` ON `p2p_nodes` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text,
  `kind` text NOT NULL,
  `meta` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_activity_log_user_time`
  ON `activity_log` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_route_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text,
  `route` text NOT NULL,
  `module` text,
  `latency_ms` integer DEFAULT 0 NOT NULL,
  `tokens_in` integer DEFAULT 0 NOT NULL,
  `tokens_out` integer DEFAULT 0 NOT NULL,
  `success` integer DEFAULT 1 NOT NULL,
  `error` text,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_route_log_user_time`
  ON `ai_route_log` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_otp_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `code_hash` text NOT NULL,
  `purpose` text DEFAULT 'register' NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `expires_at` integer NOT NULL,
  `consumed_at` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_email_otp_email_time`
  ON `email_otp_codes` (`email`, `created_at`);
