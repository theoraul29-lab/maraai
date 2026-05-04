-- Add tier and trial tracking columns to the users table.
-- Existing users default to 'free' (no active trial).
ALTER TABLE `users` ADD COLUMN `tier` text NOT NULL DEFAULT 'free';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `trial_start_time` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `trial_ends_at` integer;
