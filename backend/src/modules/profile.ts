import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function getProfile(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const user = await deps.storage.getUser(profileId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const videos = await deps.storage.getCreatorVideos(profileId);
    const followerCount = await deps.storage.getFollowerCount(profileId);
    const followingCount = await deps.storage.getFollowingCount(profileId);

    // Check if current user is following
    const currentUserId = (req.user as any)?.uid;
    let isFollowing = false;
    if (currentUserId && currentUserId !== profileId) {
      isFollowing = await deps.storage.isFollowing(currentUserId, profileId);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: (user as any).displayName,
        bio: (user as any).bio,
        profileImageUrl: user.profileImageUrl,
        createdAt: user.createdAt,
      },
      videoCount: videos.length,
      followerCount,
      followingCount,
      isFollowing,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get profile' });
  }
}

export async function getProfileVideos(req: Request, res: Response) {
  try {
    const profileId = req.params.id;
    const videos = await deps.storage.getCreatorVideos(profileId);
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get profile videos' });
  }
}

export async function followUser(req: Request, res: Response) {
  try {
    const followerId = (req.user as any)?.uid;
    const followingId = req.params.id;

    if (followerId === followingId) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const result = await deps.storage.followUser(followerId, followingId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to follow/unfollow user' });
  }
}
