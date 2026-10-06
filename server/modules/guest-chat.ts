// Guest chat — the Mara-first anonymous "talk before you sign up" surface.
//
// Deliberately NOT a second AI system: it calls the exact same `route()`
// hybrid router (server/maraai/ai-router.ts) used by the authenticated
// `/api/chat` endpoint, and persists turns through the exact same
// `chat_messages` table via `storage.createChatMessage`/`getChatMessages` —
// which is what lets signup migrate a guest's conversation by simply
// re-keying those rows (see server/modules/auth-api.ts's signupHandler).
//
// No `userId` is passed into `routeAi()`/`getMaraResponse()` here on
// purpose: that keeps a guest turn fast and stateless on the memory side
// (no buildUserContext/user_memories/evolved-profile lookups for a
// throwaway id) and uses the static fallback persona instead. Rate
// limiting itself is handled upstream by guestChatGuard, not here.
import type { Request, Response } from 'express';
import { storage } from '../storage.js';
import { route as routeAi } from '../maraai/ai-router.js';
import { guestMessagesRemaining } from '../middleware/guestChatGuard.js';

const MAX_GUEST_MESSAGE_CHARS = 2000;
// Hard cap on what a guest turn can show, independent of the provider's own
// settings — the plan's "hard output limit" for anonymous replies, applied
// here rather than threading a new maxTokens option through the shared
// Ollama/Anthropic provider clients (ai-provider.ts) for every caller.
const MAX_GUEST_REPLY_CHARS = 600;

function truncateReply(text: string): string {
  if (text.length <= MAX_GUEST_REPLY_CHARS) return text;
  const slice = text.slice(0, MAX_GUEST_REPLY_CHARS);
  const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  return (lastBreak > 200 ? slice.slice(0, lastBreak + 1) : slice).trim() + '…';
}

export async function getGuestChatHistory(req: Request, res: Response) {
  try {
    const guestUserId = (req.user as any)?.uid;
    const history = await storage.getChatMessages(guestUserId);
    const status = guestMessagesRemaining(guestUserId);
    res.json({
      messages: history.slice(0, 20),
      remaining: status.remaining,
      limit: status.limit,
      resetsAt: status.resetsAt,
    });
  } catch (error) {
    console.error('[guest-chat] Failed to load history:', error);
    res.status(500).json({ message: 'Failed to get chat history' });
  }
}

export async function sendGuestChatMessage(req: Request, res: Response) {
  try {
    const guestUserId = (req.user as any)?.uid;
    const { message, language } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }
    if (message.length > MAX_GUEST_MESSAGE_CHARS) {
      return res.status(400).json({ message: `Message is too long. Limit is ${MAX_GUEST_MESSAGE_CHARS} characters.` });
    }

    // Chronological (oldest-first) history for the LLM — getChatMessages
    // returns newest-first, so reverse before slicing to the most recent
    // few turns. A guest has at most MAX_GUEST_MESSAGES turns anyway.
    const priorHistory = await storage.getChatMessages(guestUserId);
    const formattedHistory = [...priorHistory]
      .reverse()
      .slice(-8)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content }));

    const userMsg = await storage.createChatMessage({ content: message, sender: 'user', userId: guestUserId });

    const result = await routeAi(message, {
      prefs: { language },
      history: formattedHistory,
    });

    const replyText = truncateReply(result.response);
    const aiMsg = await storage.createChatMessage({ content: replyText, sender: 'mara', userId: guestUserId });

    const status = guestMessagesRemaining(guestUserId);
    res.json({
      message: userMsg,
      aiResponse: aiMsg,
      detectedMood: result.detectedMood,
      remaining: status.remaining,
      limit: status.limit,
      resetsAt: status.resetsAt,
    });
  } catch (error) {
    console.error('[guest-chat] Failed to send message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
}
