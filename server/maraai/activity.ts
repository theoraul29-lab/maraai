// Transparency activity log.
//
// Every advanced/optional action (consent change, mode switch, kill switch,
// AI route, P2P node register, kafka publish) writes one row here. The user
// can read these rows via /api/transparency/activity. Persisting them is
// what makes the "no hidden background activity" promise verifiable.

import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '../db.js';
import { activityLog, type ActivityLogRow } from '../../shared/schema.js';

export type ActivityKind =
  | 'consent.updated'
  | 'mode.changed'
  | 'p2p.node.registered'
  | 'p2p.node.heartbeat'
  | 'p2p.node.deleted'
  | 'p2p.kill_switch'
  | 'ai.route'
  | 'ai.error'
  | 'kafka.publish'
  | 'kafka.fallback'
  | 'auth.otp.requested'
  | 'auth.otp.verified'
  | 'sync.local'
  | 'system';

export async function logActivity(
  userId: string | null,
  kind: ActivityKind | string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(activityLog).values({
      userId: userId ?? null,
      kind,
      meta: JSON.stringify(meta ?? {}),
    });
  } catch (err) {
    // The activity log is best-effort. We never want telemetry writes to
    // take down the originating request handler.
    console.error('[maraai/activity] failed to log activity:', err);
  }
}

export type ActivityView = Omit<ActivityLogRow, 'meta'> & { meta: Record<string, unknown> };

export async function listActivity(
  userId: string,
  opts: { limit?: number; sinceMs?: number } = {},
): Promise<ActivityView[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
  const cond = opts.sinceMs
    ? and(eq(activityLog.userId, userId), gt(activityLog.createdAt, new Date(opts.sinceMs)))
    : eq(activityLog.userId, userId);
  const rows = await db
    .select()
    .from(activityLog)
    .where(cond)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    meta: safeParse(r.meta),
  }));
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
