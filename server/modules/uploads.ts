/**
 * Generic image upload pipeline.
 *
 * The reels module already owns video uploads (videos/) on its own
 * volume. This module gives every other surface (profile avatar, cover,
 * post image, writers cover, etc.) a single place to push image bytes
 * and get back a public URL that the rest of the app can store as a
 * plain string in any `*ImageUrl` column.
 *
 * Storage model:
 *  - Bytes are written to `IMAGE_UPLOADS_DIR` (a Railway volume in
 *    production, a local directory in dev). The filename is
 *    `<timestamp>-<rand>.<ext>` where the extension is derived from the
 *    server-validated MIME type — never trust the client's filename.
 *  - Files are served read-only by `express.static` mounted at
 *    `/uploads/images` in `server/index.ts`.
 *  - The handler returns `{ url: '/uploads/images/<filename>' }` so the
 *    caller can put that value straight into PATCH /api/profile/me,
 *    POST /api/profile/posts, etc.
 */

import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import multer from 'multer';

export const IMAGE_UPLOADS_DIR = (() => {
  const configured = process.env.IMAGE_UPLOADS_DIR;
  if (configured && configured.length > 0) return configured;
  if (process.env.NODE_ENV === 'production') return '/data/images';
  return path.join(process.cwd(), 'data', 'images');
})();

try {
  fs.mkdirSync(IMAGE_UPLOADS_DIR, { recursive: true });
} catch {
  // best-effort; upload handler will surface a clearer error if the
  // volume is unwritable.
}

const MAX_IMAGE_BYTES =
  Number.parseInt(process.env.IMAGE_UPLOAD_MAX_BYTES ?? '', 10) ||
  8 * 1024 * 1024; // 8 MB default — enough for a 4032×3024 phone photo at q70.

// Server-validated MIME -> on-disk extension. Extensions matter because
// express.static derives Content-Type from them and the browser will
// happily render an `.html` masquerading as `image/jpeg`.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const ALLOWED_MIME_TYPES = new Set(Object.keys(MIME_TO_EXT));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGE_UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] ?? '.bin';
    cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`);
  },
});

export const imageUploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported image mime type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
}).single('image');

export async function uploadImage(req: Request, res: Response) {
  try {
    const userId: string | undefined = (req as any).user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    const url = `/uploads/images/${file.filename}`;
    res.status(201).json({ url, mimeType: file.mimetype, sizeBytes: file.size });
  } catch (error) {
    console.error('[uploads] uploadImage failed:', error);
    res.status(500).json({ error: 'upload_failed' });
  }
}
