/**
 * requireAdmin middleware — delegates to the shared isUserAdmin() helper
 * from server/lib/admin-check.ts which is the single source of truth for
 * the ADMIN_USER_IDS / ADMIN_EMAILS contract.
 *
 * Fail-safe: any error defaults to 403, never accidentally grants access.
 * The role is NEVER read from the client request body or headers.
 */

import type { Request, Response, NextFunction } from 'express';
import { isUserAdmin } from '../lib/admin-check.js';

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId: string | undefined = (req as any).user?.uid;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized — login required.' });
    return;
  }

  try {
    if (await isUserAdmin(userId)) {
      return next();
    }
  } catch (err) {
    console.error('[requireAdmin] isUserAdmin check failed — denying access:', err);
  }

  res.status(403).json({ message: 'Forbidden — admin access required.' });
}
