import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';
import { eq, sql } from 'drizzle-orm';
import { notifyReelLike } from '../../../server/notifications/producer.js';

let deps: {
  storage: IStorage;
  db: any;
  api: any;
  z: any;
  creatorPostRequestSchema: any;
  likesTable: any;
};

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function listVideos(req: Request, res: Response) {
  try {
    const topic = req.query.topic as string | undefined;
    const videos = await deps.storage.getVideos(topic);
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list videos' });
  }
}

export async function maraFeed(_req: Request, res: Response) {
  try {
    const videos = await deps.storage.getVideos();
    // Return shuffled feed
    const shuffled = videos.sort(() => Math.random() - 0.5);
    res.json(shuffled.slice(0, 50));
  } catch (error) {
    res.status(500).json({ message: 'Failed to load feed' });
  }
}

export async function createVideo(req: Request, res: Response) {
  try {
    const video = await deps.storage.createVideo(req.body);
    res.status(201).json(video);
  } catch (error) {
    res.status(400).json({ message: 'Failed to create video' });
  }
}

export async function likeVideo(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) return res.status(400).json({ message: 'Invalid video ID' });
    const result = await deps.storage.likeVideo(userId, videoId);
    if (userId && result && (result as { liked?: boolean }).liked) {
      try {
        const video = await deps.storage.getVideoById(videoId);
        if (video?.creatorId && video.creatorId !== userId) {
          void notifyReelLike({
            videoOwnerId: video.creatorId,
            likerId: userId,
            videoId,
          });
        }
      } catch {
        /* best-effort */
      }
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to like video' });
  }
}

export async function viewVideo(req: Request, res: Response) {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) return res.status(400).json({ message: 'Invalid video ID' });
    const result = await deps.storage.viewVideo(videoId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to record view' });
  }
}

export async function saveVideo(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) return res.status(400).json({ message: 'Invalid video ID' });
    const result = await deps.storage.saveVideo(userId, videoId, req.body.note);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save video' });
  }
}

export async function unsaveVideo(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) return res.status(400).json({ message: 'Invalid video ID' });
    const result = await deps.storage.unsaveVideo(userId, videoId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to unsave video' });
  }
}

export async function getSavedVideos(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const saved = await deps.storage.getSavedVideos(userId);
    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get saved videos' });
  }
}

export async function creatorPostStatus(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const status = await deps.storage.canUserPost(userId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get post status' });
  }
}

export async function creatorMyVideos(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const videos = await deps.storage.getCreatorVideos(userId);
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get creator videos' });
  }
}

export async function creatorPostReel(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const canPost = await deps.storage.canUserPost(userId);
    if (!canPost.canPost) {
      return res.status(403).json({
        message: `Post limit reached (${canPost.used}/${canPost.limit}). Upgrade to Premium for unlimited posts.`,
      });
    }

    const parsed = deps.creatorPostRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const video = await deps.storage.createVideo({
      ...parsed.data,
      creatorId: userId,
    });
    await deps.storage.recordCreatorPost(userId, video.id);
    res.status(201).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Failed to post reel' });
  }
}

export async function creatorAnalytics(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const videos = await deps.storage.getCreatorVideos(userId);
    const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
    const totalLikes = videos.reduce((sum, v) => sum + (v.likes || 0), 0);
    const followerCount = await deps.storage.getFollowerCount(userId);

    res.json({
      totalVideos: videos.length,
      totalViews,
      totalLikes,
      followerCount,
      videos: videos.slice(0, 20),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get analytics' });
  }
}

export async function deleteCreatorVideo(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) return res.status(400).json({ message: 'Invalid video ID' });
    const deleted = await deps.storage.deleteCreatorVideo(videoId, userId);
    if (!deleted) return res.status(404).json({ message: 'Video not found or not yours' });
    res.json({ message: 'Video deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete video' });
  }
}
