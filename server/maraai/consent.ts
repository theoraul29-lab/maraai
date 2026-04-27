// Per-user GDPR consent + selected operating mode + kill switch.
//
// The default for an authenticated user with no consent_records row is
// "centralized mode, no P2P, no background, no notifications". Every
// advanced feature MUST funnel through `requireConsent(...)` before doing
// anything that could surprise the user (P2P traffic, background work,
// advanced AI routing, etc).

import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  consentRecords,
  CURRENT_CONSENT_VERSION,
  DEFAULT_CONSENT,
  type ConsentRecord,
  type MaraMode,
} from '../../shared/schema.js';
import { logActivity } from './activity.js';

export type ConsentView = {
  userId: string;
  mode: MaraMode;
  p2pEnabled: boolean;
  bandwidthShareGbMonth: number;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  notificationsEnabled: boolean;
  killSwitch: boolean;
  consentVersion: number;
  acceptedTermsAt: number | null;
  needsOnboarding: boolean;
};

const VALID_MODES: MaraMode[] = ['centralized', 'hybrid', 'advanced'];

export function isMaraMode(value: unknown): value is MaraMode {
  return typeof value === 'string' && (VALID_MODES as string[]).includes(value);
}

function rowToView(row: ConsentRecord | undefined, userId: string): ConsentView {
  if (!row) {
    return {
      userId,
      mode: 'centralized',
      p2pEnabled: false,
      bandwidthShareGbMonth: 0,
      backgroundNode: false,
      advancedAiRouting: false,
      notificationsEnabled: false,
      killSwitch: false,
      consentVersion: 0,
      acceptedTermsAt: null,
      needsOnboarding: true,
    };
  }
  // killSwitch overrides every opt-in feature without rewriting the row.
  const killed = row.killSwitch === 1;
  return {
    userId: row.userId,
    mode: killed ? 'centralized' : ((row.mode as MaraMode) || 'centralized'),
    p2pEnabled: !killed && row.p2pEnabled === 1,
    bandwidthShareGbMonth: row.bandwidthShareGbMonth,
    backgroundNode: !killed && row.backgroundNode === 1,
    advancedAiRouting: !killed && row.advancedAiRouting === 1,
    notificationsEnabled: row.notificationsEnabled === 1,
    killSwitch: killed,
    consentVersion: row.consentVersion,
    acceptedTermsAt: row.acceptedTermsAt
      ? row.acceptedTermsAt instanceof Date
        ? row.acceptedTermsAt.getTime()
        : Number(row.acceptedTermsAt)
      : null,
    needsOnboarding:
      row.consentVersion < CURRENT_CONSENT_VERSION || !row.acceptedTermsAt,
  };
}

export async function getConsent(userId: string): Promise<ConsentView> {
  const rows = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .limit(1);
  return rowToView(rows[0], userId);
}

export type ConsentUpdate = Partial<{
  mode: MaraMode;
  p2pEnabled: boolean;
  bandwidthShareGbMonth: number;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  notificationsEnabled: boolean;
  killSwitch: boolean;
  acceptTerms: boolean;
}>;

