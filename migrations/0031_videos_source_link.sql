ALTER TABLE `videos` ADD COLUMN `source_kind` text;
--> statement-breakpoint
ALTER TABLE `videos` ADD COLUMN `source_id` text;
--> statement-breakpoint
CREATE INDEX `idx_videos_source` ON `videos` (`source_kind`,`source_id`);
