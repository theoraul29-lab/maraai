import { rawSqlite } from '../db.js';
import { llmGenerate } from '../llm.js';
import { randomUUID } from 'crypto';

const LANG_NAMES: Record<string, string> = {
  en: 'English', ro: 'Romanian', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', uk: 'Ukrainian', nl: 'Dutch',
  sv: 'Swedish', bg: 'Bulgarian', ja: 'Japanese', ko: 'Korean', pl: 'Polish',
  cs: 'Czech', hu: 'Hungarian', hr: 'Croatian', sr: 'Serbian', tr: 'Turkish',
  ar: 'Arabic', hi: 'Hindi', zh: 'Chinese (Simplified)', th: 'Thai', vi: 'Vietnamese',
  da: 'Danish', el: 'Greek',
};

function normalizeLang(lang: string): string {
  return (lang || 'en').split('-')[0].toLowerCase();
}

// Persistent translation cache so each mission is only translated once per language.
rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS mission_translations (
    mission_id TEXT NOT NULL,
    lang TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    proof_prompt TEXT NOT NULL,
    steps TEXT NOT NULL,
    reflection TEXT,
    translated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (mission_id, lang)
  )
`);

const PILLAR_LABELS: Record<string, string> = {
  discipline: '🎯 Disciplină',
  creativity: '🎨 Creativitate',
  life: '🌱 Viață',
  acceptance: '🤍 Acceptare',
  helping: '🤝 Ajutare',
  self: '🔍 Eu',
  hobby: '🎭 Hobby',
};

export function getUserXP(userId: string) {
  return (rawSqlite.prepare(
    'SELECT xp, level, streak FROM user_xp WHERE user_id = ?'
  ).get(userId) as { xp: number; level: number; streak: number } | undefined)
    ?? { xp: 0, level: 1, streak: 0 };
}

export function getPersonality(userId: string) {
  return rawSqlite.prepare(
    'SELECT * FROM user_personality WHERE user_id = ?'
  ).get(userId) as Record<string, any> | undefined;
}

// Atomic XP write — wraps the read-modify-write inside a SQLite transaction
// so two concurrent calls cannot read the same baseline and both write
// `current.xp + gained`, dropping one update. better-sqlite3's `transaction()`
// serialises the inner block through SQLite's write lock.
const addXPTxn = rawSqlite.transaction((userId: string, amount: number) => {
  const current = (rawSqlite.prepare(
    'SELECT xp, level, streak FROM user_xp WHERE user_id = ?'
  ).get(userId) as { xp: number; level: number; streak: number } | undefined)
    ?? { xp: 0, level: 1, streak: 0 };
  const multiplier = current.streak >= 7 ? 1.5 : current.streak >= 3 ? 1.2 : 1.0;
  const gained = Math.round(amount * multiplier);
  const newXP = current.xp + gained;
  const newLevel = Math.floor(newXP / 1000) + 1;
  rawSqlite.prepare(`
    INSERT INTO user_xp (user_id, xp, level, streak, last_activity_at, updated_at)
    VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET
      xp = excluded.xp, level = excluded.level,
      last_activity_at = unixepoch(), updated_at = unixepoch()
  `).run(userId, newXP, newLevel, current.streak);
  return { xp: newXP, level: newLevel, leveledUp: newLevel > current.level, gained };
});

export function addXP(userId: string, amount: number) {
  return addXPTxn(userId, amount);
}

export function saveOnboarding(userId: string, answers: {
  whatYouLove?: string;
  wantToChange?: string;
  currentHobbies?: string;
  dreamLife?: string;
  biggestFear?: string;
  preferredPillars?: string[];
}) {
  rawSqlite.prepare(`
    INSERT INTO user_personality (
      user_id, onboarding_done, what_you_love, want_to_change,
      current_hobbies, dream_life, biggest_fear, preferred_pillars, updated_at
    ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET
      onboarding_done = 1,
      what_you_love = excluded.what_you_love,
      want_to_change = excluded.want_to_change,
      current_hobbies = excluded.current_hobbies,
      dream_life = excluded.dream_life,
      biggest_fear = excluded.biggest_fear,
      preferred_pillars = excluded.preferred_pillars,
      updated_at = unixepoch()
  `).run(
    userId,
    answers.whatYouLove ?? null,
    answers.wantToChange ?? null,
    answers.currentHobbies ?? null,
    answers.dreamLife ?? null,
    answers.biggestFear ?? null,
    JSON.stringify(answers.preferredPillars ?? Object.keys(PILLAR_LABELS)),
  );
}

export async function startMission(userId: string, missionId: string) {
  const existing = rawSqlite.prepare(
    "SELECT id FROM user_missions WHERE user_id = ? AND mission_id = ? AND status != 'skipped' LIMIT 1"
  ).get(userId, missionId);
  if (existing) return { success: false, message: 'Mission is already active or completed.' };
  const id = randomUUID();
  rawSqlite.prepare(
    'INSERT INTO user_missions (id, user_id, mission_id, status, progress, started_at) VALUES (?, ?, ?, ?, 0, unixepoch())'
  ).run(id, userId, missionId, 'active');
  logEvent(userId, missionId, 'start');
  return { success: true, userMissionId: id };
}

// Atomic transition active → completed + XP award + event log + knowledge
// update. Called from submitProof() after the LLM call completes. better-sqlite3
// supports nesting (the inner addXPTxn becomes a SAVEPOINT) so XP stays atomic.
const submitProofTxn = rawSqlite.transaction((
  userId: string,
  missionId: string,
  xpReward: number,
  proof: {
    text: string | null;
    mediaUrl: string | null;
    reflectionAnswer: string | null;
    maraFeedback: string;
  },
) => {
  rawSqlite.prepare(`
    UPDATE user_missions SET
      status = 'completed', progress = 100,
      proof_text = ?, proof_media_url = ?, reflection_answer = ?,
      mara_feedback = ?, completed_at = unixepoch()
    WHERE user_id = ? AND mission_id = ? AND status = 'active'
  `).run(
    proof.text,
    proof.mediaUrl,
    proof.reflectionAnswer,
    proof.maraFeedback,
    userId,
    missionId,
  );
  const xpResult = addXPTxn(userId, xpReward);
  logEvent(userId, missionId, 'complete', { xpAwarded: xpReward });
  updateMaraKnowledge(userId, missionId, proof.text ?? '');
  return xpResult;
});

export async function submitProof(
  userId: string,
  missionId: string,
  proof: { text?: string; mediaUrl?: string; reflectionAnswer?: string },
  lang = 'en',
) {
  const mission = rawSqlite.prepare(
    'SELECT xp_reward, title, reflection FROM missions WHERE id = ?'
  ).get(missionId) as { xp_reward: number; title: string; reflection: string } | undefined;
  if (!mission) return { success: false, message: 'Mission not found.' };

  const normalized = normalizeLang(lang);
  const langName = LANG_NAMES[normalized] ?? normalized;

  let maraFeedback = '';
  try {
    const personality = getPersonality(userId);
    const prompt = `You are Mara — an empathetic and wise life coach.
A user just completed the mission "${mission.title}".
What they wrote as proof: "${proof.text ?? '[uploaded a photo/video]'}"
${personality ? `What you know about them: they love: ${personality['what_you_love'] ?? 'unknown'}, want to change: ${personality['want_to_change'] ?? 'unknown'}` : ''}
Write a personal response in ${langName} in 2-3 sentences.
Acknowledge the effort specifically, inspire them to continue.
Be personal — reference something concrete from what they wrote.`;
    maraFeedback = await llmGenerate(prompt, { source: 'agent.missions.feedback' });
  } catch {
    maraFeedback = 'Well done on completing this mission! Every step counts on your journey.';
  }

  // Wrap the proof write + XP award + audit log + knowledge note in a single
  // SQLite transaction. Without this, two concurrent submitProof() calls (e.g.
  // double-click) could each pass the WHERE status='active' guard, double-award
  // XP and double-log the completion. The LLM call stayed outside so we keep
  // the transaction short and don't hold the write lock during a network call.
  const xpResult = submitProofTxn(userId, missionId, mission.xp_reward, {
    text: proof.text ?? null,
    mediaUrl: proof.mediaUrl ?? null,
    reflectionAnswer: proof.reflectionAnswer ?? null,
    maraFeedback,
  });

  return {
    success: true,
    maraFeedback,
    xp: xpResult.xp,
    level: xpResult.level,
    leveledUp: xpResult.leveledUp,
    gained: xpResult.gained,
    message: `+${xpResult.gained} XP${xpResult.leveledUp ? ' · LEVEL UP! 🎉' : ''}`,
  };
}

function updateMaraKnowledge(userId: string, missionId: string, proofText: string) {
  if (!proofText || proofText.length < 20) return;
  const mission = rawSqlite.prepare(
    'SELECT pillar, title FROM missions WHERE id = ?'
  ).get(missionId) as { pillar: string; title: string } | undefined;
  if (!mission) return;
  const personality = getPersonality(userId);
  const currentNotes = personality?.mara_notes ? JSON.parse(personality.mara_notes as string) : {};
  if (!currentNotes[mission.pillar]) currentNotes[mission.pillar] = [];
  currentNotes[mission.pillar].push({
    mission: mission.title,
    insight: proofText.substring(0, 200),
    date: new Date().toISOString(),
  });
  if (currentNotes[mission.pillar].length > 5) {
    currentNotes[mission.pillar] = currentNotes[mission.pillar].slice(-5);
  }
  rawSqlite.prepare(`
    INSERT INTO user_personality (user_id, mara_notes, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET mara_notes = excluded.mara_notes, updated_at = unixepoch()
  `).run(userId, JSON.stringify(currentNotes));
}

export function suggestMission(userId: string) {
  const personality = getPersonality(userId);
  const done = (rawSqlite.prepare(
    "SELECT mission_id FROM user_missions WHERE user_id = ? AND status IN ('active','completed')"
  ).all(userId) as { mission_id: string }[]).map((r) => r.mission_id);

  const preferredPillars: string[] = personality?.preferred_pillars
    ? JSON.parse(personality.preferred_pillars as string)
    : Object.keys(PILLAR_LABELS);

  const available = (rawSqlite.prepare(
    'SELECT id, title, pillar, xp_reward FROM missions WHERE is_active = 1 AND is_daily = 0 ORDER BY RANDOM() LIMIT 20'
  ).all() as { id: string; title: string; pillar: string; xp_reward: number }[])
    .filter((m) => !done.includes(m.id));

  const preferred = available.filter((m) => preferredPillars.includes(m.pillar));
  return preferred[0] ?? available[0] ?? null;
}

export async function generatePersonalizedMission(userId: string, lang = 'en') {
  const personality = getPersonality(userId);
  const xpData = getUserXP(userId);
  const row = rawSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM user_missions WHERE user_id = ? AND status = 'completed'"
  ).get(userId) as { cnt: number } | undefined;
  const completedCount = row?.cnt ?? 0;

  const normalized = normalizeLang(lang);
  const langName = LANG_NAMES[normalized] ?? normalized;

  const prompt = `You are Mara — an empathetic life coach. Generate a personalized mission.
Level: ${xpData.level}, Completed missions: ${completedCount}
User likes: ${personality?.what_you_love ?? 'unknown'}
Wants to change: ${personality?.want_to_change ?? 'unknown'}
Hobbies: ${personality?.current_hobbies ?? 'unknown'}
Available pillars: discipline|creativity|life|acceptance|helping|self|hobby
Difficulties: gentle|medium|deep
Write ALL text fields in ${langName}.
Respond ONLY with valid JSON (no markdown):
{
  "title": "short inspiring title",
  "description": "2-3 personalized sentences",
  "pillar": "one of the pillars",
  "difficulty": "gentle|medium|deep",
  "xp_reward": 150,
  "proof_type": "text|photo|video|screenshot|any",
  "proof_prompt": "specific reflection question",
  "steps": ["step 1", "step 2", "step 3"],
  "reflection": "deep reflection question"
}`;

  try {
    const response = await llmGenerate(prompt, { source: 'agent.missions.personalized' });
    const clean = response.replace(/```json|```/g, '').trim();
    const mission = JSON.parse(clean) as {
      title: string; description: string; pillar: string;
      difficulty: string; xp_reward: number; proof_type: string;
      proof_prompt: string; steps: string[]; reflection: string;
    };
    const id = randomUUID();
    rawSqlite.prepare(`
      INSERT INTO missions (id, title, description, pillar, difficulty, xp_reward,
        proof_type, proof_prompt, steps, reflection, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id, mission.title, mission.description, mission.pillar,
      mission.difficulty, mission.xp_reward, mission.proof_type,
      mission.proof_prompt, JSON.stringify(mission.steps), mission.reflection,
    );
    return { ...mission, id };
  } catch {
    return null;
  }
}