export async function updateConsent(
  userId: string,
  patch: ConsentUpdate,
): Promise<ConsentView> {
  const existing = (
    await db.select().from(consentRecords).where(eq(consentRecords.userId, userId)).limit(1)
  )[0];

  const cap = (n: number) => Math.max(0, Math.min(1024, Math.floor(n)));

  const next = {
    userId,
    mode: patch.mode ?? (existing?.mode as MaraMode) ?? DEFAULT_CONSENT.mode!,
    p2pEnabled:
      patch.p2pEnabled === undefined
        ? existing?.p2pEnabled ?? 0
        : patch.p2pEnabled
          ? 1
          : 0,
    bandwidthShareGbMonth:
      patch.bandwidthShareGbMonth === undefined
        ? existing?.bandwidthShareGbMonth ?? 0
        : cap(patch.bandwidthShareGbMonth),
    backgroundNode:
      patch.backgroundNode === undefined
        ? existing?.backgroundNode ?? 0
        : patch.backgroundNode
          ? 1
          : 0,
    advancedAiRouting:
      patch.advancedAiRouting === undefined
        ? existing?.advancedAiRouting ?? 0
        : patch.advancedAiRouting
          ? 1
          : 0,
    notificationsEnabled:
      patch.notificationsEnabled === undefined
        ? existing?.notificationsEnabled ?? 0
        : patch.notificationsEnabled
          ? 1
          : 0,
    killSwitch:
      patch.killSwitch === undefined ? existing?.killSwitch ?? 0 : patch.killSwitch ? 1 : 0,
    consentVersion: CURRENT_CONSENT_VERSION,
    acceptedTermsAt: patch.acceptTerms
      ? new Date()
      : existing?.acceptedTermsAt ?? null,
    updatedAt: new Date(),
  };

  // Centralized mode forcibly disables every P2P/background flag —
  // the UI should already do this client-side, but the server is the
  // source of truth for the "no hidden background activity" guarantee.
  if (next.mode === 'centralized') {
    next.p2pEnabled = 0;
    next.backgroundNode = 0;
  }

  if (existing) {
    await db
      .update(consentRecords)
      .set({
        mode: next.mode,
        p2pEnabled: next.p2pEnabled,
        bandwidthShareGbMonth: next.bandwidthShareGbMonth,
        backgroundNode: next.backgroundNode,
        advancedAiRouting: next.advancedAiRouting,
        notificationsEnabled: next.notificationsEnabled,
        killSwitch: next.killSwitch,
        consentVersion: next.consentVersion,
        acceptedTermsAt: next.acceptedTermsAt as any,
        updatedAt: next.updatedAt,
      })
      .where(eq(consentRecords.userId, userId));
  } else {
    await db.insert(consentRecords).values({
      userId,
      mode: next.mode,
      p2pEnabled: next.p2pEnabled,
      bandwidthShareGbMonth: next.bandwidthShareGbMonth,
      backgroundNode: next.backgroundNode,
      advancedAiRouting: next.advancedAiRouting,
      notificationsEnabled: next.notificationsEnabled,
      killSwitch: next.killSwitch,
      consentVersion: next.consentVersion,
      acceptedTermsAt: next.acceptedTermsAt as any,
    });
  }

  await logActivity(userId, 'consent.updated', {
    mode: next.mode,
    p2pEnabled: !!next.p2pEnabled,
    backgroundNode: !!next.backgroundNode,
    advancedAiRouting: !!next.advancedAiRouting,
    killSwitch: !!next.killSwitch,
  });

  return getConsent(userId);
}

export type ConsentFeature =
  | 'p2p'
  | 'backgroundNode'
  | 'advancedAiRouting'
  | 'notifications';

/**
 * Express middleware that gates a feature behind the user's consent record.
 * Returns 403 with `{ message, feature, currentConsent }` so the UI can
 * surface a "review consent" CTA without guessing which flag to toggle.
 */
export function requireConsent(feature: ConsentFeature) {
  return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    const userId: string | undefined = req.user?.uid;
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' });

    let consent: ConsentView;
    try {
      consent = await getConsent(userId);
    } catch (err) {
      return res.status(500).json({ message: 'Failed to load consent record.' });
    }

    const allowed: Record<ConsentFeature, boolean> = {
      p2p: consent.p2pEnabled,
      backgroundNode: consent.backgroundNode,
      advancedAiRouting: consent.advancedAiRouting,
      notifications: consent.notificationsEnabled,
    };

    if (!allowed[feature]) {
      return res.status(403).json({
        message: `Feature '${feature}' requires explicit user consent.`,
        feature,
        currentConsent: consent,
      });
    }

    (req as any).consent = consent;
    return next();
  };
}
