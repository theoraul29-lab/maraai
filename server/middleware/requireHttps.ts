/**
 * requireHttps middleware
 *
 * Enforces HTTPS on admin endpoints. On Railway (behind a reverse proxy),
 * the original protocol is in X-Forwarded-Proto. In development (localhost)
 * the check is skipped automatically so hot-reload works without certs.
 *
 * Usage:
 *   app.post('/api/admin/chat', requireHttps, requireAdmin, handler)
 */

import type { Request, Response, NextFunction } from 'express';

const DEV = process.env.NODE_ENV !== 'production';

export function requireHttps(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (DEV) return next(); // localhost — skip, no certs

  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.toLowerCase() ||
    (req.secure ? 'https' : 'http');

  if (proto !== 'https') {
    res.status(403).json({
      message: 'HTTPS required for admin endpoints.',
    });
    return;
  }

  next();
}
