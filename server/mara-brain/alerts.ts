// Mara Alerts — automated business intelligence alerts
//
// Creates alerts when platform KPIs deviate from thresholds defined in the
// ObjectiveFunction.alertThresholds. Called at the end of every brain cycle.
// Alerts are stored in `mara_alerts` (created here via DDL) and surfaced in
// the admin dashboard.
//
// Design rules:
//   - DDL via rawSqlite.exec() — drizzle has no schema for this table
//   - Queries via rawSqlite.prepare() — same reason
//   - 24h dedup: same type+title won't fire twice in a day
//   - Never throws — always swallows errors so brain cycle never fails

import { rawSqlite } from '../db.js';

export interface MaraAlert {
  id: number;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metadata: string; // JSON string
  read: number; // 0 | 1
  created_at: number; // unix seconds
}

export function ensureAlertsTable(): void {
  rawSqlite.exec(`
    CREATE TABLE IF NOT EXISTS mara_alerts (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      type     TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title    TEXT NOT NULL,
      message  TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      read     INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_mara_alerts_read ON mara_alerts (read);
    CREATE INDEX IF NOT EXISTS idx_mara_alerts_created_at ON mara_alerts (created_at DESC);
  `);
}

/**
 * Insert a new alert, skipping if an identical type+title already fired in
 * the last 24 hours (dedup window). Returns the new row id, or null if deduped.
 */
export function createAlert(
  type: string,
  severity: MaraAlert['severity'],
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
): number | null {
  try {
    const existing = rawSqlite
      .prepare(
        'SELECT id FROM mara_alerts WHERE type = ? AND title = ? AND created_at > (unixepoch() - 86400) LIMIT 1',
      )
      .get(type, title) as { id: number } | undefined;

    if (existing) return null;

    const result = rawSqlite
      .prepare(
        'INSERT INTO mara_alerts (type, severity, title, message, metadata) VALUES (?, ?, ?, ?, ?)',
      )
      .run(type, severity, title, message, JSON.stringify(metadata));

    return Number(result.lastInsertRowid);
  } catch (err) {
    console.warn('[alerts] createAlert failed:', err);
    return null;
  }
}

/**
 * Analyze platform health and fire alerts as needed.
 * Called at the end of every brain cycle — never throws.
 */
export async function analyzePlatformAndAlert(): Promise<void> {
  try {
    const { storage } = await import('../storage.js');
    const { getKnowledgeStats } = await import('./knowledge-base.js');
    const { getObjective } = await import('../mara-core/objective.js');

    const objective = getObjective();
    const thresholds = objective.alertThresholds ?? {};

    // ── User milestone alerts ────────────────────────────────────────────────
    const users = await storage.getAllUsers();
    const totalUsers = users.length;
    const milestones = [10, 50, 100, 500, 1000, 5000];
    for (const m of milestones) {
      if (totalUsers >= m && totalUsers < m + 5) {
        createAlert(
          `milestone_users_${m}`,
          'info',
          `${m} utilizatori înregistrați`,
          `Platforma hellomara.net a atins ${totalUsers} utilizatori — milestone important pe drumul spre 1M EUR ARR!`,
          { users: totalUsers, milestone: m },
        );
      }
    }

    // ── Knowledge base health ────────────────────────────────────────────────
    const stats = await getKnowledgeStats();
    if (stats.total < 20) {
      createAlert(
        'kb_critical_empty',
        'warning',
        'Knowledge base insuficientă',
        `Doar ${stats.total} intrări în knowledge base. Mara nu are context suficient pentru decizii bune.`,
        { total: stats.total },
      );
    }

    // ── Brain cycle errors ───────────────────────────────────────────────────
    const recentLogs = await storage.getBrainLogs(20);
    const errorLogs = recentLogs.filter((l: any) => l.level === 'error');
    if (errorLogs.length >= 5) {
      createAlert(
        'brain_repeated_errors',
        'critical',
        'Erori repetate în brain cycle',
        `${errorLogs.length} erori din ultimele 20 de cicluri brain. Verifică configurația LLM și BRAIN_ENABLED.`,
        { errorCount: errorLogs.length },
      );
    } else if (errorLogs.length >= 3) {
      createAlert(
        'brain_errors_warning',
        'warning',
        'Erori frecvente în brain cycle',
        `${errorLogs.length} erori detectate în ultimele 20 cicluri brain.`,
        { errorCount: errorLogs.length },
      );
    }

    // ── LLM error rate ───────────────────────────────────────────────────────
    const llmThreshold = thresholds.llmErrorRatePct ?? 15;
    const totalLogs = recentLogs.length;
    if (totalLogs > 0) {
      const errorRate = (errorLogs.length / totalLogs) * 100;
      if (errorRate >= llmThreshold) {
        createAlert(
          'llm_high_error_rate',
          'warning',
          'Rată ridicată de erori LLM',
          `${errorRate.toFixed(0)}% din ciclurile recente au eșuat (prag: ${llmThreshold}%). Verifică quota API.`,
          { errorRate, threshold: llmThreshold },
        );
      }
    }

    // ── Objective goal deadline alerts ───────────────────────────────────────
    const goals = objective.goals ?? [];
    const now = Date.now();
    for (const goal of goals) {
      const deadline = new Date(goal.deadline).getTime();
      const daysLeft = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 30) {
        createAlert(
          `goal_deadline_${goal.id}`,
          daysLeft <= 7 ? 'critical' : 'warning',
          `Goal aproape de deadline: ${goal.label}`,
          `Mai sunt ${daysLeft} zile până la deadline-ul pentru "${goal.label}" (target: ${goal.targetValue} ${goal.unit}).`,
          { goalId: goal.id, daysLeft, target: goal.targetValue, unit: goal.unit },
        );
      }
    }

  } catch (err) {
    console.warn('[alerts] analyzePlatformAndAlert failed (non-fatal):', err);
  }
}

export function getUnreadAlerts(): MaraAlert[] {
  try {
    return rawSqlite
      .prepare('SELECT * FROM mara_alerts WHERE read = 0 ORDER BY created_at DESC LIMIT 50')
      .all() as MaraAlert[];
  } catch {
    return [];
  }
}

export function getAllAlerts(limit = 100): MaraAlert[] {
  try {
    return rawSqlite
      .prepare('SELECT * FROM mara_alerts ORDER BY created_at DESC LIMIT ?')
      .all(limit) as MaraAlert[];
  } catch {
    return [];
  }
}

export function markAlertRead(id: number): boolean {
  try {
    const r = rawSqlite.prepare('UPDATE mara_alerts SET read = 1 WHERE id = ?').run(id);
    return (r.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

export function markAllAlertsRead(): number {
  try {
    const r = rawSqlite.prepare('UPDATE mara_alerts SET read = 1 WHERE read = 0').run();
    return r.changes ?? 0;
  } catch {
    return 0;
  }
}

export function getUnreadCount(): number {
  try {
    const row = rawSqlite
      .prepare('SELECT COUNT(*) AS cnt FROM mara_alerts WHERE read = 0')
      .get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}
