import { rawSqlite } from '../db.js';
import { llmGenerate, isLLMConfigured } from '../llm.js';
import { PROGRAM_CATALOGUE } from '../billing/plans.js';
import { hasFeature } from '../billing/features.js';
import { translateMissions } from './engine.js';

// ─── PROGRAM ACCESS ───────────────────────────────────────────────────────────

/**
 * Check if a user can access a specific day of a program.
 * Programs are now included with VIP (and Creator) subscriptions.
 */
export async function hasAccessToDay(userId: string, programSlug: string, day: number): Promise<boolean> {
  const programId = slugToProgramId(programSlug);
  const def = PROGRAM_CATALOGUE.find((p) => p.id === programId);
  if (!def) return false;
  void day; // all days accessible once user has VIP
  return hasFeature(userId, 'programs.all');
}

export async function hasPurchasedProgram(userId: string, _programId: string): Promise<boolean> {
  return hasFeature(userId, 'programs.all');
}

function slugToProgramId(slug: string): string {
  // Slugs like 'new-mindset' map to program IDs like 'new_mindset'
  return slug.replace(/-/g, '_');
}

// ─── ENROLLMENT ───────────────────────────────────────────────────────────────

export async function enrollUserInProgram(
  userId: string,
  programSlug: string,
  settings: {
    notificationHour?: number;
    habitDescription?: string;
    language?: string;
  } = {},
): Promise<{ success: boolean; enrollmentId?: string; message?: string }> {
  const program = rawSqlite
    .prepare('SELECT * FROM mission_programs WHERE slug = ? AND is_active = 1')
    .get(programSlug) as any;
  if (!program) return { success: false, message: 'Program not found.' };

  const existing = rawSqlite
    .prepare(
      "SELECT id FROM user_program_enrollments WHERE user_id = ? AND program_id = ? AND status = 'active' LIMIT 1",
    )
    .get(userId, program.id) as any;
  if (existing) return { success: false, message: 'You are already enrolled in this program.' };

  const enrollmentId = crypto.randomUUID();
  rawSqlite
    .prepare(
      `INSERT INTO user_program_enrollments
        (id, user_id, program_id, status, current_day, streak, settings, started_at)
       VALUES (?, ?, ?, 'active', 1, 0, ?, unixepoch())`,
    )
    .run(
      enrollmentId,
      userId,
      program.id,
      JSON.stringify({
        notificationHour: settings.notificationHour ?? 8,
        habitDescription: settings.habitDescription ?? '',
        language: settings.language ?? 'en',
      }),
    );

  // Generate first 7 days asynchronously
  generateProgramDays(enrollmentId, userId, program, settings, 1, 7).catch((err) =>
    console.error('[program-engine] Gen error:', err),
  );

  return { success: true, enrollmentId };
}

// ─── GENERARE ZILE ────────────────────────────────────────────────────────────

