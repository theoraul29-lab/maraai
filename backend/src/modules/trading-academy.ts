/**
 * Trading Academy (PR F) — HTTP handlers.
 *
 * Structured learning content (modules + lessons + quizzes) gated by the
 * billing feature catalogue. Each module declares the `FeatureKey` a user
 * must have in order to enter its lessons; the free tier gets only
 * `trading.level_1_fundamentals`, the VIP/Creator tiers unlock
 * `trading.all_levels` and `trading.live_sessions`.
 *
 * This module intentionally mirrors the `writers.ts` shape:
 *   - deps are injected via `injectDeps` so the same handlers can be
 *     exercised under a mocked storage in tests
 *   - all handlers are wrapped in try/catch so a thrown rejection never
 *     escapes into Express' default error path (which yields a 500 with
 *     no body on Railway)
 *   - access decisions return stable reason codes (`plan_required`) so
 *     the frontend can map them to i18n strings rather than parsing
 *     human-readable messages
 */

import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';
import { hasFeature, type FeatureKey } from '../../../server/billing/features';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

function getUserId(req: Request): string | null {
  const anyReq = req as unknown as { user?: { uid?: string; claims?: { sub?: string } } };
  return anyReq.user?.uid || anyReq.user?.claims?.sub || null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function stripQuizAnswers(quizJson: string | null): unknown {
  // Lessons are public-visible once the user has the feature, but the
  // correct quiz answer index is never sent down the wire — the server
  // grades submissions in `submitQuiz`. This prevents a curl user from
  // reading the answers out of the module/lesson GET responses.
  if (!quizJson) return null;
  try {
    const parsed = JSON.parse(quizJson) as {
      questions?: Array<{ id?: string; prompt?: string; choices?: string[]; answer?: number }>;
    };
    return {
      questions: (parsed.questions ?? []).map((q) => ({
        id: q.id ?? '',
        prompt: q.prompt ?? '',
        choices: Array.isArray(q.choices) ? q.choices : [],
      })),
    };
  } catch {
    return null;
  }
}

function parseQuiz(quizJson: string | null): {
  questions: Array<{ id: string; prompt: string; choices: string[]; answer: number }>;
} | null {
  if (!quizJson) return null;
  try {
    const parsed = JSON.parse(quizJson);
    if (!parsed || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * GET /api/trading/modules
 *
 * Returns every module with its gating info so the frontend can render a
 * full catalogue (locked modules are shown but their lessons are not
 * listed here). Anonymous users see the catalogue too — they just can't
 * enter non-free modules.
 */
export async function listModules(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const modules = await deps.storage.listTradingModules();
    const results = await Promise.all(
      modules.map(async (m) => ({
        id: m.id,
        slug: m.slug,
        level: m.level,
        title: m.title,
        description: m.description,
        orderIdx: m.orderIdx,
        requiredFeature: m.requiredFeature,
        hasAccess: await hasFeature(userId, m.requiredFeature as FeatureKey),
      })),
    );
    res.json({ modules: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to list modules';
    res.status(500).json({ error: 'Failed to list modules', detail: msg });
  }
}

/**
 * GET /api/trading/modules/:slug
 *
 * Returns a single module plus its lessons — but lesson `content` and
 * `videoUrl` are redacted unless the caller has the required feature. A
 * locked caller still sees titles / durations / order so the UI can show
 * a "subscribe to unlock" list.
 */
export async function getModule(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const mod = await deps.storage.getTradingModuleBySlug(String(req.params.slug ?? ''));
    if (!mod) return res.status(404).json({ error: 'Module not found' });

    const allowed = await hasFeature(userId, mod.requiredFeature as FeatureKey);
    const lessons = await deps.storage.listTradingLessonsByModule(mod.id);

    res.json({
      module: {
        id: mod.id,
        slug: mod.slug,
        level: mod.level,
        title: mod.title,
        description: mod.description,
        requiredFeature: mod.requiredFeature,
        hasAccess: allowed,
      },
      lessons: lessons.map((l) => ({
        id: l.id,
        slug: l.slug,
        title: l.title,
        orderIdx: l.orderIdx,
        durationSeconds: l.durationSeconds,
        hasQuiz: !!l.quizJson,
        // Body + video only when the caller is allowed into the module.
        content: allowed ? l.content : null,
        videoUrl: allowed ? l.videoUrl : null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to load module';
    res.status(500).json({ error: 'Failed to load module', detail: msg });
  }
}

/**
 * GET /api/trading/lessons/:id
 *
 * Full lesson body + stripped-quiz (no answers). Gated on the module's
 * required feature.
 */
export async function getLesson(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const id = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid lesson id' });

    const lesson = await deps.storage.getTradingLessonById(id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const mod = await deps.storage.getTradingModuleById(lesson.moduleId);
    if (!mod) return res.status(404).json({ error: 'Lesson not found' });

    const allowed = await hasFeature(userId, mod.requiredFeature as FeatureKey);
    if (!allowed) {
      return res.status(403).json({
        error: 'Plan required',
        reason: 'plan_required',
        requiredFeature: mod.requiredFeature,
        module: { id: mod.id, slug: mod.slug, level: mod.level, title: mod.title },
      });
    }

    res.json({
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        slug: lesson.slug,
        title: lesson.title,
        content: lesson.content,
        videoUrl: lesson.videoUrl,
        durationSeconds: lesson.durationSeconds,
        orderIdx: lesson.orderIdx,
        quiz: stripQuizAnswers(lesson.quizJson),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to load lesson';
    res.status(500).json({ error: 'Failed to load lesson', detail: msg });
  }
}

/**
 * POST /api/trading/lessons/:id/complete
 *
 * Marks a lesson as completed (no quiz). Idempotent — re-calling updates
 * the timestamp. If the lesson has a quiz, the caller should hit
 * `/quiz` instead so the score is recorded; calling /complete on a quiz
 * lesson still works but records score = null (counts as "read, not
 * graded").
 */
export async function completeLesson(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid lesson id' });

    const lesson = await deps.storage.getTradingLessonById(id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const mod = await deps.storage.getTradingModuleById(lesson.moduleId);
    if (!mod) return res.status(404).json({ error: 'Lesson not found' });

    const allowed = await hasFeature(userId, mod.requiredFeature as FeatureKey);
    if (!allowed) {
      return res.status(403).json({ error: 'Plan required', reason: 'plan_required' });
    }

    const progress = await deps.storage.recordLessonCompletion(userId, id, null);
    const certificate = await deps.storage.issueCertificateIfEligible(userId, mod.id);

    res.status(201).json({ progress, certificate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to complete lesson';
    res.status(500).json({ error: 'Failed to complete lesson', detail: msg });
  }
}

/**
 * POST /api/trading/lessons/:id/quiz
 *
 * Accepts `{ answers: { [questionId]: number } }` and returns `{ score,
 * correct, total }`. The server grades against the authoritative quiz
 * JSON — we never trust a client-sent score.
 */
export async function submitQuiz(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid lesson id' });

    const lesson = await deps.storage.getTradingLessonById(id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const mod = await deps.storage.getTradingModuleById(lesson.moduleId);
    if (!mod) return res.status(404).json({ error: 'Lesson not found' });

    const allowed = await hasFeature(userId, mod.requiredFeature as FeatureKey);
    if (!allowed) {
      return res.status(403).json({ error: 'Plan required', reason: 'plan_required' });
    }

    const quiz = parseQuiz(lesson.quizJson);
    if (!quiz) return res.status(400).json({ error: 'Lesson has no quiz' });

    const answers = (req.body?.answers ?? {}) as Record<string, unknown>;
    let correct = 0;
    for (const q of quiz.questions) {
      const raw = answers[q.id];
      const chosen = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
      if (Number.isFinite(chosen) && chosen === q.answer) correct += 1;
    }
    const total = quiz.questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    const progress = await deps.storage.recordLessonCompletion(userId, id, score);
    const certificate = await deps.storage.issueCertificateIfEligible(userId, mod.id);

    res.status(201).json({ score, correct, total, progress, certificate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to submit quiz';
    res.status(500).json({ error: 'Failed to submit quiz', detail: msg });
  }
}

/**
 * GET /api/trading/progress
 *
 * Returns the user's full progress across all lessons plus summary stats
 * per module. Requires auth so an anonymous user can't iterate ids.
 */
export async function getProgress(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [progress, certs, modules] = await Promise.all([
      deps.storage.listUserLessonProgress(userId),
      deps.storage.listUserCertificates(userId),
      deps.storage.listTradingModules(),
    ]);

    // Build per-module summary: completed / total lessons
    const moduleStats = await Promise.all(
      modules.map(async (m) => {
        const lessons = await deps.storage.listTradingLessonsByModule(m.id);
        const lessonIds = new Set(lessons.map((l) => l.id));
        const done = progress.filter((p) => lessonIds.has(p.lessonId)).length;
        return {
          moduleId: m.id,
          slug: m.slug,
          level: m.level,
          completed: done,
          total: lessons.length,
          percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
        };
      }),
    );

    res.json({
      progress,
      certificates: certs,
      modules: moduleStats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to load progress';
    res.status(500).json({ error: 'Failed to load progress', detail: msg });
  }
}

/**
 * GET /api/trading/certificates
 *
 * Shortcut that returns just the certificates (useful for rendering the
 * "You" profile without paying for the full progress aggregation above).
 */
export async function getCertificates(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const certs = await deps.storage.listUserCertificates(userId);
    res.json({ certificates: certs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to load certificates';
    res.status(500).json({ error: 'Failed to load certificates', detail: msg });
  }
}

// Kept to satisfy callers that expect a default export later.
export default {
  injectDeps,
  listModules,
  getModule,
  getLesson,
  completeLesson,
  submitQuiz,
  getProgress,
  getCertificates,
};

// Compile-time hint: lint does not flag unused import `clampInt` (intentional — reserved for future pagination on /progress).
void clampInt;
