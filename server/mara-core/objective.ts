// MaraCore — ObjectiveFunction load/save + boot seed
//
// The brain has a single row in `mara_core_objective` (id=1) holding the
// current ObjectiveFunction as JSON. This module is the only place that
// reads or writes it, so callers don't have to worry about the JSON
// encoding, the singleton invariant, or migration timing.
//
// Etapa 1 of the MaraCore migration: persistence + seed + admin-facing
// getter/setter. Wiring this into the rate limiter and Growth Engineer's
// ICE scoring happens in Etapa 2 (a separate PR) — the brain cycle is
// not yet reading from here.

import { db } from '../db.js';
import { maraCoreObjective } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_OBJECTIVE,
  type ObjectiveFunction,
} from './types.js';

const SINGLETON_ID = 1;

/**
 * Load the current ObjectiveFunction.
 *
 * Falls back to `DEFAULT_OBJECTIVE` if the row is missing OR the stored
 * JSON cannot be parsed. The fallback is deliberate: a corrupt or
 * unmigrated DB should never crash the brain — it should run with sane
 * defaults and log a warning. Callers that *need* to know whether the
 * payload was valid can use {@link getObjectiveRow} instead.
 */
export function getObjective(): ObjectiveFunction {
  const row = db
    .select()
    .from(maraCoreObjective)
    .where(eq(maraCoreObjective.id, SINGLETON_ID))
    .all()[0];

  if (!row) return DEFAULT_OBJECTIVE;

  try {
    const parsed = JSON.parse(row.payload) as Partial<ObjectiveFunction>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    console.warn(
      '[MaraCore] mara_core_objective.payload is not valid JSON; using DEFAULT_OBJECTIVE.',
      err,
    );
    return DEFAULT_OBJECTIVE;
  }
}

/**
 * Return the raw row including provenance (updatedAt, updatedBy). Used by
 * the admin endpoint so the operator can see who last touched the
 * objective and when.
 */
