import type { Request, Response } from 'express';
import { storage } from '../../../server/storage.js';

function currentUserId(req: Request): string | null {
  const u = req.user as { uid?: string } | undefined;
  if (typeof u?.uid === 'string' && u.uid.length > 0) return u.uid;
  const fromSession = (req as unknown as { session?: { userId?: string } }).session?.userId;
  if (typeof fromSession === 'string' && fromSession.length > 0) return fromSession;
  return null;
}

export async function getOrCreateConv(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const { recipientId } = (req.body ?? {}) as { recipientId?: unknown };
    if (typeof recipientId !== 'string' || recipientId.length === 0) {
      res.status(400).json({ error: 'invalid_recipient' });
      return;
    }
    if (recipientId === userId) {
      res.status(400).json({ error: 'cannot_message_self' });
      return;
    }
    const conv = await storage.getOrCreateConversation(userId, recipientId);
    res.json(conv);
  } catch (err) {
    console.error('[messenger] getOrCreateConv failed:', err);
    res.status(500).json({ error: 'conv_failed' });
  }
}

export async function listConversations(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const items = await storage.listUserConversations(userId);
    res.json({ items });
  } catch (err) {
    console.error('[messenger] listConversations failed:', err);
    res.status(500).json({ error: 'list_convs_failed' });
  }
}

export async function getMessages(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const convId = Number.parseInt(req.params.convId ?? '', 10);
    if (!Number.isFinite(convId) || convId <= 0) {
      res.status(400).json({ error: 'invalid_conv_id' });
      return;
    }
    const rawLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const rawBefore = Number.parseInt(String(req.query.before ?? ''), 10);
    const before = Number.isFinite(rawBefore) ? rawBefore : undefined;
    const messages = await storage.listDirectMessages(convId, { limit, before });
    res.json({ items: messages });
  } catch (err) {
    console.error('[messenger] getMessages failed:', err);
    res.status(500).json({ error: 'get_msgs_failed' });
  }
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const convId = Number.parseInt(req.params.convId ?? '', 10);
    if (!Number.isFinite(convId) || convId <= 0) {
      res.status(400).json({ error: 'invalid_conv_id' });
      return;
    }
    const { content } = (req.body ?? {}) as { content?: unknown };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'invalid_content' });
      return;
    }
    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 5000) {
      res.status(400).json({ error: 'invalid_content' });
      return;
    }
    const msg = await storage.sendDirectMessage(convId, userId, trimmed);
    res.status(201).json(msg);
  } catch (err) {
    console.error('[messenger] sendMessage failed:', err);
    res.status(500).json({ error: 'send_msg_failed' });
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const convId = Number.parseInt(req.params.convId ?? '', 10);
    if (!Number.isFinite(convId) || convId <= 0) {
      res.status(400).json({ error: 'invalid_conv_id' });
      return;
    }
    await storage.markConversationRead(convId, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[messenger] markRead failed:', err);
    res.status(500).json({ error: 'mark_read_failed' });
  }
}
