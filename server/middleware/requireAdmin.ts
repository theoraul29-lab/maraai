/**
 * requireAdmin middleware
 *
 * Security model (defense-in-depth, three layers):
 *   1. req.user must exist — session auth has already run
 *   2. ADMIN_USER_IDS env var — fast O(1) check, no DB call needed
 *   3. ADMIN_EMAILS env var  — confirmed via DB query (not just session data)
 *
 * Fail-safe: any error defaults to 403, never accidentally grants access.
 * The role is NEVER read from the client request body or headers.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

const parseCsv = (v: string | undefined): string[] =>
  (v || '').split(',').map((s) => s.trim()).filter(Boolean);

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

  // Layer 1: fast ID check (no DB round-trip)
  const adminIds = parseCsv(process.env.ADMIN_USER_IDS);
  if (adminIds.includes(userId)) {
    return next();
  }

  // Layer 2: email check confirmed via DB (prevents session tampering)
  const adminEmails = parseCsv(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  if (adminEmails.length === 0) {
    res.status(403).json({ message: 'Forbidden — admin access required.' });
    return;
  }

  try {
    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const email = row?.email?.toLowerCase();
    if (email && adminEmails.includes(email)) {
      return next();
    }
  } catch (err) {
    // Fail-safe: DB errors must not grant access
    console.error('[requireAdmin] DB lookup failed — denying access:', err);
  }

  res.status(403).json({ message: 'Forbidden — admin access required.' });
}