export async function generateProgramDays(
  enrollmentId: string,
  userId: string,
  program: any,
  settings: any,
  fromDay: number,
  toDay: number,
): Promise<void> {
  const personality = rawSqlite
    .prepare('SELECT * FROM user_personality WHERE user_id = ?')
    .get(userId) as any;

  const seedMissions = rawSqlite
    .prepare('SELECT * FROM missions WHERE is_active = 1 ORDER BY RANDOM() LIMIT 50')
    .all() as any[];

  for (let day = fromDay; day <= toDay; day++) {
    const exists = rawSqlite
      .prepare('SELECT id FROM program_day_missions WHERE program_id = ? AND day_number = ?')
      .get(program.id, day);
    if (exists) continue;

    try {
      const mission = await generateDayMission(day, program, personality, settings, seedMissions);
      rawSqlite
        .prepare(
          `INSERT OR IGNORE INTO program_day_missions
            (id, program_id, day_number, mission_id,
             custom_title, custom_description, custom_proof_prompt, intent, is_ai_generated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          crypto.randomUUID(),
          program.id,
          day,
          mission.seedMissionId ?? null,
          mission.customTitle ?? null,
          mission.customDescription ?? null,
          mission.customProofPrompt ?? null,
          mission.intent ?? null,
          mission.isAiGenerated ? 1 : 0,
        );
    } catch (err) {
      console.error(`[program-engine] Day ${day} error:`, err);
      const fallback = seedMissions[day % seedMissions.length];
      if (fallback) {
        rawSqlite
          .prepare(
            `INSERT OR IGNORE INTO program_day_missions
              (id, program_id, day_number, mission_id, is_ai_generated)
             VALUES (?, ?, ?, ?, 0)`,
          )
          .run(crypto.randomUUID(), program.id, day, fallback.id);
      }
    }
  }
}

async function generateDayMission(
  day: number,
  program: any,
  personality: any,
  settings: any,
  seedMissions: any[],
): Promise<{
  seedMissionId?: string;
  customTitle?: string;
  customDescription?: string;
  customProofPrompt?: string;
  intent?: string;
  isAiGenerated: boolean;
}> {
  const useAI = (day <= 50 || Math.random() > 0.7) && isLLMConfigured();
  if (!useAI) {
    const seed = seedMissions[day % seedMissions.length];
    return { seedMissionId: seed?.id, isAiGenerated: false };
  }

  const totalDays = program.duration_days;
  const progress = day / totalDays;
  const phase = progress < 0.33 ? 'beginning' : progress < 0.66 ? 'middle' : 'deep';
  const phaseContext = {
    beginning: 'Light missions that build momentum. The user is at the beginning of their journey.',
    middle: 'Medium missions. The user feels the change and is ready for more.',
    deep: 'Deep and transformative missions. The user is ready for depth and challenge.',
  }[phase];

  const userLang = settings?.language ?? 'en';
  const LANG_NAMES: Record<string, string> = {
    en: 'English', ro: 'Romanian', de: 'German', fr: 'French', es: 'Spanish',
    it: 'Italian', pt: 'Portuguese', ru: 'Russian', uk: 'Ukrainian', nl: 'Dutch',
    sv: 'Swedish', bg: 'Bulgarian', ja: 'Japanese', ko: 'Korean', pl: 'Polish',
    cs: 'Czech', hu: 'Hungarian', hr: 'Croatian', sr: 'Serbian', tr: 'Turkish',
    ar: 'Arabic', hi: 'Hindi', zh: 'Chinese (Simplified)', th: 'Thai', vi: 'Vietnamese',
    da: 'Danish', el: 'Greek',
  };
  const langName = LANG_NAMES[userLang.split('-')[0].toLowerCase()] ?? userLang;

  const prompt = `You are Mara — an empathetic life coach.
Generate the mission for day ${day} of ${totalDays} from the program "${program.name}".

Program: ${program.tagline}
Phase: ${phaseContext}
Focus pillars: ${program.pillar_focus}

User:
- Loves: ${personality?.what_you_love ?? 'unknown'}
- Wants to change: ${personality?.want_to_change ?? 'unknown'}
- Specific goal: ${settings?.habitDescription ?? 'personal transformation'}

IMPORTANT:
- Proof via: photo OR drawing OR text OR any combination
- Mission must be concrete and achievable in 5-30 minutes
- Mara's journal transforms the proof into a beautiful literary page
- Write ALL text fields in ${langName}.

Respond ONLY with valid JSON (no markdown fences):
{
  "title": "short inspiring title",
  "description": "2-3 personalized sentences",
  "proofPrompt": "what to do / photograph / draw",
  "intent": "how Mara will transform this into a journal page",
  "reflection": "deep reflection question",
  "proofType": "text|photo|any|drawing"
}`;

  const response = await llmGenerate(prompt, { source: 'agent.program-generator' });
  const clean = response.replace(/```json|```/g, '').trim();
  let gen: Record<string, unknown>;
  try {
    gen = JSON.parse(clean) as Record<string, unknown>;
  } catch {
    // LLM returned malformed JSON — fall back to seed mission
    const seed = seedMissions[day % seedMissions.length];
    return { seedMissionId: seed?.id, isAiGenerated: false };
  }

  return {
    customTitle: typeof gen.title === 'string' ? gen.title : undefined,
    customDescription: typeof gen.description === 'string' ? gen.description : undefined,
    customProofPrompt: typeof gen.proofPrompt === 'string' ? gen.proofPrompt : undefined,
    intent: typeof gen.intent === 'string' ? gen.intent : undefined,
    isAiGenerated: true,
  };
}

// ─── MISIUNEA ZILEI ───────────────────────────────────────────────────────────

export async function getDayMission(
  userId: string,
  enrollmentId: string,
  lang?: string,
): Promise<any> {
  const enrollment = rawSqlite
    .prepare(
      `SELECT e.*, p.name as program_name, p.slug as program_slug,
              p.duration_days, p.pillar_focus, p.id as program_id
       FROM user_program_enrollments e
       JOIN mission_programs p ON p.id = e.program_id
       WHERE e.id = ? AND e.user_id = ? AND e.status = 'active'`,
    )
    .get(enrollmentId, userId) as any;
  if (!enrollment) return null;

  const currentDay = enrollment.current_day;

  // Enforce access: programs require VIP or Creator subscription
  if (!(await hasAccessToDay(userId, enrollment.program_slug, currentDay))) {
    return { locked: true, currentDay, programSlug: enrollment.program_slug };
  }

  const todayCompleted = rawSqlite
    .prepare(
      `SELECT id FROM journal_entries
       WHERE user_id = ? AND program_enrollment_id = ?
         AND day_number = ? AND date(created_at, 'unixepoch') = date('now')
       LIMIT 1`,
    )
    .get(userId, enrollmentId, currentDay) as any;

  let dayMission = rawSqlite
    .prepare(
      `SELECT pdm.*, m.title, m.description, m.pillar, m.difficulty,
              m.xp_reward, m.proof_type, m.proof_prompt, m.steps, m.reflection
       FROM program_day_missions pdm
       LEFT JOIN missions m ON m.id = pdm.mission_id
       WHERE pdm.program_id = ? AND pdm.day_number = ?`,
    )
    .get(enrollment.program_id, currentDay) as any;

  if (!dayMission) {
    const program = rawSqlite
      .prepare('SELECT * FROM mission_programs WHERE id = ?')
      .get(enrollment.program_id) as any;
    const settings = enrollment.settings ? JSON.parse(enrollment.settings) : {};
    const seedMissions = rawSqlite
      .prepare('SELECT * FROM missions WHERE is_active = 1 LIMIT 30')
      .all() as any[];
    const personality = rawSqlite
      .prepare('SELECT * FROM user_personality WHERE user_id = ?')
      .get(userId) as any;

    await generateProgramDays(enrollmentId, userId, program!, settings, currentDay, currentDay);

    dayMission = rawSqlite
      .prepare(
        `SELECT pdm.*, m.title, m.description, m.pillar, m.difficulty,
                m.xp_reward, m.proof_type, m.proof_prompt, m.steps, m.reflection
         FROM program_day_missions pdm
         LEFT JOIN missions m ON m.id = pdm.mission_id
         WHERE pdm.program_id = ? AND pdm.day_number = ?`,
      )
      .get(enrollment.program_id, currentDay) as any;

  }

  // Translate the day mission's base fields (from the missions table) if needed.
  // Custom fields (AI-generated at enroll time) are expected to already be in
  // the enrollment's language, so we only translate the seed-based fallbacks.
  let translatedBase: { title: string; description: string; proof_prompt: string; steps: string; reflection: string | null } | null = null;
  if (dayMission && dayMission.mission_id && lang) {
    const [t] = await translateMissions([{
      id: dayMission.mission_id,
      title: dayMission.title ?? '',
      description: dayMission.description ?? '',
      proof_prompt: dayMission.proof_prompt ?? '',
      steps: dayMission.steps ?? '[]',
      reflection: dayMission.reflection ?? null,
    }], lang);
    translatedBase = t;
  }

  return {
    enrollment,
    currentDay,
    totalDays: enrollment.duration_days,
    percentComplete: Math.round((currentDay / enrollment.duration_days) * 100),
    isCompleted: !!todayCompleted,
    streakMessage: getStreakMessage(enrollment.streak, lang),
    mission: dayMission
      ? {
          id: dayMission.mission_id ?? dayMission.id,
          title: dayMission.custom_title ?? translatedBase?.title ?? dayMission.title,
          description: dayMission.custom_description ?? translatedBase?.description ?? dayMission.description,
          proofPrompt: dayMission.custom_proof_prompt ?? translatedBase?.proof_prompt ?? dayMission.proof_prompt,
          intent: dayMission.intent,
          pillar: dayMission.pillar,
          difficulty: dayMission.difficulty,
          xpReward: dayMission.xp_reward ?? 100,
          proofType: dayMission.proof_type ?? 'text',
          steps: dayMission.steps ? JSON.parse(translatedBase?.steps ?? dayMission.steps) : [],
          reflection: translatedBase?.reflection ?? dayMission.reflection,
          isAiGenerated: !!dayMission.is_ai_generated,
        }
      : null,
  };
}

function getStreakMessage(streak: number, lang?: string): string {
  if (streak === 0) return '';
  const l = (lang || 'en').split('-')[0].toLowerCase();

  const msgs: Record<string, { 1?: string; 7?: string; 14?: string; 21?: string; 30?: string; default: string }> = {
    ro: { 1: '🔥 Prima zi — ai început!', 7: '🔥🔥 7 zile — o săptămână completă!', 14: '🔥🔥🔥 14 zile — două săptămâni!', 21: '💎 21 de zile — habitoul e al tău!', 30: '👑 30 de zile — un maestru al obiceiului!', default: `🔥 ${streak} zile consecutive — nu te opri!` },
    en: { 1: '🔥 Day one — you started!', 7: '🔥🔥 7 days — a full week!', 14: '🔥🔥🔥 14 days — two weeks strong!', 21: '💎 21 days — the habit is yours!', 30: '👑 30 days — a habit master!', default: `🔥 ${streak} consecutive days — keep going!` },
    de: { 1: '🔥 Erster Tag — du hast begonnen!', 7: '🔥🔥 7 Tage — eine ganze Woche!', 14: '🔥🔥🔥 14 Tage — zwei Wochen!', 21: '💎 21 Tage — die Gewohnheit gehört dir!', 30: '👑 30 Tage — ein Gewohnheitsmeister!', default: `🔥 ${streak} Tage in Folge — hör nicht auf!` },
    fr: { 1: '🔥 Premier jour — tu as commencé !', 7: '🔥🔥 7 jours — une semaine complète !', 14: '🔥🔥🔥 14 jours — deux semaines !', 21: '💎 21 jours — l\'habitude t\'appartient !', 30: '👑 30 jours — un maître de l\'habitude !', default: `🔥 ${streak} jours consécutifs — ne t'arrête pas !` },
    es: { 1: '🔥 Primer día — ¡empezaste!', 7: '🔥🔥 7 días — ¡una semana completa!', 14: '🔥🔥🔥 14 días — ¡dos semanas!', 21: '💎 21 días — ¡el hábito es tuyo!', 30: '👑 30 días — ¡un maestro del hábito!', default: `🔥 ${streak} días consecutivos — ¡no te detengas!` },
    it: { 1: '🔥 Primo giorno — hai iniziato!', 7: '🔥🔥 7 giorni — una settimana intera!', 14: '🔥🔥🔥 14 giorni — due settimane!', 21: '💎 21 giorni — l\'abitudine è tua!', 30: '👑 30 giorni — un maestro delle abitudini!', default: `🔥 ${streak} giorni consecutivi — non fermarti!` },
    pt: { 1: '🔥 Primeiro dia — você começou!', 7: '🔥🔥 7 dias — uma semana completa!', 14: '🔥🔥🔥 14 dias — duas semanas!', 21: '💎 21 dias — o hábito é seu!', 30: '👑 30 dias — um mestre do hábito!', default: `🔥 ${streak} dias consecutivos — não pare!` },
    ja: { 1: '🔥 1日目 — 始めました！', 7: '🔥🔥 7日間 — 1週間達成！', 14: '🔥🔥🔥 14日間 — 2週間！', 21: '💎 21日間 — 習慣が身についた！', 30: '👑 30日間 — 習慣の達人！', default: `🔥 ${streak}日連続 — 止まらないで！` },
    ko: { 1: '🔥 첫 번째 날 — 시작했어요!', 7: '🔥🔥 7일 — 꼬박 한 주!', 14: '🔥🔥🔥 14일 — 2주!', 21: '💎 21일 — 습관이 생겼어요!', 30: '👑 30일 — 습관의 달인!', default: `🔥 ${streak}일 연속 — 멈추지 마세요!` },
    zh: { 1: '🔥 第一天 — 你开始了！', 7: '🔥🔥 7天 — 整整一周！', 14: '🔥🔥🔥 14天 — 两周！', 21: '💎 21天 — 习惯已成！', 30: '👑 30天 — 习惯大师！', default: `🔥 ${streak}天连续 — 不要停！` },
    ar: { 1: '🔥 اليوم الأول — لقد بدأت!', 7: '🔥🔥 7 أيام — أسبوع كامل!', 14: '🔥🔥🔥 14 يومًا — أسبوعان!', 21: '💎 21 يومًا — العادة أصبحت لك!', 30: '👑 30 يومًا — سيد العادات!', default: `🔥 ${streak} أيام متتالية — لا تتوقف!` },
  };

  const m = msgs[l] ?? msgs['en'];
  if (streak === 1 && m[1]) return m[1];
  if (streak === 7 && m[7]) return m[7];
  if (streak === 14 && m[14]) return m[14];
  if (streak === 21 && m[21]) return m[21];
  if (streak === 30 && m[30]) return m[30];
  return m.default;
}

// ─── COMPLETARE ZI ────────────────────────────────────────────────────────────

export async function completeProgramDay(
  userId: string,
  enrollmentId: string,
  proof: {
    type: string;
    content?: string;
    mediaUrl?: string;
    reflectionAnswer?: string;
    language?: string;
  },
): Promise<{
  success: boolean;
  maraJournalPage?: string;
  maraFeedback?: string;
  xpGained?: number;
  newDay?: number;
  programCompleted?: boolean;
  streakMessage?: string;
  message?: string;
}> {
  const enrollment = rawSqlite
    .prepare(
      `SELECT e.*, p.name as program_name, p.duration_days, p.slug, p.id as program_id
       FROM user_program_enrollments e
       JOIN mission_programs p ON p.id = e.program_id
       WHERE e.id = ? AND e.user_id = ? AND e.status = 'active'`,
    )
    .get(enrollmentId, userId) as any;
  if (!enrollment) return { success: false, message: 'Enrollment not found.' };

  const alreadyDone = rawSqlite
    .prepare(
      `SELECT id FROM journal_entries
       WHERE user_id = ? AND program_enrollment_id = ?
         AND day_number = ? AND date(created_at, 'unixepoch') = date('now')
       LIMIT 1`,
    )
    .get(userId, enrollmentId, enrollment.current_day);
  if (alreadyDone) return { success: false, message: "You have already completed today's mission!" };

  const dayMission = await getDayMission(userId, enrollmentId);
  if (!dayMission?.mission) return { success: false, message: "Today's mission not found." };

  const journalData = await generateJournalPage(userId, dayMission, proof, enrollment);

  const journalId = crypto.randomUUID();
  const MILESTONES = [7, 14, 21, 30, 60, 90, 180, 365];

  // Atomic: journal entry + proof insert in single transaction to avoid orphaned records
  rawSqlite.transaction(() => {
    rawSqlite
      .prepare(
        `INSERT INTO journal_entries
          (id, user_id, program_enrollment_id, day_number, raw_content,
           mara_reflection, mara_page, mood, tags, visibility, is_milestone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?)`,
      )
      .run(
        journalId,
        userId,
        enrollmentId,
        enrollment.current_day,
        proof.content ?? '',
        journalData.maraFeedback,
        journalData.journalPage,
        journalData.detectedMood ?? null,
        JSON.stringify(journalData.tags ?? []),
        MILESTONES.includes(enrollment.current_day) ? 1 : 0,
      );

    rawSqlite
      .prepare(
        `INSERT INTO mission_proofs
          (id, user_mission_id, user_id, proof_type, content, media_url,
           mara_feedback, mara_page, processing_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done')`,
      )
      .run(
        crypto.randomUUID(),
        dayMission.mission.id ?? 'unknown',
        userId,
        proof.type,
        proof.content ?? null,
        proof.mediaUrl ?? null,
        journalData.maraFeedback,
        journalData.journalPage,
      );
  })();

  const newDay = enrollment.current_day + 1;
  const newStreak = enrollment.streak + 1;
  const longestStreak = Math.max(newStreak, enrollment.longest_streak ?? 0);
  const programCompleted = newDay > enrollment.duration_days;

  rawSqlite
    .prepare(
      `UPDATE user_program_enrollments SET
        current_day = ?, streak = ?, longest_streak = ?,
        last_activity_at = unixepoch(),
        status = ?,
        completed_at = CASE WHEN ? THEN unixepoch() ELSE NULL END
       WHERE id = ?`,
    )
    .run(
      newDay,
      newStreak,
      longestStreak,
      programCompleted ? 'completed' : 'active',
      programCompleted ? 1 : 0,
      enrollmentId,
    );

  const xpGained = dayMission.mission.xpReward ?? 100;
  rawSqlite
    .prepare(
      `INSERT INTO user_xp (user_id, xp, level, streak, updated_at)
       VALUES (?, ?, 1, 0, unixepoch())
       ON CONFLICT(user_id) DO UPDATE SET
         xp = xp + ?,
         level = CASE
           WHEN xp + ? < 500   THEN 1
           WHEN xp + ? < 1500  THEN 2
           WHEN xp + ? < 3500  THEN 3
           WHEN xp + ? < 7500  THEN 4
           WHEN xp + ? < 15000 THEN 5
           ELSE 6
         END,
         updated_at = unixepoch()`,
    )
    .run(userId, xpGained, xpGained, xpGained, xpGained, xpGained, xpGained, xpGained);

  if (programCompleted) {
    generateUserBook(userId, enrollmentId, enrollment).catch((err) =>
      console.error('[book-gen] Error:', err),
    );
  } else {
    const program = rawSqlite
      .prepare('SELECT * FROM mission_programs WHERE id = ?')
      .get(enrollment.program_id) as any;
    const settings = enrollment.settings ? JSON.parse(enrollment.settings) : {};
    if (program) {
      generateProgramDays(
        enrollmentId,
        userId,
        program,
        settings,
        newDay,
        Math.min(newDay + 6, enrollment.duration_days),
      ).catch(() => {});
    }
  }

  const proofLang = proof.language ?? 'en';
  return {
    success: true,
    maraJournalPage: journalData.journalPage,
    maraFeedback: journalData.maraFeedback,
    xpGained,
    newDay,
    programCompleted,
    streakMessage: getStreakMessage(newStreak, proofLang),
    message: programCompleted
      ? `🎉 Program "${enrollment.program_name}" completed!`
      : `+${xpGained} XP · Day ${enrollment.current_day} done!`,
  };
}

// ─── GENERATOR JURNAL ─────────────────────────────────────────────────────────

async function generateJournalPage(
  userId: string,
  dayMission: any,
  proof: any,
  enrollment: any,
): Promise<{
  journalPage: string;
  maraFeedback: string;
  detectedMood?: string;
  tags: string[];
}> {
  const personality = rawSqlite
    .prepare('SELECT * FROM user_personality WHERE user_id = ?')
    .get(userId) as any;

  const lang = (proof.language ?? 'en').split('-')[0].toLowerCase();
  const langInstruction: Record<string, string> = {
    ro: 'Scrie în română.',
    en: 'Write in English.',
    de: 'Schreibe auf Deutsch.',
    fr: 'Écris en français.',
    es: 'Escribe en español.',
    it: 'Scrivi in italiano.',
    pt: 'Escreve em português.',
    ru: 'Пиши на русском.',
    uk: 'Пиши українською.',
    nl: 'Schrijf in het Nederlands.',
    sv: 'Skriv på svenska.',
    bg: 'Пиши на български.',
    ja: '日本語で書いてください。',
    ko: '한국어로 써주세요.',
    pl: 'Napisz po polsku.',
    cs: 'Piš česky.',
    hu: 'Írj magyarul.',
    hr: 'Piši na hrvatskom.',
    sr: 'Piši na srpskom.',
    tr: 'Türkçe yaz.',
    ar: 'اكتب باللغة العربية.',
    hi: 'हिंदी में लिखें।',
    zh: '用中文写。',
    th: 'เขียนเป็นภาษาไทย',
    vi: 'Viết bằng tiếng Việt.',
    da: 'Skriv på dansk.',
    el: 'Γράψε στα ελληνικά.',
  };

  const prompt = `You are Mara — an empathetic coach and talented writer.

The user has completed day ${enrollment.current_day} of "${enrollment.program_name}".

MISSION: "${dayMission.mission?.title}"
INTENT: "${dayMission.mission?.intent ?? ''}"

WHAT THEY WROTE / CREATED:
"${proof.content ?? '[Uploaded an image or drawing]'}"

REFLECTION: "${proof.reflectionAnswer ?? 'no reflection added'}"

USER PROFILE:
- Loves: ${personality?.what_you_love ?? 'unknown'}
- Wants to change: ${personality?.want_to_change ?? 'unknown'}

Do exactly 3 things:

1. JOURNAL PAGE (150-250 words):
   Transform what they wrote into beautiful literary prose.
   Their voice, in first person.
   Title: "Day [number] — [something poetic]"
   Include emotions, insights, discoveries.

2. MARA FEEDBACK (2-3 sentences):
   Personal, empathetic, specific to what they wrote.
   Inspire for tomorrow.
   Not generic — reference something concrete from what they wrote.

3. METADATA:
   mood: a single word
   tags: exactly 3 words from the content

Respond ONLY with valid JSON (no markdown fences):
{
  "journalPage": "complete page",
  "maraFeedback": "Mara's response",
  "detectedMood": "one word",
  "tags": ["tag1", "tag2", "tag3"]
}

${langInstruction[lang] ?? `Write everything in ${lang}.`}`;

  try {
    const response = await llmGenerate(prompt, { source: 'agent.journal-generator' });
    const clean = response.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {
      journalPage: `Day ${enrollment.current_day}\n\n${proof.content ?? ''}`,
      maraFeedback: 'Well done completing this day. Every step counts on your journey.',
      detectedMood: 'neutral',
      tags: ['journal', 'mission', 'transformation'],
    };
  }
}

// ─── GENERARE CARTE ───────────────────────────────────────────────────────────

export async function generateUserBook(
  userId: string,
  enrollmentId: string,
  enrollment: any,
): Promise<void> {
  const entries = rawSqlite
    .prepare(
      `SELECT * FROM journal_entries
       WHERE user_id = ? AND program_enrollment_id = ?
       ORDER BY day_number ASC`,
    )
    .all(userId, enrollmentId) as any[];
  if (entries.length === 0) return;

  const chapters = [];
  for (let i = 0; i < entries.length; i += 7) {
    const chapterEntries = entries.slice(i, i + 7);
    const chapterNumber = Math.floor(i / 7) + 1;

    let chapterTitle = `Chapter ${chapterNumber}`;
    try {
      const titlePrompt = `Generate a short, poetic title (4-6 words) for a personal journal chapter covering days ${i + 1}-${Math.min(i + 7, entries.length)}.
Detected moods: ${chapterEntries.map((e: any) => e.mood).filter(Boolean).join(', ')}.
Reply ONLY with the title, no quotes, no extra text.`;
      chapterTitle = (
        await llmGenerate(titlePrompt, { source: 'agent.book-chapter-title' })
      ).trim();
    } catch {}

    chapters.push({
      number: chapterNumber,
      title: chapterTitle,
      dayRange: `Days ${i + 1}-${Math.min(i + 7, entries.length)}`,
      entries: chapterEntries.map((e: any) => ({
        day: e.day_number,
        page: e.mara_page,
        mood: e.mood,
        tags: e.tags,
      })),
    });
  }

  let bookTitle = `My Story — ${enrollment.program_name}`;
  let bookSubtitle = `A ${enrollment.duration_days}-day journey`;
  try {
    const bookTitlePrompt = `Generate an inspiring title for a book about the personal transformation of someone who completed the program "${enrollment.program_name}" in ${enrollment.duration_days} days.
Reply with JSON only: {"title": "...", "subtitle": "..."}`;
    const r = await llmGenerate(bookTitlePrompt, { source: 'agent.book-title' });
    const parsed = JSON.parse(r.replace(/```json|```/g, '').trim());
    bookTitle = parsed.title ?? bookTitle;
    bookSubtitle = parsed.subtitle ?? bookSubtitle;
  } catch {}

  const bookId = crypto.randomUUID();
  rawSqlite
    .prepare(
      `INSERT OR REPLACE INTO user_books
        (id, user_id, program_enrollment_id, title, subtitle,
         chapters, total_pages, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', unixepoch(), unixepoch())`,
    )
    .run(bookId, userId, enrollmentId, bookTitle, bookSubtitle, JSON.stringify(chapters), entries.length);

  console.log(`[book-gen] ✅ "${bookTitle}" — ${entries.length} pagini`);
}
