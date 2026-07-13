import { rawSqlite } from '../db.js';
import { getMissionsForSeed, getProgramsForSeed } from './content.js';
import { loadTranslationBundles } from './content-translations.js';

// Content (missions + programs) is authored in ./content/*.json and validated
// in content.ts. Seeding UPSERTs from that JSON so it is the single source of
// truth for the catalog: editing a mission's text there and restarting updates
// the row. `is_active` is deliberately NOT overwritten on conflict, so an
// admin's deactivation of a mission survives a re-seed.
const insertMission = rawSqlite.prepare(`
  INSERT INTO missions (
    id, title, description, pillar, difficulty, xp_reward,
    proof_type, proof_prompt, steps, reflection, is_active, is_daily
  ) VALUES (
    @id, @title, @description, @pillar, @difficulty, @xp_reward,
    @proof_type, @proof_prompt, @steps, @reflection, 1, @is_daily
  )
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    pillar = excluded.pillar,
    difficulty = excluded.difficulty,
    xp_reward = excluded.xp_reward,
    proof_type = excluded.proof_type,
    proof_prompt = excluded.proof_prompt,
    steps = excluded.steps,
    reflection = excluded.reflection,
    is_daily = excluded.is_daily
`);

const insertProgram = rawSqlite.prepare(`
  INSERT INTO mission_programs (
    id, slug, name, description, tagline, duration_days,
    price_cents, pillar_focus, difficulty, is_featured, sort_order
  ) VALUES (
    @id, @slug, @name, @description, @tagline, @duration_days,
    @price_cents, @pillar_focus, @difficulty, @is_featured, @sort_order
  )
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    tagline = excluded.tagline,
    duration_days = excluded.duration_days,
    price_cents = excluded.price_cents,
    pillar_focus = excluded.pillar_focus,
    difficulty = excluded.difficulty,
    is_featured = excluded.is_featured,
    sort_order = excluded.sort_order
`);

export function seedMissions(): void {
  console.log('[missions] Seeding missions...');

  const missions = getMissionsForSeed();
  const { progression, thematic } = getProgramsForSeed();

  const insertAll = rawSqlite.transaction(() => {
    for (const m of missions) {
      insertMission.run({
        id: m.id,
        title: m.title,
        description: m.description,
        pillar: m.pillar,
        difficulty: m.difficulty,
        xp_reward: m.xp_reward,
        proof_type: m.proof_type,
        proof_prompt: m.proof_prompt,
        steps: m.steps_json,
        reflection: m.reflection ?? null,
        is_daily: m.is_daily,
      });
    }
    for (const p of [...progression, ...thematic]) {
      insertProgram.run({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        tagline: p.tagline,
        duration_days: p.duration_days,
        price_cents: p.price_cents,
        pillar_focus: p.pillar_focus_json,
        difficulty: p.difficulty,
        is_featured: p.is_featured,
        sort_order: p.sort_order,
      });
    }
  });

  insertAll();
  const totalPrograms = progression.length + thematic.length;
  console.log(`[missions] ✅ ${missions.length} misiuni + ${totalPrograms} programe seed-uite (${progression.length} progression + ${thematic.length} tematice)`);

  // pillar_focus consistency check (non-fatal warning at startup): every pillar
  // (declared below after translations helper)
  runPillarFocusCheck(progression, thematic);
}

// Split out so seedMissions stays readable; behaviour unchanged.
function runPillarFocusCheck(
  progression: ReturnType<typeof getProgramsForSeed>['progression'],
  thematic: ReturnType<typeof getProgramsForSeed>['thematic'],
): void {
  // every pillar
  // a program targets should have at least one active mission.
  for (const prog of [...progression, ...thematic]) {
    for (const pillar of prog.pillar_focus) {
      const count = (rawSqlite
        .prepare('SELECT COUNT(*) as cnt FROM missions WHERE pillar = ? AND is_active = 1')
        .get(pillar) as { cnt: number } | undefined)?.cnt ?? 0;
      if (count === 0) {
        console.warn(
          `[missions:seed] ⚠ Program "${prog.slug}" declares pillar_focus "${pillar}" ` +
          `but no active missions with that pillar exist in the DB.`,
        );
      }
    }
  }
}

// Seed pre-generated mission translations (content/translations/<lang>.json)
// into mission_translations so missions render in the user's language without a
// live LLM call. Idempotent and safe to run on every boot:
//   • only entries whose source_hash matches the current mission text are seeded
//     (a stale bundle entry is skipped, leaving the runtime LLM fallback to
//      regenerate it if a provider is available);
//   • human-reviewed rows (reviewed = 1) are never overwritten;
//   • machine rows are refreshed from the bundle (bundle is authoritative).
const upsertTranslation = rawSqlite.prepare(`
  INSERT INTO mission_translations (
    mission_id, lang, title, description, proof_prompt, steps, reflection, content_hash, reviewed
  ) VALUES (
    @mission_id, @lang, @title, @description, @proof_prompt, @steps, @reflection, @content_hash, 0
  )
  ON CONFLICT(mission_id, lang) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    proof_prompt = excluded.proof_prompt,
    steps = excluded.steps,
    reflection = excluded.reflection,
    content_hash = excluded.content_hash,
    translated_at = unixepoch()
  WHERE mission_translations.reviewed = 0
`);

export function seedMissionTranslations(): void {
  const bundles = loadTranslationBundles();
  if (bundles.length === 0) {
    console.log('[missions] no translation bundles found — skipping (runtime LLM fallback stays active)');
    return;
  }

  const hashById = new Map(getMissionsForSeed().map((m) => [m.id, m.content_hash]));

  let seeded = 0;
  let skippedStale = 0;
  const insertAll = rawSqlite.transaction(() => {
    for (const bundle of bundles) {
      const lang = bundle.lang.split('-')[0].toLowerCase();
      if (!lang || lang === 'ro') continue;
      for (const [missionId, entry] of Object.entries(bundle.missions)) {
        const currentHash = hashById.get(missionId);
        if (!currentHash) continue; // mission no longer exists in the catalogue
        // Only seed translations that match the current source text.
        if (entry.source_hash && entry.source_hash !== currentHash) {
          skippedStale++;
          continue;
        }
        upsertTranslation.run({
          mission_id: missionId,
          lang,
          title: entry.title,
          description: entry.description,
          proof_prompt: entry.proof_prompt,
          steps: JSON.stringify(entry.steps),
          reflection: entry.reflection ?? null,
          content_hash: currentHash,
        });
        seeded++;
      }
    }
  });
  insertAll();

  const langs = bundles.map((b) => b.lang).join(', ');
  console.log(
    `[missions] ✅ ${seeded} translation rows seeded across ${bundles.length} languages (${langs})` +
    (skippedStale > 0 ? ` — ${skippedStale} stale entries skipped` : ''),
  );
}
