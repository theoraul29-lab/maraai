import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function getStats(_req: Request, res: Response) {
  try {
    const [users, videos, messageCount, likeCount] = await Promise.all([
      deps.storage.getAllUsers(),
      deps.storage.getVideos(),
      deps.storage.getTotalMessageCount(),
      deps.storage.getTotalLikeCount(),
    ]);
    res.json({
      totalUsers: users.length,
      totalVideos: videos.length,
      totalMessages: messageCount,
      totalLikes: likeCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get stats' });
  }
}

export async function getUsers(_req: Request, res: Response) {
  try {
    const users = await deps.storage.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get users' });
  }
}

export async function getVideos(_req: Request, res: Response) {
  try {
    const videos = await deps.storage.getVideos();
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get videos' });
  }
}