export function getObjectiveRow(): {
  objective: ObjectiveFunction;
  updatedAt: Date | null;
  updatedBy: string | null;
} {
  const row = db
    .select()
    .from(maraCoreObjective)
    .where(eq(maraCoreObjective.id, SINGLETON_ID))
    .all()[0];

  if (!row) {
    return { objective: DEFAULT_OBJECTIVE, updatedAt: null, updatedBy: null };
  }

  return {
    objective: getObjective(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : null,
    updatedBy: row.updatedBy,
  };
}

/**
 * Replace the current ObjectiveFunction. Performs a structural merge with
 * `DEFAULT_OBJECTIVE` so partial payloads (e.g. an admin only tweaks
 * `weights.revenue`) don't drop unspecified fields. Returns the merged
 * value actually stored.
 */
export function setObjective(
  next: Partial<ObjectiveFunction>,
  updatedBy: string,
): ObjectiveFunction {
  const merged = mergeWithDefaults(next);
  validateObjective(merged);

  const payload = JSON.stringify(merged);
  const now = new Date();

  const existing = db
    .select()
    .from(maraCoreObjective)
    .where(eq(maraCoreObjective.id, SINGLETON_ID))
    .all()[0];

  if (existing) {
    db.update(maraCoreObjective)
      .set({ payload, updatedAt: now, updatedBy })
      .where(eq(maraCoreObjective.id, SINGLETON_ID))
      .run();
  } else {
    db.insert(maraCoreObjective)
      .values({
        id: SINGLETON_ID,
        payload,
        updatedAt: now,
        updatedBy,
        createdAt: now,
      })
      .run();
  }

  return merged;
}

/**
 * Idempotent boot-time seed. Inserts the default ObjectiveFunction iff
 * the row is missing. Safe to call on every restart — it will not
 * overwrite an admin's edits.
 */
export function seedDefaultObjective(): void {
  const existing = db
    .select({ id: maraCoreObjective.id })
    .from(maraCoreObjective)
    .where(eq(maraCoreObjective.id, SINGLETON_ID))
    .all()[0];

  if (existing) return;

  const now = new Date();
  db.insert(maraCoreObjective)
    .values({
      id: SINGLETON_ID,
      payload: JSON.stringify(DEFAULT_OBJECTIVE),
      updatedAt: now,
      updatedBy: 'system',
      createdAt: now,
    })
    .run();
  console.log('[MaraCore] Seeded default ObjectiveFunction (primary=growth).');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Structural merge of `partial` onto `DEFAULT_OBJECTIVE`. Each nested
 * object (`constraints`, `tradeoffs`, `weights`) is shallow-merged, so a
 * caller can pass `{ weights: { revenue: 0.2 } }` and the other weights
 * survive. Unknown top-level keys are silently dropped.
 */
function mergeWithDefaults(partial: Partial<ObjectiveFunction>): ObjectiveFunction {
  return {
    primary: partial.primary ?? DEFAULT_OBJECTIVE.primary,
    constraints: {
      ...DEFAULT_OBJECTIVE.constraints,
      ...(partial.constraints ?? {}),
    },
    tradeoffs: {
      ...DEFAULT_OBJECTIVE.tradeoffs,
      ...(partial.tradeoffs ?? {}),
    },
    horizonDays: partial.horizonDays ?? DEFAULT_OBJECTIVE.horizonDays,
    weights: {
      ...DEFAULT_OBJECTIVE.weights,
      ...(partial.weights ?? {}),
    },
    rationale: partial.rationale ?? DEFAULT_OBJECTIVE.rationale,
  };
}

/**
 * Cheap sanity checks so the admin endpoint can reject obvious garbage
 * before it lands in the DB. Throws on violation — callers convert to a
 * 400 response.
 */
function validateObjective(o: ObjectiveFunction): void {
  const primaries: ObjectiveFunction['primary'][] = [
    'revenue',
    'user_retention',
    'engagement',
    'growth',
  ];
  if (!primaries.includes(o.primary)) {
    throw new Error(`Invalid primary metric: ${o.primary}`);
  }

  const inUnit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

  if (!inUnit(o.constraints.minUserRetention)) {
    throw new Error('constraints.minUserRetention must be in [0, 1]');
  }
  if (!inUnit(o.constraints.minBrandSafetyScore)) {
    throw new Error('constraints.minBrandSafetyScore must be in [0, 1]');
  }
  if (
    !Number.isInteger(o.constraints.maxSupportResponseTimeMs) ||
    o.constraints.maxSupportResponseTimeMs <= 0
  ) {
    throw new Error('constraints.maxSupportResponseTimeMs must be a positive integer');
  }
  if (
    !Number.isInteger(o.constraints.maxDailyLLMCalls) ||
    o.constraints.maxDailyLLMCalls <= 0
  ) {
    throw new Error('constraints.maxDailyLLMCalls must be a positive integer');
  }
  if (
    !Number.isInteger(o.constraints.maxDailyExperiments) ||
    o.constraints.maxDailyExperiments < 0
  ) {
    throw new Error('constraints.maxDailyExperiments must be a non-negative integer');
  }

  for (const k of ['growthSpeedVsQuality', 'explorationVsExploitation', 'userAcquisitionVsRetention'] as const) {
    if (!inUnit(o.tradeoffs[k])) {
      throw new Error(`tradeoffs.${k} must be in [0, 1]`);
    }
  }

  for (const k of ['revenue', 'retention', 'engagement', 'brandSafety'] as const) {
    if (!Number.isFinite(o.weights[k]) || o.weights[k] < 0) {
      throw new Error(`weights.${k} must be a non-negative number`);
    }
  }

  if (!Number.isInteger(o.horizonDays) || o.horizonDays <= 0) {
    throw new Error('horizonDays must be a positive integer');
  }
}
