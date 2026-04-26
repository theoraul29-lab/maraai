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
  registerNode,
} from './p2p.js';
import { route as routeAi } from './ai-router.js';
import { eventBusStatus, KAFKA_TOPICS } from './kafka.js';
import { requestOtp, verifyOtp } from './otp.js';
import { logActivity } from './activity.js';

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

  app.post('/api/p2p/heartbeat', requireAuth, async (req: AuthedReq, res: Response) => {
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

  // --- Hybrid AI router ---
  app.post('/api/maraai/ai', requireAuth, async (req: AuthedReq, res: Response) => {
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
  app.post('/api/auth/otp/request', async (req: Request, res: Response) => {
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

  app.post('/api/auth/otp/verify', async (req: Request, res: Response) => {
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
}
