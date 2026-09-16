import { rawSqlite } from '../db.js';
import { startPaymentActivationChecker } from '../modules/launch-countdown.js';
import { startSecurityCleanup } from '../security/cleanup.js';
import { scheduleDbBackup } from '../services/dbBackup.js';
import { startControlTaskWorker } from './control-task-worker.js';
import { startWriterPayoutRetryChecker } from '../billing/writer-payout-retry.js';
import { backfillKnowledgeEmbeddings } from '../mara-brain/embeddings-backfill.js';
import { startLibraryPrecache } from '../modules/library-precache.js';

export function startBackgroundJobs(): void {
  scheduleDbBackup();
  startControlTaskWorker();

  function purgeOldMessages() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const iso = new Date(cutoff).toISOString();
    try {
      rawSqlite.prepare(`DELETE FROM direct_messages WHERE created_at < ?`).run(iso);
      rawSqlite.prepare(`DELETE FROM chat_messages WHERE created_at < ?`).run(iso);
    } catch {
      // tables may not exist in all envs
    }
  }

  purgeOldMessages();
  setInterval(purgeOldMessages, 24 * 60 * 60 * 1000);

  startPaymentActivationChecker();
  startSecurityCleanup();
  startWriterPayoutRetryChecker();

  // Fire-and-forget: paces itself in the background (see the module doc
  // comment), no-ops once every row already has an embedding.
  void backfillKnowledgeEmbeddings();

  startLibraryPrecache();
}
