-- Launch waitlist
--
-- Captures email submissions from the pre-launch landing page that
-- hellomara.net serves until 2026-06-01. After launch we use this
-- table to email everyone with their early-access magic link.
--
-- Also created idempotently in server/db.ts at boot so a fresh dev
-- clone works without running drizzle migrations first. This file
-- exists purely for the migration history.
--
-- Fields:
--   email      — unique, never lower-cased on the DB side so we
--                preserve the user's typed casing for display.
--                Dedup is done at the API layer by lower-casing
--                before insert.
--   source     — where the signup came from (default 'landing',
--                future values: 'preview', 'referral', etc).
--   referrer   — HTTP Referer header, useful for tracking traffic.
--   ip_hash    — sha256 of the source IP. Never the raw IP (GDPR).
--   user_agent — raw UA string for bot detection / analytics.

CREATE TABLE IF NOT EXISTS `mara_waitlist` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `source` text DEFAULT 'landing' NOT NULL,
  `referrer` text,
  `ip_hash` text,
  `user_agent` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mara_waitlist_email_unique`
  ON `mara_waitlist`(`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mara_waitlist_created_at`
  ON `mara_waitlist`(`created_at` DESC);
