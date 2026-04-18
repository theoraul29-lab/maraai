/**
 * Reels pipeline (PR D).
 *
 * Provides the upload → metadata → feed flow for user-generated video content
 * plus comments, shares, and an engagement-ordered feed.
 *
 * Storage model:
 *   - Bytes are written to `UPLOADS_DIR` (a Railway volume in production, a
 *     local directory in dev). The filename is `<nanoid>.<ext>`.
 *   - The DB row stores: the public URL (`/videos/files/<filename>`), the
 *     `fileKey` (filename only), plus mimetype + optional thumbnail URL.
 *   - Files are served by `express.static` mounted at `/videos/files` in
 *     server/index.ts.
 *
 * The P2P layer (see server/index.ts `p2p-have-video` / `p2p-want-video`)
 * lets browser peers advertise cached byte-ranges and discover other peers
 * who have the same video, so the server does not have to shoulder all
 * bandwidth.
 */

import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { IStorage } from '../../../server/storage';

let deps: {
  storage: IStorage;
};

export function injectDeps(d: typeof deps) {
  deps = d;
}

// Resolve the uploads directory up front so we can fail fast if the volume
// path is unwritable. In production Railway mounts a persistent volume at
// `/data`; in dev we fall back to `<repo>/data/uploads`.
export const UPLOADS_DIR = (() => {
  const configured = process.env.VIDEO_UPLOADS_DIR;
  if (configured && configured.length > 0) return configured;
  if (process.env.NODE_ENV === 'production') return '/data/videos';
  return path.join(process.cwd(), 'data', 'videos');
})();

try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {
  // Directory creation is best-effort at import time; the upload handler
  // will surface a clearer error to the client if the volume is unusable.
}

const MAX_UPLOAD_BYTES =
  Number.parseInt(process.env.VIDEO_UPLOAD_MAX_BYTES ?? '', 10) || 100 * 1024 * 1024; // 100 MB default

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
    const name = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported mime type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
}).single('video');

// --- Handlers ----------------------------------------------------------------

export async function uploadReel(req: Request, res: Response) {
  try {
    const userId: string | undefined = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'No video file provided' });

    const title = (req.body?.title as string | undefined)?.trim() || 'Untitled';
    const description = (req.body?.description as string | undefined)?.trim() || '';
    const type = (req.body?.type as string | undefined)?.trim() || 'creator';

    const fileKey = file.filename;
    const publicUrl = `/videos/files/${fileKey}`;

    const created = await deps.storage.createVideo({
      title: title.slice(0, 200),
      description: description.slice(0, 1000),
      type,
      url: publicUrl,
      creatorId: userId,
      fileKey,
      mimeType: file.mimetype,
      thumbnailUrl: null,
      durationSec: null,
      moderationStatus: 'approved',
    } as any);

    res.status(201).json({ video: created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'upload failed';
    // multer surfaces limit errors as LIMIT_FILE_SIZE etc — surface as 413/400.
    if (msg.includes('File too large')) {
      res.status(413).json({ error: 'File too large' });
      return;
    }
    res.status(500).json({ error: 'Failed to upload reel', detail: msg });
  }
}

export async function getReelsFeed(req: Request, res: Response) {
  try {
    const limit = Number.parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const offset = Number.parseInt(String(req.query.offset ?? '0'), 10) || 0;
    const items = await deps.storage.getReelsFeed({ limit, offset });
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Failed to load feed' });
  }
}

export async function shareReel(req: Request, res: Response) {
  try {
    const videoId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) return res.status(400).json({ error: 'Invalid video id' });
    const existing = await deps.storage.getVideoById(videoId);
    if (!existing) return res.status(404).json({ error: 'Video not found' });
    const result = await deps.storage.shareVideo(videoId);
    res.json({
      ...result,
      shareUrl: existing.url,
    });
  } catch {
    res.status(500).json({ error: 'Failed to record share' });
  }
}

export async function listComments(req: Request, res: Response) {
  try {
    const videoId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) return res.status(400).json({ error: 'Invalid video id' });
    const limit = Number.parseInt(String(req.query.limit ?? '50'), 10) || 50;
    const items = await deps.storage.listVideoComments(videoId, limit);
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Failed to list comments' });
  }
}

export async function createComment(req: Request, res: Response) {
  try {
    const userId: string | undefined = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const videoId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) return res.status(400).json({ error: 'Invalid video id' });
    const content = String(req.body?.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'Comment content required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Comment too long' });
    const existing = await deps.storage.getVideoById(videoId);
    if (!existing) return res.status(404).json({ error: 'Video not found' });
    const created = await deps.storage.createVideoComment({
      videoId,
      userId,
      content,
    });
    res.status(201).json({ comment: created });
  } catch {
    res.status(500).json({ error: 'Failed to create comment' });
  }
}

export async function deleteComment(req: Request, res: Response) {
  try {
    const userId: string | undefined = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const commentId = Number.parseInt(req.params.commentId, 10);
    if (!Number.isFinite(commentId)) return res.status(400).json({ error: 'Invalid comment id' });
    const adminIds = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const isAdmin = adminIds.includes(userId);
    const ok = await deps.storage.deleteVideoComment(commentId, userId, isAdmin);
    if (!ok) return res.status(404).json({ error: 'Comment not found or not owned' });
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}
