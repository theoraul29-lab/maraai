import type { Express } from 'express';
import { rawSqlite } from '../db.js';
import { missionWriteRateLimit, publicReadRateLimit } from '../rate-limit.js';
import {
  startMission,
  submitProof,
  suggestMission,
  generatePersonalizedMission,
  shareMission,
  getCommunityFeed,
  getUserXP,
  getPersonality,
  saveOnboarding,
  translateMissions,
} from './engine.js';
import {
  enrollUserInProgram,
  getDayMission,
  completeProgramDay,
} from './program-engine.js';

const SUPPORTED_LANGS = new Set([
  'en','ro','de','fr','es','it','pt','ru','uk','nl','sv','bg','ja','ko',
  'pl','cs','hu','hr','sr','tr','ar','hi','zh','th','vi','da','el',
]);

const ALLOWED_SHARE_PLATFORMS = new Set([
  'hellomara','you','instagram','tiktok','x','whatsapp','telegram','link',
]);

function getUserId(req: any): string {
  return req.user?.uid;
}

export function registerMissionRoutes(app: Express, requireAuth: any) {
  // ── ONBOARDING ──────────────────────────────────────────────────────────────

  app.get('/api/missions/onboarding', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const personality = getPersonality(userId);
    res.json({ done: !!(personality?.onboarding_done), personality: personality ?? null });
  });

  app.post('/api/missions/onboarding', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    saveOnboarding(userId, req.body);
    res.json({ success: true });
  });

  // ── MISIUNI ─────────────────────────────────────────────────────────────────

  // Helper: read the user's stored language preference from user_preferences.
  // Used as a fallback when the frontend doesn't send a ?lang= query param.
  function getUserLang(userId: string, queryLang?: string): string {
    const raw = queryLang ?? (() => {
      try {
        const prefs = rawSqlite.prepare(
          "SELECT language FROM user_preferences WHERE user_id = ? LIMIT 1"
        ).get(userId) as { language: string } | undefined;
        return prefs?.language;
      } catch { return undefined; }
    })();
    if (!raw) return 'en';
    const normalized = raw.split('-')[0].toLowerCase();
    return SUPPORTED_LANGS.has(normalized) ? normalized : 'en';
  }

  app.get('/api/missions', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const { pillar, lang: rawLang } = req.query as { pillar?: string; lang?: string };
    const lang = getUserLang(userId, rawLang);
    const missions = pillar
      ? rawSqlite
          .prepare(
            `SELECT m.*, um.status as user_status, um.progress as user_progress,
              um.mara_feedback, um.id as user_mission_id
             FROM missions m
             LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
             WHERE m.is_active = 1 AND m.is_daily = 0 AND m.pillar = ?
             ORDER BY m.xp_reward ASC`,
          )
          .all(userId, pillar)
      : rawSqlite
          .prepare(
            `SELECT m.*, um.status as user_status, um.progress as user_progress,
              um.mara_feedback, um.id as user_mission_id
             FROM missions m
             LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
             WHERE m.is_active = 1 AND m.is_daily = 0
             ORDER BY m.xp_reward ASC`,
          )
          .all(userId);

    // Sequential unlock: mission N is locked until mission N-1 is completed.
    const withLocked = (missions as any[]).map((m, i) => ({
      ...m,
      locked: i > 0 && (missions as any[])[i - 1].user_status !== 'completed',
    }));

    const translated = await translateMissions(withLocked, lang);
    res.json({ missions: translated, userXp: getUserXP(userId) });
  });

  app.get('/api/missions/daily', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const { lang: rawLang } = req.query as { lang?: string };
    const lang = getUserLang(userId, rawLang);
    const today = new Date().toISOString().split('T')[0];
    const dailies = rawSqlite
      .prepare(
        `SELECT m.*, um.status as user_status, um.id as user_mission_id
         FROM missions m
         LEFT JOIN user_missions um
           ON m.id = um.mission_id AND um.user_id = ?
           AND date(um.started_at, 'unixepoch') = ?
         WHERE m.is_daily = 1 AND m.is_active = 1`,
      )
      .all(userId, today);
    const translated = await translateMissions(dailies as any[], lang);
    res.json({ missions: translated });
  });

  app.get('/api/missions/suggest', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const mission = suggestMission(userId);
    res.json({ mission });
  });

  app.post('/api/missions/generate', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const { lang } = req.body as { lang?: string };
    const mission = await generatePersonalizedMission(userId, lang);
    if (!mission) return res.status(503).json({ message: 'AI unavailable.' });
    res.json({ mission });
  });

  app.post('/api/missions/:id/start', requireAuth, missionWriteRateLimit, async (req: any, res: any) => {
    const userId = getUserId(req);
    const result = await startMission(userId, req.params.id);
    res.json(result);
  });

  app.post('/api/missions/:id/proof', requireAuth, missionWriteRateLimit, async (req: any, res: any) => {
    const userId = getUserId(req);
    const { lang: rawLang, ...proof } = req.body as { lang?: string; [key: string]: unknown };
    // Validate lang from body the same way we validate query params
    const lang = rawLang ? getUserLang(userId, rawLang) : getUserLang(userId, undefined);
    const result = await submitProof(userId, req.params.id, proof as any, lang);
    res.json(result);
  });

  app.post('/api/missions/share', requireAuth, missionWriteRateLimit, async (req: any, res: any) => {
    const userId = getUserId(req);
    const { userMissionId, platform, caption } = req.body as {
      userMissionId: string;
      platform: string;
      caption?: string;
    };
    if (!userMissionId || !platform) {
      return res.status(400).json({ message: 'userMissionId and platform are required.' });
    }
    if (!ALLOWED_SHARE_PLATFORMS.has(platform)) {
      return res.status(400).json({ message: `Invalid platform. Allowed: ${[...ALLOWED_SHARE_PLATFORMS].join(', ')}` });
    }
    const result = await shareMission(userId, userMissionId, platform, caption);
    res.json(result);
  });

  app.get('/api/missions/community', publicReadRateLimit, (_req: any, res: any) => {
    const feed = getCommunityFeed(20);
    res.json({ feed });
  });

  app.get('/api/missions/stats', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const xp = getUserXP(userId);
    const row = rawSqlite
      .prepare("SELECT COUNT(*) as cnt FROM user_missions WHERE user_id = ? AND status = 'completed'")
      .get(userId) as { cnt: number } | undefined;
    const completed = row?.cnt ?? 0;
    const byPillar = rawSqlite
      .prepare(
        `SELECT m.pillar, COUNT(*) as cnt
         FROM user_missions um JOIN missions m ON m.id = um.mission_id
         WHERE um.user_id = ? AND um.status = 'completed'
         GROUP BY m.pillar`,
      )
      .all(userId);
    res.json({ xp, completed, byPillar });
  });

  app.get('/api/missions/leaderboard', publicReadRateLimit, (_req: any, res: any) => {
    const rows = rawSqlite
      .prepare(
        `SELECT ux.user_id, ux.xp, ux.level, ux.streak,
                COALESCE(u.display_name, u.first_name, u.name, 'Anonymous') as display_name,
                u.profile_image_url
         FROM user_xp ux
         LEFT JOIN users u ON u.id = ux.user_id
         ORDER BY ux.xp DESC
         LIMIT 20`,
      )
      .all() as Array<{
        user_id: string; xp: number; level: number; streak: number;
        display_name: string; profile_image_url: string | null;
      }>;
    const completed_counts = rawSqlite
      .prepare(
        `SELECT user_id, COUNT(*) as cnt FROM user_missions
         WHERE status = 'completed' GROUP BY user_id`,
      )
      .all() as Array<{ user_id: string; cnt: number }>;
    const countMap = new Map(completed_counts.map(r => [r.user_id, r.cnt]));
    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      displayName: r.display_name,
      profileImageUrl: r.profile_image_url,
      xp: r.xp,
      level: r.level,
      streak: r.streak,
      missionsCompleted: countMap.get(r.user_id) ?? 0,
    }));
    res.json({ leaderboard });
  });

  app.post('/api/missions/feedback', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const { missionId, rating, note } = req.body;
    if (!missionId || ![-1, 1].includes(rating)) {
      return res.status(400).json({ message: 'missionId and rating are required.' });
    }
    rawSqlite
      .prepare(
        `INSERT INTO mission_feedback (id, user_id, mission_id, rating, note)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, mission_id) DO UPDATE SET rating = excluded.rating, note = excluded.note`,
      )
      .run(crypto.randomUUID(), userId, missionId, rating, note ?? null);
    res.json({ success: true });
  });

  // ── PROGRAME ────────────────────────────────────────────────────────────────

  app.get('/api/programs', publicReadRateLimit, (_req: any, res: any) => {
    const programs = rawSqlite
      .prepare('SELECT * FROM mission_programs WHERE is_active = 1 ORDER BY sort_order ASC')
      .all();
    res.json({ programs });
  });

  app.get('/api/programs/my/enrollments', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const enrollments = rawSqlite
      .prepare(
        `SELECT e.*, p.name as program_name, p.slug, p.duration_days,
                p.tagline, p.difficulty, p.price_cents
         FROM user_program_enrollments e
         JOIN mission_programs p ON p.id = e.program_id
         WHERE e.user_id = ?
         ORDER BY e.started_at DESC`,
      )
      .all(userId);
    res.json({ enrollments });
  });

  app.get('/api/programs/:slug', publicReadRateLimit, (req: any, res: any) => {
    const program = rawSqlite
      .prepare('SELECT * FROM mission_programs WHERE slug = ? AND is_active = 1')
      .get(req.params.slug);
    if (!program) return res.status(404).json({ message: 'Program not found.' });
    res.json({ program });
  });

  app.post('/api/programs/:slug/enroll', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    // Validate and normalize the language in enrollment settings so it
    // propagates correctly through generateDayMission and generateJournalPage.
    const body = { ...req.body };
    if (body.language) {
      body.language = getUserLang(userId, body.language);
    } else {
      body.language = getUserLang(userId, undefined);
    }
    const result = await enrollUserInProgram(userId, req.params.slug, body);
    res.json(result);
  });

  app.get(
    '/api/programs/enrollment/:enrollmentId/today',
    requireAuth,
    async (req: any, res: any) => {
      const userId = getUserId(req);
      const { lang } = req.query as { lang?: string };
      const dayMission = await getDayMission(userId, req.params.enrollmentId, lang);
      if (!dayMission) {
        return res.status(404).json({ message: 'Enrollment not found or inactive.' });
      }
      res.json(dayMission);
    },
  );

  app.post(
    '/api/programs/enrollment/:enrollmentId/complete',
    requireAuth,
    async (req: any, res: any) => {
      const userId = getUserId(req);
      // Normalize proof.language before it reaches completeProgramDay so
      // invalid/missing lang codes never propagate to LLM prompts or DB.
      const body = { ...req.body };
      if (body.language) body.language = getUserLang(userId, body.language);
      const result = await completeProgramDay(userId, req.params.enrollmentId, body);
      res.json(result);
    },
  );

  // ── JURNAL ──────────────────────────────────────────────────────────────────

  app.get('/api/journal', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);
    const enrollmentId = req.query.enrollmentId as string | undefined;

    const entries = enrollmentId
      ? rawSqlite
          .prepare(
            `SELECT je.*, mp.name as program_name
             FROM journal_entries je
             LEFT JOIN user_program_enrollments upe ON upe.id = je.program_enrollment_id
             LEFT JOIN mission_programs mp ON mp.id = upe.program_id
             WHERE je.user_id = ? AND je.program_enrollment_id = ?
             ORDER BY je.created_at DESC LIMIT ? OFFSET ?`,
          )
          .all(userId, enrollmentId, limit, offset)
      : rawSqlite
          .prepare(
            `SELECT je.*, mp.name as program_name
             FROM journal_entries je
             LEFT JOIN user_program_enrollments upe ON upe.id = je.program_enrollment_id
             LEFT JOIN mission_programs mp ON mp.id = upe.program_id
             WHERE je.user_id = ?
             ORDER BY je.created_at DESC LIMIT ? OFFSET ?`,
          )
          .all(userId, limit, offset);

    const total = (
      rawSqlite
        .prepare('SELECT COUNT(*) as cnt FROM journal_entries WHERE user_id = ?')
        .get(userId) as { cnt: number }
    ).cnt;

    res.json({ entries, total });
  });

  app.get('/api/journal/community', publicReadRateLimit, (_req: any, res: any) => {
    const entries = rawSqlite
      .prepare(
        `SELECT je.mara_page, je.mood, je.day_number, je.created_at, je.tags,
                mp.name as program_name, u.display_name
         FROM journal_entries je
         JOIN users u ON u.id = je.user_id
         LEFT JOIN user_program_enrollments upe ON upe.id = je.program_enrollment_id
         LEFT JOIN mission_programs mp ON mp.id = upe.program_id
         WHERE je.visibility IN ('community','public')
         ORDER BY je.created_at DESC LIMIT 30`,
      )
      .all();
    res.json({ entries });
  });

  app.get('/api/journal/:id', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const entry = rawSqlite
      .prepare('SELECT * FROM journal_entries WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);
    if (!entry) return res.status(404).json({ message: 'Entry not found.' });
    res.json({ entry });
  });

  app.patch('/api/journal/:id/visibility', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const { visibility } = req.body;
    if (!['private', 'community', 'public'].includes(visibility)) {
      return res.status(400).json({ message: 'Visibility invalid.' });
    }
    rawSqlite
      .prepare(
        "UPDATE journal_entries SET visibility = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?",
      )
      .run(visibility, req.params.id, userId);
    res.json({ success: true });
  });

  // ── CARTE ───────────────────────────────────────────────────────────────────

  app.get('/api/books/my', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const books = rawSqlite
      .prepare(
        `SELECT b.*, p.name as program_name
         FROM user_books b
         LEFT JOIN user_program_enrollments e ON e.id = b.program_enrollment_id
         LEFT JOIN mission_programs p ON p.id = e.program_id
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC`,
      )
      .all(userId);
    res.json({ books });
  });

  app.get('/api/books/:id', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const book = rawSqlite
      .prepare('SELECT * FROM user_books WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);
    if (!book) return res.status(404).json({ message: 'Book not found.' });
    res.json({ book });
  });

  console.log('[missions] ✅ Routes registered (v4)');
}
