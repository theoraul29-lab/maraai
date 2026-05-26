// Growth feature flags — gates viral loop and growth dashboard behind a
// minimum user count so features activate automatically when threshold is reached.

import { rawSqlite } from '../db.js';

const GROWTH_THRESHOLD = 70;

function getUserCount(): number {
  try {
    const row = rawSqlite
      .prepare('SELECT COUNT(*) as cnt FROM users')
      .get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

export function isViralLoopActive(): boolean {
  return getUserCount() >= GROWTH_THRESHOLD;
}

export function isGrowthDashboardActive(): boolean {
  return getUserCount() >= GROWTH_THRESHOLD;
}

export function getGrowthGateStatus(): {
  userCount: number;
  threshold: number;
  viralLoop: boolean;
  growthDashboard: boolean;
} {
  const userCount = getUserCount();
  return {
    userCount,
    threshold: GROWTH_THRESHOLD,
    viralLoop: userCount >= GROWTH_THRESHOLD,
    growthDashboard: userCount >= GROWTH_THRESHOLD,
  };
}
