CREATE TABLE IF NOT EXISTS `user_blocks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `blocker_id` text NOT NULL,
  `blocked_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_user_blocks_pair` ON `user_blocks` (`blocker_id`, `blocked_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_user_blocks_blocked` ON `user_blocks` (`blocked_id`);
