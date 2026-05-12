import type { Express } from 'express';
import type { Server } from 'http';
import { storage } from './storage';
import { api } from '../shared/routes';
import { z } from 'zod';
import {
  creatorPostRequestSchema,
  likes as likesTable,
} from '../shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';
import { csrfProtection } from './auth';
import * as videoModule from '../backend/src/modules/video.js';
import * as reelsModule from '../backend/src/modules/reels.js';
import * as uploadsModule from '../backend/src/modules/uploads.js';
import * as writersModule from '../backend/src/modules/writers.js';
import * as tradingAcademyModule from '../backend/src/modules/trading-academy.js';
import * as creatorsModule from '../backend/src/modules/creators.js';
import * as chatModule from '../backend/src/modules/chat.js';
import * as ttsModule from '../backend/src/modules/tts.js';
import * as sttModule from '../backend/src/modules/stt.js';
import * as userPrefsModule from '../backend/src/modules/userPrefs.js';
import * as adminModule from '../backend/src/modules/admin.js';
import * as feedbackModule from '../backend/src/modules/feedback.js';
import * as profileModule from '../backend/src/modules/profile.js';
import * as notificationsModule from '../backend/src/modules/notifications.js';
import * as searchModule from '../backend/src/modules/search.js';
import * as ordersModule from '../backend/src/modules/orders.js';
import * as adminOrdersModule from '../backend/src/modules/adminOrders.js';
import * as paymentsModule from '../backend/src/modules/payments.js';
import * as pythonBridgeModule from '../backend/src/modules/pythonBridge.js';
import * as messengerModule from '../backend/src/modules/messenger.js';
import {
  StripeProvider,
  PayPalProvider,
} from '../backend/src/payments/providers.js';
import {
  getMaraResponse,
  MOOD_TO_THEME,
  analyzeFeedbackPatterns,
  generateImprovementIdeas,
  generateMarketingPost,
} from './ai';
import { getAIHealth } from './llm';
import {
  getLibraryProgress,
  addAndReadCustomBook,
  getKnowledgeStats,
  brainManager,
  readNextLibraryBook,
  readLibraryBookById,
  getNextUnreadBook,
  getBuiltInLibrary,
  listExperiments,
  getExperiment,
  decideExperiment,
  markImplemented,
  readFunnelData,
} from './mara-brain/index';
import { learningRateLimiter } from './mara-brain/rate-limiter';
import { getObjectiveRow, setObjective } from './mara-core/objective.js';
import {
  listUnresolvedConflicts,
  resolveConflict,
} from './mara-brain/conflict-detector.js';
import { listSingletonLocks } from './lib/singleton-lock.js';
import { chatRateLimit } from './rate-limit.js';
import { users as usersTable } from '../shared/models/auth.js';
import { registerMaraAIRoutes } from './maraai/routes.js';
import { signup as authSignup, login as authLogin, logout as authLogout, me as authMe } from './modules/auth-api.js';

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {

  // Middleware: requires a logged-in user (session user)
  const requireAuth = (req: any, res: any, next: any) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ message: 'Unauthorized — login required.' });
    return next();
  };

  // Apply CSRF protection to all state-changing routes.
  // Note: setupSessionAuth() is called in server/index.ts before registerRoutes(),
  // so req.session is populated by the time this middleware runs.
  app.use(csrfProtection);

  // Admin guard: match against ADMIN_USER_IDS / ADMIN_EMAILS (deny-by-default).
  const parseCsv = (v: string | undefined): string[] =>
    (v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const requireAdmin = async (req: any, res: any, next: any) => {
    const adminIds = parseCsv(process.env.ADMIN_USER_IDS);
    const adminEmails = parseCsv(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());

    const userId: string | undefined = req.user?.uid;
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' });

    if (adminIds.includes(userId)) return next();

    if (adminEmails.length > 0) {
      try {
        const user = await storage.getUserById(userId);
        const email = user?.email?.toLowerCase();
        if (email && adminEmails.includes(email)) return next();
      } catch (err) {
        console.error('[requireAdmin] getUserById failed:', err);
      }
    }

    return res.status(403).json({ message: 'Forbidden — admin access required.' });
  };

  // Inject dependencies into modules
  videoModule.injectDeps({ storage, db, api, z, creatorPostRequestSchema, likesTable });
  reelsModule.injectDeps({ storage });
  writersModule.injectDeps({ storage });
  tradingAcademyModule.injectDeps({ storage });
  creatorsModule.injectDeps({ storage });
  ttsModule.injectDeps({
    classic: 'nova',
    friendly: 'shimmer',
    professor: 'onyx',
    energetic: 'alloy',
    calm: 'nova',
    storyteller: 'shimmer',
    deep: 'onyx',
    bright: 'alloy',
    warm: 'nova',
    serious: 'onyx',
    playful: 'shimmer',
    confident: 'alloy',
  });
  sttModule.injectDeps({});
  userPrefsModule.injectDeps({ storage });
  adminModule.injectDeps({ storage });
  profileModule.injectDeps({ storage });
  ordersModule.injectDeps({ storage, z });
  adminOrdersModule.injectDeps({ storage });
  paymentsModule.injectDeps({
    stripeProvider: new StripeProvider(),
    paypalProvider: new PayPalProvider(),
  });

  // Payment endpoints (require auth)
  app.post('/api/payments/stripe', requireAuth, paymentsModule.processStripePayment);
  app.post('/api/payments/paypal', requireAuth, paymentsModule.processPayPalPayment);

  // Admin order management (require admin)
  app.get('/api/admin/orders', requireAdmin, adminOrdersModule.getOrders);
  app.post('/api/admin/orders/:id/confirm', requireAdmin, adminOrdersModule.confirmOrder);
  app.post('/api/admin/orders/:id/reject', requireAdmin, adminOrdersModule.rejectOrder);

  // Orders, premium, and trading endpoints (require auth)
  app.get('/api/premium/status', requireAuth, ordersModule.getPremiumStatus);
  app.get('/api/trading/access', requireAuth, ordersModule.getTradingAccess);
  app.post('/api/premium/order', requireAuth, ordersModule.createPremiumOrder);

  // --- Auth endpoints (local email/password + session) ---------------------
  // The handlers themselves live in server/modules/auth-api.ts and are
  // wrapped with wrapAsync to guarantee the response is always ended even
  // if the handler throws. We register them here so /api/auth/signup and
  // /api/auth/login are reachable; without this wiring the SPA fell back
  // to the static index.html and the AuthContext silently treated every
  // signup/login as failed.
  app.post('/api/auth/signup', authSignup);
  app.post('/api/auth/login', authLogin);
  app.post('/api/auth/logout', authLogout);
  // Full user payload (matches the AuthContext's expected shape).
  app.get('/api/auth/me', authMe);

  // Mara AI chat / OTP / brain endpoints. Imported but never wired in
  // the previous PR which is why /api/auth/otp/* and /api/chat were
  // returning the SPA HTML instead of JSON.
  registerMaraAIRoutes(app, requireAuth);

  // Profile endpoints (PR H)
  // Order matters: `/me` must be registered before `/:id` so Express matches
  // it literally instead of treating "me" as a user id.
  app.get('/api/profile/me', requireAuth, profileModule.getMe);
  app.patch('/api/profile/me', requireAuth, profileModule.updateMe);
  app.get('/api/profile/:id', profileModule.getProfile);
  app.get('/api/profile/:id/videos', profileModule.getProfileVideos);
  app.get('/api/profile/:id/followers', profileModule.listFollowers);
  app.get('/api/profile/:id/following', profileModule.listFollowing);
  app.get('/api/profile/:id/activity', profileModule.getActivity);
  app.get('/api/profile/:id/badges', profileModule.getBadges);
  app.get('/api/profile/:id/posts', profileModule.listProfilePosts);
  app.post('/api/profile/posts', requireAuth, profileModule.createProfilePost);
  // Post likes & comments — must be registered BEFORE the delete-post route
  // so that Express does not match `/posts/:postId` before `/posts/comments/:commentId`.
  app.post('/api/profile/posts/:postId/like', requireAuth, profileModule.likePost);
  app.get('/api/profile/posts/:postId/comments', profileModule.listPostComments);
  app.post('/api/profile/posts/:postId/comments', requireAuth, profileModule.createPostComment);
  app.delete('/api/profile/posts/comments/:commentId', requireAuth, profileModule.deletePostComment);
  app.delete(
    '/api/profile/posts/:postId',
    requireAuth,
    profileModule.deleteProfilePost,
  );
  app.post('/api/profile/:id/follow', requireAuth, profileModule.followUser);

  // Admin endpoints (require admin)
  app.get('/api/admin/stats', requireAdmin, adminModule.getStats);
  app.get('/api/admin/users', requireAdmin, adminModule.getUsers);
  app.get('/api/admin/videos', requireAdmin, adminModule.getVideos);

  // Feedback/moderation endpoint (require auth)
  app.post('/api/moderate', requireAuth, feedbackModule.moderate);

  // --- Notifications (Phase 2 P2.1) -----------------------------------------
  app.get('/api/notifications', requireAuth, notificationsModule.listNotifications);
  app.get('/api/notifications/unread-count', requireAuth, notificationsModule.unreadCount);
  app.post('/api/notifications/:id/read', requireAuth, notificationsModule.markRead);
  app.post('/api/notifications/read-all', requireAuth, notificationsModule.markAllRead);

  // --- Direct Messaging (Feature 5) ------------------------------------------
  app.get('/api/messenger/conversations', requireAuth, messengerModule.listConversations);
  app.post('/api/messenger/conversations', requireAuth, messengerModule.getOrCreateConv);
  app.get('/api/messenger/conversations/:convId/messages', requireAuth, messengerModule.getMessages);
  app.post('/api/messenger/conversations/:convId/messages', requireAuth, messengerModule.sendMessage);
  app.post('/api/messenger/conversations/:convId/read', requireAuth, messengerModule.markRead);

  // Global search (Phase 2 P2.4) — public, returns ranked results across
  // people/reels/articles/lessons. See backend/src/modules/search.ts.
  app.get('/api/search', searchModule.search);

  // Video and feed endpoints
  app.get(api.videos.list.path, videoModule.listVideos);
  app.get('/api/mara-feed', videoModule.maraFeed);
  app.post(api.videos.create.path, requireAuth, videoModule.createVideo);
  app.post('/api/videos/:id/like', requireAuth, videoModule.likeVideo);
  app.post('/api/videos/:id/view', videoModule.viewVideo);
  app.post('/api/videos/:id/save', requireAuth, videoModule.saveVideo);
  app.delete('/api/videos/:id/save', requireAuth, videoModule.unsaveVideo);
  app.get('/api/videos/saved', requireAuth, videoModule.getSavedVideos);

  // --- Reels pipeline (PR D) -------------------------------------------------
  app.get('/api/reels/feed', reelsModule.getReelsFeed);
  app.post(
    '/api/reels/upload',
    requireAuth,
    (req: any, res: any, next: any) => {
      reelsModule.uploadMiddleware(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : 'upload error';
          const status = msg.includes('File too large') ? 413 : 400;
          return res.status(status).json({ error: msg });
        }
        return next();
      });
    },
    reelsModule.uploadReel,
  );
  // --- Generic image upload (avatar, cover, post image, writers cover) ----
  // Auth-required, multipart/form-data field name `image`. Returns a public
  // URL the caller can store in any *ImageUrl column via the existing
  // PATCH /api/profile/me / POST /api/profile/posts / POST /api/writers
  // endpoints — those still validate URL shape so we keep one source of
  // truth for what an image URL looks like.
  app.post(
    '/api/uploads/image',
    requireAuth,
    (req: any, res: any, next: any) => {
      uploadsModule.imageUploadMiddleware(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : 'upload error';
          const status = msg.includes('File too large') ? 413 : 400;
          return res.status(status).json({ error: msg });
        }
        return next();
      });
    },
    uploadsModule.uploadImage,
  );

  app.post('/api/videos/:id/share', requireAuth, reelsModule.shareReel);
  app.get('/api/videos/:id/comments', reelsModule.listComments);
  app.post('/api/videos/:id/comments', requireAuth, reelsModule.createComment);
  app.delete('/api/videos/comments/:commentId', requireAuth, reelsModule.deleteComment);

  // --- Writers Hub (PR E) ----------------------------------------------------
  //
  // Legacy routes preserved for the frontend currently in production
  // (`/api/writers/library`, `/api/writers/publish`, `/api/writers/:id/like`,
  // `/api/writers/:id/comment`). New endpoints use the modern REST shape
  // (`GET /api/writers`, `GET /api/writers/:idOrSlug`, etc.). Both resolve
  // to the same handlers so the frontend can migrate incrementally.
  app.get('/api/writers', writersModule.listLibrary);
  app.get('/api/writers/library', writersModule.listLibrary);
  app.get('/api/writers/mine', requireAuth, writersModule.listMyPages);
  app.get('/api/writers/purchases', requireAuth, writersModule.listMyPurchases);
  app.post('/api/writers', requireAuth, writersModule.publishArticle);
  app.post('/api/writers/publish', requireAuth, writersModule.publishArticle);
  app.get('/api/writers/:idOrSlug', writersModule.getArticle);
  app.patch('/api/writers/:id', requireAuth, writersModule.updateArticle);
  app.delete('/api/writers/:id', requireAuth, writersModule.deleteArticle);
  app.post('/api/writers/:id/like', requireAuth, writersModule.likeArticle);
  app.get('/api/writers/:id/comments', writersModule.listComments);
  app.post('/api/writers/:id/comments', requireAuth, writersModule.createComment);
  // legacy singular alias used by WritersHub.tsx
  app.post('/api/writers/:id/comment', requireAuth, writersModule.createComment);
  app.delete('/api/writers/comments/:commentId', requireAuth, writersModule.deleteComment);
  app.get('/api/writers/:id/access', writersModule.getAccess);
  app.post('/api/writers/:id/purchase', requireAuth, writersModule.purchaseArticle);

  // --- Trading Academy (PR F) -----------------------------------------------
  //
  // Feature gating is checked inside the handlers themselves rather than with
  // `requireFeature` middleware because:
  //   * `listModules` and `getModule` must respond 200 even for locked
  //     modules (the frontend renders a paywalled preview)
  //   * `getLesson` / `completeLesson` / `submitQuiz` need to know which
  //     FeatureKey to enforce, and that key is read from the module row
  //     (not fixed on the route).
  app.get('/api/trading/modules', tradingAcademyModule.listModules);
  app.get('/api/trading/modules/:slug', tradingAcademyModule.getModule);
  app.get('/api/trading/lessons/:id', tradingAcademyModule.getLesson);
  app.post('/api/trading/lessons/:id/complete', requireAuth, tradingAcademyModule.completeLesson);
  app.post('/api/trading/lessons/:id/quiz', requireAuth, tradingAcademyModule.submitQuiz);
  app.get('/api/trading/progress', requireAuth, tradingAcademyModule.getProgress);
  app.get('/api/trading/certificates', requireAuth, tradingAcademyModule.getCertificates);

  // --- Creator Tools (PR G) -------------------------------------------------
  // Aggregated earnings (requires creator.revenue_share feature).
  app.get('/api/creator/earnings', requireAuth, creatorsModule.getEarnings);
  app.get('/api/creator/earnings/history', requireAuth, creatorsModule.getEarningsHistory);
  // Writer-side analytics (pages/views/likes/followers). A distinct path from
  // the existing reels-focused `/api/creator/analytics` (videoModule) which
  // returns a different shape already consumed by the frontend; merging the
  // two is deferred to the dashboard wiring PR.
  app.get('/api/creator/dashboard-analytics', requireAuth, creatorsModule.getAnalytics);
  // Payout requests (list is open to any signed-in user so creators can see
  // their own past requests even if their active plan has lapsed; POST
  // requires the creator.payouts feature).
  app.get('/api/creator/payouts', requireAuth, creatorsModule.listMyPayouts);
  app.post('/api/creator/payouts', requireAuth, creatorsModule.createPayout);
  // Admin endpoints.
  app.get('/api/admin/creator/payouts', creatorsModule.adminListPayouts);
  app.patch('/api/admin/creator/payouts/:id', creatorsModule.adminUpdatePayout);

  // Creator endpoints (require auth)
  app.get('/api/creator/post-status', requireAuth, videoModule.creatorPostStatus);
  app.get('/api/creator/my-videos', requireAuth, videoModule.creatorMyVideos);
  app.post('/api/creator/post-reel', requireAuth, videoModule.creatorPostReel);
  app.get('/api/creator/analytics', requireAuth, videoModule.creatorAnalytics);
  app.delete('/api/creator/videos/:id', requireAuth, videoModule.deleteCreatorVideo);

  // Chat endpoints (require auth)
  app.get(api.chat.list.path, requireAuth, chatModule.getChatHistory);
  app.post(api.chat.send.path, requireAuth, chatModule.sendChatMessage);

  // TTS/STT endpoints
  app.post('/api/mara-speak', ttsModule.maraSpeak);
  app.post('/api/tts', ttsModule.tts);
  app.post('/api/stt', sttModule.stt);

  // Python bridge — requires auth to prevent SSRF abuse
  app.post('/api/maraai/python-fetch', requireAuth, pythonBridgeModule.fetchWithPython);

  // User preferences endpoints (require auth)
  app.get('/api/user/language', requireAuth, userPrefsModule.getUserLanguage);
  app.post('/api/user/language', requireAuth, userPrefsModule.setUserLanguage);

  // === Mara Brain Library & Knowledge endpoints (admin only) ===
  app.get('/api/admin/mara/library', requireAdmin, async (_req: any, res: any) => {
    try {
      const progress = await getLibraryProgress();
      const stats = await getKnowledgeStats();
      res.json({ library: progress, knowledge: stats });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get library status' });
    }
  });

  app.post('/api/admin/mara/library/upload', requireAdmin, async (req: any, res: any) => {
    try {
      const { title, content, category } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: 'title and content are required' });
      }
      if (typeof title !== 'string' || typeof content !== 'string') {
        return res.status(400).json({ error: 'title and content must be strings' });
      }
      if (content.length > 500000) {
        return res.status(400).json({ error: 'Content too large (max 500KB)' });
      }
      const result = await addAndReadCustomBook(title, content, category || 'general');
      res.json({
        message: `Mara a citit "${title}" și a extras ${result.totalIdeas} idei`,
        result: {
          title: result.title,
          chunks: result.processedChunks,
          ideas: result.totalIdeas,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process uploaded book' });
    }
  });

  // Trigger immediate read of the next unread library book.
  // Used by admin to fast-track ingestion of new high-priority books (e.g.
  // the Growth Engineer core library) without waiting for the next brain
  // cycle. Idempotent — repeat calls just read subsequent books until the
  // library is exhausted.
  app.post('/api/admin/mara/library/read-next', requireAdmin, async (_req: any, res: any) => {
    try {
      const next = await getNextUnreadBook();
      if (!next) {
        const progress = await getLibraryProgress();
        return res.json({
          message: 'All library books have been read',
          progress,
        });
      }
      const result = await readNextLibraryBook();
      if (!result) {
        return res.json({ message: 'No unread book found (race condition)' });
      }
      const progress = await getLibraryProgress();
      res.json({
        message: `Mara a citit "${result.title}" și a extras ${result.totalIdeas} idei`,
        result: {
          title: result.title,
          chunks: result.processedChunks,
          totalChunks: result.totalChunks,
          ideas: result.totalIdeas,
          savedKnowledgeIds: result.savedKnowledgeIds.length,
        },
        progress,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Failed to read next library book: ${message}` });
    }
  });

  // Force re-read of a specific library book by id, bypassing the
  // "already read" check. Used to re-process books whose previous
  // extraction failed (e.g. because of the camelCase/snake_case bug in
  // learnFromText that silently dropped every parsed idea). Body:
  // { "bookId": "growth-hooked-nir-eyal" }.
  app.post('/api/admin/mara/library/read-book', requireAdmin, async (req: any, res: any) => {
    try {
      const { bookId } = req.body || {};
      if (!bookId || typeof bookId !== 'string') {
        return res.status(400).json({ error: 'bookId is required' });
      }
      const result = await readLibraryBookById(bookId);
      if (!result) {
        return res.status(404).json({ error: `No book with id "${bookId}" in built-in library` });
      }
      const progress = await getLibraryProgress();
      res.json({
        message: `Mara a re-citit "${result.title}" și a extras ${result.totalIdeas} idei`,
        result: {
          title: result.title,
          chunks: result.processedChunks,
          totalChunks: result.totalChunks,
          ideas: result.totalIdeas,
          savedKnowledgeIds: result.savedKnowledgeIds.length,
        },
        progress,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Failed to read library book: ${message}` });
    }
  });

  // Inspect the static library catalog — useful for the admin UI to see
  // what books are available, in what order they will be read, and which
  // categories are represented.
  app.get('/api/admin/mara/library/catalog', requireAdmin, (_req: any, res: any) => {
    try {
      const catalog = getBuiltInLibrary().map((b) => ({
        id: b.id,
        title: b.title,
        category: b.category,
        priority: b.priority,
        contentLength: b.content.length,
      }));
      catalog.sort((a, b) => a.priority - b.priority);
      res.json({ catalog });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get library catalog' });
    }
  });

  app.get('/api/admin/mara/knowledge', requireAdmin, async (_req: any, res: any) => {
    try {
      const stats = await getKnowledgeStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get knowledge stats' });
    }
  });

  // === MaraCore Objective (admin only) ===
  // Etapa 1 of the single-brain migration: the ObjectiveFunction lives in
  // a singleton row of `mara_core_objective`. GET reads it (returns
  // defaults if the row is missing); PUT performs a partial update merged
  // onto the current value. Future PRs route the brain cycle's
  // rate-limit + ICE scoring through this row, so editing it here will
  // start actually steering behaviour.
  app.get('/api/admin/mara/objective', requireAdmin, (_req: any, res: any) => {
    try {
      const { objective, updatedAt, updatedBy } = getObjectiveRow();
      res.json({
        objective,
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        updatedBy,
      });
    } catch (error) {
      console.error('[admin/mara/objective] GET failed:', error);
      res.status(500).json({ error: 'Failed to load objective' });
    }
  });

  app.put('/api/admin/mara/objective', requireAdmin, async (req: any, res: any) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Body must be a JSON object.' });
      }

      // Identify the editor for the audit log. Prefer email so the
      // history is human-readable; fall back to user_id, then 'admin'.
      let updatedBy = 'admin';
      const userId: string | undefined = req.user?.uid;
      if (userId) {
        try {
          const user = await storage.getUserById(userId);
          updatedBy = user?.email || userId;
        } catch {
          updatedBy = userId;
        }
      }

      const merged = setObjective(body, updatedBy);
      const { updatedAt } = getObjectiveRow();
      res.json({
        objective: merged,
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        updatedBy,
      });
    } catch (error) {
      // `setObjective` throws plain Errors for validation issues. Surface
      // the message so the operator sees *what* was wrong.
      const message = error instanceof Error ? error.message : 'Failed to save objective';
      console.error('[admin/mara/objective] PUT failed:', error);
      res.status(400).json({ error: message });
    }
  });

  // === Audit P2: knowledge conflicts (admin only) ===
  // Each row in mara_knowledge_conflicts pairs two same-category knowledge
  // entries whose contents disagree on a polarity word (e.g. risky vs safe).
  // Inserted by storeKnowledge() — observational, never blocks the write.
  // GET returns unresolved conflicts; POST .../resolve marks one as resolved
  // so it drops off the dashboard.
  app.get('/api/admin/mara/knowledge/conflicts', requireAdmin, (req: any, res: any) => {
    try {
      const limitRaw = Number.parseInt(String(req.query?.limit ?? '50'), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 200)
        : 50;
      const rows = listUnresolvedConflicts(limit);
      res.json({ conflicts: rows, count: rows.length });
    } catch (error) {
      console.error('[admin/mara/knowledge/conflicts] GET failed:', error);
      res.status(500).json({ error: 'Failed to list conflicts' });
    }
  });

  app.post(
    '/api/admin/mara/knowledge/conflicts/:id/resolve',
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const id = Number.parseInt(String(req.params?.id), 10);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid conflict id.' });
        }
        let resolvedBy = 'admin';
        const userId: string | undefined = req.user?.uid;
        if (userId) {
          try {
            const user = await storage.getUserById(userId);
            resolvedBy = user?.email || userId;
          } catch {
            resolvedBy = userId;
          }
        }
        const ok = resolveConflict(id, resolvedBy);
        if (!ok) {
          return res
            .status(404)
            .json({ error: 'Conflict not found or already resolved.' });
        }
        res.json({ ok: true, resolvedBy });
      } catch (error) {
        console.error('[admin/mara/knowledge/conflicts] resolve failed:', error);
        res.status(500).json({ error: 'Failed to resolve conflict' });
      }
    },
  );

  // Diagnostic: list the cross-process advisory locks held in this DB.
  // Helps operators confirm which Railway replica is the active brain
  // orchestrator and when its lease expires.
  app.get('/api/admin/mara/locks', requireAdmin, (_req: any, res: any) => {
    try {
      const rows = listSingletonLocks();
      res.json({ locks: rows, count: rows.length });
    } catch (error) {
      console.error('[admin/mara/locks] GET failed:', error);
      res.status(500).json({ error: 'Failed to list locks' });
    }
  });

  // === Mara Growth Engineer experiments (admin only) ===
  //
  // Each brain cycle proposes ONE experiment via the Growth Engineer loop and
  // stores it in `mara_growth_experiments` with status='proposed'. These
  // endpoints let the admin inspect, approve, reject, or mark-implemented an
  // experiment. A full UI lives at /admin/experiments (Step 3) but the
  // endpoints work standalone via curl for ops use.
  app.get('/api/admin/mara/experiments', requireAdmin, async (req: any, res: any) => {
    try {
      const statusParam = typeof req.query?.status === 'string' ? req.query.status : undefined;
      const allowed = new Set(['proposed', 'approved', 'implemented', 'measured', 'rejected']);
      const status = statusParam && allowed.has(statusParam) ? (statusParam as 'proposed' | 'approved' | 'implemented' | 'measured' | 'rejected') : undefined;
      const limitRaw = Number.parseInt(String(req.query?.limit ?? '50'), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
      const rows = await listExperiments({ status, limit });
      res.json({ experiments: rows, count: rows.length });
    } catch (error) {
      console.error('[experiments] list failed:', error);
      res.status(500).json({ error: 'Failed to list growth experiments' });
    }
  });

  app.get('/api/admin/mara/experiments/funnel', requireAdmin, async (req: any, res: any) => {
    try {
      const daysRaw = Number.parseInt(String(req.query?.days ?? '14'), 10);
      const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 14;
      const snapshot = await readFunnelData(days);
      res.json(snapshot);
    } catch (error) {
      console.error('[experiments] funnel snapshot failed:', error);
      res.status(500).json({ error: 'Failed to read funnel snapshot' });
    }
  });

  app.get('/api/admin/mara/experiments/:id', requireAdmin, async (req: any, res: any) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid experiment id' });
      }
      const exp = await getExperiment(id);
      if (!exp) return res.status(404).json({ error: 'Experiment not found' });
      res.json(exp);
    } catch (error) {
      console.error('[experiments] get failed:', error);
      res.status(500).json({ error: 'Failed to get experiment' });
    }
  });

  app.post('/api/admin/mara/experiments/:id/approve', requireAdmin, async (req: any, res: any) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid experiment id' });
      }
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      const decidedBy = (req.user?.email as string | undefined) ?? 'unknown-admin';
      const updated = await decideExperiment(id, 'approved', decidedBy, note);
      if (!updated) return res.status(404).json({ error: 'Experiment not found' });
      res.json({ experiment: updated });
    } catch (error) {
      console.error('[experiments] approve failed:', error);
      res.status(500).json({ error: 'Failed to approve experiment' });
    }
  });

  app.post('/api/admin/mara/experiments/:id/reject', requireAdmin, async (req: any, res: any) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid experiment id' });
      }
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      const decidedBy = (req.user?.email as string | undefined) ?? 'unknown-admin';
      const updated = await decideExperiment(id, 'rejected', decidedBy, note);
      if (!updated) return res.status(404).json({ error: 'Experiment not found' });
      res.json({ experiment: updated });
    } catch (error) {
      console.error('[experiments] reject failed:', error);
      res.status(500).json({ error: 'Failed to reject experiment' });
    }
  });

  // Mark an approved experiment as deployed/implemented. The body may contain
  // `measureAfterMs` (number of milliseconds from now until measurement) to
  // override the default 7-day window — useful in tests, or for fast-iteration
  // experiments that need a shorter measurement horizon.
  app.post('/api/admin/mara/experiments/:id/implement', requireAdmin, async (req: any, res: any) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid experiment id' });
      }
      const measureAfterMsRaw = Number(req.body?.measureAfterMs);
      const measureAfterMs = Number.isFinite(measureAfterMsRaw) && measureAfterMsRaw > 0
        ? measureAfterMsRaw
        : undefined;
      const updated = await markImplemented(id, measureAfterMs);
      if (!updated) return res.status(404).json({ error: 'Experiment not found' });
      if (updated.status !== 'implemented') {
        return res.status(409).json({
          error: `Cannot mark implemented: experiment is in status "${updated.status}". Approve it first.`,
          experiment: updated,
        });
      }
      res.json({ experiment: updated });
    } catch (error) {
      console.error('[experiments] implement failed:', error);
      res.status(500).json({ error: 'Failed to mark experiment implemented' });
    }
  });

  // === Mara Brain status/logs/trigger (admin only) ===
  app.get('/api/admin/brain/status', requireAdmin, (_req: any, res: any) => {
    try {
      res.json(brainManager.status());
    } catch (error) {
      res.status(500).json({ error: 'Failed to get brain status' });
    }
  });

  app.get('/api/admin/brain/logs', requireAdmin, async (req: any, res: any) => {
    try {
      const rawLimit = Number.parseInt(String(req.query.limit ?? '20'), 10);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 20;
      const logs = await storage.getBrainLogs(limit);
      // BrainLog fields are plain newline-delimited strings. Expose both the
      // raw string and a best-effort array split so the UI can render either.
      const toLines = (val: unknown): string[] => {
        if (typeof val !== 'string') return [];
        return val.split('\n').map((s) => s.trim()).filter(Boolean);
      };
      const decoded = logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt,
        research: l.research,
        productIdeas: l.productIdeas,
        devTasks: l.devTasks,
        growthIdeas: l.growthIdeas,
        researchItems: toLines(l.research),
        productIdeasItems: toLines(l.productIdeas),
        devTasksItems: toLines(l.devTasks),
        growthIdeasItems: toLines(l.growthIdeas),
      }));
      res.json({ logs: decoded });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get brain logs' });
    }
  });

  app.post('/api/admin/brain/trigger', requireAdmin, async (_req: any, res: any) => {
    try {
      const result = await brainManager.triggerManual();
      if (result.ok) {
        return res.status(202).json({ ok: true, message: 'Brain cycle started in background.' });
      }
      if (result.reason === 'disabled') {
        return res.status(503).json({ ok: false, code: 'brain_disabled', message: 'Brain scheduler is disabled.' });
      }
      if (result.reason === 'running') {
        return res.status(409).json({ ok: false, code: 'brain_running', message: 'A brain cycle is already running.' });
      }
      if (result.reason === 'cooldown') {
        return res.status(429).json({
          ok: false,
          code: 'cooldown',
          message: 'Manual trigger cooldown active.',
          retryAfterMs: result.retryAfterMs,
        });
      }
      return res.status(500).json({ ok: false, message: 'Unknown trigger failure.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger brain cycle' });
    }
  });

  // === Mara Learning Engine (admin only) ===
  // Per-module growth proposals + reading/learning queue. Proposals are
  // generated autonomously by the brain cycle and require admin approval
  // before they take effect on the platform.

  app.get('/api/admin/learning/stats', requireAdmin, async (_req: any, res: any) => {
    try {
      const [insights, queue, knowledge] = await Promise.all([
        storage.getPlatformInsights(),
        storage.getPendingLearningTasks(100),
        getKnowledgeStats(),
      ]);
      const byModule: Record<string, { proposed: number; approved: number; rejected: number; completed: number }> = {};
      for (const i of insights) {
        if (!byModule[i.module]) {
          byModule[i.module] = { proposed: 0, approved: 0, rejected: 0, completed: 0 };
        }
        const bucket = byModule[i.module];
        if (i.status === 'proposed') bucket.proposed += 1;
        else if (i.status === 'approved' || i.status === 'in_progress') bucket.approved += 1;
        else if (i.status === 'rejected') bucket.rejected += 1;
        else if (i.status === 'completed') bucket.completed += 1;
      }
      res.json({
        rateLimiter: learningRateLimiter.stats(),
        byModule,
        queuePending: queue.length,
        knowledge,
      });
    } catch (error) {
      console.error('[Learning] stats failed:', error);
      res.status(500).json({ error: 'Failed to get learning stats' });
    }
  });

  app.get('/api/admin/learning/insights', requireAdmin, async (req: any, res: any) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const module = typeof req.query.module === 'string' ? req.query.module : undefined;
      const rawLimit = Number.parseInt(String(req.query.limit ?? '100'), 10);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
      let insights = await storage.getPlatformInsights(status);
      if (module) insights = insights.filter((i) => i.module === module);
      res.json({ insights: insights.slice(0, limit) });
    } catch (error) {
      console.error('[Learning] list insights failed:', error);
      res.status(500).json({ error: 'Failed to list insights' });
    }
  });

  app.post('/api/admin/learning/insights/:id/status', requireAdmin, async (req: any, res: any) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid insight id' });
      }
      const allowed = ['proposed', 'approved', 'in_progress', 'completed', 'rejected'];
      const status = typeof req.body?.status === 'string' ? req.body.status : '';
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      }
      const updated = await storage.updatePlatformInsightStatus(id, status);
      if (!updated) return res.status(404).json({ error: 'Insight not found' });
      res.json({ insight: updated });
    } catch (error) {
      console.error('[Learning] update insight status failed:', error);
      res.status(500).json({ error: 'Failed to update insight status' });
    }
  });

  app.get('/api/admin/learning/queue', requireAdmin, async (_req: any, res: any) => {
    try {
      const pending = await storage.getPendingLearningTasks(100);
      res.json({ queue: pending });
    } catch (error) {
      console.error('[Learning] list queue failed:', error);
      res.status(500).json({ error: 'Failed to list learning queue' });
    }
  });

  app.post('/api/admin/learning/queue', requireAdmin, async (req: any, res: any) => {
    try {
      const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      const rawPriority = typeof req.body?.priority === 'string' ? req.body.priority : 'medium';
      const priority = ['low', 'medium', 'high', 'critical'].includes(rawPriority) ? rawPriority : 'medium';
      if (!topic || topic.length < 2 || topic.length > 500) {
        return res.status(400).json({ error: 'topic is required (2-500 chars)' });
      }
      const created = await storage.createLearningTask({
        topic,
        reason: reason || `Admin-added: ${topic}`,
        priority,
        source: 'admin',
      });
      res.json({ task: created });
    } catch (error) {
      console.error('[Learning] add to queue failed:', error);
      res.status(500).json({ error: 'Failed to add to learning queue' });
    }
  });

  // Global search — public, no auth required.
  app.get('/api/search', searchModule.search);

  // Trading signals — returns the latest Mara-generated market signal.
  app.get('/api/trading/signals', async (_req: any, res: any) => {
    try {
      res.json({
        content: 'Mara AI is analyzing markets. Check back in a few minutes for updated signals.',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get signals' });
    }
  });

  // Upgrade user tier — requires auth; updates users.tier in DB.
  app.post('/api/user/upgrade', requireAuth, async (req: any, res: any) => {
    const userId: string = req.user?.uid;
    const VALID_TIERS = ['free', 'trial', 'premium', 'vip'] as const;
    type ValidTier = typeof VALID_TIERS[number];
    const newTier = req.body?.newTier as string;
    if (!newTier || !(VALID_TIERS as readonly string[]).includes(newTier)) {
      return res.status(400).json({ message: 'newTier must be one of: free, trial, premium, vip' });
    }
    try {
      const updated = await db
        .update(usersTable)
        .set({ tier: newTier as ValidTier })
        .where(eq(usersTable.id, userId))
        .returning()
        .all();
      if (!updated[0]) return res.status(404).json({ message: 'User not found' });
      return res.json({ ok: true, tier: updated[0].tier });
    } catch (err) {
      console.error('[upgrade] failed:', err);
      return res.status(500).json({ message: 'Failed to upgrade tier' });
    }
  });

  seedDatabase().catch(console.error);

  // AI provider health check endpoint. Returns the currently-primary
  // provider plus a `fallback` block describing the secondary when one is
  // configured. Shape matches what the AI integration prompt requested:
  //   { provider, configured, ok, model, fallback?: { provider, configured, ok, model } }
  app.get('/api/ai/health', async (_req: any, res: any) => {
    const snap = await getAIHealth();
    return res.status(snap.ok ? 200 : 503).json(snap);
  });

  return httpServer;
}

async function seedDatabase() {
  const existingVideos = await storage.getVideos();
  const yt = (id: string) => `youtube:${id}`;
  const g = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";
  const t = "https://test-videos.co.uk/vids";

  const defaultVideos = [
    {
      url: yt("dQw4w9WgXcQ"),
      type: "real",
      title: "Rick Astley - Never Gonna Give You Up",
      description: "The classic hit that never gets old",
    },
    {
      url: yt("kJQP7kiw5Fk"),
      type: "real",
      title: "Luis Fonsi - Despacito",
      description: "Most viewed music video of all time",
    },
    {
      url: yt("JGwWNGJdvx8"),
      type: "real",
      title: "Ed Sheeran - Shape of You",
      description: "Chart-topping pop hit",
    },
    {
      url: yt("YQHsXMglC9A"),
      type: "real",
      title: "Adele - Hello",
      description: "Powerful ballad from the other side",
    },
    {
      url: yt("fJ9rUzIMcZQ"),
      type: "real",
      title: "Queen - Bohemian Rhapsody",
      description: "Legendary rock masterpiece",
    },
    {
      url: yt("9bZkp7q19f0"),
      type: "real",
      title: "PSY - Gangnam Style",
      description: "The viral sensation that broke the internet",
    },
    {
      url: yt("CevxZvSJLk8"),
      type: "real",
      title: "Katy Perry - Roar",
      description: "Empowering pop anthem",
    },
    {
      url: yt("OPf0YbXqDm0"),
      type: "real",
      title: "Uptown Funk - Bruno Mars",
      description: "Funk-pop party starter",
    },
    {
      url: yt("RgKAFK5djSk"),
      type: "real",
      title: "See You Again - Wiz Khalifa",
      description: "Emotional tribute song",
    },
    {
      url: yt("e-ORhEE9VVg"),
      type: "real",
      title: "Taylor Swift - Blank Space",
      description: "Pop perfection storytelling",
    },
    {
      url: yt("kXYiU_JCYtU"),
      type: "real",
      title: "Linkin Park - Numb",
      description: "Nu-metal classic anthem",
    },
    {
      url: yt("hLQl3WQQoQ0"),
      type: "real",
      title: "Adele - Someone Like You",
      description: "Heart-wrenching ballad",
    },
    {
      url: yt("60ItHLz5WEA"),
      type: "real",
      title: "Alan Walker - Faded",
      description: "Electronic music masterpiece",
    },
    {
      url: yt("2Vv-BfVoq4g"),
      type: "real",
      title: "Ed Sheeran - Perfect",
      description: "Romantic love song",
    },
    {
      url: yt("pRpeEdMmmQ0"),
      type: "real",
      title: "Shakira - Waka Waka",
      description: "World Cup anthem",
    },
    {
      url: yt("hT_nvWreIhg"),
      type: "real",
      title: "OneRepublic - Counting Stars",
      description: "Indie pop hit",
    },
    {
      url: yt("lp-EO5I60KA"),
      type: "real",
      title: "Ed Sheeran - Thinking Out Loud",
      description: "Beautiful wedding song",
    },
    {
      url: yt("FTQbiNvZqaY"),
      type: "real",
      title: "Toto - Africa",
      description: "Timeless 80s classic",
    },
    {
      url: yt("hTWKbfoikeg"),
      type: "real",
      title: "Nirvana - Smells Like Teen Spirit",
      description: "Grunge revolution anthem",
    },
    {
      url: yt("djV11Xbc914"),
      type: "real",
      title: "a-ha - Take On Me",
      description: "Iconic 80s synth-pop",
    },
    {
      url: yt("fNFzfwLM72c"),
      type: "real",
      title: "Bee Gees - Stayin Alive",
      description: "Disco era classic",
    },
    {
      url: yt("y6120QOlsfU"),
      type: "real",
      title: "Darude - Sandstorm",
      description: "Electronic dance anthem",
    },
    {
      url: yt("L_jWHffIx5E"),
      type: "real",
      title: "Smash Mouth - All Star",
      description: "Feel-good pop rock",
    },
    {
      url: yt("v2AC41dglnM"),
      type: "real",
      title: "AC/DC - Thunderstruck",
      description: "Hard rock energy",
    },
    {
      url: yt("gQlMMD8auMs"),
      type: "real",
      title: "BLACKPINK - Pink Venom",
      description: "K-pop sensation",
    },
    {
      url: yt("oRdxUFDoQe0"),
      type: "real",
      title: "Michael Jackson - Beat It",
      description: "King of Pop classic",
    },
    {
      url: `${g}/ForBiggerBlazes.mp4`,
      type: "AI",
      title: "Blazing Action",
      description: "High-energy action trailer",
    },
    {
      url: `${g}/ForBiggerEscapes.mp4`,
      type: "real",
      title: "Cosmic Escape",
      description: "Space adventure trailer",
    },
    {
      url: `${g}/ForBiggerFun.mp4`,
      type: "real",
      title: "Fun Moments",
      description: "Entertaining moments compilation",
    },
    {
      url: `${g}/ForBiggerJoyrides.mp4`,
      type: "real",
      title: "Joyride Adventures",
      description: "Thrilling joyride experiences",
    },
    {
      url: `${t}/jellyfish/mp4/h264/720/Jellyfish_720_10s_5MB.mp4`,
      type: "real",
      title: "Ocean Jellyfish",
      description: "Mesmerizing jellyfish in deep ocean",
    },
    {
      url: `${t}/sintel/mp4/h264/720/Sintel_720_10s_5MB.mp4`,
      type: "AI",
      title: "Dragon Quest",
      description: "Fantasy dragon-slaying adventure",
    },
  ];

  const existingUrls = new Set(existingVideos.map((v) => v.url));
  let added = 0;
  for (const v of defaultVideos) {
    if (!existingUrls.has(v.url)) {
      await storage.createVideo(v);
      added++;
    }
  }
  if (added > 0)
    console.log(
      `Database seeded with ${added} new videos (total: ${existingVideos.length + added}).`,
    );
}
