import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';
import { notifyFollow } from '../../../server/notifications/producer.js';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

// Extract the currently-authenticated user id from whichever auth scheme is
// in use. Matches the pattern used elsewhere in the app.
function currentUserId(req: Request): string | null {
  const fromSession = (req as unknown as { session?: { userId?: string } })
    .session?.userId;
  if (typeof fromSession === 'string' && fromSession.length > 0) return fromSession;
  const fromPassport = (req.user as { uid?: string } | undefined)?.uid;
  if (typeof fromPassport === 'string' && fromPassport.length > 0) return fromPassport;
  return null;
}

function toPublicProfile(
  user: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    bio: string | null;
    profileImageUrl: string | null;
    coverImageUrl?: string | null;
    location?: string | null;
    website?: string | null;
    createdAt: Date | null;
  },
) {
  return {
    id: user.id,
    displayName: user.displayName ?? user.firstName ?? null,
    firstName: user.firstName,
    bio: user.bio,
    profileImageUrl: user.profileImageUrl,
    coverImageUrl: user.coverImageUrl ?? null,
    location: user.location ?? null,
    website: user.website ?? null,
    createdAt: user.createdAt,
  };
}

// Strict variant — only absolute http/https URLs. Used for fields like
// `website` where a same-origin relative path is semantically wrong.
function validateOptionalUrl(v: unknown, maxLen = 2048): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || v.length > maxLen) return { ok: false };

  let normalized: string;
  try {
    const url = new URL(v);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false };
    // Use the parsed .href so that quotes / control chars are percent-encoded
    // before the value is stored. This prevents things like
    //   https://x.com/img"test.jpg
    // from breaking the frontend's CSS `url("…")` construction.
    normalized = url.href;
  } catch {
    return { ok: false };
  }
  return { ok: true, value: normalized };
}

// Image-URL variant — also accepts same-origin relative paths produced by
// /api/uploads/image and /api/reels/upload. They live under our own
// /uploads/* and /videos/* static mounts so there is no cross-origin
// attack surface, and we explicitly restrict the prefix list rather than
// allowing arbitrary `/foo` strings.
function validateOptionalImageUrl(v: unknown, maxLen = 2048): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || v.length > maxLen) return { ok: false };
  if (v.startsWith('/uploads/') || v.startsWith('/videos/')) {
    if (v.includes('..') || v.includes('"') || /\s/.test(v)) return { ok: false };
    return { ok: true, value: v };
  }
  return validateOptionalUrl(v, maxLen);
}

function parsePagination(
  req: Request,
  defaults: { limit: number; maxLimit: number },
): { limit: number; offset: number } {
  const parseNum = (v: unknown, fallback: number) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const limit = Math.min(
    Math.max(parseNum(req.query.limit, defaults.limit), 1),
    defaults.maxLimit,
  );
  const offset = Math.max(parseNum(req.query.offset, 0), 0);
  return { limit, offset };
}

export async function getProfile(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const user = await deps.storage.getUserById(profileId);
    if (!user) {
      res.status(404).json({ error: 'not_found', code: 'not_found' });
      return;
    }

    const [videos, followerCount, followingCount, postCount] = await Promise.all([
      deps.storage.getCreatorVideos(profileId),
      deps.storage.getFollowerCount(profileId),
      deps.storage.getFollowingCount(profileId),
      deps.storage.countUserPosts(profileId),
    ]);

    const viewerId = currentUserId(req);
    let isFollowing = false;
    if (viewerId && viewerId !== profileId) {
      isFollowing = await deps.storage.isFollowing(viewerId, profileId);
    }

    res.json({
      user: toPublicProfile(user),
      videoCount: videos.length,
      postCount,
      followerCount,
      followingCount,
      isFollowing,
      isSelf: viewerId === profileId,
    });
  } catch (error) {
    console.error('[profile] getProfile failed:', error);
    res.status(500).json({ error: 'profile_fetch_failed', code: 'profile_fetch_failed' });
  }
}

export async function getProfileVideos(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const videos = await deps.storage.getCreatorVideos(profileId);
    res.json(videos);
  } catch (error) {
    console.error('[profile] getProfileVideos failed:', error);
    res.status(500).json({ error: 'profile_videos_failed', code: 'profile_videos_failed' });
  }
}

