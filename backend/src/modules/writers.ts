/**
 * Writers Hub (PR E).
 *
 * Backend API for user-authored articles with three visibility tiers:
 *
 *   - `public`: readable by anyone (anon or signed in).
 *   - `vip`:    readable by users whose active plan grants `writers.read_vip`.
 *               VIP / Creator plans qualify today; free / Pro do not.
 *   - `paid`:   readable only by users who have purchased this specific
 *               article. Author sets a price in cents; revenue share is
 *               70% author / 30% platform (see `CREATOR_REVENUE_SHARE`).
 *
 * Publishing permissions are feature-gated (`writers.publish_public`,
 * `writers.publish_vip`, `writers.publish_paid`) so the plan catalogue is the
 * single source of truth for who can do what.
 *
 * Payments are deliberately feature-flagged: when `PAYMENTS_ENABLED` is not
 * `true`, `/purchase` returns 501 instead of attempting a real charge. The
 * purchase record itself is still written when the flag is flipped on, so
 * author/platform shares are accounted for from day one.
 *
 * Scope explicitly deferred:
 *   - No rich-text / markdown sanitisation (author-submitted HTML is NOT
 *     trusted; we store raw content and render on the client with the same
 *     nosniff + CSP posture we use for reels static files). Proper
 *     server-side sanitisation comes in the Writers UI PR.
 *   - No draft auto-save endpoint; drafts live in localStorage on the client
 *     until the author hits "publish".
 *   - No full-text search infrastructure; we fall back to LIKE queries.
 */

import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';
import { notifyWriterComment, notifyWriterLike } from '../../../server/notifications/producer.js';
import {
  getActivePlanId,
  hasFeature,
  type FeatureKey,
} from '../../../server/billing/features';
import { CREATOR_REVENUE_SHARE } from '../../../server/billing/plans';

let deps: {
  storage: IStorage;
};

export function injectDeps(d: typeof deps) {
  deps = d;
}

// --- Helpers -----------------------------------------------------------------

function getUserId(req: Request): string | null {
  return (req as any).user?.uid ?? null;
}

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const adminIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
}

const VISIBILITIES = new Set(['public', 'vip', 'paid']);
type Visibility = 'public' | 'vip' | 'paid';

const VISIBILITY_TO_FEATURE: Record<Visibility, FeatureKey> = {
  public: 'writers.publish_public',
  vip: 'writers.publish_vip',
  paid: 'writers.publish_paid',
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Slug safe for URLs. Strips anything outside `[a-z0-9-]` and collapses
 * hyphens. If the source title is non-Latin (e.g. Arabic, Japanese) we fall
 * back to a short random slug so we never end up with an empty key.
 */
function slugify(title: string, id: number): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const suffix = id.toString(36);
  return base ? `${base}-${suffix}` : `article-${suffix}`;
}

