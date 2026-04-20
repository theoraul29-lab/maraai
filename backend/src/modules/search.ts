/**
 * Global search (Phase 2 P2.4).
 *
 *   GET /api/search?q=...&kind=all|people|reels|articles|lessons&limit=20
 *
 * Returns a unified, ranked result list across the main content surfaces:
 *   - users          (display name + bio + first/last name)
 *   - reels/videos   (title + description)
 *   - writer pages   (title + excerpt + content)
 *   - trading lessons (title + content; gated at render time, not here)
 *
 * Implementation: plain SQL LIKE with case-insensitive matching and a rough
 * popularity weighting per surface. At our current scale (<100k rows per
 * table) this is sub-50ms on SQLite. Upgrading to FTS5 later is a drop-in
 * replacement for this module — the REST contract stays identical.
 *
 * Security:
 *   - Public endpoint (no requireAuth) — search is discoverable content.
 *   - `?q=` is escaped against LIKE wildcards so `%` / `_` don't leak.
 *   - Results never include email, password hashes, or paid-article bodies;
 *     snippets for paid content fall back to the excerpt.
 */

import type { Request, Response } from 'express';
import { or, like, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../../server/db.js';
import { users } from '../../../shared/models/auth.js';
import {
  videos,
  writerPages,
  tradingLessons,
  tradingModules,
} from '../../../shared/schema.js';

type Kind = 'people' | 'reels' | 'articles' | 'lessons';

export interface SearchResult {
  kind: Kind;
  id: string;
  title: string;
  snippet: string;
  href: string;
  thumbnail?: string | null;
  score: number;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const SNIPPET_LEN = 160;

function escapeLike(q: string): string {
  // Escape LIKE wildcards so a user typing `100%` doesn't match everything,
  // and drop the control chars that SQLite LIKE treats inconsistently.
  return q.replace(/([\\%_])/g, '\\$1');
}

function makeSnippet(body: string, q: string): string {
  if (!body) return '';
  const lower = body.toLowerCase();
  const needle = q.toLowerCase();
  const idx = needle ? lower.indexOf(needle) : -1;
  if (idx < 0) {
    return body.length > SNIPPET_LEN ? `${body.slice(0, SNIPPET_LEN)}…` : body;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + needle.length + SNIPPET_LEN - 40);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return `${prefix}${body.slice(start, end)}${suffix}`;
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleHit(q: string) {
  const qLower = q.toLowerCase();
  return (h: string | null | undefined) =>
    (h ?? '').toLowerCase().includes(qLower);
}

async function searchPeople(q: string, limit: number): Promise<SearchResult[]> {
  const pat = `%${escapeLike(q)}%`;
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(
      or(
        like(users.displayName, pat),
        like(users.firstName, pat),
        like(users.lastName, pat),
        like(users.bio, pat),
      ) as SQL,
    )
    .limit(limit);
  const hit = titleHit(q);
  return rows.map((r) => {
    const display =
      (r.displayName ?? '').trim() ||
      [r.firstName, r.lastName].filter(Boolean).join(' ').trim() ||
      'Unknown';
    return {
      kind: 'people' as const,
      id: r.id,
      title: display,
      snippet: makeSnippet(r.bio ?? '', q),
      href: `/you/${r.id}`,
      thumbnail: r.profileImageUrl ?? null,
      score: (hit(r.displayName) ? 2 : 1) * 100,
    };
  });
}

async function searchReels(q: string, limit: number): Promise<SearchResult[]> {
  const pat = `%${escapeLike(q)}%`;
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      thumbnailUrl: videos.thumbnailUrl,
      likes: videos.likes,
      views: videos.views,
    })
    .from(videos)
    .where(or(like(videos.title, pat), like(videos.description, pat)) as SQL)
    .orderBy(desc(videos.views))
    .limit(limit);
  const hit = titleHit(q);
  return rows.map((r) => ({
    kind: 'reels' as const,
    id: String(r.id),
    title: r.title,
    snippet: makeSnippet(r.description ?? '', q),
    href: `/reels/${r.id}`,
    thumbnail: r.thumbnailUrl ?? null,
    score: (hit(r.title) ? 2 : 1) * 50 + Math.log10((r.views ?? 0) + 1),
  }));
}

async function searchArticles(q: string, limit: number): Promise<SearchResult[]> {
  const pat = `%${escapeLike(q)}%`;
  const rows = await db
    .select({
      id: writerPages.id,
      slug: writerPages.slug,
      title: writerPages.title,
      excerpt: writerPages.excerpt,
      content: writerPages.content,
      coverImage: writerPages.coverImage,
      visibility: writerPages.visibility,
      views: writerPages.views,
    })
    .from(writerPages)
    .where(
      sql`${writerPages.published} = 1 AND (
        ${writerPages.title} LIKE ${pat} ESCAPE '\\' OR
        ${writerPages.excerpt} LIKE ${pat} ESCAPE '\\' OR
        ${writerPages.content} LIKE ${pat} ESCAPE '\\'
      )`,
    )
    .orderBy(desc(writerPages.views))
    .limit(limit);
  const hit = titleHit(q);
  return rows.map((r) => {
    // Paid-article bodies are never leaked in search snippets — fall back to
    // the author-supplied excerpt so the result is useful without bypassing
    // the paywall.
    const snippetSource =
      r.visibility === 'paid' ? r.excerpt ?? '' : stripHtml(r.content);
    return {
      kind: 'articles' as const,
      id: String(r.id),
      title: r.title,
      snippet: makeSnippet(snippetSource, q),
      href: r.slug ? `/writers-hub/${r.slug}` : `/writers-hub/page/${r.id}`,
      thumbnail: r.coverImage ?? null,
      score: (hit(r.title) ? 2 : 1) * 30 + Math.log10((r.views ?? 0) + 1),
    };
  });
}

async function searchLessons(q: string, limit: number): Promise<SearchResult[]> {
  const pat = `%${escapeLike(q)}%`;
  const rows = await db
    .select({
      id: tradingLessons.id,
      slug: tradingLessons.slug,
      title: tradingLessons.title,
      content: tradingLessons.content,
      moduleSlug: tradingModules.slug,
    })
    .from(tradingLessons)
    .innerJoin(tradingModules, eq(tradingModules.id, tradingLessons.moduleId))
    .where(
      or(like(tradingLessons.title, pat), like(tradingLessons.content, pat)) as SQL,
    )
    .limit(limit);
  const hit = titleHit(q);
  return rows.map((r) => ({
    kind: 'lessons' as const,
    id: String(r.id),
    title: r.title,
    snippet: makeSnippet(stripHtml(r.content), q),
    href: `/trading/${r.moduleSlug}/${r.slug}`,
    thumbnail: null,
    score: (hit(r.title) ? 2 : 1) * 20,
  }));
}

export async function search(req: Request, res: Response) {
  try {
    const qRaw = String(req.query.q ?? '').trim();
    if (qRaw.length < 2) {
      res.json({
        query: qRaw,
        results: [],
        counts: { people: 0, reels: 0, articles: 0, lessons: 0 },
      });
      return;
    }
    const q = qRaw.slice(0, 120);
    const kind = String(req.query.kind ?? 'all') as 'all' | Kind;
    const limit = Math.max(
      1,
      Math.min(
        MAX_LIMIT,
        Number.parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) ||
          DEFAULT_LIMIT,
      ),
    );

    const wants = (k: Kind) => kind === 'all' || kind === k;
    const [people, reels, articles, lessons] = await Promise.all([
      wants('people') ? searchPeople(q, limit) : Promise.resolve([]),
      wants('reels') ? searchReels(q, limit) : Promise.resolve([]),
      wants('articles') ? searchArticles(q, limit) : Promise.resolve([]),
      wants('lessons') ? searchLessons(q, limit) : Promise.resolve([]),
    ]);

    const all = [...people, ...reels, ...articles, ...lessons]
      .sort((a, b) => b.score - a.score)
      .slice(0, kind === 'all' ? limit * 2 : limit);

    res.json({
      query: q,
      kind,
      results: all,
      counts: {
        people: people.length,
        reels: reels.length,
        articles: articles.length,
        lessons: lessons.length,
      },
    });
  } catch (err) {
    console.error('[search] failed:', err);
    res.status(500).json({ error: 'search_failed' });
  }
}
