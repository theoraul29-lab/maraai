-- Users (registered accounts). Migration 0000 never emitted this table, so we
-- create it here guarded by IF NOT EXISTS (safe on existing dev DBs too).
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`first_name` text,
	`last_name` text,
	`display_name` text,
	`bio` text,
	`profile_image_url` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
-- Session storage (reserved for future persistent store).
CREATE TABLE IF NOT EXISTS `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_session_expire` ON `sessions` (`expire`);
--> statement-breakpoint
-- Local email/password credentials (bcrypt hash).
CREATE TABLE IF NOT EXISTS `local_auth_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `local_auth_credentials_email_unique` ON `local_auth_credentials` (`email`);