function computeReadTimeMinutes(content: string): number {
  // ~200 wpm is the usual "average adult reading speed" constant. We use it
  // as a rough heuristic; the client can show "~N min read".
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Resolve whether the user can *read* a given article. Returns a tagged
 * object so callers can either allow the read or respond with a precise
 * reason (used both by the single-article endpoint and the access check
 * endpoint that UIs call before rendering a paywall).
 */
async function resolveReadAccess(
  userId: string | null,
  page: {
    id: number;
    userId: string;
    visibility: string;
    published: number;
  },
): Promise<{ allowed: true } | { allowed: false; reason: 'draft' | 'vip_required' | 'purchase_required' | 'unknown_visibility' }> {
  // Authors always see their own drafts + full text.
  if (userId && userId === page.userId) return { allowed: true };
  // Admins see everything.
  if (isAdmin(userId)) return { allowed: true };

  if (!page.published) return { allowed: false, reason: 'draft' };

  const vis = page.visibility as Visibility;
  if (vis === 'public') return { allowed: true };

  if (vis === 'vip') {
    const ok = await hasFeature(userId, 'writers.read_vip');
    return ok ? { allowed: true } : { allowed: false, reason: 'vip_required' };
  }

  if (vis === 'paid') {
    if (!userId) return { allowed: false, reason: 'purchase_required' };
    const purchased = await deps.storage.hasPurchasedWriterPage(userId, page.id);
    return purchased
      ? { allowed: true }
      : { allowed: false, reason: 'purchase_required' };
  }

  return { allowed: false, reason: 'unknown_visibility' };
}

// --- Handlers ---------------------------------------------------------------

export async function listLibrary(req: Request, res: Response) {
  try {
    const limit = clampInt(req.query.limit, 1, 100, 20);
    const offset = clampInt(req.query.offset, 0, 10_000, 0);
    const visibilityQ = String(req.query.visibility ?? 'all');
    const visibility: 'public' | 'vip' | 'paid' | 'all' = (
      VISIBILITIES.has(visibilityQ) ? (visibilityQ as Visibility) : 'all'
    );
    const category = (req.query.category as string | undefined)?.trim() || undefined;
    const authorId = (req.query.authorId as string | undefined)?.trim() || undefined;
    const search = (req.query.search as string | undefined)?.trim() || undefined;

    const pages = await deps.storage.getWriterLibrary({
      limit,
      offset,
      visibility,
      category,
      authorId,
      search,
    });

    // Library response never includes paywalled body text. Paid articles
    // expose title + excerpt + price + cover only; full content fetches go
    // through /api/writers/:id which does the access check.
    const items = pages.map((p) => ({
      id: p.id,
      userId: p.userId,
      penName: p.penName,
      title: p.title,
      excerpt: p.excerpt,
      coverImage: p.coverImage,
      category: p.category,
      visibility: p.visibility,
      priceCents: p.priceCents,
      currency: p.currency,
      slug: p.slug,
      readTimeMinutes: p.readTimeMinutes,
      likes: p.likes,
      views: p.views,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
    }));

    res.json({ items, limit, offset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to list library';
    res.status(500).json({ error: 'Failed to list writers library', detail: msg });
  }
}

export async function getArticle(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const idOrSlug = String(req.params.idOrSlug ?? '').trim();
    if (!idOrSlug) return res.status(400).json({ error: 'Missing article id or slug' });

    // Numeric → id lookup; anything else → slug lookup.
    const asInt = Number.parseInt(idOrSlug, 10);
    const page = Number.isFinite(asInt) && String(asInt) === idOrSlug
      ? await deps.storage.getWriterPageById(asInt)
      : await deps.storage.getWriterPageBySlug(idOrSlug);

    if (!page) return res.status(404).json({ error: 'Article not found' });

    const access = await resolveReadAccess(userId, page);
    if (!access.allowed) {
      // Drafts must be indistinguishable from missing rows — returning any
      // metadata (title, excerpt, cover) would let an unauthenticated user
      // enumerate ids and scrape unpublished content.
      if (access.reason === 'draft') {
        return res.status(404).json({ error: 'Article not found' });
      }
      // Paywalled / VIP-only: reply with enough metadata for the client to
      // render the paywall (title, excerpt, price, reason) but never the body.
      return res.status(403).json({
        error: 'Access denied',
        reason: access.reason,
        article: {
          id: page.id,
          title: page.title,
          excerpt: page.excerpt,
          coverImage: page.coverImage,
          visibility: page.visibility,
          priceCents: page.priceCents,
          currency: page.currency,
          penName: page.penName,
        },
      });
    }

    // Best-effort view increment; failure must not break the read.
    deps.storage.viewWriterPage(page.id).catch(() => {});

    res.json({ article: page });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to fetch article';
    res.status(500).json({ error: 'Failed to fetch article', detail: msg });
  }
}

export async function publishArticle(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const content = String(body.content ?? '').trim();
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const visibilityRaw = String(body.visibility ?? 'public');
    if (!VISIBILITIES.has(visibilityRaw)) {
      return res.status(400).json({ error: 'Invalid visibility' });
    }
    const visibility = visibilityRaw as Visibility;

    // Publishing into a given tier requires the matching feature.
    const okPublish = await hasFeature(userId, VISIBILITY_TO_FEATURE[visibility]);
    if (!okPublish) {
      return res.status(403).json({
        error: 'Plan does not allow publishing at this visibility',
        required: VISIBILITY_TO_FEATURE[visibility],
      });
    }

    let priceCents: number | null = null;
    if (visibility === 'paid') {
      const raw = Number.parseInt(String(body.priceCents ?? ''), 10);
      if (!Number.isFinite(raw) || raw < 50) {
        // 0.50 EUR minimum to avoid absurd micro-prices the payment
        // processor would reject anyway.
        return res.status(400).json({ error: 'priceCents must be >= 50 for paid articles' });
      }
      priceCents = Math.min(raw, 100_00); // hard cap 100 EUR per article
    }

    const penName = String(body.penName ?? '').trim().slice(0, 60) || 'Anonymous';
    const category = String(body.category ?? 'story').trim().slice(0, 40) || 'story';
    const coverImage = String(body.coverImage ?? '').trim().slice(0, 2000) || null;
    const excerpt = String(body.excerpt ?? '').trim().slice(0, 500)
      || content.slice(0, 240).replace(/\s+/g, ' ') + (content.length > 240 ? '…' : '');
    const readTimeMinutes = computeReadTimeMinutes(content);

    // Two-phase insert: create the row first (we need the id for a stable
    // slug), then patch with slug + published markers.
    const created = await deps.storage.createWriterPage({
      userId,
      penName,
      title: title.slice(0, 200),
      content,
      coverImage,
      category,
      visibility,
      priceCents: priceCents ?? undefined,
      currency: 'EUR',
      excerpt,
      slug: null as unknown as string,
      readTimeMinutes,
    } as any);

    const slug = slugify(title, created.id);
    const patched = await deps.storage.updateWriterPage(created.id, userId, {
      slug,
      published: true,
    });

    res.status(201).json({ article: patched ?? created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to publish';
    res.status(500).json({ error: 'Failed to publish article', detail: msg });
  }
}

export async function updateArticle(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });

    const existing = await deps.storage.getWriterPageById(id);
    if (!existing) return res.status(404).json({ error: 'Article not found' });

    const admin = isAdmin(userId);
    if (existing.userId !== userId && !admin) {
      return res.status(403).json({ error: 'Not the author' });
    }

    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200);
    if (typeof body.content === 'string') {
      patch.content = body.content;
      patch.readTimeMinutes = computeReadTimeMinutes(body.content);
    }
    if (typeof body.excerpt === 'string') patch.excerpt = body.excerpt.trim().slice(0, 500);
    if (typeof body.coverImage === 'string') patch.coverImage = body.coverImage.trim().slice(0, 2000);
    if (typeof body.category === 'string') patch.category = body.category.trim().slice(0, 40);
    if (typeof body.visibility === 'string' && VISIBILITIES.has(body.visibility)) {
      const vis = body.visibility as Visibility;
      // Changing visibility requires the matching publish capability, same
      // rules as initial publish.
      const ok = await hasFeature(userId, VISIBILITY_TO_FEATURE[vis]);
      if (!ok && !admin) {
        return res.status(403).json({
          error: 'Plan does not allow this visibility',
          required: VISIBILITY_TO_FEATURE[vis],
        });
      }
      patch.visibility = vis;
    }
    if (typeof body.priceCents === 'number' && Number.isFinite(body.priceCents)) {
      // Same floor as publish: 0.50 EUR minimum, 100 EUR cap. Preventing 0
      // here is critical — a 0-cent paid article would paywall the content
      // while letting anyone "purchase" it for free and unlock full access.
      patch.priceCents = Math.min(Math.max(body.priceCents, 50), 100_00);
    }
    if (typeof body.published === 'boolean') {
      patch.published = body.published;
    }

    // Cross-field check: whenever the article ends up as `paid` after this
    // PATCH, it must have a valid price. Otherwise an author could create a
    // public article (priceCents=null), then PATCH only { visibility: 'paid' }
    // and turn it into a 0-cent paywall — purchaseArticle falls back to 0
    // and anyone unlocks full access for free.
    const effectiveVisibility = (patch.visibility ?? existing.visibility) as string;
    const effectivePrice =
      (patch.priceCents as number | undefined) ?? (existing.priceCents ?? null);
    if (effectiveVisibility === 'paid' && (!effectivePrice || effectivePrice < 50)) {
      return res.status(400).json({ error: 'priceCents must be >= 50 for paid articles' });
    }

    const updated = await deps.storage.updateWriterPage(
      id,
      userId,
      patch,
      { isAdmin: admin },
    );
    if (!updated) return res.status(404).json({ error: 'Article not found' });
    res.json({ article: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to update';
    res.status(500).json({ error: 'Failed to update article', detail: msg });
  }
}

export async function deleteArticle(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });

    const ok = await deps.storage.deleteWriterPage(id, userId, {
      isAdmin: isAdmin(userId),
    });
    if (!ok) return res.status(404).json({ error: 'Article not found or not owned' });
    res.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to delete';
    res.status(500).json({ error: 'Failed to delete article', detail: msg });
  }
}

