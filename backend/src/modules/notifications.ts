/**
 * Notifications REST API (Phase 2 P2.1).
 *
 * The `notifications` table has existed in the schema since day 0 and
 * `storage.ts` has CRUD helpers for it, but nothing was exposed via HTTP
 * until now. This module adds:
 *   - GET    /api/notifications          → last 50
 *   - GET    /api/notifications/unread-count
 *   - POST   /api/notifications/:id/read
 *   - POST   /api/notifications/read-all
 *
 * Producers live next to the events they observe (followUser, createComment,
 * likeVideo, billing webhook). They call `emit()` from `notifications/producer.ts`
 * which is a best-effort fire-and-forget — a notification failure must never
 * roll back the underlying action.
 */

import type { Request, Response } from 'express';
import { storage } from '../../../server/storage.js';

function currentUserId(req: Request): string | null {
  const u = req.user as { uid?: string; claims?: { sub?: string } } | undefined;
  return u?.uid ?? u?.claims?.sub ?? null;
}

export async function listNotifications(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const rows = await storage.getNotifications(userId);
    res.json({ items: rows });
  } catch (err) {
    console.error('[notifications] list failed:', err);
    res.status(500).json({ error: 'notifications_list_failed' });
  }
}

export async function unreadCount(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const n = await storage.getUnreadNotificationCount(userId);
    res.json({ count: n });
  } catch (err) {
    console.error('[notifications] unreadCount failed:', err);
    res.status(500).json({ error: 'notifications_count_failed' });
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    await storage.markNotificationRead(id, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] markRead failed:', err);
    res.status(500).json({ error: 'notifications_mark_failed' });
  }
}

export async function markAllRead(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    await storage.markAllNotificationsRead(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] markAllRead failed:', err);
    res.status(500).json({ error: 'notifications_mark_all_failed' });
  }
}
