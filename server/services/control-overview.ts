import { rawSqlite } from '../db.js';
import { eventBusStatus } from '../maraai/kafka.js';

export interface ControlOverview {
  users: { total: number; newToday: number; active7d: number };
  languages: Array<Record<string, unknown>>;
  revenue: { total: number; thisMonth: number; pendingOrders: number };
  notifications: { total: number; today: number };
  pwa: { installs: number };
  missions: { completed: number };
  aiRoutes: Array<Record<string, unknown>>;
  system: { uptimeSeconds: number; memoryMB: number; totalMemoryMB: number; nodeVersion: string };
  brain: { lastLog: Record<string, unknown> | null; logsToday: number };
  eventBus: ReturnType<typeof eventBusStatus>;
}

function sqlGet<T>(query: string): T | null {
  try { return rawSqlite.prepare(query).get() as T; } catch { return null; }
}

function sqlAll<T>(query: string): T[] {
  try { return rawSqlite.prepare(query).all() as T[]; } catch { return []; }
}

/** Shared read-only platform overview for Web Admin and Control Center. */
export function readControlOverview(): ControlOverview {
  const totalUsers = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users')?.cnt ?? 0;
  const newUsersToday = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE created_at > unixepoch()-86400')?.cnt ?? 0;
  const activeUsers7d = sqlGet<{ cnt: number }>('SELECT COUNT(DISTINCT user_id) as cnt FROM chat_messages WHERE created_at > unixepoch()-604800')?.cnt ?? 0;
  const languages = sqlAll<Record<string, unknown>>('SELECT language, COUNT(*) as cnt FROM user_preferences WHERE language IS NOT NULL GROUP BY language ORDER BY cnt DESC LIMIT 10');
  const totalRevenue = sqlGet<{ total: number }>('SELECT COALESCE(SUM(amount),0) as total FROM premium_orders WHERE status="confirmed"')?.total ?? 0;
  const revenueMonth = sqlGet<{ total: number }>('SELECT COALESCE(SUM(amount),0) as total FROM premium_orders WHERE status="confirmed" AND created_at>unixepoch()-2592000')?.total ?? 0;
  const pendingOrders = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM premium_orders WHERE status="pending"')?.cnt ?? 0;
  const notifTotal = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notifications')?.cnt ?? 0;
  const notifToday = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notifications WHERE created_at>unixepoch()-86400')?.cnt ?? 0;
  const pwaInstalls = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM push_subscriptions')?.cnt ?? 0;
  const missionsComp = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM user_missions WHERE status="completed"')?.cnt ?? 0;
  const aiRoutes = sqlAll<Record<string, unknown>>('SELECT route, COUNT(*) as cnt, AVG(latency_ms) as avg_latency, SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes FROM ai_route_log WHERE created_at>unixepoch()-86400 GROUP BY route');
  const lastBrainLog = sqlGet<Record<string, unknown>>('SELECT message, level, created_at FROM brain_logs ORDER BY created_at DESC LIMIT 1');
  const brainToday = sqlGet<{ cnt: number }>('SELECT COUNT(*) as cnt FROM brain_logs WHERE created_at>unixepoch()-86400')?.cnt ?? 0;

  return {
    users: { total: totalUsers, newToday: newUsersToday, active7d: activeUsers7d },
    languages,
    revenue: { total: totalRevenue, thisMonth: revenueMonth, pendingOrders },
    notifications: { total: notifTotal, today: notifToday },
    pwa: { installs: pwaInstalls },
    missions: { completed: missionsComp },
    aiRoutes,
    system: {
      uptimeSeconds: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      totalMemoryMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      nodeVersion: process.version,
    },
    brain: { lastLog: lastBrainLog, logsToday: brainToday },
    eventBus: eventBusStatus(),
  };
}
