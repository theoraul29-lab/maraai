#!/usr/bin/env node
/**
 * Build-time mission translator.
 *
 * Reads the Romanian-authored mission catalogue from
 * `server/missions/content/missions.json` and produces one versionable
 * translation bundle per language under
 * `server/missions/content/translations/<lang>.json`.
 *
 * These bundles are committed to the repo and seeded into the
 * `mission_translations` table at server startup (see content-translations.ts +
 * seed.ts). That means missions render in the user's chosen language WITHOUT any
 * live LLM call at runtime — deterministic, zero latency, zero per-request cost.
 * The runtime LLM path in engine.ts remains only as a fallback for AI-generated
 * per-user personalized missions, which cannot be pre-translated.
 *
 * Translation pivots through English (LLMs translate EN→X more faithfully than
 * RO→X), mirroring the runtime translateMissions() logic.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/translate-missions.mjs            # all languages
 *   ANTHROPIC_API_KEY=... node scripts/translate-missions.mjs de es fr   # only these
 *   ANTHROPIC_API_KEY=... node scripts/translate-missions.mjs --force    # ignore hash, re-translate all
 */
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'server', 'missions', 'content');
const OUT_DIR = join(CONTENT_DIR, 'translations');

// Keep in sync with LANG_NAMES in server/missions/engine.ts.
const LANG_NAMES = {
  en: 'English', ro: 'Romanian', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', uk: 'Ukrainian', nl: 'Dutch',
  sv: 'Swedish', bg: 'Bulgarian', ja: 'Japanese', ko: 'Korean', pl: 'Polish',
  cs: 'Czech', hu: 'Hungarian', hr: 'Croatian', sr: 'Serbian', tr: 'Turkish',
  ar: 'Arabic', hi: 'Hindi', zh: 'Chinese (Simplified)', th: 'Thai', vi: 'Vietnamese',
  da: 'Danish', el: 'Greek',
};

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS) || 8192;
const CHUNK = 10;

// Derived identically to missionContentHash() in server/missions/content.ts so
// the seed loader can detect when a bundle is stale versus missions.json.
function missionContentHash(m) {
  const steps = Array.isArray(m.steps) ? m.steps : [m.steps];
  const payload = JSON.stringify({
    title: m.title,
    description: m.description,
    proof_prompt: m.proof_prompt,
    steps,
    reflection: m.reflection ?? null,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function sourceEntry(m) {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    proof_prompt: m.proof_prompt,
    steps: m.steps,
    reflection: m.reflection ?? null,
  };
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set. Cannot generate translations.');
  process.exit(1);
}
const client = new Anthropic({ apiKey, timeout: 120_000 });

async function translateChunk(chunk, fromLang, toLang) {
  const payload = chunk.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    proof_prompt: m.proof_prompt,
    steps: JSON.stringify(m.steps),
    reflection: m.reflection,
  }));
  const prompt = `Translate the following JSON array from ${fromLang} to ${toLang}.
Keep each "id" value unchanged. Translate only: title, description, proof_prompt, steps (it is a JSON array encoded as a string — translate the strings inside it but keep it as a JSON-encoded string), reflection.
Preserve tone: these are short personal-development mission cards. Keep it natural and motivational, not literal.
Return ONLY a valid JSON array, no markdown fences:
${JSON.stringify(payload)}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('LLM did not return a JSON array');
  return parsed;
}

// Translate the full mission list from a source list into `toLang`.
// Returns a Map<id, {title, description, proof_prompt, steps(array), reflection}>.
async function translateAll(sourceList, fromLang, toLang) {
  const out = new Map();
  for (let i = 0; i < sourceList.length; i += CHUNK) {
    const chunk = sourceList.slice(i, i + CHUNK);
    let attempt = 0;
    // Retry transient failures a couple of times before giving up.
    while (true) {
      try {
        const translated = await translateChunk(chunk, fromLang, toLang);
        for (const t of translated) {
          const orig = chunk.find((m) => m.id === t.id);
          if (!orig || !t.title) continue;
          let steps;
          try {
            steps = JSON.parse(t.steps);
            if (!Array.isArray(steps)) steps = orig.steps;
          } catch {
            steps = orig.steps;
          }
          out.set(t.id, {
            title: t.title,
            description: t.description ?? orig.description,
            proof_prompt: t.proof_prompt ?? orig.proof_prompt,
            steps,
            reflection: t.reflection ?? null,
          });
        }
        process.stdout.write(`    chunk ${i / CHUNK + 1}/${Math.ceil(sourceList.length / CHUNK)} ok\n`);
        break;
      } catch (err) {
        attempt++;
        if (attempt >= 3) throw err;
        console.warn(`    chunk ${i} failed (attempt ${attempt}): ${err.message} — retrying`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const requested = args.filter((a) => !a.startsWith('--'));
  const targets = (requested.length > 0 ? requested : Object.keys(LANG_NAMES))
    .filter((l) => l !== 'ro'); // Romanian is the source, never a translation target.

  const missions = JSON.parse(readFileSync(join(CONTENT_DIR, 'missions.json'), 'utf8'));
  const sourceRO = missions.map(sourceEntry);
  const hashById = new Map(missions.map((m) => [m.id, missionContentHash(m)]));

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Translating ${missions.length} missions → ${targets.length} languages (model ${MODEL})`);

  // English is the pivot base for every other language.
  let english = null;
  const needEnglish = targets.includes('en') || targets.some((l) => l !== 'en');
  if (needEnglish) {
    console.log('\n[en] translating RO → English (pivot base)...');
    const enMap = await translateAll(sourceRO, 'Romanian', 'English');
    english = missions.map((m) => {
      const t = enMap.get(m.id) ?? sourceEntry(m);
      return { id: m.id, title: t.title, description: t.description, proof_prompt: t.proof_prompt, steps: t.steps, reflection: t.reflection };
    });
    if (targets.includes('en')) writeBundle('en', enMap, hashById, missions);
  }

  for (const lang of targets) {
    if (lang === 'en') continue;
    const outPath = join(OUT_DIR, `${lang}.json`);
    if (!force && existsSync(outPath) && isFresh(outPath, hashById)) {
      console.log(`\n[${lang}] up to date — skipping (use --force to regenerate)`);
      continue;
    }
    console.log(`\n[${lang}] translating English → ${LANG_NAMES[lang]}...`);
    const map = await translateAll(english, 'English', LANG_NAMES[lang]);
    writeBundle(lang, map, hashById, missions);
  }

  console.log('\nDone.');
}

function isFresh(outPath, hashById) {
  try {
    const bundle = JSON.parse(readFileSync(outPath, 'utf8'));
    const entries = bundle.missions ?? {};
    for (const [id, hash] of hashById) {
      if (!entries[id] || entries[id].source_hash !== hash) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function writeBundle(lang, map, hashById, missions) {
  const entries = {};
  for (const m of missions) {
    const t = map.get(m.id);
    if (!t) continue;
    entries[m.id] = {
      title: t.title,
      description: t.description,
      proof_prompt: t.proof_prompt,
      steps: t.steps,
      reflection: t.reflection ?? null,
      source_hash: hashById.get(m.id),
    };
  }
  const bundle = {
    lang,
    lang_name: LANG_NAMES[lang],
    generated_at: new Date().toISOString(),
    model: MODEL,
    missions: entries,
  };
  const outPath = join(OUT_DIR, `${lang}.json`);
  writeFileSync(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${outPath} (${Object.keys(entries).length}/${missions.length} missions)`);
}

main().catch((err) => {
  console.error('translate-missions failed:', err);
  process.exit(1);
});
