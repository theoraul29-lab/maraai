-- Security: Honeypot + Auto-Blacklist tables
-- GDPR basis: Art. 6(1)(f) legitimate interest — network/information security (Recital 49)
-- Data minimization: IP, path, method, truncated UA only. 30-day retention on events.

CREATE TABLE IF NOT EXISTS `blacklisted_ips` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `ip` text NOT NULL,
  `reason` text NOT NULL,
  `hit_count` integer DEFAULT 1 NOT NULL,
  `first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
  `last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
  `expires_at` integer NOT NULL,
  `permanent` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `blacklisted_ips_ip_unique` ON `blacklisted_ips` (`ip`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_blacklisted_ips_expires` ON `blacklisted_ips` (`expires_at`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `honeypot_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `ip` text NOT NULL,
  `path` text NOT NULL,
  `method` text NOT NULL,
  `user_agent` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_honeypot_events_ip` ON `honeypot_events` (`ip`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `IDX_honeypot_events_created` ON `honeypot_events` (`created_at`);
