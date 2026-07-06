import { rawSqlite } from '../db.js';
import { getMissionsForSeed, getProgramsForSeed } from './content.js';

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
