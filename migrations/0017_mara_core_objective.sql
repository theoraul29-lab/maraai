-- Mara Core Objective — single-row table holding the ObjectiveFunction
-- that the brain optimises against. See `server/mara-core/types.ts`.
--
-- Invariant: exactly one row, with id=1. `payload` is a JSON-encoded
-- ObjectiveFunction. Boot-time seed in `server/mara-core/objective.ts`
-- uses INSERT OR IGNORE so it cannot clobber admin edits.
--
-- This is the first table of the MaraCore migration (Etapa 1). It is
-- read-only from the brain cycle's perspective in this PR; future PRs
-- wire `ObjectiveFunction.constraints.maxDailyLLMCalls` into the rate
-- limiter and `weights` into the Growth Engineer's ICE scoring.

CREATE TABLE IF NOT EXISTS `mara_core_objective` (
  `id` integer PRIMARY KEY NOT NULL,
  `payload` text NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_by` text,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
