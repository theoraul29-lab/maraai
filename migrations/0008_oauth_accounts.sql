-- OAuth / social-login identities linked to our local user rows.
--
-- Why a separate table (instead of storing `googleId` on `users`)?
-- • A single user may eventually link BOTH Google and Facebook to the same
--   account. Keeping this as a child table means we just add a new row.
-- • Provider ids are opaque strings; the unique constraint lives on the
--   (provider, provider_user_id) pair so one Google identity can only be
--   attached to one local user.
CREATE TABLE IF NOT EXISTS `oauth_accounts` (
        `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        `user_id` text NOT NULL,
        `provider` text NOT NULL,
        `provider_user_id` text NOT NULL,
        `email` text,
        `created_at` integer DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oauth_accounts_user_id` ON `oauth_accounts` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_accounts_provider_puid` ON `oauth_accounts` (`provider`, `provider_user_id`);