export async function shareMission(
  userId: string,
  userMissionId: string,
  platform: string,
  caption?: string,
) {
  const alreadyShared = rawSqlite.prepare(
    'SELECT id FROM mission_shares WHERE user_id = ? AND user_mission_id = ? AND platform = ? LIMIT 1'
  ).get(userId, userMissionId, platform);
  if (alreadyShared) return { success: false, message: 'Already shared on this platform.' };

  const id = randomUUID();
  rawSqlite.prepare(
    'INSERT INTO mission_shares (id, user_id, user_mission_id, platform, caption, xp_awarded) VALUES (?, ?, ?, ?, ?, 50)'
  ).run(id, userId, userMissionId, platform, caption ?? null);
  addXP(userId, 50);
  return { success: true, message: `+50 XP for sharing on ${platform}!` };
}

export function getCommunityFeed(limit = 20) {
  return rawSqlite.prepare(`
    SELECT ms.id, ms.caption, ms.platform, ms.created_at,
      u.display_name, u.profile_image_url,
      m.title as mission_title, m.pillar,
      um.proof_text, um.mara_feedback
    FROM mission_shares ms
    JOIN users u ON u.id = ms.user_id
    JOIN user_missions um ON um.id = ms.user_mission_id
    JOIN missions m ON m.id = um.mission_id
    WHERE ms.platform = 'hellomara'
    ORDER BY ms.created_at DESC
    LIMIT ?
  `).all(limit);
}

