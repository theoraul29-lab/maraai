// SQLite database — matches the schema defined in shared/schema.ts (drizzle-orm/sqlite-core).
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../shared/schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath =
  process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'maraai.sqlite');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

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
