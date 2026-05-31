-- LEGACY / DOCUMENTATION ONLY
--
-- These tables (mara_self_reflection, mara_platform_insights) are created
-- at server startup by rawSqlite.exec() calls in server/db.ts, not by this
-- file. This file is kept as a documentation artefact only and is NOT
-- executed by any migration runner.
--
-- Do NOT add this file to the Drizzle journal — it would conflict with the
-- runtime CREATE TABLE IF NOT EXISTS guards already in server/db.ts.

CREATE TABLE IF NOT EXISTS mara_self_reflection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  confidence REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mara_platform_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
