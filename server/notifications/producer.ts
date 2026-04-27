/**
 * Notification producers (Phase 2 P2.1).
 *
 * Thin, typed helpers that wrap `storage.createNotification` with sensible
 * defaults and fire-and-forget semantics.
 *
 * Design rules:
 *   - **Never throw**. If writing a notification fails, we log and move on.
 *     A like / follow / comment must never be rolled back because we
 *     couldn't insert a notification row.
 *   - Self-notifications are skipped (liking your own post, following
 *     yourself, etc.).
 *   - `relatedId` points at the resource the user should open when they
 *     click the notification (video id, article id, etc.).
 */

import { storage } from '../storage.js';

type NotifKind =
  | 'follow'
  | 'comment_reel'
  | 'comment_writer'
  | 'like_reel'
  | 'like_writer'
  | 'subscription_active';

interface EmitOptions {
  recipientUserId: string;
  actorUserId?: string | null;
  kind: NotifKind;
  title: string;
  message: string;
  relatedId?: number | null;
}

export async function emit(opts: EmitOptions): Promise<void> {
  try {
    if (opts.actorUserId && opts.actorUserId === opts.recipientUserId) {
      return;
    }
    await storage.createNotification({
      userId: opts.recipientUserId,
      type: opts.kind,
      title: opts.title,
      message: opts.message,
      relatedId: opts.relatedId ?? null,
    });
  } catch (err) {
    // Intentionally swallowed: producers must never break the caller's flow.
    console.error('[notifications] emit failed:', opts.kind, err);
  }
}

async function actorDisplayName(actorUserId: string): Promise<string> {
  try {
    const u = await storage.getUserById(actorUserId);
    if (!u) return 'Someone';
    const named = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return named || u.displayName || u.email || 'Someone';
  } catch {
    return 'Someone';
  }
}

// ---------------------------------------------------------------------------
// Typed producers — one per event we currently observe.
// ---------------------------------------------------------------------------

export async function notifyFollow(
  followerId: string,
  followedId: string,
): Promise<void> {
  if (followerId === followedId) return;
  const name = await actorDisplayName(followerId);
  await emit({
    recipientUserId: followedId,
    actorUserId: followerId,
    kind: 'follow',
    title: 'New follower',
    message: `${name} started following you.`,
  });
}

export async function notifyReelComment(args: {
  videoOwnerId: string;
  commenterId: string;
  videoId: number;
  commentPreview: string;
}): Promise<void> {
  const name = await actorDisplayName(args.commenterId);
  const preview = args.commentPreview.slice(0, 140);
  await emit({
    recipientUserId: args.videoOwnerId,
    actorUserId: args.commenterId,
    kind: 'comment_reel',
    title: 'New comment on your reel',
    message: `${name}: ${preview}`,
    relatedId: args.videoId,
  });
}

export async function notifyWriterComment(args: {
  articleOwnerId: string;
  commenterId: string;
  articleId: number;
  commentPreview: string;
}): Promise<void> {
  const name = await actorDisplayName(args.commenterId);
  const preview = args.commentPreview.slice(0, 140);
  await emit({
    recipientUserId: args.articleOwnerId,
    actorUserId: args.commenterId,
    kind: 'comment_writer',
    title: 'New comment on your article',
    message: `${name}: ${preview}`,
    relatedId: args.articleId,
  });
}

export async function notifyReelLike(args: {
  videoOwnerId: string;
  likerId: string;
  videoId: number;
}): Promise<void> {
  const name = await actorDisplayName(args.likerId);
  await emit({
    recipientUserId: args.videoOwnerId,
    actorUserId: args.likerId,
    kind: 'like_reel',
    title: 'New like',
    message: `${name} liked your reel.`,
    relatedId: args.videoId,
  });
}

export async function notifyWriterLike(args: {
  articleOwnerId: string;
  likerId: string;
  articleId: number;
}): Promise<void> {
  const name = await actorDisplayName(args.likerId);
  await emit({
    recipientUserId: args.articleOwnerId,
    actorUserId: args.likerId,
    kind: 'like_writer',
    title: 'New like',
    message: `${name} liked your article.`,
    relatedId: args.articleId,
  });
}

export async function notifySubscriptionActive(args: {
  userId: string;
  planId: string;
}): Promise<void> {
  await emit({
    recipientUserId: args.userId,
    kind: 'subscription_active',
    title: 'Subscription active',
    message: `Your ${args.planId.replace(/_/g, ' ')} subscription is now active. Welcome!`,
  });
}
