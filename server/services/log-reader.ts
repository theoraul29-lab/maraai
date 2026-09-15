import { storage } from '../storage.js';
import { getAllAlerts, getUnreadAlerts, getUnreadCount, type MaraAlert } from '../mara-brain/alerts.js';
import { listActivity, type ActivityView } from '../maraai/activity.js';
import type { BrainLog } from '../../shared/schema.js';

export interface ControlLogSnapshot {
  brainLogs: BrainLog[];
  alerts: MaraAlert[];
  unreadAlertRows: MaraAlert[];
  unreadAlerts: number;
  activity: ActivityView[];
}

/** Read-only log capability shared by Web Admin and the Control Center. */
export async function readControlLogs(options: {
  brainLimit?: number;
  alertLimit?: number;
  userId?: string;
  activityLimit?: number;
  activitySinceMs?: number;
} = {}): Promise<ControlLogSnapshot> {
  const [brainLogs, activity] = await Promise.all([
    storage.getBrainLogs(options.brainLimit ?? 20),
    options.userId
      ? listActivity(options.userId, {
          limit: options.activityLimit ?? 100,
          sinceMs: options.activitySinceMs,
        })
      : Promise.resolve([] as ActivityView[]),
  ]);

  return {
    brainLogs,
    alerts: getAllAlerts(options.alertLimit ?? 100),
    unreadAlertRows: getUnreadAlerts(),
    unreadAlerts: getUnreadCount(),
    activity,
  };
}
