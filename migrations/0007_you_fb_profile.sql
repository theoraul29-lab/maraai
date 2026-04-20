-- You FB-style (Phase 2 P0)
-- Adds Facebook-style profile fields (cover photo, location, website) and a
-- text/image "post" table so each user has a personal feed on their profile.
--
-- Posts are intentionally simple here: content + optional image URL. Video
-- posts continue to use the existing `videos` table (Reels pipeline). The
-- `/api/feed` aggregator (PR I) will later unify both streams.

ALTER TABLE `users` ADD COLUMN `cover_image_url` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `location` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `website` text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `user_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`image_url` text,
	`created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_user_posts_user` ON `user_posts` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_user_posts_created` ON `user_posts` (`created_at`);
