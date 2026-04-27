// SQLite database — matches the schema defined in shared/schema.ts (drizzle-orm/sqlite-core).
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../shared/schema.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the SQLite file path from either DATABASE_URL (preferred, matches
// .env.example and SQLAlchemy convention) or DATABASE_PATH (legacy).
// SQLAlchemy-style URLs:
//   sqlite:///relative/path.db    (3 slashes → relative to cwd)
//   sqlite:////absolute/path.db   (4 slashes → absolute)
function resolveDbPath(): string {
  const url = process.env.DATABASE_URL;
  if (url) {
    if (url.startsWith('sqlite:////')) {
      return url.slice('sqlite:///'.length); // keeps leading '/' → absolute
    }
    if (url.startsWith('sqlite:///')) {
      return url.slice('sqlite:///'.length); // strips leading '/' → relative
    }
    if (url.startsWith('sqlite://')) {
      return url.slice('sqlite://'.length);
    }
    if (url.startsWith('file:')) {
      return url.replace(/^file:(?:\/\/)?/, '');
    }
    // Treat any other DATABASE_URL as a literal path (best-effort).
    return url;
  }
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // Production default: /data (chown'd to `nodejs` in Dockerfile; attach a
  // Railway Volume here for persistence across deploys). Falls back to the
  // repo-local sqlite file when /data does not exist (dev / local scripts).
  try {
    if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) {
      return '/data/maraai.sqlite';
    }
  } catch {
    // fall through to local default
  }
  return path.resolve(__dirname, '..', 'maraai.sqlite');
}

const dbPath = resolveDbPath();

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
// Bound the time better-sqlite3 will block on a write lock. Without an
// explicit timeout, contended writes can wait indefinitely (which on
// Railway has been observed to make /api/auth/signup hang past the
// edge proxy's response deadline). 5s is well above any healthy
// transaction time and still fails fast on real deadlocks.
sqlite.pragma('busy_timeout = 5000');
// WAL+NORMAL is the recommended combo for write throughput on commodity
// disks; FULL fsyncs every commit, which can stall multi-second on slow
// network volumes. NORMAL still survives application crashes because of
// WAL; only OS-level crashes between checkpoints can lose the last txn.
sqlite.pragma('synchronous = NORMAL');

// Auto-create Mara Brain tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS mara_knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence INTEGER NOT NULL DEFAULT 70,
    metadata TEXT NOT NULL DEFAULT '{}',
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS mara_search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    source TEXT NOT NULL,
    result_summary TEXT NOT NULL,
    knowledge_extracted TEXT NOT NULL DEFAULT '[]',
    triggered_by TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS mara_learning_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    reason TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'auto',
    result TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS mara_self_reflection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    mood TEXT NOT NULL DEFAULT 'curious',
    topics_learned TEXT NOT NULL DEFAULT '[]',
    topics_to_research TEXT NOT NULL DEFAULT '[]',
    platform_score INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS mara_platform_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    insight_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'P2',
    estimated_impact TEXT NOT NULL DEFAULT 'medium',
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

export const db = drizzle(sqlite, { schema });
