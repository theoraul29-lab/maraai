-- Cross-module attribution (Phase 2 P2.2)
--
-- When Writers Hub / Trading Akademie shares to /you, the origin of the post
-- (kind + row id in the source module) is preserved so the timeline can
-- render a "📊 From Trading Akademie" / "✍️ From Writers Hub" badge and
-- link back to the source.
--
-- Allowed kinds are currently 'writers' | 'trading' | 'reel' | NULL (plain
-- user post). Enforced in application code (createProfilePost) rather than
-- via a CHECK constraint so future kinds can be added without a migration.

ALTER TABLE `user_posts` ADD COLUMN `source_kind` text;
--> statement-breakpoint
ALTER TABLE `user_posts` ADD COLUMN `source_id` integer;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `user_posts_source_idx`
  ON `user_posts` (`source_kind`, `source_id`);
