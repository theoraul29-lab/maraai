-- Reels pipeline (PR D).
--
-- Additive migration:
--   * adds storage / pipeline columns to `videos`
--   * adds `video_comments` table
--
-- All statements use IF NOT EXISTS / ALTER ADD COLUMN guarded at runtime so
-- this is safe to re-run on a dev DB that already has partial state.

ALTER TABLE `videos` ADD COLUMN `file_key` text;
--> statement-breakpoint
ALTER TABLE `videos` ADD COLUMN `mime_type` text;
--> statement-breakpoint
ALTER TABLE `videos` ADD COLUMN `duration_sec` integer;
--> statement-breakpoint
ALTER TABLE `videos` ADD COLUMN `thumbnail_url` text;
--> statement-breakpoint
ALTER TABLE `videos` ADD COLUMN `shares` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `videos` ADD COLUMN `moderation_status` text NOT NULL DEFAULT 'approved';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `video_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `IDX_video_comments_video` ON `video_comments` (`video_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_video_comments_user` ON `video_comments` (`user_id`);
