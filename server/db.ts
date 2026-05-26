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
  if (process.env.DATABASE_FILE) return process.env.DATABASE_FILE;
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
  CREATE TABLE IF NOT EXISTS mara_growth_experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drop_off_stage TEXT NOT NULL,
    baseline_drop_off_rate REAL NOT NULL,
    baseline_metrics TEXT NOT NULL DEFAULT '{}',
    hypothesis TEXT NOT NULL,
    framework TEXT NOT NULL,
    code_sketch TEXT NOT NULL,
    ice_impact INTEGER NOT NULL,
    ice_confidence INTEGER NOT NULL,
    ice_ease INTEGER NOT NULL,
    ice_score REAL NOT NULL,
    expected_impact_pct REAL NOT NULL,
    cited_knowledge_ids TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'proposed',
    decided_by TEXT,
    decided_at INTEGER,
    decision_note TEXT,
    implemented_at INTEGER,
    measure_after_at INTEGER,
    result_metrics TEXT,
    actual_impact_pct REAL,
    succeeded INTEGER,
    learnings TEXT,
    measured_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_mara_growth_exp_status ON mara_growth_experiments (status, created_at);
  CREATE INDEX IF NOT EXISTS idx_mara_growth_exp_measure ON mara_growth_experiments (status, measure_after_at);

  -- MaraCore Etapa 1: singleton table for the ObjectiveFunction.
  -- Auto-created here (alongside the rest of the brain tables) so that
  -- environments which skip Drizzle migrations on boot still get a usable
  -- mara_core_objective table. The seed row is inserted by
  -- server/mara-core/objective.ts at boot time.
  CREATE TABLE IF NOT EXISTS mara_core_objective (
    id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
    updated_by TEXT,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL
  );

  -- Audit P2: cross-process advisory lock for the brain cycle. A single
  -- row per lock name, with a TTL'd lease and a heartbeat column. Managed
  -- exclusively by server/lib/singleton-lock.ts.
  CREATE TABLE IF NOT EXISTS mara_singleton_locks (
    name TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    heartbeat_at INTEGER NOT NULL
  );

  -- Audit P2: knowledge conflict markers. Inserted by storeKnowledge()
  -- when two rows in the same category disagree on a polarity pair.
  CREATE TABLE IF NOT EXISTS mara_knowledge_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    knowledge_a_id INTEGER NOT NULL,
    knowledge_b_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    category TEXT NOT NULL,
    resolved INTEGER DEFAULT 0 NOT NULL,
    resolved_by TEXT,
    resolved_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mara_knowledge_conflicts_resolved
    ON mara_knowledge_conflicts(resolved, created_at DESC);

  -- Code visibility (Item 3): index of repo source files so Mara can
  -- reason about her own implementation. Populated by indexCode() on
  -- boot and refreshed on demand. Only metadata lives in the index;
  -- contents are read on-demand by code-explorer.ts.
  CREATE TABLE IF NOT EXISTS mara_code_index (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    lines INTEGER NOT NULL,
    extension TEXT NOT NULL,
    indexed_at INTEGER DEFAULT (unixepoch()) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mara_code_index_extension
    ON mara_code_index(extension, mtime DESC);
  CREATE INDEX IF NOT EXISTS idx_mara_code_index_mtime
    ON mara_code_index(mtime DESC);

  -- Code visibility audit log: every readFile() call writes a row so we
  -- can answer "what has Mara been looking at?" without inferring it
  -- from prompts or LLM outputs.
  CREATE TABLE IF NOT EXISTS mara_code_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    accessed_by TEXT NOT NULL,
    reason TEXT,
    size INTEGER NOT NULL,
    truncated INTEGER DEFAULT 0 NOT NULL,
    accessed_at INTEGER DEFAULT (unixepoch()) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mara_code_reads_accessed_at
    ON mara_code_reads(accessed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mara_code_reads_path
    ON mara_code_reads(path);

  -- Launch waitlist: emails collected from the pre-launch landing page
  -- so we can notify subscribers when hellomara.net goes live on June 1st
  -- 2026. ip_hash is a sha256 of the source IP, never the raw IP.
  CREATE TABLE IF NOT EXISTS mara_waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'landing',
    referrer TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mara_waitlist_created_at
    ON mara_waitlist(created_at DESC);

  -- Mara Missions V3
  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    pillar TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'gentle',
    xp_reward INTEGER NOT NULL DEFAULT 100,
    proof_type TEXT NOT NULL DEFAULT 'text',
    proof_prompt TEXT NOT NULL DEFAULT 'Cum te-ai simțit?',
    steps TEXT DEFAULT '[]',
    reflection TEXT,
    is_active INTEGER DEFAULT 1,
    is_daily INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS user_missions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    proof_text TEXT,
    proof_media_url TEXT,
    reflection_answer TEXT,
    mara_feedback TEXT,
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS user_xp (
    user_id TEXT PRIMARY KEY,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0,
    last_activity_at INTEGER,
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS mission_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    meta TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS user_personality (
    user_id TEXT PRIMARY KEY,
    onboarding_done INTEGER DEFAULT 0,
    what_you_love TEXT,
    want_to_change TEXT,
    current_hobbies TEXT,
    dream_life TEXT,
    biggest_fear TEXT,
    preferred_pillars TEXT DEFAULT '[]',
    mara_notes TEXT DEFAULT '{}',
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS mission_shares (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    user_mission_id TEXT NOT NULL,
    caption TEXT,
    media_url TEXT,
    platform TEXT NOT NULL,
    xp_awarded INTEGER DEFAULT 50,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_user_missions_user ON user_missions(user_id);
  CREATE INDEX IF NOT EXISTS idx_mission_events_user ON mission_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_mission_shares_user ON mission_shares(user_id);

  -- Universal content shares: tracks who shared what, where, and when. The
  -- table is module-agnostic -- source_module is the producer (mission /
  -- reel / post / article / profile) and target_module / target_platform
  -- describe the destination (internal feed vs. external network).
  CREATE TABLE IF NOT EXISTS content_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_module TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_type TEXT,
    target_module TEXT,
    target_platform TEXT,
    caption TEXT,
    share_url TEXT,
    xp_awarded INTEGER DEFAULT 25,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// A/B testing table for growth experiments
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS ab_tests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    experiment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    variant TEXT NOT NULL CHECK(variant IN ('control', 'treatment')),
    assigned_at INTEGER DEFAULT (unixepoch()),
    converted INTEGER DEFAULT 0,
    converted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ab_experiment ON ab_tests(experiment_id);
  CREATE INDEX IF NOT EXISTS idx_ab_user ON ab_tests(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_unique ON ab_tests(experiment_id, user_id);
`);

// Add implementation_notes and outcome_metrics columns if they don't exist
try { sqlite.exec(`ALTER TABLE mara_growth_experiments ADD COLUMN implementation_notes TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE mara_growth_experiments ADD COLUMN outcome_metrics TEXT`); } catch { /* already exists */ }

// FIX 2 (from main): per-user toxicity state persisted across restarts.
// FIX 4 (from main): mara_knowledge_base indexes.
// We unconditionally create the toxicity table because nothing else creates
// it, but we guard the knowledge-base indexes so a fresh CI DB (where
// mara_knowledge_base is created later by another module) doesn't crash on
// startup with "no such table".
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_toxicity_state (
    user_id TEXT PRIMARY KEY,
    level INTEGER NOT NULL DEFAULT 0,
    warmth_reduction INTEGER NOT NULL DEFAULT 0,
    consecutive_toxic_messages INTEGER NOT NULL DEFAULT 0,
    last_escalation TEXT,
    updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
  );
`);

// --- Audit fix #4: indexes for hot queries -------------------------------
// Adds covering indexes for the most common WHERE/JOIN columns that were
// previously doing full table scans on each request. We run them as a guarded
// loop instead of one big sqlite.exec because on a fresh DB the underlying
// tables may not exist yet — Drizzle creates them only after this module
// finishes initialising. Missing tables are skipped silently; the next boot
// (or the first time the module touches the table) will pick them up.
{
  const indexDefs: ReadonlyArray<readonly [name: string, table: string, cols: string]> = [
    ['idx_chat_messages_user_id', 'chat_messages', 'user_id'],
    ['idx_user_posts_user_id', 'user_posts', 'user_id'],
    ['idx_notifications_user_read', 'notifications', 'user_id, read'],
    ['idx_notifications_user_id', 'notifications', 'user_id'],
    ['idx_direct_messages_conversation', 'direct_messages', 'conversation_id'],
    ['idx_videos_creator_id', 'videos', 'creator_id'],
    ['idx_post_likes_post_id', 'post_likes', 'post_id'],
    ['idx_post_comments_post_id', 'post_comments', 'post_id'],
    ['idx_followers_follower_id', 'followers', 'follower_id'],
    ['idx_followers_following_id', 'followers', 'following_id'],
    ['idx_user_missions_user_status', 'user_missions', 'user_id, status'],
    ['idx_mission_events_user_id', 'mission_events', 'user_id'],
    ['idx_writer_pages_user_id', 'writer_pages', 'user_id'],
    ['idx_conversations_users', 'conversations', 'user_a_id, user_b_id'],
    ['idx_push_subscriptions_user', 'push_subscriptions', 'user_id'],
    ['idx_content_shares_user', 'content_shares', 'user_id'],
    // From main: knowledge-base hot paths.
    ['idx_mkb_category', 'mara_knowledge_base', 'category'],
    ['idx_mkb_source', 'mara_knowledge_base', 'source'],
    ['idx_mkb_confidence', 'mara_knowledge_base', 'confidence DESC'],
    ['idx_mkb_updated_at', 'mara_knowledge_base', 'updated_at DESC'],
    ['idx_mkb_topic', 'mara_knowledge_base', 'topic'],
  ];
  const tableExists = sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
  );
  for (const [name, table, cols] of indexDefs) {
    if (!tableExists.get(table)) continue;
    try {
      sqlite.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${cols});`);
    } catch (err) {
      // Most likely an unexpected column rename — log and continue so the
      // app can boot. The query planner just keeps the existing plan.
      console.warn(`[db] skipping index ${name} on ${table}:`, err);
    }
  }
}


// ─── Missions V4 tables ──────────────────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS mission_programs (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    tagline TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    pillar_focus TEXT NOT NULL DEFAULT '[]',
    difficulty TEXT NOT NULL DEFAULT 'gentle',
    proof_types TEXT NOT NULL DEFAULT '["text","photo"]',
    is_active INTEGER NOT NULL DEFAULT 1,
    is_featured INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_program_enrollments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    program_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_day INTEGER NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_activity_at INTEGER,
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    paused_at INTEGER,
    settings TEXT NOT NULL DEFAULT '{}',
    UNIQUE(user_id, program_id)
  );

  CREATE INDEX IF NOT EXISTS idx_enrollments_user
    ON user_program_enrollments(user_id);
  CREATE INDEX IF NOT EXISTS idx_enrollments_status
    ON user_program_enrollments(user_id, status);

  CREATE TABLE IF NOT EXISTS program_day_missions (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    mission_id TEXT,
    custom_title TEXT,
    custom_description TEXT,
    custom_proof_prompt TEXT,
    intent TEXT,
    is_ai_generated INTEGER DEFAULT 0,
    UNIQUE(program_id, day_number)
  );

  CREATE INDEX IF NOT EXISTS idx_day_missions_program
    ON program_day_missions(program_id, day_number);

  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_mission_id TEXT,
    program_enrollment_id TEXT,
    day_number INTEGER,
    raw_content TEXT NOT NULL,
    mara_reflection TEXT,
    mara_page TEXT,
    mood TEXT,
    energy_level INTEGER CHECK(energy_level BETWEEN 1 AND 10),
    tags TEXT NOT NULL DEFAULT '[]',
    media_urls TEXT NOT NULL DEFAULT '[]',
    visibility TEXT NOT NULL DEFAULT 'private'
      CHECK(visibility IN ('private','community','public')),
    chapter_number INTEGER,
    is_milestone INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_journal_user
    ON journal_entries(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_journal_enrollment
    ON journal_entries(program_enrollment_id);
  CREATE INDEX IF NOT EXISTS idx_journal_visibility
    ON journal_entries(visibility, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    program_enrollment_id TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    cover_theme TEXT NOT NULL DEFAULT 'violet',
    chapters TEXT NOT NULL DEFAULT '[]',
    total_pages INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'writing'
      CHECK(status IN ('writing','completed','published')),
    pdf_url TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_books_user
    ON user_books(user_id);

  CREATE TABLE IF NOT EXISTS mission_proofs (
    id TEXT PRIMARY KEY,
    user_mission_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    proof_type TEXT NOT NULL
      CHECK(proof_type IN ('text','photo','drawing','audio','video','link')),
    content TEXT,
    media_url TEXT,
    media_thumbnail_url TEXT,
    mara_feedback TEXT,
    mara_page TEXT,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    word_count INTEGER DEFAULT 0,
    processing_status TEXT DEFAULT 'pending'
      CHECK(processing_status IN ('pending','processing','done','failed')),
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_proofs_user_mission
    ON mission_proofs(user_mission_id);
  CREATE INDEX IF NOT EXISTS idx_proofs_user
    ON mission_proofs(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS mission_generation_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    program_enrollment_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    context TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','processing','done','failed')),
    generated_mission_id TEXT,
    attempts INTEGER DEFAULT 0,
    error TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    processed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_gen_queue_status
    ON mission_generation_queue(status, created_at);

  CREATE TABLE IF NOT EXISTS mission_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
    note TEXT,
    context TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(user_id, mission_id)
  );

  CREATE INDEX IF NOT EXISTS idx_mission_feedback_mission
    ON mission_feedback(mission_id);

  -- P2P Background Compute: tasks dispatched to idle browser nodes.
  -- Browser nodes poll GET /api/p2p/get-task, run lightweight JS computation,
  -- POST result to /api/p2p/submit-result, and earn XP + credits.
  CREATE TABLE IF NOT EXISTS p2p_tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('maraAnalysis','missionGeneration','contentProcessing','knowledgeBase')),
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','assigned','completed','failed')),
    assigned_node TEXT,
    assigned_user_id TEXT,
    assigned_at INTEGER,
    result TEXT,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_p2p_tasks_status
    ON p2p_tasks(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_p2p_tasks_node
    ON p2p_tasks(assigned_node);
`);

export const db = drizzle(sqlite, { schema });

// Expose the raw better-sqlite3 handle so startup code (e.g. the
// cover_image_url safety guard in server/index.ts) can run PRAGMA queries
// and DDL that Drizzle's query builder doesn't expose directly.
export { sqlite as rawSqlite };
