// Shared admin-check helper. The previous codebase had three independent
// implementations of this same logic (server/routes.ts requireAdmin,
// server/maraai/routes.ts award-credits inline check, and a third path that
// only consulted ADMIN_USER_IDS without ADMIN_EMAILS). They drifted from one
// another and made it easy to add a new admin-gated route that forgot one of
// the two env vars. This helper unifies the contract:
//
//   * `ADMIN_USER_IDS` — comma-separated user ids that are admin
//   * `ADMIN_EMAILS`   — comma-separated emails (case-insensitive)
//
// Either match makes the user admin.

import { db } from '../db.js';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

const parseCsv = (v: string | undefined): string[] =>
  (v || '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Returns true if the given user id is an admin per the
 * ADMIN_USER_IDS / ADMIN_EMAILS env contract.
 *
 * Safe to call from any code path — falls back to `false` on any DB error
 * rather than throwing, so it cannot accidentally lock out an admin if the
 * users table is briefly unavailable. Misses here only mean Mara doesn't
 * elevate to admin-mode chat for one request; the next call will retry.
 */
export async function isUserAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;

  const adminIds = parseCsv(process.env.ADMIN_USER_IDS);
  if (adminIds.includes(userId)) return true;

  const adminEmails = parseCsv(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  if (adminEmails.length === 0) return false;

  try {
    const row = (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
    const email = row?.email?.toLowerCase();
    return !!email && adminEmails.includes(email);
  } catch (err) {
    console.error('[isUserAdmin] db lookup failed:', err);
    return false;
  }
}
