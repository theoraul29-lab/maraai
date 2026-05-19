import type { Express } from 'express';
import { rawSqlite } from '../db.js';
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
} from './engine.js';

function getUserId(req: any): string {
  return req.user?.uid;
}

export function registerMissionRoutes(app: Express, requireAuth: any) {
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

  app.get('/api/missions', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const { pillar } = req.query as { pillar?: string };
    const pillarClause = pillar ? `AND m.pillar = '${pillar.replace(/'/g, "''")}'` : '';
    const missions = rawSqlite.prepare(`
      SELECT m.*, um.status as user_status, um.progress as user_progress,
        um.mara_feedback, um.id as user_mission_id
      FROM missions m
      LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
      WHERE m.is_active = 1 AND m.is_daily = 0 ${pillarClause}
      ORDER BY m.xp_reward ASC
    `).all(userId);
    res.json({ missions, userXp: getUserXP(userId) });
  });

  app.get('/api/missions/daily', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const today = new Date().toISOString().split('T')[0];
    const dailies = rawSqlite.prepare(`
      SELECT m.*, um.status as user_status, um.id as user_mission_id
      FROM missions m
      LEFT JOIN user_missions um
        ON m.id = um.mission_id
        AND um.user_id = ?
        AND date(um.started_at, 'unixepoch') = ?
      WHERE m.is_daily = 1 AND m.is_active = 1
    `).all(userId, today);
    res.json({ missions: dailies });
  });

  app.get('/api/missions/suggest', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const mission = suggestMission(userId);
    res.json({ mission });
  });

  app.post('/api/missions/generate', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const mission = await generatePersonalizedMission(userId);
    if (!mission) return res.status(503).json({ message: 'AI indisponibil momentan.' });
    res.json({ mission });
  });

  app.post('/api/missions/:id/start', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const result = await startMission(userId, req.params.id);
    res.json(result);
  });

  app.post('/api/missions/:id/proof', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const result = await submitProof(userId, req.params.id, req.body);
    res.json(result);
  });

  app.post('/api/missions/share', requireAuth, async (req: any, res: any) => {
    const userId = getUserId(req);
    const { userMissionId, platform, caption } = req.body as {
      userMissionId: string; platform: string; caption?: string;
    };
    if (!userMissionId || !platform) {
      return res.status(400).json({ message: 'userMissionId și platform sunt obligatorii.' });
    }
    const result = await shareMission(userId, userMissionId, platform, caption);
    res.json(result);
  });

  app.get('/api/missions/community', (_req: any, res: any) => {
    const feed = getCommunityFeed(20);
    res.json({ feed });
  });

  app.get('/api/missions/stats', requireAuth, (req: any, res: any) => {
    const userId = getUserId(req);
    const xp = getUserXP(userId);
    const row = rawSqlite.prepare(
      "SELECT COUNT(*) as cnt FROM user_missions WHERE user_id = ? AND status = 'completed'"
    ).get(userId) as { cnt: number } | undefined;
    const completed = row?.cnt ?? 0;
    const byPillar = rawSqlite.prepare(`
      SELECT m.pillar, COUNT(*) as cnt
      FROM user_missions um JOIN missions m ON m.id = um.mission_id
      WHERE um.user_id = ? AND um.status = 'completed'
      GROUP BY m.pillar
    `).all(userId);
    res.json({ xp, completed, byPillar });
  });

  console.log('[missions] ✅ Routes registered');
}
