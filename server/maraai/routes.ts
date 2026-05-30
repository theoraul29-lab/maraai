// HTTP surface for the MaraAI hybrid platform layer.
//
// All endpoints live under /api/maraai/* except `/api/consent` and
// `/api/mode` which match the spec's public contract.

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '../../shared/schema.js';
import { setSessionUser } from '../modules/auth-api.js';
import {
  getConsent,
  updateConsent,
  isMaraMode,
  type ConsentUpdate,
} from './consent.js';
import { getActivityFeed, getTransparencyStatus } from './transparency.js';
import {
  activateKillSwitch,
  deleteNode,
  heartbeat,
  listMyNodes,
  listOnlineNodes,
  registerNode,
} from './p2p.js';
import {
  createTask,
  ensureExampleTasks,
  getAdminStats,
  getNextTask,
  submitTaskResult,
} from './p2p-tasks.js';
import { route as routeAi } from './ai-router.js';
import { eventBusStatus, KAFKA_TOPICS } from './kafka.js';
import { requestOtp, verifyOtp } from './otp.js';
import { logActivity } from './activity.js';
import { otpRateLimit, p2pHeartbeatRateLimit } from '../rate-limit.js';
import {
  awardCredits,
  CREDIT_REASONS,
  getBalance,
  getHistory,
} from './credits.js';
import {
  getOrCreateReferralCode,
  applyReferralCode,
  getTopReferrers,
} from './viral-loop.js';
import { getGrowthGateStatus, isViralLoopActive, isGrowthDashboardActive } from './growth-gate.js';
import { rawSqlite } from '../db.js';
import { costGuard, isOllamaForcedFallback, setOllamaForcedFallback } from '../middleware/costGuard.js';

type AuthedReq = Request & { user?: { uid: string } };

const consentPatchSchema = z
  .object({
    mode: z.enum(['centralized', 'hybrid', 'advanced']).optional(),
    p2pEnabled: z.boolean().optional(),
    bandwidthShareGbMonth: z.number().int().min(0).max(1024).optional(),
    backgroundNode: z.boolean().optional(),
    advancedAiRouting: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    killSwitch: z.boolean().optional(),
    acceptTerms: z.boolean().optional(),
    /**
     * Optional hint to the credits system. The desktop onboarding modal
     * sends 'desktop' (default), the future mobile client sends 'mobile'.
     */
    deviceKind: z.enum(['desktop', 'mobile']).optional(),
  })
  .strict();

const modeSchema = z
  .object({ mode: z.enum(['centralized', 'hybrid', 'advanced']) })
  .strict();

const otpRequestSchema = z
  .object({
    email: z.string().email(),
    purpose: z.enum(['register', 'login', 'reset']).optional(),
  })
  .strict();

const otpVerifySchema = z
  .object({ email: z.string().email(), code: z.string().min(4).max(10) })
  .strict();

const nodeRegisterSchema = z
  .object({ deviceLabel: z.string().max(100).optional(), nodeId: z.string().max(100).optional() })
  .strict();

