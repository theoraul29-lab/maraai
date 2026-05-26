import { rawSqlite } from '../db.js';
import { llmGenerate, isLLMConfigured } from '../llm.js';
import { PROGRAM_CATALOGUE } from '../billing/plans.js';

// ─── PROGRAM ACCESS ───────────────────────────────────────────────────────────

/**
 * Check if a user can access a specific day of a program.
 * - new_mindset: always free (1 day)
 * - new_habit: days 1-10 free, 11-21 require purchase
 * - all others: require purchase for any day
 */
export function hasAccessToDay(userId: string, programSlug: string, day: number): boolean {
  const programId = slugToProgramId(programSlug);
  const def = PROGRAM_CATALOGUE.find((p) => p.id === programId);
  if (!def) return false;
  if (def.priceCents === 0) return true; // fully free
  if (day <= def.freeDays) return true;  // within free tier
  // Check purchase
  const purchase = rawSqlite
    .prepare(
      "SELECT id FROM program_purchases WHERE user_id = ? AND program_id = ? AND status = 'completed' LIMIT 1",
    )
    .get(userId, programId) as { id: string } | undefined;
  return !!purchase;
}

export function hasPurchasedProgram(userId: string, programId: string): boolean {
  const purchase = rawSqlite
    .prepare(
      "SELECT id FROM program_purchases WHERE user_id = ? AND program_id = ? AND status = 'completed' LIMIT 1",
    )
    .get(userId, programId) as { id: string } | undefined;
  return !!purchase;
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
  if (!program) return { success: false, message: 'Programul nu există.' };

  const existing = rawSqlite
    .prepare(
      "SELECT id FROM user_program_enrollments WHERE user_id = ? AND program_id = ? AND status = 'active' LIMIT 1",
    )
    .get(userId, program.id) as any;
  if (existing) return { success: false, message: 'Ești deja înrolat în acest program.' };

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
        language: settings.language ?? 'ro',
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
    beginning: 'Misiuni ușoare care construiesc momentum. Userul e la început.',
    middle: 'Misiuni medii. Userul simte schimbarea și e pregătit pentru mai mult.',
    deep: 'Misiuni profunde și transformatoare. Userul e pregătit pentru profunzime.',
  }[phase];

  const prompt = `Ești Mara — coach de viață empatic.
Generează misiunea pentru ziua ${day} din ${totalDays} din programul "${program.name}".

Program: ${program.tagline}
Faza: ${phaseContext}
Piloni focus: ${program.pillar_focus}

User:
- Îi place: ${personality?.what_you_love ?? 'necunoscut'}
- Vrea să schimbe: ${personality?.want_to_change ?? 'necunoscut'}
- Scop specific: ${settings?.habitDescription ?? 'transformare personală'}

IMPORTANT:
- Proof prin: fotografie SAU desen SAU text SAU combinație
- Misiunea să fie concretă și realizabilă în 5-30 minute
- Jurnalul Marei transformă dovada în pagină literară frumoasă
- Limbă: ${settings?.language ?? 'ro'}

Răspunde DOAR JSON valid:
{
  "title": "titlu scurt și inspirant",
  "description": "2-3 propoziții personalizate",
  "proofPrompt": "ce să facă/fotografieze/deseneze",
  "intent": "cum transformă Mara în pagină de jurnal",
  "reflection": "întrebare profundă de reflecție",
  "proofType": "text|photo|any|drawing"
}`;

  const response = await llmGenerate(prompt, { source: 'agent.program-generator' });
  const clean = response.replace(/```json|```/g, '').trim();
  const gen = JSON.parse(clean);

  return {
    customTitle: gen.title,
    customDescription: gen.description,
    customProofPrompt: gen.proofPrompt,
    intent: gen.intent,
    isAiGenerated: true,
  };
}

// ─── MISIUNEA ZILEI ───────────────────────────────────────────────────────────

export async function getDayMission(
  userId: string,
  enrollmentId: string,
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

    void personality; void seedMissions;
  }

  return {
    enrollment,
    currentDay,
    totalDays: enrollment.duration_days,
    percentComplete: Math.round((currentDay / enrollment.duration_days) * 100),
    isCompleted: !!todayCompleted,
    streakMessage: getStreakMessage(enrollment.streak),
    mission: dayMission
      ? {
          id: dayMission.mission_id ?? dayMission.id,
          title: dayMission.custom_title ?? dayMission.title,
          description: dayMission.custom_description ?? dayMission.description,
          proofPrompt: dayMission.custom_proof_prompt ?? dayMission.proof_prompt,
          intent: dayMission.intent,
          pillar: dayMission.pillar,
          difficulty: dayMission.difficulty,
          xpReward: dayMission.xp_reward ?? 100,
          proofType: dayMission.proof_type ?? 'text',
          steps: dayMission.steps ? JSON.parse(dayMission.steps) : [],
          reflection: dayMission.reflection,
          isAiGenerated: !!dayMission.is_ai_generated,
        }
      : null,
  };
}

