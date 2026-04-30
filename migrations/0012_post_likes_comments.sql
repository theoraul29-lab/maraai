CREATE TABLE IF NOT EXISTS `post_likes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_post_likes_unique` ON `post_likes` (`post_id`, `user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `post_comments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL,
  `user_id` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_post_comments_post` ON `post_comments` (`post_id`);