export async function likeArticle(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });
    const out = await deps.storage.likeWriterPage(id);
    const userId = getUserId(req);
    if (userId) {
      try {
        const page = await deps.storage.getWriterPageById(id);
        if (page?.userId && page.userId !== userId) {
          void notifyWriterLike({
            articleOwnerId: page.userId,
            likerId: userId,
            articleId: id,
          });
        }
      } catch {
        /* best-effort */
      }
    }
    res.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to like';
    res.status(500).json({ error: 'Failed to like article', detail: msg });
  }
}

export async function listComments(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });
    const limit = clampInt(req.query.limit, 1, 500, 100);

    // Comment threads must follow the same read-access rules as the article
    // body. Otherwise an anon user could scrape comments on paywalled / VIP
    // articles (potentially leaking excerpts quoted back in comments) or
    // enumerate drafts via their comment lists.
    const page = await deps.storage.getWriterPageById(id);
    if (!page) return res.status(404).json({ error: 'Article not found' });

    const access = await resolveReadAccess(userId, page);
    if (!access.allowed) {
      if (access.reason === 'draft') {
        return res.status(404).json({ error: 'Article not found' });
      }
      return res.status(403).json({ error: 'Access denied', reason: access.reason });
    }

    const comments = await deps.storage.listWriterComments(id, limit);
    res.json({ comments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to list comments';
    res.status(500).json({ error: 'Failed to list comments', detail: msg });
  }
}

