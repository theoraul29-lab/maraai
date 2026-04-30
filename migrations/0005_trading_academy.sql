-- Trading Academy (PR F).
--
-- Structured learning content gated by the billing feature catalogue:
--   * `trading.level_1_fundamentals` (free tier)  -> Level 1 modules
--   * `trading.all_levels`          (VIP/Creator) -> Level 2..4
--   * `trading.live_sessions`       (VIP+)        -> Level 5 (live)
--
-- Only additive statements; safe to re-apply because every CREATE is
-- guarded by IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS `trading_modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`level` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL DEFAULT '',
	`order_idx` integer NOT NULL DEFAULT 0,
	-- Feature key from billing/features.ts (FeatureKey union).
	-- Intentionally stored as text, not FK, so seed data can reference
	-- feature keys without needing to manage migration ordering against
	-- the plans catalogue.
	`required_feature` text NOT NULL,
	`created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_trading_modules_slug` ON `trading_modules` (`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_trading_modules_level` ON `trading_modules` (`level`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `trading_lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL DEFAULT '',
	`video_url` text,
	`duration_seconds` integer NOT NULL DEFAULT 0,
	`order_idx` integer NOT NULL DEFAULT 0,
	-- Optional quiz as JSON: { questions: [{ id, prompt, choices:[..], answer: <idx> }] }.
	-- Null means the lesson has no quiz and counts as complete on explicit /complete.
	`quiz_json` text,
	`created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_trading_lessons_module_slug` ON `trading_lessons` (`module_id`, `slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_trading_lessons_module` ON `trading_lessons` (`module_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `trading_lesson_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`lesson_id` integer NOT NULL,
	`quiz_score` integer,
	`completed_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_trading_progress_user_lesson` ON `trading_lesson_progress` (`user_id`, `lesson_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_trading_progress_user` ON `trading_lesson_progress` (`user_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `trading_certificates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`module_id` integer NOT NULL,
	`avg_score` integer NOT NULL DEFAULT 0,
	`issued_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_trading_certs_user_module` ON `trading_certificates` (`user_id`, `module_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_trading_certs_user` ON `trading_certificates` (`user_id`);
