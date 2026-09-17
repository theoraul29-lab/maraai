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
import type { IStorage } from '../storage.js';
import { notifyReelComment, notifyReelLike } from '../notifications/producer.js';

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

// MIME -> extension whitelist. We derive the on-disk extension from the
// server-validated MIME type, NOT from the user-supplied originalname,
// because express.static serves files based on extension. Trusting the
// client's filename here would let an attacker upload `evil.html` with a
// spoofed `Content-Type: video/mp4` and achieve stored XSS.
const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
};
const ALLOWED_MIME_TYPES = new Set(Object.keys(MIME_TO_EXT));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] ?? '.bin';
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

    // Optional cross-module attribution: today only a Writers Hub "trailer"
    // — a short Spark the author records to promote one of their own
    // published articles. Same allow-listed sourceKind pattern as
    // shareToYou() in creators.ts. Ownership + published-state are checked
    // server-side so a trailer can't be attached to someone else's draft.
    let sourceKind: string | null = null;
    let sourceId: string | null = null;
    const rawSourceKind = (req.body?.sourceKind as string | undefined)?.trim();
    if (rawSourceKind === 'writers') {
      const articleId = Number.parseInt(String(req.body?.sourceId ?? ''), 10);
      const article = Number.isFinite(articleId)
        ? await deps.storage.getWriterPageById(articleId)
        : null;
      if (!article || article.userId !== userId || !article.published) {
        fs.unlink(file.path, () => { /* ignore cleanup errors */ });
        res.status(403).json({ error: 'Cannot attach a trailer to that article' });
        return;
      }
      sourceKind = 'writers';
      sourceId = String(articleId);
    }

    const fileKey = file.filename;
    const publicUrl = `/videos/files/${fileKey}`;

    const created = await deps.storage.createVideo({
      title: title.slice(0, 200),
      description: description.slice(0, 1000),
      type: sourceKind === 'writers' ? 'writers-trailer' : type,
      url: publicUrl,
      creatorId: userId,
      fileKey,
      mimeType: file.mimetype,
      thumbnailUrl: null,
      durationSec: null,
      moderationStatus: 'approved',
      sourceKind,
      sourceId,
    } as any);

    res.status(201).json({ video: created });
  } catch (err) {
    // Best-effort cleanup of the file multer already wrote to disk so a
    // flaky DB doesn't slowly fill the Railway volume with orphaned bytes.
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file?.path) {
      fs.unlink(file.path, () => { /* ignore cleanup errors */ });
    }
    const msg = err instanceof Error ? err.message : 'upload failed';
    if (msg.includes('File too large')) {
      res.status(413).json({ error: 'File too large' });
      return;
    }
    res.status(500).json({ error: 'Failed to upload reel', detail: msg });
  }
}

// --- External link Sparks (Phase 4) -----------------------------------------
//
// Legitimate oEmbed-based linking, never downloading/rehosting: the bytes
// stay on the source platform's own servers, we only store the link plus
// whatever metadata their public oEmbed endpoint returns, and render their
// own sanctioned embed widget client-side. User-facing copy for this feature
// must stay fully generic (product decision) — never name the platforms in
// our own labels/errors; only their own embedded player, outside our
// control, shows its native branding.

const OEMBED_FETCH_TIMEOUT_MS = 5000;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);

function extractYouTubeId(u: URL): string | null {
  if (u.hostname === 'youtu.be') {
    const id = u.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (u.pathname === '/watch') {
    const id = u.searchParams.get('v');
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  const shortsMatch = u.pathname.match(/^\/shorts\/([\w-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  return null;
}

export async function postExternalLink(req: Request, res: Response) {
  try {
    const userId: string | undefined = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const rawUrl = String(req.body?.url ?? '').trim();
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'That link is not valid.' });
    }
    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'That link is not supported.' });
    }

    const description = (req.body?.description as string | undefined)?.trim().slice(0, 1000) || '';

    if (YOUTUBE_HOSTS.has(parsed.hostname)) {
      const videoId = extractYouTubeId(parsed);
      if (!videoId) return res.status(400).json({ error: 'That link is not supported.' });
      const created = await deps.storage.createVideo({
        title: ((req.body?.title as string | undefined)?.trim() || 'Spark').slice(0, 200),
        description,
        type: 'external-link',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        creatorId: userId,
        fileKey: null,
        mimeType: null,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        durationSec: null,
        moderationStatus: 'approved',
        sourceKind: null,
        sourceId: null,
        externalPlatform: 'youtube',
      } as any);
      return res.status(201).json({ video: created });
    }

    if (TIKTOK_HOSTS.has(parsed.hostname)) {
      let oembed: { title?: string; embed_product_id?: string; author_name?: string } | null = null;
      try {
        const resp = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`, {
          signal: AbortSignal.timeout(OEMBED_FETCH_TIMEOUT_MS),
        });
        if (resp.ok) oembed = await resp.json();
      } catch {
        // oembed stays null — handled below as an unresolvable link.
      }
      if (!oembed || !oembed.embed_product_id) {
        return res.status(400).json({ error: "That link couldn't be resolved." });
      }
      const created = await deps.storage.createVideo({
        title: ((req.body?.title as string | undefined)?.trim() || oembed.title || 'Spark').slice(0, 200),
        description,
        type: 'external-link',
        url: rawUrl,
        creatorId: userId,
        fileKey: null,
        mimeType: null,
        // No thumbnail hotlinked here on purpose: the source platform's own
        // embed script renders its own preview inside its own iframe, so we
        // never need to allow-list its CDN host under img-src.
        thumbnailUrl: null,
        durationSec: null,
        moderationStatus: 'approved',
        sourceKind: null,
        sourceId: null,
        externalPlatform: 'tiktok',
      } as any);
      return res.status(201).json({ video: created });
    }

    res.status(400).json({ error: 'That link is not supported yet.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to add link';
    res.status(500).json({ error: 'Failed to add link', detail: msg });
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
    if (existing.creatorId && existing.creatorId !== userId) {
      void notifyReelComment({
        videoOwnerId: existing.creatorId,
        commenterId: userId,
        videoId,
        commentPreview: content,
      });
    }
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