export async function createComment(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });

    const raw = String(req.body?.content ?? req.body?.text ?? '').trim();
    if (!raw) return res.status(400).json({ error: 'Empty comment' });
    if (raw.length > 2000) return res.status(400).json({ error: 'Comment too long (max 2000 chars)' });

    const page = await deps.storage.getWriterPageById(id);
    if (!page) return res.status(404).json({ error: 'Article not found' });

    // Gate comments on articles the user cannot even read, so a paywall
    // doesn't leak comment threads.
    const access = await resolveReadAccess(userId, page);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Cannot comment on locked article', reason: access.reason });
    }

    const created = await deps.storage.createWriterComment({
      pageId: id,
      userId,
      content: raw,
    });
    if (page.userId && page.userId !== userId) {
      void notifyWriterComment({
        articleOwnerId: page.userId,
        commenterId: userId,
        articleId: id,
        commentPreview: raw,
      });
    }
    res.status(201).json({ comment: created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to create comment';
    res.status(500).json({ error: 'Failed to create comment', detail: msg });
  }
}

export async function deleteComment(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const commentId = Number.parseInt(req.params.commentId, 10);
    if (!Number.isFinite(commentId)) return res.status(400).json({ error: 'Invalid comment id' });

    const ok = await deps.storage.deleteWriterComment(commentId, userId, isAdmin(userId));
    if (!ok) return res.status(404).json({ error: 'Comment not found or not owned' });
    res.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to delete comment';
    res.status(500).json({ error: 'Failed to delete comment', detail: msg });
  }
}

