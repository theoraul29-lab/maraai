// Pre-generated mission translations, authored offline by
// scripts/translate-missions.mjs and committed as versionable JSON under
// ./content/translations/<lang>.json. These are seeded into the
// mission_translations table at startup (see seedMissionTranslations below) so
// missions render in the user's language WITHOUT any live LLM call at runtime.
//
// Each bundle entry stores a `source_hash` derived from the Romanian source
// (identical to missionContentHash in content.ts). A bundle entry whose stored
// hash no longer matches the current mission text is stale and is skipped, so
// the runtime translateMissions() fallback can regenerate it if an LLM is
// available — otherwise the user sees the original Romanian for that mission.
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';

const translationsDir = join(dirname(fileURLToPath(import.meta.url)), 'content', 'translations');

const entrySchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  proof_prompt: z.string(),
  steps: z.array(z.string()),
  reflection: z.string().nullable(),
  source_hash: z.string().optional(),
});

const bundleSchema = z.object({
  lang: z.string().min(1),
  lang_name: z.string().optional(),
  generated_at: z.string().optional(),
  model: z.string().optional(),
  missions: z.record(entrySchema),
});

export type TranslationBundleEntry = z.infer<typeof entrySchema>;
export type TranslationBundle = z.infer<typeof bundleSchema>;

/**
 * Load and validate every translation bundle shipped in content/translations.
 * Malformed or missing files are skipped with a warning (never fatal at boot).
 */
export function loadTranslationBundles(): TranslationBundle[] {
  let files: string[];
  try {
    files = readdirSync(translationsDir).filter((f) => f.endsWith('.json'));
  } catch {
    // Directory absent (e.g. no bundles generated yet) — nothing to seed.
    return [];
  }

  const bundles: TranslationBundle[] = [];
  for (const file of files) {
    try {
      const raw: unknown = JSON.parse(readFileSync(join(translationsDir, file), 'utf8'));
      const parsed = bundleSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[missions:translations] invalid bundle ${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        continue;
      }
      bundles.push(parsed.data);
    } catch (err) {
      console.warn(`[missions:translations] failed to read ${file}: ${(err as Error).message}`);
    }
  }
  return bundles;
}
