import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';

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
  user: { id: string; displayName: string | null; firstName: string | null; lastName: string | null; bio: string | null; profileImageUrl: string | null; createdAt: Date | null },
) {
  return {
    id: user.id,
    displayName: user.displayName ?? user.firstName ?? null,
    firstName: user.firstName,
    bio: user.bio,
    profileImageUrl: user.profileImageUrl,
    createdAt: user.createdAt,
  };
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

    const [videos, followerCount, followingCount] = await Promise.all([
      deps.storage.getCreatorVideos(profileId),
      deps.storage.getFollowerCount(profileId),
      deps.storage.getFollowingCount(profileId),
    ]);

    const viewerId = currentUserId(req);
    let isFollowing = false;
    if (viewerId && viewerId !== profileId) {
      isFollowing = await deps.storage.isFollowing(viewerId, profileId);
    }

    res.json({
      user: toPublicProfile(user),
      videoCount: videos.length,
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
    const [followerCount, followingCount] = await Promise.all([
      deps.storage.getFollowerCount(userId),
      deps.storage.getFollowingCount(userId),
    ]);
    res.json({
      user: {
        ...toPublicProfile(user),
        email: user.email,
        lastName: user.lastName,
      },
      followerCount,
      followingCount,
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
      const v = body.profileImageUrl;
      if (v === null || v === '') {
        patch.profileImageUrl = null;
      } else if (typeof v !== 'string' || v.length > 2048) {
        res.status(400).json({ error: 'invalid_image_url', code: 'invalid_image_url' });
        return;
      } else {
        try {
          const url = new URL(v);
          if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol');
        } catch {
          res.status(400).json({ error: 'invalid_image_url', code: 'invalid_image_url' });
          return;
        }
        patch.profileImageUrl = v;
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