export async function getAccess(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });
    const page = await deps.storage.getWriterPageById(id);
    if (!page) return res.status(404).json({ error: 'Article not found' });
    const access = await resolveReadAccess(userId, page);
    // Drafts must be indistinguishable from missing rows — same treatment as
    // getArticle. Otherwise an attacker could iterate numeric ids against
    // /access to enumerate unpublished drafts and read their visibility tier
    // / price tag before they go live.
    if (!access.allowed && access.reason === 'draft') {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json({
      hasAccess: access.allowed,
      reason: access.allowed ? null : access.reason,
      article: {
        id: page.id,
        visibility: page.visibility,
        priceCents: page.priceCents,
        currency: page.currency,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to resolve access';
    res.status(500).json({ error: 'Failed to resolve access', detail: msg });
  }
}

export async function purchaseArticle(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid article id' });

    const page = await deps.storage.getWriterPageById(id);
    // Drafts must be indistinguishable from missing rows here too — otherwise
    // an attacker could call /purchase on guessed ids and use the response
    // (400 "not paywalled" vs 404) to learn which drafts exist and even
    // leak their tier / price metadata once published-but-drafted.
    if (!page || !page.published) {
      return res.status(404).json({ error: 'Article not found' });
    }
    if (page.visibility !== 'paid') {
      return res.status(400).json({ error: 'Article is not paywalled' });
    }
    if (page.userId === userId) {
      return res.status(400).json({ error: 'Cannot purchase your own article' });
    }
    const already = await deps.storage.hasPurchasedWriterPage(userId, id);
    if (already) return res.status(200).json({ purchased: true, alreadyOwned: true });

    // Purchase recording is gated behind TWO separate flags to avoid any
    // possibility of a user unlocking paid content without a real charge:
    //
    //   - PAYMENTS_ENABLED=true       → user has configured Stripe/PayPal
    //     keys and a real webhook. In this case /purchase is a no-op here;
    //     the purchase row is written by the provider webhook handler
    //     (shipping in the Stripe/PayPal PR) *after* the charge clears.
    //     We return 501 from this endpoint to make it very obvious the
    //     charge path has not run yet.
    //
    //   - PAYMENTS_TEST_MODE=true     → explicit CI / local-dev override.
    //     When this is set, the endpoint will directly record a purchase
    //     row with the 70/30 split so we can smoke-test the paywall flow
    //     without a real provider. NEVER set this in production.
    //
    // If neither flag is set, 501 as before.
    const enabled = (process.env.PAYMENTS_ENABLED || '').toLowerCase() === 'true';
    const testMode = (process.env.PAYMENTS_TEST_MODE || '').toLowerCase() === 'true';

    if (!enabled && !testMode) {
      return res.status(501).json({
        error: 'Payments not enabled yet',
        hint: 'Set PAYMENTS_ENABLED=true and configure Stripe/PayPal keys.',
      });
    }

    if (enabled && !testMode) {
      // Real payments live — the purchase row is written by the provider
      // webhook, NOT by this endpoint. Returning 501 here prevents the
      // "set the flag and unlock every paid article" foot-gun.
      return res.status(501).json({
        error: 'Direct purchase recording disabled under PAYMENTS_ENABLED',
        hint: 'Complete checkout via Stripe/PayPal — the purchase row is written by the webhook after the charge clears.',
      });
    }

    // PAYMENTS_TEST_MODE=true path: record directly with the 70/30 split.
    // This is the only path in PR E that writes a purchase row and is
    // explicitly documented as dev/CI-only.
    const amountCents = page.priceCents ?? 0;
    const authorShare = Math.floor(amountCents * CREATOR_REVENUE_SHARE);
    const platformShare = amountCents - authorShare;

    const purchase = await deps.storage.createWriterPurchase({
      pageId: id,
      userId,
      amountCents,
      currency: page.currency,
      provider: String(req.body?.provider ?? 'stub'),
      providerRef: String(req.body?.providerRef ?? '') || null,
      authorShareCents: authorShare,
      platformShareCents: platformShare,
    });

    res.status(201).json({ purchased: true, purchase, testMode: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to purchase';
    res.status(500).json({ error: 'Failed to purchase', detail: msg });
  }
}

export async function listMyPurchases(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const purchases = await deps.storage.getWriterPurchasesByUser(userId);
    res.json({ purchases });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to list purchases';
    res.status(500).json({ error: 'Failed to list purchases', detail: msg });
  }
}

export async function listMyPages(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const pages = await deps.storage.getWriterPages(userId);
    res.json({ items: pages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to list my pages';
    res.status(500).json({ error: 'Failed to list pages', detail: msg });
  }
}