const heartbeatSchema = z
  .object({
    nodeId: z.string().min(3).max(100),
    uptimeSec: z.number().int().min(0).optional(),
    bytesIn: z.number().int().min(0).optional(),
    bytesOut: z.number().int().min(0).optional(),
    successCount: z.number().int().min(0).max(1000).optional(),
    failureCount: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

const aiSchema = z
  .object({
    message: z.string().min(1).max(8000),
    module: z.string().max(64).optional(),
    history: z
      .array(z.object({ role: z.string().max(32), content: z.string().max(8000) }))
      .max(50)
      .optional(),
    language: z.string().max(16).optional(),
    personality: z.string().max(32).optional(),
  })
  .strict();

export function registerMaraAIRoutes(
  app: Express,
  requireAuth: (req: any, res: any, next: any) => void,
) {
  // --- Consent / mode ---
  app.get('/api/consent', requireAuth, async (req: AuthedReq, res: Response) => {
    const userId = req.user!.uid;
    const consent = await getConsent(userId);
    res.json({ consent });
  });

  app.post('/api/consent', requireAuth, async (req: AuthedReq, res: Response) => {
    const parsed = consentPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid consent patch.', errors: parsed.error.flatten() });
    const consent = await updateConsent(req.user!.uid, parsed.data as ConsentUpdate);
    res.json({ consent });
  });

  app.get('/api/mode', requireAuth, async (req: AuthedReq, res: Response) => {
    const consent = await getConsent(req.user!.uid);
    res.json({ mode: consent.mode });
  });

  app.post('/api/mode', requireAuth, async (req: AuthedReq, res: Response) => {
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid mode.', errors: parsed.error.flatten() });
    if (!isMaraMode(parsed.data.mode)) return res.status(400).json({ message: 'Invalid mode.' });
    const consent = await updateConsent(req.user!.uid, { mode: parsed.data.mode });
    await logActivity(req.user!.uid, 'mode.changed', { mode: parsed.data.mode });
    res.json({ consent });
  });

  // --- Transparency dashboard ---
  app.get('/api/transparency/status', requireAuth, async (req: AuthedReq, res: Response) => {
    const status = await getTransparencyStatus(req.user!.uid);
    res.json(status);
  });

  app.get('/api/transparency/activity', requireAuth, async (req: AuthedReq, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? '100'), 10) || 100;
    const sinceMs = req.query.since ? Number.parseInt(String(req.query.since), 10) : undefined;
    const activity = await getActivityFeed(req.user!.uid, limit, sinceMs);
    res.json({ activity });
  });

  // --- P2P ---
  app.get('/api/p2p/nodes', requireAuth, async (req: AuthedReq, res: Response) => {
    const nodes = await listMyNodes(req.user!.uid);
    res.json({ nodes });
  });

  app.post('/api/p2p/register', requireAuth, async (req: AuthedReq, res: Response) => {
    const parsed = nodeRegisterSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid registration.', errors: parsed.error.flatten() });
    try {
      const node = await registerNode({
        userId: req.user!.uid,
        deviceLabel: parsed.data.deviceLabel ?? null,
        nodeId: parsed.data.nodeId ?? null,
      });
      res.json({ node });
    } catch (err: any) {
      const code = err?.code ?? 'ERR';
      const status = code === 'NO_CONSENT' || code === 'KILL_SWITCH' || code === 'CENTRALIZED_MODE' ? 403 : 500;
      res.status(status).json({ message: err?.message ?? 'P2P register failed.', code });
    }
  });

  app.post('/api/p2p/heartbeat', requireAuth, p2pHeartbeatRateLimit, async (req: AuthedReq, res: Response) => {
    const parsed = heartbeatSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid heartbeat.', errors: parsed.error.flatten() });
    const node = await heartbeat({ userId: req.user!.uid, ...parsed.data });
    if (!node) return res.status(404).json({ message: 'Node not found.' });
    res.json({ node });
  });

  app.delete('/api/p2p/nodes/:nodeId', requireAuth, async (req: AuthedReq, res: Response) => {
    const ok = await deleteNode(req.user!.uid, req.params.nodeId);
    if (!ok) return res.status(404).json({ message: 'Node not found.' });
    res.json({ deleted: true });
  });

  app.post('/api/p2p/kill-switch', requireAuth, async (req: AuthedReq, res: Response) => {
    await activateKillSwitch(req.user!.uid);
    const consent = await getConsent(req.user!.uid);
    res.json({ consent });
  });

  // ── Background browser compute endpoints ──────────────────────────────

  const getTaskNodeSchema = z
    .object({ nodeId: z.string().min(3).max(100) })
    .strict();

  const submitResultSchema = z
    .object({
      taskId: z.string().min(1).max(200),
      nodeId: z.string().min(3).max(100),
      result: z.record(z.any()),
    })
    .strict();

  const goOfflineSchema = z
    .object({ nodeId: z.string().min(3).max(100) })
    .strict();

  const createTaskSchema = z
    .object({
      type: z.enum(['maraAnalysis', 'missionGeneration', 'contentProcessing', 'knowledgeBase']),
      payload: z.record(z.any()).optional(),
    })
    .strict();

  /** GET /api/p2p/get-task — browser node polls for available work. */
  app.get('/api/p2p/get-task', requireAuth, async (req: AuthedReq, res: Response) => {
    const parsed = getTaskNodeSchema.safeParse({ nodeId: req.query.nodeId });
    if (!parsed.success) return res.status(400).json({ message: 'nodeId required.' });
    try {
      await ensureExampleTasks();
      const task = await getNextTask(parsed.data.nodeId, req.user!.uid);
      if (!task) return res.json({ task: null });
      res.json({ task });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? 'Failed to get task.' });
    }
  });

  /** POST /api/p2p/submit-result — browser node submits computed result + earns XP/credits. */
  app.post('/api/p2p/submit-result', requireAuth, async (req: AuthedReq, res: Response) => {
    const parsed = submitResultSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid result.', errors: parsed.error.flatten() });
    try {
      const out = await submitTaskResult({
        taskId: parsed.data.taskId,
        nodeId: parsed.data.nodeId,
        userId: req.user!.uid,
        result: parsed.data.result,
      });
      res.json(out);
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? 'Submit failed.' });
    }
  });

  /** POST /api/p2p/go-offline — browser node signals it's going offline (user returned). */
  app.post('/api/p2p/go-offline', requireAuth, async (req: AuthedReq, res: Response) => {
    const parsed = goOfflineSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'nodeId required.' });
    try {
      await heartbeat({
        userId: req.user!.uid,
        nodeId: parsed.data.nodeId,
        successCount: 0,
        failureCount: 0,
      });
      // Mark the node offline in p2p_nodes.
      const { markOffline } = await import('./p2p.js');
      await markOffline(parsed.data.nodeId);
      res.json({ offline: true });
    } catch {
      res.json({ offline: true }); // best-effort
    }
  });

  /** POST /api/p2p/tasks — admin: manually enqueue a task. */
  app.post('/api/p2p/tasks', requireAuth, async (req: AuthedReq, res: Response) => {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const caller = (await db.select().from(users).where(eq(users.id, req.user!.uid)).limit(1))[0];
    if (!caller?.email || !adminEmails.includes(caller.email.toLowerCase())) {
      return res.status(403).json({ message: 'Admin only.' });
    }
    const parsed = createTaskSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid task.', errors: parsed.error.flatten() });
    const task = await createTask({ type: parsed.data.type, payload: parsed.data.payload ?? {} });
    res.json({ task });
  });

  /** GET /api/p2p/admin/stats — admin dashboard: active nodes, tasks today, API savings. */
  app.get('/api/p2p/admin/stats', requireAuth, async (req: AuthedReq, res: Response) => {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const caller = (await db.select().from(users).where(eq(users.id, req.user!.uid)).limit(1))[0];
    if (!caller?.email || !adminEmails.includes(caller.email.toLowerCase())) {
      return res.status(403).json({ message: 'Admin only.' });
    }
    const onlineCount = listOnlineNodes().length;
    const stats = await getAdminStats(onlineCount);
    res.json({ stats });
  });

  // --- Mara Credits ---
  app.get('/api/credits/balance', requireAuth, async (req: AuthedReq, res: Response) => {
    const balance = await getBalance(req.user!.uid);
    res.json(balance);
  });

  app.get('/api/credits/history', requireAuth, async (req: AuthedReq, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? '50'), 10) || 50;
    const transactions = await getHistory(req.user!.uid, limit);
    res.json({ transactions });
  });

  // Manual award by an admin. The router-level admin guard is owned by the
  // main `server/routes.ts` `requireAdmin` middleware; we don't reach in
  // here — instead we accept an `adminUserId` from session and verify the
  // ADMIN_EMAILS / ADMIN_USER_IDS env contract inline so this module stays
  // self-contained.
  const adminAwardSchema = z
    .object({
      userId: z.string().min(1),
      delta: z.number().int().refine((v) => v !== 0, 'delta must be non-zero'),
      reason: z.string().min(1).max(64),
      idempotencyKey: z.string().max(200).optional(),
      meta: z.record(z.any()).optional(),
    })
    .strict();
  app.post('/api/credits/award', requireAuth, async (req: AuthedReq, res: Response) => {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const callerId = req.user!.uid;
    let isAdmin = adminIds.includes(callerId);
    if (!isAdmin && adminEmails.length > 0) {
      const caller = (
        await db.select().from(users).where(eq(users.id, callerId)).limit(1)
      )[0];
      if (caller?.email && adminEmails.includes(caller.email.toLowerCase())) {
        isAdmin = true;
      }
    }
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden — admin access required.' });

    const parsed = adminAwardSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return res.status(400).json({ message: 'Invalid request.', errors: parsed.error.flatten() });

    try {
      const balance = await awardCredits({
        userId: parsed.data.userId,
        delta: parsed.data.delta,
        reason: CREDIT_REASONS.ADMIN_GRANT,
        idempotencyKey: parsed.data.idempotencyKey,
        meta: { ...parsed.data.meta, awardedBy: callerId, originalReason: parsed.data.reason },
      });
      res.json({ balance });
    } catch (err: any) {
      res.status(400).json({ message: err?.message ?? 'Award failed.' });
    }
  });

  // --- Hybrid AI router ---
  app.post('/api/maraai/ai', requireAuth, costGuard, async (req: AuthedReq, res: Response) => {
    const parsed = aiSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid request.', errors: parsed.error.flatten() });
    const result = await routeAi(parsed.data.message, {
      userId: req.user!.uid,
      module: parsed.data.module,
      prefs: { language: parsed.data.language, personality: parsed.data.personality },
      history: parsed.data.history,
    });
    res.json(result);
  });

  // --- Email OTP ---
  app.post('/api/auth/otp/request', otpRateLimit, async (req: Request, res: Response) => {
    const parsed = otpRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid request.', errors: parsed.error.flatten() });
    try {
      const out = await requestOtp(parsed.data.email, parsed.data.purpose);
      // Production with no transport configured: tell the caller the
      // mail service is not set up so the UI can show a real error
      // instead of silently advancing into a code-entry step.
      if (!out.delivered) {
        return res.status(503).json({
          delivered: false,
          reason: out.reason,
          message: 'Email delivery is not configured on this server.',
        });
      }
      res.json(out);
    } catch (err: any) {
      res.status(err?.status ?? 500).json({ message: err?.message ?? 'OTP request failed.' });
    }
  });

  app.post('/api/auth/otp/verify', otpRateLimit, async (req: Request, res: Response) => {
    const parsed = otpVerifySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid request.', errors: parsed.error.flatten() });
    const out = await verifyOtp(parsed.data.email, parsed.data.code);
    if (!out.ok) return res.status(400).json(out);

    // Find-or-create the user row for this verified email and bind it to a
    // fresh authenticated session. This is what closes the loop for the
    // email-OTP register path: the client never has to know an actual
    // password, and returning users sign in by simply re-verifying their
    // email — no password mismatch, no random-password retry.
    try {
      const email = out.email.toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      let userId = existing[0]?.id;
      if (!userId) {
        const inserted = db
          .insert(users)
          .values({ email, firstName: email.split('@')[0], displayName: email.split('@')[0] })
          .returning()
          .all();
        userId = inserted[0]?.id;
        if (!userId) throw new Error('users.insert returned no row');
      }
      await setSessionUser(req, userId);
      return res.json({ ...out, userId });
    } catch (err) {
      console.error('[maraai/otp] session bind failed:', err);
      return res.status(500).json({ ok: false, reason: 'session_create_failed' });
    }
  });

  // --- Internal event bus status (no user data, fine to expose to authed users) ---
  app.get('/api/maraai/bus/status', requireAuth, async (_req: Request, res: Response) => {
    res.json({ ...eventBusStatus(), topics: Object.values(KAFKA_TOPICS) });
  });

  // ── Growth: Viral Referral Loop (gated >= 70 users) ──────────────────────

  // GET /api/growth/referral — get or create user's referral code + stats
  app.get('/api/growth/referral', requireAuth, async (req: AuthedReq, res: Response) => {
    const gate = getGrowthGateStatus();
    if (!gate.viralLoop) return res.json({ active: false, ...gate });
    const userId = req.user!.uid;
    const result = getOrCreateReferralCode(userId);
    return res.json({ active: true, ...result });
  });

  // POST /api/growth/referral/apply — apply a referral code (called at signup)
  app.post('/api/growth/referral/apply', requireAuth, async (req: AuthedReq, res: Response) => {
    if (!isViralLoopActive()) return res.json({ ok: false, message: 'Feature not yet active.' });
    const { code } = req.body as { code?: string };
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, message: 'Cod lipsă.' });
    }
    const userId = req.user!.uid;
    const result = await applyReferralCode(userId, code);
    return res.json(result);
  });

  // ── Growth: Dashboard (admin, gated >= 70 users) ─────────────────────────

  // GET /api/growth/dashboard — full growth data for admin dashboard
  app.get('/api/growth/dashboard', requireAuth, async (req: AuthedReq, res: Response) => {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const callerId = req.user!.uid;
    const [callerRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, callerId)).limit(1);
    const isAdmin = adminIds.includes(callerId) || (!!callerRow?.email && adminEmails.includes(callerRow.email.toLowerCase()));
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden.' });

    const gate = getGrowthGateStatus();
    if (!gate.growthDashboard) {
      return res.json({ gateActive: false, userCount: gate.userCount, threshold: gate.threshold });
    }

    const now = Math.floor(Date.now() / 1000);
    const day7 = now - 7 * 86400;
    const day14 = now - 14 * 86400;

    // Current funnel (last 7 days)
    const signupNow   = (rawSqlite.prepare('SELECT COUNT(*) as c FROM users WHERE created_at > ?').get(day7) as { c: number }).c;
    const signupPrev  = (rawSqlite.prepare('SELECT COUNT(*) as c FROM users WHERE created_at > ? AND created_at <= ?').get(day14, day7) as { c: number }).c;
    const activatedNow = (rawSqlite.prepare(`
      SELECT COUNT(DISTINCT u.id) as c FROM users u
      JOIN user_missions um ON um.user_id = u.id
      WHERE u.created_at > ? AND um.started_at < u.created_at + 86400
    `).get(day7) as { c: number }).c;
    const activatedPrev = (rawSqlite.prepare(`
      SELECT COUNT(DISTINCT u.id) as c FROM users u
      JOIN user_missions um ON um.user_id = u.id
      WHERE u.created_at > ? AND u.created_at <= ? AND um.started_at < u.created_at + 86400
    `).get(day14, day7) as { c: number }).c;
    const engagedNow  = (rawSqlite.prepare('SELECT COUNT(DISTINCT user_id) as c FROM chat_messages WHERE created_at > ? AND sender = ?').get(day7, 'user') as { c: number }).c;
    const engagedPrev = (rawSqlite.prepare('SELECT COUNT(DISTINCT user_id) as c FROM chat_messages WHERE created_at > ? AND created_at <= ? AND sender = ?').get(day14, day7, 'user') as { c: number }).c;

    function makeStage(stage: string, count: number, total: number, prevCount: number, prevTotal: number) {
      return {
        stage,
        count,
        dropOffRate: total > 0 ? (total - count) / total : 0,
        prevDropOffRate: prevTotal > 0 ? (prevTotal - prevCount) / prevTotal : 0,
      };
    }

    const currentFunnel = [
      makeStage('signup', signupNow, signupNow, signupPrev, signupPrev),
      makeStage('activation', activatedNow, signupNow, activatedPrev, signupPrev),
      makeStage('engagement', engagedNow, signupNow, engagedPrev, signupPrev),
    ];
    const previousFunnel = [
      makeStage('signup', signupPrev, signupPrev, 0, 0),
      makeStage('activation', activatedPrev, signupPrev, 0, 0),
      makeStage('engagement', engagedPrev, signupPrev, 0, 0),
    ];

    // Cohorts: last 6 weeks
    const cohorts: Array<{ week: string; signups: number; day7: number; day30: number }> = [];
    for (let w = 5; w >= 0; w--) {
      const wStart = now - (w + 1) * 7 * 86400;
      const wEnd   = now - w * 7 * 86400;
      const sRow   = rawSqlite.prepare('SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?').get(wStart, wEnd) as { c: number };
      const d7Row  = rawSqlite.prepare(`
        SELECT COUNT(DISTINCT u.id) as c FROM users u
        JOIN chat_messages cm ON cm.user_id = u.id AND cm.sender = 'user'
        WHERE u.created_at >= ? AND u.created_at < ? AND cm.created_at >= u.created_at + 6*86400
      `).get(wStart, wEnd) as { c: number };
      const d30Row = rawSqlite.prepare(`
        SELECT COUNT(DISTINCT u.id) as c FROM users u
        JOIN chat_messages cm ON cm.user_id = u.id AND cm.sender = 'user'
        WHERE u.created_at >= ? AND u.created_at < ? AND cm.created_at >= u.created_at + 29*86400
      `).get(wStart, wEnd) as { c: number };
      const weekLabel = new Date(wStart * 1000).toISOString().slice(0, 10);
      cohorts.push({ week: weekLabel, signups: sRow.c, day7: d7Row.c, day30: d30Row.c });
    }

    // Qualitative signals fired today (approximated via activity log)
    const todayStart = now - 86400;
    const signalRows = rawSqlite.prepare(`
      SELECT event_type as type, COUNT(*) as count
      FROM activity_log
      WHERE event_type LIKE 'investigator.%' AND created_at > ?
      GROUP BY event_type
    `).all(todayStart) as Array<{ type: string; count: number }>;

    const topReferrers = isViralLoopActive() ? getTopReferrers(10) : [];

    return res.json({
      gateActive: true,
      userCount: gate.userCount,
      threshold: gate.threshold,
      funnel: { current: currentFunnel, previous: previousFunnel },
      cohorts,
      qualitativeSignals: signalRows,
      topReferrers,
    });
  });
}
