-- Password reset tokens table.
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_prt_user_id` ON `password_reset_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_prt_expires_at` ON `password_reset_tokens` (`expires_at`);
