// Transparency dashboard data.
//
// Aggregates everything the user needs to verify the platform is not doing
// anything behind their back: their consent record, the last N activity
// log entries, the AI route mix for the last 24h, P2P node status, and a
// process-level CPU snapshot.

import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '../db.js';
import { aiRouteLog, p2pNodes, type AiRoute } from '../../shared/schema.js';
import { getConsent } from './consent.js';
import { listActivity } from './activity.js';
import { eventBusStatus } from './kafka.js';

const procStartedAtMs = Date.now();
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

function cpuSnapshot() {
  const now = process.cpuUsage();
  const t = Date.now();
  const elapsedUs = (now.user + now.system) - (lastCpu.user + lastCpu.system);
  const wallUs = (t - lastCpuAt) * 1000;
  const cpuPercent = wallUs > 0 ? Math.max(0, Math.min(100, (elapsedUs / wallUs) * 100)) : 0;
  lastCpu = now;
  lastCpuAt = t;
  return {
    cpuPercent: Number(cpuPercent.toFixed(2)),
    rssMb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1)),
    uptimeSec: Math.floor((t - procStartedAtMs) / 1000),
  };
}

export type TransparencyStatus = {
  consent: Awaited<ReturnType<typeof getConsent>>;
  process: ReturnType<typeof cpuSnapshot>;
  eventBus: ReturnType<typeof eventBusStatus>;
  routeMix24h: Record<AiRoute, number>;
  nodes: Array<{
    nodeId: string;
    deviceLabel: string | null;
    status: string;
    score: number;
    bytesIn: number;
    bytesOut: number;
    uptimeSec: number;
  }>;
  warnings: string[];
};

export async function getTransparencyStatus(userId: string): Promise<TransparencyStatus> {
  const consent = await getConsent(userId);

  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const recent = await db
    .select()
    .from(aiRouteLog)
    .where(and(eq(aiRouteLog.userId, userId), gt(aiRouteLog.createdAt, new Date(sinceMs))))
    .orderBy(desc(aiRouteLog.createdAt))
    .limit(500);

  const routeMix24h: Record<AiRoute, number> = { local: 0, central: 0, p2p: 0 };
  for (const r of recent) {
    const k = (r.route as AiRoute) ?? 'central';
    routeMix24h[k] = (routeMix24h[k] || 0) + 1;
  }

  const nodes = await db
    .select()
    .from(p2pNodes)
    .where(eq(p2pNodes.userId, userId));

  const warnings: string[] = [];
  if (consent.killSwitch) warnings.push('kill_switch_active');
  if (consent.consentVersion === 0) warnings.push('onboarding_incomplete');
  if (!process.env.ANTHROPIC_API_KEY) warnings.push('central_llm_not_configured');

  return {
    consent,
    process: cpuSnapshot(),
    eventBus: eventBusStatus(),
    routeMix24h,
    nodes: nodes.map((n) => ({
      nodeId: n.nodeId,
      deviceLabel: n.deviceLabel ?? null,
      status: n.status,
      score: n.score,
      bytesIn: n.bytesIn,
      bytesOut: n.bytesOut,
      uptimeSec: n.uptimeSec,
    })),
    warnings,
  };
}

export async function getActivityFeed(userId: string, limit = 100, sinceMs?: number) {
  return listActivity(userId, { limit, sinceMs });
}
