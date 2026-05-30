/**
 * SQLite backup service.
 *
 * - Copies maraai.sqlite → /data/backups/maraai_YYYY-MM-DD_HH-MM.sqlite
 * - Retains the 7 most recent backups; deletes older ones
 * - Scheduled daily at 03:00 UTC via scheduleDbBackup()
 *
 * npm run backup:db runs this once immediately (see package.json).
 */

import fs from 'fs';
import path from 'path';

const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups';
const MAX_BACKUPS = 7;

function getDbPath(): string {
  const url = process.env.DATABASE_URL;
  if (url) {
    if (url.startsWith('sqlite:////')) return url.slice('sqlite:///'.length);
    if (url.startsWith('sqlite:///')) return url.slice('sqlite:///'.length);
    if (url.startsWith('sqlite://')) return url.slice('sqlite://'.length);
  }
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.DATABASE_FILE) return process.env.DATABASE_FILE;
  if (fs.existsSync('/data')) return '/data/maraai.sqlite';
  return path.resolve(process.cwd(), 'maraai.sqlite');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function backupFilename(): string {
  const now = new Date();
  const date = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  const time = `${pad2(now.getUTCHours())}-${pad2(now.getUTCMinutes())}`;
  return `maraai_${date}_${time}.sqlite`;
}

export function runDbBackup(): { success: boolean; file?: string; error?: string } {
  try {
    const src = getDbPath();
    if (!fs.existsSync(src)) {
      return { success: false, error: `DB file not found: ${src}` };
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const dest = path.join(BACKUP_DIR, backupFilename());
    fs.copyFileSync(src, dest);
    console.info(`[backup:db] Backup created: ${dest}`);

    pruneOldBackups();

    return { success: true, file: dest };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[backup:db] Backup failed:', message);
    return { success: false, error: message };
  }
}

function pruneOldBackups(): void {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('maraai_') && f.endsWith('.sqlite'))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    const toDelete = files.slice(MAX_BACKUPS);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      console.info(`[backup:db] Removed old backup: ${f.name}`);
    }
  } catch (err) {
    console.warn('[backup:db] Prune failed:', err instanceof Error ? err.message : String(err));
  }
}

function msUntilNextUtcHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(targetHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_HOUR_UTC = 3;

/**
 * Schedule daily backup at 03:00 UTC.
 * Call once from server startup; the timer keeps running for the lifetime of the process.
 */
// Allow running directly: `tsx server/services/dbBackup.ts`
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('dbBackup.ts') || process.argv[1].endsWith('dbBackup.js'))
) {
  const result = runDbBackup();
  process.exit(result.success ? 0 : 1);
}

export function scheduleDbBackup(): void {
  if (process.env.NODE_ENV !== 'production' && !process.env.FORCE_DB_BACKUP_SCHEDULE) {
    console.info('[backup:db] Scheduler skipped (non-production). Set FORCE_DB_BACKUP_SCHEDULE=1 to enable locally.');
    return;
  }

  const delay = msUntilNextUtcHour(BACKUP_HOUR_UTC);
  console.info(`[backup:db] First backup in ${Math.round(delay / 60000)} min (at 03:00 UTC daily)`);

  setTimeout(() => {
    runDbBackup();
    setInterval(runDbBackup, DAY_MS);
  }, delay);
}
