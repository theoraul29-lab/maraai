import { rawSqlite } from '../db.js';
import { llmGenerate } from '../llm.js';
import { randomUUID } from 'crypto';

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

export function addXP(userId: string, amount: number) {
  const current = getUserXP(userId);
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
  if (existing) return { success: false, message: 'Misiunea este deja activă sau completată.' };
  const id = randomUUID();
  rawSqlite.prepare(
    'INSERT INTO user_missions (id, user_id, mission_id, status, progress, started_at) VALUES (?, ?, ?, ?, 0, unixepoch())'
  ).run(id, userId, missionId, 'active');
  logEvent(userId, missionId, 'start');
  return { success: true, userMissionId: id };
}

export async function submitProof(
  userId: string,
  missionId: string,
  proof: { text?: string; mediaUrl?: string; reflectionAnswer?: string },
) {
  const mission = rawSqlite.prepare(
    'SELECT xp_reward, title, reflection FROM missions WHERE id = ?'
  ).get(missionId) as { xp_reward: number; title: string; reflection: string } | undefined;
  if (!mission) return { success: false, message: 'Misiunea nu există.' };

  let maraFeedback = '';
  try {
    const personality = getPersonality(userId);
    const prompt = `Ești Mara — un coach de viață empatic și înțelept.
Un utilizator tocmai a completat misiunea "${mission.title}".
Ce a scris ca dovadă: "${proof.text ?? 'A uploadat o imagine/video'}"
${personality ? `Ce știi despre el: îi place: ${personality['what_you_love'] ?? 'necunoscut'}, vrea să schimbe: ${personality['want_to_change'] ?? 'necunoscut'}` : ''}
Scrie un răspuns personal în română de 2-3 propoziții.
Recunoaște efortul, fii specific, inspiră-l să continue.
Nu fi generic. Vorbește ca unui prieten apropiat.`;
    maraFeedback = await llmGenerate(prompt, { source: 'agent.missions.feedback' });
  } catch {
    maraFeedback = 'Bravo că ai completat această misiune! Fiecare pas contează în călătoria ta.';
  }

  rawSqlite.prepare(`
    UPDATE user_missions SET
      status = 'completed', progress = 100,
      proof_text = ?, proof_media_url = ?, reflection_answer = ?,
      mara_feedback = ?, completed_at = unixepoch()
    WHERE user_id = ? AND mission_id = ? AND status = 'active'
  `).run(
    proof.text ?? null,
    proof.mediaUrl ?? null,
    proof.reflectionAnswer ?? null,
    maraFeedback,
    userId,
    missionId,
  );

  const xpResult = addXP(userId, mission.xp_reward);
  logEvent(userId, missionId, 'complete', { xpAwarded: mission.xp_reward });
  updateMaraKnowledge(userId, missionId, proof.text ?? '');

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

export async function generatePersonalizedMission(userId: string) {
  const personality = getPersonality(userId);
  const xpData = getUserXP(userId);
  const row = rawSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM user_missions WHERE user_id = ? AND status = 'completed'"
  ).get(userId) as { cnt: number } | undefined;
  const completedCount = row?.cnt ?? 0;

  const prompt = `Ești Mara — un coach de viață empatic. Generează o misiune personalizată.
Nivel: ${xpData.level}, Misiuni completate: ${completedCount}
Îi place: ${personality?.what_you_love ?? 'necunoscut'}
Vrea să schimbe: ${personality?.want_to_change ?? 'necunoscut'}
Hobbyuri: ${personality?.current_hobbies ?? 'necunoscut'}
Piloni disponibili: discipline|creativity|life|acceptance|helping|self|hobby
Dificultăți: gentle|medium|deep
Răspunde DOAR cu JSON valid (fără markdown):
{
  "title": "titlu scurt și inspirant",
  "description": "descriere 2-3 propoziții personalizată",
  "pillar": "unul din piloni",
  "difficulty": "gentle|medium|deep",
  "xp_reward": 150,
  "proof_type": "text|photo|video|screenshot|any",
  "proof_prompt": "întrebare specifică pentru reflecție",
  "steps": ["pas 1", "pas 2", "pas 3"],
  "reflection": "întrebare profundă de reflecție"
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
  if (alreadyShared) return { success: false, message: 'Ai distribuit deja pe această platformă.' };

  const id = randomUUID();
  rawSqlite.prepare(
    'INSERT INTO mission_shares (id, user_id, user_mission_id, platform, caption, xp_awarded) VALUES (?, ?, ?, ?, ?, 50)'
  ).run(id, userId, userMissionId, platform, caption ?? null);
  addXP(userId, 50);
  return { success: true, message: `+50 XP pentru share pe ${platform}!` };
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
