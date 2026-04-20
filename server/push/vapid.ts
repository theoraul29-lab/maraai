/**
 * Web Push (VAPID) plumbing — Phase 2 P2.1.4.
 *
 * Design:
 *   • VAPID keys live in env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
 *     `VAPID_SUBJECT`). If any is missing, `isConfigured()` returns false and
 *     `sendToUser()` becomes a no-op — the notification row is still written
 *     (bell UI keeps working), only the OS-level push is skipped.
 *   • Subscriptions are UPSERTed by unique `endpoint`. Browsers rotate
 *     endpoints occasionally; we must not create duplicate rows per user.
 *   • On dispatch, 404/410 from the push service means the subscription
 *     expired and we garbage-collect the row so we don't keep retrying it.
 *   • Every other error is logged but NEVER thrown — push must be
 *     fire-and-forget like the producer pattern. A failed push should never
 *     take down a follow/comment/like request.
 */

import webpush, { type SendResult } from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { pushSubscriptions } from '../../shared/schema.js';

let configured = false;
let initAttempted = false;

function init(): void {
  if (initAttempted) return;
  initAttempted = true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@hellomara.net';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys missing — push notifications disabled');
    return;
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    console.info('[push] VAPID configured (subject=%s)', subject);
  } catch (err) {
    console.error('[push] setVapidDetails failed:', err);
  }
}

export function isConfigured(): boolean {
  init();
  return configured;
}

export function getPublicKey(): string | null {
  init();
  return configured ? (process.env.VAPID_PUBLIC_KEY || null) : null;
}

export async function saveSubscription(args: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  const { userId, endpoint, p256dh, auth, userAgent } = args;
  if (!endpoint || !p256dh || !auth) {
    throw new Error('invalid_subscription');
  }
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, userAgent: userAgent ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, userAgent: userAgent ?? null },
    });
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  relatedId?: number | null;
  kind?: string;
}

/**
 * Fire-and-forget: look up all of `userId`'s active subscriptions and
 * dispatch `payload` to each. Expired subs are deleted. Errors are swallowed.
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  init();
  if (!configured) return;
  let subs;
  try {
    subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  } catch (err) {
    console.error('[push] failed to load subscriptions for', userId, err);
    return;
  }
  if (!subs.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    tag: payload.tag,
    icon: payload.icon ?? '/icons/icon-192.png',
    data: { relatedId: payload.relatedId ?? null, kind: payload.kind ?? null },
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number } | undefined)?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired — drop the row so we don't retry forever.
          try {
            await deleteSubscription(sub.endpoint);
          } catch (gcErr) {
            console.error('[push] gc failed for', sub.endpoint, gcErr);
          }
        } else {
          console.error('[push] sendNotification failed:', status, err);
        }
      }
    }),
  );
}

export type { SendResult };