export async function followUser(req: Request, res: Response) {
  try {
    const followerId = currentUserId(req);
    if (!followerId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const followingId = req.params.id;
    if (followerId === followingId) {
      res.status(400).json({ error: 'cannot_follow_self', code: 'cannot_follow_self' });
      return;
    }
    // Verify the target actually exists so we never insert orphan follow rows.
    const target = await deps.storage.getUserById(followingId);
    if (!target) {
      res.status(404).json({ error: 'not_found', code: 'not_found' });
      return;
    }
    const result = await deps.storage.followUser(followerId, followingId);
    // Fire-and-forget notification. Must never break the follow op.
    void notifyFollow(followerId, followingId);
    res.json(result);
  } catch (error) {
    console.error('[profile] followUser failed:', error);
    res.status(500).json({ error: 'follow_failed', code: 'follow_failed' });
  }
}

// --- PR H additions --------------------------------------------------------

export async function getMe(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const user = await deps.storage.getUserById(userId);
    // `requireAuth` only checks for a session-level uid, but the app also
    // assigns a stable anonymous uid to every visitor (see server/auth.ts).
    // For `/profile/me` we specifically want the logged-in user, so treat
    // "no user row" as unauthenticated rather than a missing profile.
    if (!user) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const [followerCount, followingCount, postCount] = await Promise.all([
      deps.storage.getFollowerCount(userId),
      deps.storage.getFollowingCount(userId),
      deps.storage.countUserPosts(userId),
    ]);
    res.json({
      user: {
        ...toPublicProfile(user),
        email: user.email,
        lastName: user.lastName,
      },
      followerCount,
      followingCount,
      postCount,
      isSelf: true,
    });
  } catch (error) {
    console.error('[profile] getMe failed:', error);
    res.status(500).json({ error: 'me_fetch_failed', code: 'me_fetch_failed' });
  }
}

export async function updateMe(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    // Reject anonymous session ids: no `users` row means the caller is an
    // automatically-assigned visitor, not a real logged-in user.
    const existing = await deps.storage.getUserById(userId);
    if (!existing) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: {
      displayName?: string;
      bio?: string;
      profileImageUrl?: string | null;
      coverImageUrl?: string | null;
      location?: string | null;
      website?: string | null;
    } = {};

    if ('displayName' in body) {
      const v = body.displayName;
      if (v === null || v === '') {
        res.status(400).json({ error: 'invalid_display_name', code: 'invalid_display_name' });
        return;
      }
      if (typeof v !== 'string') {
        res.status(400).json({ error: 'invalid_display_name', code: 'invalid_display_name' });
        return;
      }
      // Trim first so a whitespace-only name (e.g. "   ") is rejected
      // rather than silently collapsing to the empty string at persistence.
      const trimmed = v.trim();
      if (trimmed.length < 1 || trimmed.length > 60) {
        res.status(400).json({ error: 'invalid_display_name', code: 'invalid_display_name' });
        return;
      }
      patch.displayName = trimmed;
    }

    if ('bio' in body) {
      const v = body.bio;
      if (v !== null && (typeof v !== 'string' || v.length > 500)) {
        res.status(400).json({ error: 'invalid_bio', code: 'invalid_bio' });
        return;
      }
      patch.bio = v == null ? '' : v.trim();
    }

    if ('profileImageUrl' in body) {
      const parsed = validateOptionalImageUrl(body.profileImageUrl);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_image_url', code: 'invalid_image_url' });
        return;
      }
      patch.profileImageUrl = parsed.value;
    }

    if ('coverImageUrl' in body) {
      const parsed = validateOptionalImageUrl(body.coverImageUrl);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_cover_url', code: 'invalid_cover_url' });
        return;
      }
      patch.coverImageUrl = parsed.value;
    }

    if ('website' in body) {
      const parsed = validateOptionalUrl(body.website);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_website', code: 'invalid_website' });
        return;
      }
      patch.website = parsed.value;
    }

    if ('location' in body) {
      const v = body.location;
      if (v === null || v === '') {
        patch.location = null;
      } else if (typeof v !== 'string' || v.length > 120) {
        res.status(400).json({ error: 'invalid_location', code: 'invalid_location' });
        return;
      } else {
        const trimmed = v.trim();
        patch.location = trimmed.length > 0 ? trimmed : null;
      }
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no_fields', code: 'no_fields' });
      return;
    }

    const updated = await deps.storage.updateUserProfile(userId, patch);
    if (!updated) {
      res.status(404).json({ error: 'not_found', code: 'not_found' });
      return;
    }
    // Mirror the shape of GET /profile/me so clients can replace cached
    // user state with the PATCH response without silently losing
    // `email` / `lastName`.
    res.json({
      user: {
        ...toPublicProfile(updated),
        email: updated.email,
        lastName: updated.lastName,
      },
    });
  } catch (error) {
    console.error('[profile] updateMe failed:', error);
    res.status(500).json({ error: 'update_failed', code: 'update_failed' });
  }
}

export async function listFollowers(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const { limit, offset } = parsePagination(req, { limit: 50, maxLimit: 200 });
    const items = await deps.storage.listFollowers(profileId, { limit, offset });
    res.json({ items, pagination: { limit, offset } });
  } catch (error) {
    console.error('[profile] listFollowers failed:', error);
    res.status(500).json({ error: 'followers_failed', code: 'followers_failed' });
  }
}

