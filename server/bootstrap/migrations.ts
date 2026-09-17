import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { db, rawSqlite } from '../db.js';

export function runMigrations() {
  // Resolve from the working directory (repo root in dev, /app in the
  // container) rather than relative to this file — under the compiled prod
  // build this module lives in dist/server/, so a file-relative path would
  // point at the wrong place.
  const migrationsFolder = path.resolve(process.cwd(), 'migrations');
  try {
    migrate(db, { migrationsFolder });
    console.log('[migrations] Drizzle migrations applied successfully');
  } catch (err) {
    console.error('[migrations] Failed to run migrations:', err);
    throw err;
  }

  // Self-heal guard for missing schema. The Drizzle migration journal
  // (migrations/meta/_journal.json) was overwritten by PR #85 and lost the
  // entries for migrations 0010–0015 (cover_image_url, users.tier/trial,
  // password_reset_tokens, post_likes/comments, direct_messages) plus
  // 0009_push_subscriptions. Databases initialised from that broken journal
  // never receive those DDLs, and Drizzle's `db.select().from(users)`
  // expands to an explicit column list from the in-memory schema, so any
  // missing column makes /api/auth/me + /api/profile/me + /api/notifications/*
  // throw 500. Express 4 silently swallows async-handler rejections, so the
  // request hangs past the upstream proxy deadline without a useful error.
  //
  // The runtime guards below are purely additive — every column add is
  // gated on PRAGMA table_info(), every CREATE TABLE uses IF NOT EXISTS —
  // so a database that already has the schema is left alone.
  //
  // SQLite has no ALTER TABLE … ADD COLUMN IF NOT EXISTS, so each column
  // is wrapped in its own try/catch so a transient failure on one (e.g.
  // duplicate-column race with another boot) does not skip the rest.
  type ColumnInfo = { name: string };
  const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const ALLOWED_TYPES = new Set([
    'text', 'integer', 'real', 'blob',
    "text NOT NULL DEFAULT 'free'",
    "text NOT NULL DEFAULT 'en'",
    "text NOT NULL DEFAULT 'dark'",
    "integer DEFAULT 0",
    // journal_entries.is_ai_generated defaults to 1 (program entries are
    // AI-authored). Without this the heal below threw "unsafe column type"
    // and the column was never backfilled on older production DBs.
    "integer DEFAULT 1",
  ]);
  const ensureColumns = (
    table: string,
    required: ReadonlyArray<readonly [string, string]>,
  ) => {
    if (!IDENT_RE.test(table)) throw new Error(`ensureColumns: unsafe table name '${table}'`);
    try {
      const columns = rawSqlite.pragma(`table_info(${table})`) as ColumnInfo[];
      const have = new Set(columns.map((c) => c.name));
      for (const [name, type] of required) {
        if (!IDENT_RE.test(name)) throw new Error(`ensureColumns: unsafe column name '${name}'`);
        if (!ALLOWED_TYPES.has(type)) throw new Error(`ensureColumns: unsafe column type '${type}'`);
        if (have.has(name)) continue;
        try {
          rawSqlite.exec(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type};`);
          console.log(`[migrations] Added missing ${table}.${name} column`);
        } catch (colErr) {
          console.error(
            `[migrations] Failed to add ${table}.${name} column (non-fatal):`,
            colErr,
          );
        }
      }
    } catch (err) {
      console.error(`[migrations] Failed to inspect ${table} table for safety guard:`, err);
      throw err;
    }
  };

  // users: cover_image_url/location/website were added by migration 0007.
  // tier/trial_start_time/trial_ends_at were added by migration 0012. Both
  // sets are missing on production DBs initialised from a journal that
  // didn't include those migrations (see notes on _journal.json corruption
  // introduced by PR #85). Drizzle's `db.select().from(users)` expands to
  // an explicit column list from the in-memory schema, so any missing
  // column causes `/api/auth/me`, `/api/profile/me`, `/api/notifications/*`
  // to throw 500. This guard is purely additive — a column that already
  // exists is left alone.
  ensureColumns('users', [
    ['cover_image_url', 'text'],
    ['location', 'text'],
    ['website', 'text'],
    ["tier", "text NOT NULL DEFAULT 'free'"],
    ['trial_start_time', 'integer'],
    ['trial_ends_at', 'integer'],
    // Migration 0034_pending_deletion — self-heal for DBs whose journal
    // didn't pick it up, same reasoning as the columns above.
    ['pending_deletion_at', 'integer'],
  ]);

  ensureColumns('user_preferences', [
    ["theme", "text NOT NULL DEFAULT 'dark'"],
    ["language", "text NOT NULL DEFAULT 'en'"],
  ]);

  ensureColumns('mara_growth_experiments', [
    ['auto_recommendation', 'text'],
  ]);

  // user_personality: evolutionary profile columns added by migration 0023.
  // user_personality may not exist on very fresh databases (created by
  // onboarding), so the guard is wrapped in its own try/catch.
  try {
    const upRows = rawSqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_personality'")
      .all() as Array<{ name: string }>;
    if (upRows.length > 0) {
      ensureColumns('user_personality', [
        ['dominant_emotion', 'text'],
        ['dominant_topic', 'text'],
        ['mara_confidence', 'integer DEFAULT 0'],
        ['profile_updated_at', 'integer'],
      ]);
    }
  } catch (err) {
    console.error('[migrations] Failed to add user_personality evolution columns (non-fatal):', err);
  }

  try {
    const jeRows = rawSqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='journal_entries'")
      .all() as Array<{ name: string }>;
    if (jeRows.length > 0) {
      ensureColumns('journal_entries', [
        ['is_ai_generated', 'integer DEFAULT 1'],
      ]);
    }
  } catch (err) {
    console.error('[migrations] Failed to add journal_entries.is_ai_generated (non-fatal):', err);
  }

  // ── Missions hardening migrations ───────────────────────────────────────────
  // These self-heal existing production databases for the mission/program
  // integrity fixes. db.ts only defines the fresh-DB schema (CREATE TABLE IF
  // NOT EXISTS), so the column adds, table rebuild and unique indexes below are
  // applied here where we can dedupe first and keep each step non-fatal.
  const missionTableExists = (name: string): boolean => {
    if (!IDENT_RE.test(name)) return false;
    return (
      rawSqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .all(name) as Array<{ name: string }>
    ).length > 0;
  };

  // missions.owner_user_id — scopes AI-generated missions to their creator.
  try {
    if (missionTableExists('missions')) ensureColumns('missions', [['owner_user_id', 'text']]);
  } catch (err) {
    console.error('[migrations] Failed to add missions.owner_user_id (non-fatal):', err);
  }

  // program_day_missions — re-key from UNIQUE(program_id, day_number) to
  // UNIQUE(enrollment_id, day_number) so each enrollment gets its own
  // AI-personalized days. SQLite can't drop a UNIQUE constraint in place, so we
  // rebuild the table. Existing rows are preserved with enrollment_id = NULL
  // (they become inert under the new per-enrollment reads and are regenerated
  // on demand). Guarded by the presence of the enrollment_id column so it runs
  // at most once.
  try {
    if (missionTableExists('program_day_missions')) {
      const cols = rawSqlite.pragma('table_info(program_day_missions)') as ColumnInfo[];
      if (!cols.some((c) => c.name === 'enrollment_id')) {
        rawSqlite.transaction(() => {
          rawSqlite.exec(`
            CREATE TABLE program_day_missions_new (
              id TEXT PRIMARY KEY,
              enrollment_id TEXT,
              program_id TEXT NOT NULL,
              day_number INTEGER NOT NULL,
              mission_id TEXT,
              custom_title TEXT,
              custom_description TEXT,
              custom_proof_prompt TEXT,
              intent TEXT,
              is_ai_generated INTEGER DEFAULT 0,
              UNIQUE(enrollment_id, day_number)
            );
            INSERT INTO program_day_missions_new
              (id, enrollment_id, program_id, day_number, mission_id,
               custom_title, custom_description, custom_proof_prompt, intent, is_ai_generated)
              SELECT id, NULL, program_id, day_number, mission_id,
                     custom_title, custom_description, custom_proof_prompt, intent, is_ai_generated
              FROM program_day_missions;
            DROP TABLE program_day_missions;
            ALTER TABLE program_day_missions_new RENAME TO program_day_missions;
            CREATE INDEX IF NOT EXISTS idx_day_missions_enrollment
              ON program_day_missions(enrollment_id, day_number);
          `);
        })();
        console.log('[migrations] Re-keyed program_day_missions on enrollment_id');
      }
    }
  } catch (err) {
    console.error('[migrations] Failed to re-key program_day_missions (non-fatal):', err);
  }

  // Dedupe + unique indexes. Each is dedup'd before the index is created so the
  // CREATE UNIQUE INDEX can't fail on pre-existing duplicate rows (left behind
  // by the very bugs these fixes address).
  const dedupeAndIndex = (label: string, dedupeSql: string, indexSql: string) => {
    try {
      rawSqlite.transaction(() => {
        rawSqlite.exec(dedupeSql);
        rawSqlite.exec(indexSql);
      })();
    } catch (err) {
      console.error(`[migrations] Failed to apply ${label} (non-fatal):`, err);
    }
  };

  if (missionTableExists('mission_shares')) {
    dedupeAndIndex(
      'mission_shares unique',
      `DELETE FROM mission_shares WHERE rowid NOT IN (
         SELECT MIN(rowid) FROM mission_shares
         GROUP BY user_id, user_mission_id, platform
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_shares_unique
         ON mission_shares(user_id, user_mission_id, platform);`,
    );
  }

  if (missionTableExists('journal_entries')) {
    dedupeAndIndex(
      'journal_entries program-day unique',
      `DELETE FROM journal_entries
       WHERE program_enrollment_id IS NOT NULL
         AND rowid NOT IN (
           SELECT MIN(rowid) FROM journal_entries
           WHERE program_enrollment_id IS NOT NULL
           GROUP BY user_id, program_enrollment_id, day_number
         );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_program_day_unique
         ON journal_entries(user_id, program_enrollment_id, day_number)
         WHERE program_enrollment_id IS NOT NULL;`,
    );
  }

  if (missionTableExists('user_books')) {
    dedupeAndIndex(
      'user_books enrollment unique',
      `DELETE FROM user_books
       WHERE program_enrollment_id IS NOT NULL
         AND rowid NOT IN (
           SELECT rowid FROM (
             SELECT rowid, ROW_NUMBER() OVER (
               PARTITION BY user_id, program_enrollment_id
               ORDER BY (status = 'completed') DESC, updated_at DESC, created_at DESC
             ) rn
             FROM user_books WHERE program_enrollment_id IS NOT NULL
           ) WHERE rn = 1
         );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_books_enrollment_unique
         ON user_books(user_id, program_enrollment_id);`,
    );
  }

  // user_posts: source_kind / source_id were added by migration
  // 0009_user_posts_source_kind. Same self-heal pattern — applied
  // separately from createTable below because the table itself is created
  // by 0007, and the columns may be missing even when the table exists.
  // (Run only if the table exists; the next ensureTable() block will
  // create the table on truly fresh databases, so the column-add will
  // re-run on the next boot if needed.)
  try {
    const rows = rawSqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_posts'")
      .all() as Array<{ name: string }>;
    if (rows.length > 0) {
      ensureColumns('user_posts', [
        ['source_kind', 'text'],
        ['source_id', 'integer'],
      ]);
    }
  } catch (err) {
    console.error('[migrations] Failed to inspect user_posts for source_kind guard:', err);
  }

  // Safety guard: ensure FB-style profile tables exist. Migrations 0007 and
  // 0014 create user_posts / post_likes / post_comments, but production
  // databases that were initialised from a snapshot taken before those
  // migrations ran (or where the row was inserted into __drizzle_migrations
  // without the DDL actually executing) are missing the tables, causing
  // every /api/profile/:id, /api/profile/me, /api/profile/:id/posts,
  // POST /api/profile/posts, /like, /comment call to throw with no useful
  // error to the client. Same shape as the cover_image_url guard above —
  // CREATE TABLE IF NOT EXISTS is idempotent so this is safe to run on
  // every boot.
  type TableInfo = { name: string };
  const tableExists = (name: string): boolean => {
    try {
      const rows = rawSqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .all(name) as TableInfo[];
      return rows.length > 0;
    } catch {
      return false;
    }
  };

  const ensureTable = (name: string, ddl: string, indexDdl: readonly string[] = []) => {
    if (tableExists(name)) return;
    try {
      rawSqlite.exec(ddl);
      for (const idx of indexDdl) {
        try {
          rawSqlite.exec(idx);
        } catch (e) {
          console.error(`[migrations] Failed to create index on ${name} (non-fatal):`, e);
        }
      }
      console.log(`[migrations] Created missing ${name} table`);
    } catch (e) {
      console.error(`[migrations] Failed to create ${name} table (non-fatal):`, e);
    }
  };

  ensureTable(
    'user_posts',
    `CREATE TABLE IF NOT EXISTS \`user_posts\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text NOT NULL,
      \`content\` text NOT NULL,
      \`image_url\` text,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    [
      'CREATE INDEX IF NOT EXISTS `IDX_user_posts_user` ON `user_posts` (`user_id`);',
      'CREATE INDEX IF NOT EXISTS `IDX_user_posts_created` ON `user_posts` (`created_at`);',
    ],
  );

  ensureTable(
    'post_likes',
    `CREATE TABLE IF NOT EXISTS \`post_likes\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`post_id\` integer NOT NULL,
      \`user_id\` text NOT NULL,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    [
      'CREATE UNIQUE INDEX IF NOT EXISTS `IDX_post_likes_unique` ON `post_likes` (`post_id`, `user_id`);',
    ],
  );

  ensureTable(
    'post_comments',
    `CREATE TABLE IF NOT EXISTS \`post_comments\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`post_id\` integer NOT NULL,
      \`user_id\` text NOT NULL,
      \`content\` text NOT NULL,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    [
      'CREATE INDEX IF NOT EXISTS `IDX_post_comments_post` ON `post_comments` (`post_id`);',
    ],
  );

  // --- Phase 2 P2.1.4: push_subscriptions (migration 0009_push_subscriptions) ---
  ensureTable(
    'push_subscriptions',
    `CREATE TABLE IF NOT EXISTS \`push_subscriptions\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text NOT NULL,
      \`endpoint\` text NOT NULL,
      \`p256dh\` text NOT NULL,
      \`auth\` text NOT NULL,
      \`user_agent\` text,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
    [
      'CREATE UNIQUE INDEX IF NOT EXISTS `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);',
      'CREATE INDEX IF NOT EXISTS `idx_push_subs_user` ON `push_subscriptions` (`user_id`);',
    ],
  );

  // --- Phase 3 MaraAI hybrid-platform (migration 0010_maraai_platform) ---
  ensureTable(
    'consent_records',
    `CREATE TABLE IF NOT EXISTS \`consent_records\` (
      \`user_id\` text PRIMARY KEY NOT NULL,
      \`mode\` text DEFAULT 'centralized' NOT NULL,
      \`p2p_enabled\` integer DEFAULT 0 NOT NULL,
      \`bandwidth_share_gb_month\` integer DEFAULT 0 NOT NULL,
      \`background_node\` integer DEFAULT 0 NOT NULL,
      \`advanced_ai_routing\` integer DEFAULT 0 NOT NULL,
      \`notifications_enabled\` integer DEFAULT 0 NOT NULL,
      \`kill_switch\` integer DEFAULT 0 NOT NULL,
      \`consent_version\` integer DEFAULT 1 NOT NULL,
      \`accepted_terms_at\` integer,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
      \`updated_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
  );

  ensureTable(
    'p2p_nodes',
    `CREATE TABLE IF NOT EXISTS \`p2p_nodes\` (
      \`node_id\` text PRIMARY KEY NOT NULL,
      \`user_id\` text NOT NULL,
      \`device_label\` text,
      \`status\` text DEFAULT 'offline' NOT NULL,
      \`score\` integer DEFAULT 0 NOT NULL,
      \`uptime_sec\` integer DEFAULT 0 NOT NULL,
      \`bytes_in\` integer DEFAULT 0 NOT NULL,
      \`bytes_out\` integer DEFAULT 0 NOT NULL,
      \`last_seen_at\` integer,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
    ['CREATE INDEX IF NOT EXISTS `idx_p2p_nodes_user` ON `p2p_nodes` (`user_id`);'],
  );

  ensureTable(
    'activity_log',
    `CREATE TABLE IF NOT EXISTS \`activity_log\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text,
      \`kind\` text NOT NULL,
      \`meta\` text DEFAULT '{}' NOT NULL,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
    ['CREATE INDEX IF NOT EXISTS `idx_activity_log_user_time` ON `activity_log` (`user_id`, `created_at`);'],
  );

  ensureTable(
    'ai_route_log',
    `CREATE TABLE IF NOT EXISTS \`ai_route_log\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text,
      \`route\` text NOT NULL,
      \`module\` text,
      \`latency_ms\` integer DEFAULT 0 NOT NULL,
      \`tokens_in\` integer DEFAULT 0 NOT NULL,
      \`tokens_out\` integer DEFAULT 0 NOT NULL,
      \`success\` integer DEFAULT 1 NOT NULL,
      \`error\` text,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
    ['CREATE INDEX IF NOT EXISTS `idx_ai_route_log_user_time` ON `ai_route_log` (`user_id`, `created_at`);'],
  );

  ensureTable(
    'email_otp_codes',
    `CREATE TABLE IF NOT EXISTS \`email_otp_codes\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`email\` text NOT NULL,
      \`code_hash\` text NOT NULL,
      \`purpose\` text DEFAULT 'register' NOT NULL,
      \`attempts\` integer DEFAULT 0 NOT NULL,
      \`expires_at\` integer NOT NULL,
      \`consumed_at\` integer,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
    ['CREATE INDEX IF NOT EXISTS `idx_email_otp_email_time` ON `email_otp_codes` (`email`, `created_at`);'],
  );

  // --- Migration 0013_password_reset_tokens ---
  ensureTable(
    'password_reset_tokens',
    `CREATE TABLE IF NOT EXISTS \`password_reset_tokens\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text NOT NULL,
      \`token\` text NOT NULL,
      \`expires_at\` integer NOT NULL,
      \`used_at\` integer,
      \`created_at\` integer DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );`,
    [
      'CREATE UNIQUE INDEX IF NOT EXISTS `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);',
      'CREATE INDEX IF NOT EXISTS `IDX_prt_user_id` ON `password_reset_tokens` (`user_id`);',
      'CREATE INDEX IF NOT EXISTS `IDX_prt_expires_at` ON `password_reset_tokens` (`expires_at`);',
    ],
  );

  // --- Migration 0015_direct_messages ---
  ensureTable(
    'conversations',
    `CREATE TABLE IF NOT EXISTS \`conversations\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_a_id\` text NOT NULL,
      \`user_b_id\` text NOT NULL,
      \`last_message_at\` integer,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    ['CREATE UNIQUE INDEX IF NOT EXISTS `IDX_conversations_users` ON `conversations` (`user_a_id`, `user_b_id`);'],
  );

  ensureTable(
    'direct_messages',
    `CREATE TABLE IF NOT EXISTS \`direct_messages\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`conversation_id\` integer NOT NULL,
      \`sender_id\` text NOT NULL,
      \`content\` text NOT NULL,
      \`read\` integer NOT NULL DEFAULT 0,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    ['CREATE INDEX IF NOT EXISTS `IDX_direct_messages_conv` ON `direct_messages` (`conversation_id`);'],
  );

  try {
    const p2pRows = rawSqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='p2p_tasks'")
      .all() as Array<{ sql?: string }>;
    const p2pTaskSql = p2pRows[0]?.sql ?? '';
    if (p2pTaskSql && (!p2pTaskSql.includes('claimed_by') || !p2pTaskSql.includes("'running'"))) {
      rawSqlite.transaction(() => {
        rawSqlite.exec(`
          CREATE TABLE p2p_tasks_new (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('maraAnalysis','missionGeneration','contentProcessing','knowledgeBase')),
            payload TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending','running','assigned','completed','failed')),
            assigned_node TEXT,
            assigned_user_id TEXT,
            claimed_by TEXT,
            assigned_at INTEGER,
            result TEXT,
            created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
            completed_at INTEGER
          );
          INSERT INTO p2p_tasks_new (
            id, type, payload, status, assigned_node, assigned_user_id, claimed_by, assigned_at, result, created_at, completed_at
          )
          SELECT
            id,
            type,
            payload,
            CASE WHEN status = 'assigned' THEN 'running' ELSE status END,
            assigned_node,
            assigned_user_id,
            COALESCE(claimed_by, assigned_user_id),
            assigned_at,
            result,
            created_at,
            completed_at
          FROM p2p_tasks;
          DROP TABLE p2p_tasks;
          ALTER TABLE p2p_tasks_new RENAME TO p2p_tasks;
          CREATE INDEX IF NOT EXISTS idx_p2p_tasks_status ON p2p_tasks(status, created_at);
          CREATE INDEX IF NOT EXISTS idx_p2p_tasks_node ON p2p_tasks(assigned_node);
          CREATE INDEX IF NOT EXISTS idx_p2p_tasks_claimed_by ON p2p_tasks(claimed_by, status);
        `);
      })();
      console.log('[migrations] Hardened p2p_tasks ownership/state-machine schema');
    }
  } catch (err) {
    console.error('[migrations] Failed to harden p2p_tasks schema (non-fatal):', err);
  }

  ensureTable(
    'user_memories',
    `CREATE TABLE IF NOT EXISTS \`user_memories\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text NOT NULL,
      \`fact\` text NOT NULL,
      \`category\` text NOT NULL DEFAULT 'general',
      \`confidence\` real NOT NULL DEFAULT 0.8,
      \`source\` text NOT NULL DEFAULT 'chat',
      \`created_at\` integer NOT NULL DEFAULT (unixepoch()),
      \`last_accessed\` integer NOT NULL DEFAULT (unixepoch())
    );`,
    [
      'CREATE INDEX IF NOT EXISTS `IDX_user_memories_user` ON `user_memories` (`user_id`);',
      'CREATE INDEX IF NOT EXISTS `IDX_user_memories_user_cat` ON `user_memories` (`user_id`, `category`);',
    ],
  );
}
