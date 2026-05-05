/**
 * Web Push REST endpoints (Phase 2 P2.1.4).
 *
 *   GET  /api/push/public-key  → { publicKey }  (VAPID pub key, or 503 if unconfigured)
 *   POST /api/push/subscribe   → { ok: true }   (saves PushSubscription.toJSON())
 *   POST /api/push/unsubscribe → { ok: true }   (by endpoint)
 */

import type { Request, Response } from 'express';
import {
  getPublicKey,
  isConfigured,
  saveSubscription,
  deleteSubscription,
} from '../../../server/push/vapid.js';

function currentUserId(req: Request): string | null {
  const u = req.user as { uid?: string; claims?: { sub?: string } } | undefined;
  return u?.uid ?? u?.claims?.sub ?? null;
}

export async function publicKey(_req: Request, res: Response) {
  const key = getPublicKey();
  if (!key) {
    res.status(503).json({ error: 'push_unconfigured' });
    return;
  }
  res.json({ publicKey: key });
}

export async function subscribe(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!isConfigured()) {
      res.status(503).json({ error: 'push_unconfigured' });
      return;
    }
    const body = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: 'invalid_subscription' });
      return;
    }
    await saveSubscription({
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: req.get('user-agent') ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] subscribe failed:', err);
    res.status(500).json({ error: 'push_subscribe_failed' });
  }
}

export async function unsubscribe(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const endpoint = (req.body as { endpoint?: string } | undefined)?.endpoint;
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint_required' });
      return;
    }
    await deleteSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] unsubscribe failed:', err);
    res.status(500).json({ error: 'push_unsubscribe_failed' });
  }
}
