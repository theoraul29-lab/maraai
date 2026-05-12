-- Audit P2: cross-process advisory lock + knowledge conflict markers.
--
-- 1. mara_singleton_locks
--    One row per named lock. Acquire is INSERT OR IGNORE + SELECT to
--    verify ownership; takeover requires expires_at < now. Managed
--    exclusively by server/lib/singleton-lock.ts. Used so that a Railway
--    rolling deploy can't briefly run two brain cycles in parallel
--    against the same database.
--
-- 2. mara_knowledge_conflicts
--    Inserted by storeKnowledge() when two same-category rows disagree on
--    a polarity pair (e.g. "trading is risky" vs "trading is safe").
--    Observational only — never blocks the write — so the brain keeps
--    learning instead of stalling on the first contradiction it sees.

CREATE TABLE IF NOT EXISTS `mara_singleton_locks` (
  `name` text PRIMARY KEY NOT NULL,
  `holder` text NOT NULL,
  `acquired_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `heartbeat_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mara_knowledge_conflicts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `knowledge_a_id` integer NOT NULL,
  `knowledge_b_id` integer NOT NULL,
  `reason` text NOT NULL,
  `category` text NOT NULL,
  `resolved` integer DEFAULT 0 NOT NULL,
  `resolved_by` text,
  `resolved_at` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mara_knowledge_conflicts_resolved`
  ON `mara_knowledge_conflicts`(`resolved`, `created_at` DESC);
