-- Item 3 — Code visibility.
--
-- Mara needs to be able to reason about her own implementation, not just
-- about chat samples. These two tables back the new code-explorer agent.
--
-- 1. mara_code_index
--    One row per indexed source file. Populated by indexCode() on boot
--    and refreshed on demand. Only file metadata + sha256 + line count
--    are stored — contents are read on demand via fs.readFile and
--    capped per call so we never ship a megabyte of code into an LLM
--    prompt by accident.
--
-- 2. mara_code_reads
--    Audit log: every readFile() call writes one row so we can answer
--    "what has Mara been looking at?" without inferring it from
--    downstream prompts/outputs. Includes a `truncated` flag for reads
--    that hit the per-call size cap.
--
-- Both tables are also created idempotently in server/db.ts at boot so
-- a fresh dev clone or test environment works without running drizzle
-- migrations first.

CREATE TABLE IF NOT EXISTS `mara_code_index` (
  `path` text PRIMARY KEY NOT NULL,
  `size` integer NOT NULL,
  `mtime` integer NOT NULL,
  `sha256` text NOT NULL,
  `lines` integer NOT NULL,
  `extension` text NOT NULL,
  `indexed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mara_code_index_extension`
  ON `mara_code_index`(`extension`, `mtime` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mara_code_index_mtime`
  ON `mara_code_index`(`mtime` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mara_code_reads` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `path` text NOT NULL,
  `accessed_by` text NOT NULL,
  `reason` text,
  `size` integer NOT NULL,
  `truncated` integer DEFAULT 0 NOT NULL,
  `accessed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mara_code_reads_accessed_at`
  ON `mara_code_reads`(`accessed_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mara_code_reads_path`
  ON `mara_code_reads`(`path`);
