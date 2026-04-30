CREATE TABLE IF NOT EXISTS `conversations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_a_id` text NOT NULL,
  `user_b_id` text NOT NULL,
  `last_message_at` integer,
  `created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `IDX_conversations_users` ON `conversations` (`user_a_id`, `user_b_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `direct_messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `conversation_id` integer NOT NULL,
  `sender_id` text NOT NULL,
  `content` text NOT NULL,
  `read` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_direct_messages_conv` ON `direct_messages` (`conversation_id`);
