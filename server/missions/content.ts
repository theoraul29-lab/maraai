// Mission & program content — loaded from versionable JSON, validated with
// Zod at import time, and exposed as typed records. Content lives in
// ./content/*.json so it can be edited (and reviewed in diffs) without
// touching seeding logic. A per-mission `content_hash` is derived from the
// translatable fields so the translation cache can auto-invalidate when the
// source text changes (see engine.ts).
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';

// Read the JSON content relative to this module. Using fs (rather than an
// `import ... with { type: 'json' }`) keeps it working under both tsx (dev)
// and the esbuild non-bundle output (prod), where the .json files are copied
// next to this compiled module by scripts/build-server.mjs.
const contentDir = join(dirname(fileURLToPath(import.meta.url)), 'content');
const missionsRaw: unknown = JSON.parse(readFileSync(join(contentDir, 'missions.json'), 'utf8'));
const programsRaw: unknown = JSON.parse(readFileSync(join(contentDir, 'programs.json'), 'utf8'));

const PILLARS = ['discipline', 'creativity', 'life', 'acceptance', 'helping', 'self', 'hobby'] as const;
const DIFFICULTIES = ['gentle', 'medium', 'deep'] as const;
const PROOF_TYPES = ['text', 'photo', 'video', 'screenshot', 'any', 'drawing'] as const;

const missionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  pillar: z.enum(PILLARS),
  difficulty: z.enum(DIFFICULTIES),
  xp_reward: z.number().int().nonnegative(),
  proof_type: z.enum(PROOF_TYPES),
  proof_prompt: z.string().min(1),
  steps: z.array(z.string().min(1)),
  reflection: z.string().nullable(),
  is_daily: z.union([z.literal(0), z.literal(1)]),
});

const programSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  duration_days: z.number().int().positive(),
  price_cents: z.number().int().nonnegative(),
  pillar_focus: z.array(z.enum(PILLARS)),
  difficulty: z.enum(DIFFICULTIES),
  is_featured: z.union([z.literal(0), z.literal(1)]),
  sort_order: z.number().int(),
});

const programsSchema = z.object({
  progression: z.array(programSchema),
  thematic: z.array(programSchema),
});

// Fail fast and loud at boot: malformed content should never be silently
// seeded into the shared missions table.
function parseOrThrow<T>(label: string, schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[missions:content] invalid ${label}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return result.data;
}

export type MissionContent = z.infer<typeof missionSchema>;
export type ProgramContent = z.infer<typeof programSchema>;

const missionsData = parseOrThrow('missions.json', z.array(missionSchema), missionsRaw);
const programsData = parseOrThrow('programs.json', programsSchema, programsRaw);

const duplicateId = (() => {
  const seen = new Set<string>();
  for (const m of missionsData) {
    if (seen.has(m.id)) return m.id;
    seen.add(m.id);
  }
  return null;
})();
if (duplicateId) throw new Error(`[missions:content] duplicate mission id: ${duplicateId}`);

/**
 * A hash over the translatable fields of a mission. The translation cache keys
 * on this so a text edit in missions.json transparently invalidates stale
 * translations without a manual cache purge.
 */
export function missionContentHash(m: {
  title: string;
  description: string;
  proof_prompt: string;
  steps: string[] | string;
  reflection: string | null;
}): string {
  const steps = Array.isArray(m.steps) ? m.steps : (() => { try { return JSON.parse(m.steps); } catch { return [m.steps]; } })();
  const payload = JSON.stringify({
    title: m.title,
    description: m.description,
    proof_prompt: m.proof_prompt,
    steps,
    reflection: m.reflection ?? null,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Missions ready for DB insert: `steps` re-encoded as a JSON string (the DB
 * column stores a string) and a derived `content_hash`.
 */
export function getMissionsForSeed(): Array<MissionContent & { steps_json: string; content_hash: string }> {
  return missionsData.map((m) => ({
    ...m,
    steps_json: JSON.stringify(m.steps),
    content_hash: missionContentHash(m),
  }));
}

/**
 * Programs ready for DB insert: `pillar_focus` re-encoded as a JSON string.
 * Progression programs come first, then thematic, preserving prior seed order.
 */
export function getProgramsForSeed(): {
  progression: Array<ProgramContent & { pillar_focus_json: string }>;
  thematic: Array<ProgramContent & { pillar_focus_json: string }>;
} {
  const enc = (p: ProgramContent) => ({ ...p, pillar_focus_json: JSON.stringify(p.pillar_focus) });
  return {
    progression: programsData.progression.map(enc),
    thematic: programsData.thematic.map(enc),
  };
}