function getStreakMessage(streak: number): string {
  if (streak === 0) return '';
  if (streak === 1) return '🔥 Prima zi — ai început!';
  if (streak === 7) return '🔥🔥 7 zile — o săptămână completă!';
  if (streak === 14) return '🔥🔥🔥 14 zile — două săptămâni!';
  if (streak === 21) return '💎 21 de zile — habitoul e al tău!';
  if (streak === 30) return '👑 30 de zile — un maestru al obiceiului!';
  return `🔥 ${streak} zile consecutive — nu te opri!`;
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
  if (!enrollment) return { success: false, message: 'Enrollment negăsit.' };

  const alreadyDone = rawSqlite
    .prepare(
      `SELECT id FROM journal_entries
       WHERE user_id = ? AND program_enrollment_id = ?
         AND day_number = ? AND date(created_at, 'unixepoch') = date('now')
       LIMIT 1`,
    )
    .get(userId, enrollmentId, enrollment.current_day);
  if (alreadyDone) return { success: false, message: 'Ai completat deja misiunea de azi!' };

  const dayMission = await getDayMission(userId, enrollmentId);
  if (!dayMission?.mission) return { success: false, message: 'Misiunea zilei negăsită.' };

  const journalData = await generateJournalPage(userId, dayMission, proof, enrollment);

  const journalId = crypto.randomUUID();
  const MILESTONES = [7, 14, 21, 30, 60, 90, 180, 365];
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
       ON CONFLICT(user_id) DO UPDATE SET xp = xp + ?, updated_at = unixepoch()`,
    )
    .run(userId, xpGained, xpGained);

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

  return {
    success: true,
    maraJournalPage: journalData.journalPage,
    maraFeedback: journalData.maraFeedback,
    xpGained,
    newDay,
    programCompleted,
    streakMessage: getStreakMessage(newStreak),
    message: programCompleted
      ? `🎉 Ai completat programul "${enrollment.program_name}"!`
      : `+${xpGained} XP · Ziua ${enrollment.current_day} completată!`,
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

  const lang = proof.language ?? 'ro';
  const langInstruction: Record<string, string> = {
    ro: 'Scrie în română.',
    en: 'Write in English.',
    de: 'Schreibe auf Deutsch.',
    fr: 'Écris en français.',
    es: 'Escribe en español.',
  };

  const prompt = `Ești Mara — coach empatic și scriitor talentat.

Userul a completat ziua ${enrollment.current_day} din "${enrollment.program_name}".

MISIUNEA: "${dayMission.mission?.title}"
INTENȚIA: "${dayMission.mission?.intent ?? ''}"

CE A SCRIS/CREAT:
"${proof.content ?? '[A uploadat o imagine sau un desen]'}"

REFLECȚIE: "${proof.reflectionAnswer ?? 'nicio reflecție adăugată'}"

PROFIL USER:
- Îi place: ${personality?.what_you_love ?? 'necunoscut'}
- Vrea să schimbe: ${personality?.want_to_change ?? 'necunoscut'}

Fă exact 3 lucruri:

1. PAGINA DE JURNAL (150-250 cuvinte):
   Transformă ce a scris în proză literară frumoasă.
   Vocea lui, la persoana I.
   Titlu: "Ziua [număr] — [ceva poetic]"
   Include emoțiile, insight-urile, descoperirile.

2. FEEDBACK MARA (2-3 propoziții):
   Personal, empatic, specific la ce a scris.
   Inspiră pentru ziua de mâine.
   Nu generic — referă-te la ceva concret din ce a scris.

3. METADATA:
   mood: un singur cuvânt
   tags: exact 3 cuvinte din conținut

Răspunde DOAR JSON valid:
{
  "journalPage": "pagina completă",
  "maraFeedback": "răspunsul Marei",
  "detectedMood": "un cuvânt",
  "tags": ["tag1", "tag2", "tag3"]
}

${langInstruction[lang] ?? `Write in ${lang}.`}`;

  try {
    const response = await llmGenerate(prompt, { source: 'agent.journal-generator' });
    const clean = response.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {
      journalPage: `Ziua ${enrollment.current_day}\n\n${proof.content ?? ''}`,
      maraFeedback:
        'Bravo că ai completat această zi. Fiecare pas contează în călătoria ta.',
      detectedMood: 'neutru',
      tags: ['jurnal', 'misiune', 'transformare'],
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

    let chapterTitle = `Capitolul ${chapterNumber}`;
    try {
      const titlePrompt = `Generează un titlu poetic și scurt (4-6 cuvinte)
pentru un capitol de jurnal personal care acoperă zilele ${i + 1}-${Math.min(i + 7, entries.length)}.
Mood-urile detectate: ${chapterEntries.map((e: any) => e.mood).filter(Boolean).join(', ')}.
Răspunde DOAR cu titlul, fără ghilimele.`;
      chapterTitle = (
        await llmGenerate(titlePrompt, { source: 'agent.book-chapter-title' })
      ).trim();
    } catch {}

    chapters.push({
      number: chapterNumber,
      title: chapterTitle,
      dayRange: `Zilele ${i + 1}-${Math.min(i + 7, entries.length)}`,
      entries: chapterEntries.map((e: any) => ({
        day: e.day_number,
        page: e.mara_page,
        mood: e.mood,
        tags: e.tags,
      })),
    });
  }

  let bookTitle = `Povestea mea — ${enrollment.program_name}`;
  let bookSubtitle = `O călătorie de ${enrollment.duration_days} zile`;
  try {
    const bookTitlePrompt = `Generează un titlu inspirant pentru o carte despre transformarea personală
a unui om care a completat programul "${enrollment.program_name}" în ${enrollment.duration_days} zile.
Răspunde cu JSON: {"title": "...", "subtitle": "..."}`;
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
