-- Writers Hub (PR E).
--
-- Additive migration:
--   * extends `writer_pages` with visibility + paywall columns
--   * adds `writer_comments` + `writer_purchases` tables
--
-- All ALTERs are guarded by IF NOT EXISTS at runtime (the migration runner
-- tolerates duplicate-column errors on re-apply).

ALTER TABLE `writer_pages` ADD COLUMN `visibility` text NOT NULL DEFAULT 'public';
--> statement-breakpoint
ALTER TABLE `writer_pages` ADD COLUMN `price_cents` integer;
--> statement-breakpoint
ALTER TABLE `writer_pages` ADD COLUMN `currency` text NOT NULL DEFAULT 'EUR';
--> statement-breakpoint
ALTER TABLE `writer_pages` ADD COLUMN `excerpt` text;
--> statement-breakpoint
ALTER TABLE `writer_pages` ADD COLUMN `slug` text;
--> statement-breakpoint
ALTER TABLE `writer_pages` ADD COLUMN `read_time_minutes` integer;
--> statement-breakpoint
ALTER TABLE `writer_pages` ADD COLUMN `published_at` integer;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `IDX_writer_pages_slug` ON `writer_pages` (`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_writer_pages_visibility` ON `writer_pages` (`visibility`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `writer_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_writer_comments_page` ON `writer_comments` (`page_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_writer_comments_user` ON `writer_comments` (`user_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `writer_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL DEFAULT 'EUR',
	`provider` text NOT NULL DEFAULT 'stub',
	`provider_ref` text,
	`author_share_cents` integer NOT NULL,
	`platform_share_cents` integer NOT NULL,
	`created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_writer_purchases_page_user` ON `writer_purchases` (`page_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_writer_purchases_user` ON `writer_purchases` (`user_id`);