export async function listFollowing(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const { limit, offset } = parsePagination(req, { limit: 50, maxLimit: 200 });
    const items = await deps.storage.listFollowing(profileId, { limit, offset });
    res.json({ items, pagination: { limit, offset } });
  } catch (error) {
    console.error('[profile] listFollowing failed:', error);
    res.status(500).json({ error: 'following_failed', code: 'following_failed' });
  }
}

export async function getActivity(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const { limit, offset } = parsePagination(req, { limit: 20, maxLimit: 100 });
    const items = await deps.storage.getProfileActivity(profileId, { limit, offset });
    res.json({ items, pagination: { limit, offset } });
  } catch (error) {
    console.error('[profile] getActivity failed:', error);
    res.status(500).json({ error: 'activity_failed', code: 'activity_failed' });
  }
}

// --- FB-style posts (Phase 2 P0 — You) ----------------------------------

export async function listProfilePosts(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const { limit, offset } = parsePagination(req, { limit: 20, maxLimit: 100 });
    const items = await deps.storage.listUserPosts(profileId, { limit, offset });
    res.json({ items, pagination: { limit, offset } });
  } catch (error) {
    console.error('[profile] listProfilePosts failed:', error);
    res.status(500).json({ error: 'posts_failed', code: 'posts_failed' });
  }
}

export async function createProfilePost(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const existing = await deps.storage.getUserById(userId);
    if (!existing) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawContent = body.content;
    if (typeof rawContent !== 'string') {
      res.status(400).json({ error: 'invalid_content', code: 'invalid_content' });
      return;
    }
    const content = rawContent.trim();
    if (content.length < 1 || content.length > 5000) {
      res.status(400).json({ error: 'invalid_content', code: 'invalid_content' });
      return;
    }

    let imageUrl: string | null = null;
    if ('imageUrl' in body && body.imageUrl !== undefined) {
      const parsed = validateOptionalImageUrl(body.imageUrl);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_image_url', code: 'invalid_image_url' });
        return;
      }
      imageUrl = parsed.value;
    }

    const created = await deps.storage.createUserPost({ userId, content, imageUrl });
    res.status(201).json(created);
  } catch (error) {
    console.error('[profile] createProfilePost failed:', error);
    res.status(500).json({ error: 'post_create_failed', code: 'post_create_failed' });
  }
}

export async function deleteProfilePost(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    const postId = Number.parseInt(req.params.postId ?? '', 10);
    if (!Number.isFinite(postId) || postId <= 0) {
      res.status(400).json({ error: 'invalid_post_id', code: 'invalid_post_id' });
      return;
    }
    const existing = await deps.storage.getUserPostById(postId);
    if (!existing) {
      res.status(404).json({ error: 'not_found', code: 'not_found' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ error: 'forbidden', code: 'forbidden' });
      return;
    }
    const ok = await deps.storage.deleteUserPost(postId, userId);
    if (!ok) {
      res.status(404).json({ error: 'not_found', code: 'not_found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[profile] deleteProfilePost failed:', error);
    res.status(500).json({ error: 'post_delete_failed', code: 'post_delete_failed' });
  }
}

// Derived achievements. Pure read-only; computed from existing rows. No new
// table — when we want persistent, user-facing badges we can migrate later.
export async function getBadges(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const user = await deps.storage.getUserById(profileId);
    if (!user) {
      res.status(404).json({ error: 'not_found', code: 'not_found' });
      return;
    }

    // Use a dedicated page count instead of filtering `getProfileActivity`:
    // the activity feed interleaves reels and pages, so a low `limit` can
    // drop all pages from the window and under-report `first_page`.
    const [videos, followerCount, pageCount] = await Promise.all([
      deps.storage.getCreatorVideos(profileId),
      deps.storage.getFollowerCount(profileId),
      deps.storage.getPublishedPageCount(profileId),
    ]);

    const badges: Array<{ code: string; earnedAt: Date | null }> = [];
    if (videos.length >= 1) {
      badges.push({ code: 'first_reel', earnedAt: null });
    }
    if (pageCount >= 1) {
      badges.push({ code: 'first_page', earnedAt: null });
    }
    if (followerCount >= 10) {
      badges.push({ code: 'ten_followers', earnedAt: null });
    }
    if (followerCount >= 100) {
      badges.push({ code: 'hundred_followers', earnedAt: null });
    }

    res.json({ items: badges });
  } catch (error) {
    console.error('[profile] getBadges failed:', error);
    res.status(500).json({ error: 'badges_failed', code: 'badges_failed' });
  }
}