function logEvent(userId: string, missionId: string, type: string, meta: Record<string, unknown> = {}) {
  const id = randomUUID();
  rawSqlite.prepare(
    'INSERT INTO mission_events (id, user_id, mission_id, event_type, meta) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, missionId, type, JSON.stringify(meta));
}

// ── Mission context for Mara AI ───────────────────────────────────────────────

function parseSteps(stepsJson: string): string[] {
  try { return JSON.parse(stepsJson) as string[]; } catch { return []; }
}

/**
 * Build a rich, structured mission context string for Mara's system prompt.
 * Reads from the translation cache (sync — no LLM call) so it's fast enough
 * to include on every chat request.  Falls back to Romanian when a translation
 * hasn't been cached yet (warmTranslationCache() pre-fills at startup).
 */
export function getMissionContextForMara(userId: string, lang?: string): string {
  try {
    const normalized = lang ? normalizeLang(lang) : 'en';

    // ── Active missions (max 3 most recent) ──────────────────────────────────
    const activeMissions = rawSqlite.prepare(`
      SELECT m.id, m.title, m.description, m.pillar, m.difficulty,
             m.steps, m.proof_prompt, m.xp_reward, m.reflection,
             um.status, um.started_at
      FROM user_missions um
      JOIN missions m ON m.id = um.mission_id
      WHERE um.user_id = ? AND um.status = 'active'
      ORDER BY um.started_at DESC
      LIMIT 3
    `).all(userId) as Array<{
      id: string; title: string; description: string; pillar: string;
      difficulty: string; steps: string; proof_prompt: string;
      xp_reward: number; reflection: string | null;
      status: string; started_at: number;
    }>;

    // Apply cached translations if lang ≠ 'ro'
    let activeFinal = activeMissions;
    if (normalized !== 'ro' && activeMissions.length > 0) {
      const ids = activeMissions.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      const translations = rawSqlite.prepare(`
        SELECT mission_id, title, description, proof_prompt, steps, reflection
        FROM mission_translations WHERE lang = ? AND mission_id IN (${placeholders})
      `).all(normalized, ...ids) as Array<{
        mission_id: string; title: string; description: string;
        proof_prompt: string; steps: string; reflection: string | null;
      }>;
      const tMap = new Map(translations.map(t => [t.mission_id, t]));
      activeFinal = activeMissions.map(m => {
        const t = tMap.get(m.id);
        return t ? { ...m, title: t.title, description: t.description,
                        proof_prompt: t.proof_prompt, steps: t.steps,
                        reflection: t.reflection } : m;
      });
    }

    // ── Completed missions summary ────────────────────────────────────────────
    const completedRow = rawSqlite.prepare(
      "SELECT COUNT(*) as total FROM user_missions WHERE user_id = ? AND status = 'completed'"
    ).get(userId) as { total: number } | undefined;
    const totalCompleted = completedRow?.total ?? 0;

    const byPillar = rawSqlite.prepare(`
      SELECT m.pillar, COUNT(*) as cnt
      FROM user_missions um JOIN missions m ON m.id = um.mission_id
      WHERE um.user_id = ? AND um.status = 'completed'
      GROUP BY m.pillar ORDER BY cnt DESC LIMIT 3
    `).all(userId) as Array<{ pillar: string; cnt: number }>;

    // ── Build context string ──────────────────────────────────────────────────
    const parts: string[] = [];

    if (totalCompleted > 0) {
      const pillars = byPillar.map(r => `${r.pillar}(${r.cnt})`).join(', ');
      parts.push(`Missions completed: ${totalCompleted}${pillars ? ` — strongest pillars: ${pillars}` : ''}`);
    } else {
      parts.push('Missions completed: 0 — the user is just getting started.');
    }

    if (activeFinal.length > 0) {
      parts.push(`Active missions (${activeFinal.length}):`);
      for (const m of activeFinal) {
        const steps = parseSteps(m.steps);
        const daysSince = Math.floor((Date.now() / 1000 - (m.started_at || 0)) / 86400);
        parts.push(`  • [${m.pillar} / ${m.difficulty}] "${m.title}" — started ${daysSince}d ago, +${m.xp_reward} XP`);
        parts.push(`    Description: ${m.description}`);
        if (steps.length > 0) parts.push(`    Steps: ${steps.map((s, i) => `${i + 1}. ${s}`).join(' | ')}`);
        parts.push(`    Proof question: ${m.proof_prompt}`);
        if (m.reflection) parts.push(`    Reflection: ${m.reflection}`);
      }
    } else {
      parts.push('Active missions: none — the user has not started any mission yet.');
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

/**
 * Pre-warm the mission_translations cache for a list of languages.
 * Call at server startup so the first real user doesn't pay the LLM latency.
 * This is fire-and-forget — errors are logged and swallowed.
 */
export async function warmTranslationCache(langs: string[] = [
  'en', 'de', 'fr', 'es', 'pt', 'ru', 'it', 'uk', 'nl', 'sv', 'bg', 'ja', 'ko',
  'pl', 'cs', 'hu', 'hr', 'sr', 'tr', 'ar', 'hi', 'zh', 'th', 'vi', 'da', 'el',
]): Promise<void> {
  const allMissions = rawSqlite.prepare(
    'SELECT id, title, description, proof_prompt, steps, reflection FROM missions WHERE is_active = 1'
  ).all() as TranslatableMission[];

  for (const lang of langs) {
    const normalized = normalizeLang(lang);
    if (normalized === 'ro') continue;

    const cachedIds = new Set(
      (rawSqlite.prepare(
        'SELECT mission_id FROM mission_translations WHERE lang = ?'
      ).all(normalized) as { mission_id: string }[]).map(r => r.mission_id)
    );

    const toTranslate = allMissions.filter(m => !cachedIds.has(m.id));
    if (toTranslate.length === 0) {
      console.log(`[missions:warm] ${lang} — all ${allMissions.length} missions already cached`);
      continue;
    }

    console.log(`[missions:warm] ${lang} — translating ${toTranslate.length}/${allMissions.length} missions...`);
    try {
      await translateMissions(toTranslate, lang);
      console.log(`[missions:warm] ${lang} — done`);
    } catch (err) {
      console.warn(`[missions:warm] ${lang} failed:`, (err as Error).message);
    }
  }
}

// ── Mission translation ───────────────────────────────────────────────────────

type TranslatableMission = {
  id: string;
  title: string;
  description: string;
  proof_prompt: string;
  steps: string;
  reflection: string | null;
  [key: string]: unknown;
};

/**
 * Translate mission text fields to the requested language using the LLM.
 * Results are cached in mission_translations so each mission/lang pair is
 * only translated once.  Falls back to original Romanian on any error.
 */
export async function translateMissions<T extends TranslatableMission>(
  missions: T[],
  lang: string,
): Promise<T[]> {
  const normalized = normalizeLang(lang);
  if (!normalized || normalized === 'ro') return missions;

  const langName = LANG_NAMES[normalized] ?? normalized;

  const placeholders = missions.map(() => '?').join(',');
  const cached = (rawSqlite.prepare(
    `SELECT mission_id, title, description, proof_prompt, steps, reflection
     FROM mission_translations WHERE lang = ? AND mission_id IN (${placeholders})`
  ).all(normalized, ...missions.map(m => m.id))) as Array<{
    mission_id: string; title: string; description: string;
    proof_prompt: string; steps: string; reflection: string | null;
  }>;

  const cacheMap = new Map(cached.map(c => [c.mission_id, c]));
  const toTranslate = missions.filter(m => !cacheMap.has(m.id));

  if (toTranslate.length > 0) {
    const CHUNK = 10;
    const insertStmt = rawSqlite.prepare(
      `INSERT OR REPLACE INTO mission_translations
       (mission_id, lang, title, description, proof_prompt, steps, reflection)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (let i = 0; i < toTranslate.length; i += CHUNK) {
      const chunk = toTranslate.slice(i, i + CHUNK);
      const payload = chunk.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        proof_prompt: m.proof_prompt,
        steps: m.steps,
        reflection: m.reflection,
      }));

      try {
        const prompt = `Translate the following JSON array from Romanian to ${langName}.
Keep each "id" value unchanged. Translate only: title, description, proof_prompt, steps (it is a JSON array encoded as a string — translate the strings inside it but keep it as a JSON-encoded string), reflection.
Return ONLY a valid JSON array, no markdown fences:
${JSON.stringify(payload)}`;

        // source: 'user_chat' bypasses the brain rate-limiter (autonomous cap).
        // Mission translation is triggered by a live user request, so it must
        // not compete with the daily autonomous-brain call budget.
        const raw = await Promise.race([
          llmGenerate(prompt, { source: 'user_chat' }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('translate_timeout')), 30000)),
        ]);
        const clean = raw.replace(/```json|```/g, '').trim();
        const translated = JSON.parse(clean) as Array<{
          id: string; title: string; description: string;
          proof_prompt: string; steps: string; reflection: string | null;
        }>;

        if (Array.isArray(translated)) {
          rawSqlite.transaction(() => {
            for (const t of translated) {
              const orig = chunk.find(m => m.id === t.id);
              if (orig && t.title) {
                insertStmt.run(t.id, normalized, t.title, t.description ?? orig.description, t.proof_prompt ?? orig.proof_prompt, t.steps ?? orig.steps, t.reflection ?? null);
                cacheMap.set(t.id, { mission_id: t.id, title: t.title, description: t.description, proof_prompt: t.proof_prompt, steps: t.steps, reflection: t.reflection ?? null });
              }
            }
          })();
        }
      } catch (err) {
        console.warn(`[translateMissions] ${langName} chunk ${i}: ${(err as Error).message}`);
      }
    }
  }

  return missions.map(m => {
    const c = cacheMap.get(m.id);
    if (!c) return m;
    return { ...m, title: c.title, description: c.description, proof_prompt: c.proof_prompt, steps: c.steps, reflection: c.reflection };
  });
}
