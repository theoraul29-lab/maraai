/**
 * Writers Hub — platformă dedicată scriitorilor.
 *
 * Phase 2 P1 rewrite:
 *  - Rich-text editor (TipTap) replaces the old plain `<textarea>` — spec
 *    calls out bold / italic / headings / images / quotes / code.
 *  - 6 categorii aliniate la spec (fiction / nonFiction / business / poetry
 *    / journal / tutorials). Vechile chei (`essay`, `drama`, `sfFantasy`,
 *    `memoir`, `script`) sunt tratate ca aliasuri on read, ca articolele
 *    publicate anterior să nu se spargă.
 *  - Visibility picker (public / VIP / paid + price) — conectează UI-ul la
 *    backend-ul pre-existent din PR E (`/api/writers` cu `visibility`).
 *  - Share-to-You: un click pe un articol postează un link-preview pe
 *    timeline-ul lui `You` (folosește `/api/profile/posts` existent).
 *  - Drafts-urile locale sunt păstrate — HTML în loc de plaintext.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { useAuth } from './contexts/AuthContext';
import { RichEditor, sanitizeRichHtml } from './components/RichEditor';
import ShareButton from './components/ShareButton';
import OrbNavStrip from './components/OrbNavStrip';
import PayPalArticleButton from './components/PayPalArticleButton';
import { copyToClipboard } from './lib/clipboard';
import './styles/WritersHub.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const DRAFTS_KEY = 'mara_writers_drafts_v2';

// Categoriile cerute explicit în spec-ul Phase 2 (plus `general` ca fallback
// pentru articole importate / seed). Ordinea dictează UI-ul (picker + chips).
const CATEGORIES = [
  'fiction',
  'nonFiction',
  'business',
  'poetry',
  'journal',
  'tutorials',
] as const;
// Aliasuri: categoriile vechi (essay/drama/etc.) se mapează la cele noi
// pentru afișare. Nu rescriem DB-ul — doar re-etichetăm.
const CATEGORY_ALIAS: Record<string, typeof CATEGORIES[number]> = {
  essay: 'nonFiction',
  drama: 'fiction',
  sfFantasy: 'fiction',
  memoir: 'journal',
  script: 'fiction',
  story: 'fiction',
};

function normalizeCategory(raw?: string | null): typeof CATEGORIES[number] {
  if (!raw) return 'fiction';
  if ((CATEGORIES as readonly string[]).includes(raw)) return raw as typeof CATEGORIES[number];
  return CATEGORY_ALIAS[raw] ?? 'fiction';
}

type Visibility = 'public' | 'vip' | 'paid';

interface ApiArticle {
  id: number;
  userId: string;
  penName: string;
  title: string;
  excerpt: string | null;
  content?: string;
  coverImage: string | null;
  category: string;
  visibility: Visibility;
  priceCents: number | null;
  currency: string;
  slug: string | null;
  readTimeMinutes: number | null;
  likes: number;
  views: number;
  publishedAt: number | null;
  createdAt: number;
}

interface Draft {
  id: string;
  title: string;
  content: string; // HTML
  category: typeof CATEGORIES[number];
  visibility: Visibility;
  priceCents: number;
  coverUrl: string;
  savedAt: number;
}

interface SalesSummary {
  totalSales: number;
  totalEarnedCents: number;
  totalSentCents: number;
  totalOwedCents: number;
  sales: Array<{
    purchaseId: number;
    pageId: number;
    pageTitle: string;
    amountCents: number;
    authorShareCents: number;
    currency: string;
    payoutStatus: string;
    createdAt: string;
  }>;
}

interface Props { onClose: () => void; }

const MAX_DRAFTS = 20;

// Tags whose closing (or self-closing) boundary we treat as a word break
// when flattening rich HTML to plain text. Without this, TipTap's typical
// `<p>Hello</p><p>World</p>` collapses to `"HelloWorld"` after tag-stripping,
// breaking excerpts, word counts, and draft previews.
const BLOCK_BOUNDARY_RE = /<\/(?:p|div|h[1-6]|li|blockquote|pre|tr|td|th|section|article|dt|dd)>|<br\s*\/?>/gi;

function htmlToPlainText(html: string): string {
  if (!html) return '';
  // 1) Insert a space after each block boundary so adjacent block content
  //    doesn't get concatenated once tags are removed.
  // 2) DOMPurify strips tags but keeps entity references intact
  //    (`&amp;` stays `&amp;`), so we round-trip through a detached DOM node
  //    and read `textContent` to get real plain text.
  const spaced = html.replace(BLOCK_BOUNDARY_RE, (m) => `${m} `);
  const stripped = DOMPurify.sanitize(spaced, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  const el = document.createElement('div');
  el.innerHTML = stripped;
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildExcerpt(html: string, max = 240): string {
  const t = htmlToPlainText(html);
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export const WritersHub: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<'landing' | 'write' | 'library' | 'drafts' | 'read' | 'sales' | 'classics'>('landing');

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); // HTML
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('fiction');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [priceEuros, setPriceEuros] = useState<number>(2);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const [library, setLibrary] = useState<ApiArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Sparks Phase 3: right after a publish succeeds, offer to record a short
  // "trailer" Spark that promotes the new article (source_kind='writers').
  // Kept deliberately minimal — a file picker, not a full composer — since
  // the full Reels/Sparks upload UI already exists elsewhere for anyone who
  // wants more control.
  const [justPublished, setJustPublished] = useState<ApiArticle | null>(null);
  const [trailerFile, setTrailerFile] = useState<File | null>(null);
  const [trailerUploading, setTrailerUploading] = useState(false);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [trailerDone, setTrailerDone] = useState(false);
  const trailerFileRef = useRef<HTMLInputElement>(null);

  // "My Sales" panel — open to any author, not just VIP/1000-follower
  // creators (see server/storage.ts's getWriterSalesSummary doc comment).
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);

  // Drafts (localStorage, per browser)
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  // Debounced autosave — avoids writing on every keystroke.
  useEffect(() => {
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch { /* quota */ }
  }, [drafts]);

  // Read mode
  const [readingWork, setReadingWork] = useState<ApiArticle | null>(null);
  const [readingBody, setReadingBody] = useState<string>('');
  const [readingError, setReadingError] = useState<string | null>(null);
  const [readingNeedsPurchase, setReadingNeedsPurchase] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);

  // Library search
  const [searchQuery, setSearchQuery] = useState('');

  // Reading progress (0-100)
  const [readProgress, setReadProgress] = useState(0);

  // Per-session like tracker — prevents spam-clicks from pushing multiple
  // +1's into the DB (backend does unconditional `likes + 1` on each POST,
  // so the guard has to live client-side until we have a real toggle API).
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  // Share state (which article id is currently "shared to You")
  const [shareBusyId, setShareBusyId] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  useEffect(() => {
    if (!shareToast) return;
    const tmo = setTimeout(() => setShareToast(null), 2500);
    return () => clearTimeout(tmo);
  }, [shareToast]);

  // Mara assistant
  const [maraPrompt, setMaraPrompt] = useState('');
  const [maraSuggestion, setMaraSuggestion] = useState('');
  const [askingMara, setAskingMara] = useState(false);

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/writers/library`, { withCredentials: true });
      // New endpoint returns `{ items, limit, offset }`; old endpoint returns
      // a bare array. Accept both so we don't break in-flight deployments.
      const raw = res.data?.items ?? res.data ?? [];
      setLibrary(Array.isArray(raw) ? raw : []);
    } catch { /* silent — empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  useEffect(() => {
    if (view !== 'sales' || !user) return;
    let cancelled = false;
    setSalesLoading(true);
    axios.get(`${API_URL}/api/writers/my-sales`, { withCredentials: true })
      .then((res) => { if (!cancelled) setSales(res.data); })
      .catch(() => { if (!cancelled) setSales(null); })
      .finally(() => { if (!cancelled) setSalesLoading(false); });
    return () => { cancelled = true; };
  }, [view, user]);

  // Lands here after a real PayPal checkout (server/modules/writers.ts's
  // captureArticlePurchase redirects to /writers-hub?payment=...&article=id)
  // — the actual purchase + payout already happened server-side by this
  // point, this just reflects the outcome in the UI and opens the article.
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (!payment) return;
    const articleIdRaw = searchParams.get('article');
    const next = new URLSearchParams(searchParams);
    next.delete('payment');
    next.delete('article');
    setSearchParams(next, { replace: true });

    if (payment === 'success') {
      setPurchaseNotice(t('writers.purchaseSuccess', 'Purchase complete — enjoy!'));
      const articleId = articleIdRaw ? Number.parseInt(articleIdRaw, 10) : NaN;
      if (Number.isFinite(articleId)) {
        axios.get(`${API_URL}/api/writers/${articleId}`, { withCredentials: true })
          .then((res) => {
            const article: ApiArticle = res.data?.article ?? res.data;
            if (article) void openReading(article);
          })
          .catch(() => {});
      }
    } else {
      setPurchaseNotice(t('writers.purchaseFailed', 'Payment did not complete. Try again.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!purchaseNotice) return;
    const tmo = setTimeout(() => setPurchaseNotice(null), 4000);
    return () => clearTimeout(tmo);
  }, [purchaseNotice]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const wordCount = useMemo(() => {
    const txt = htmlToPlainText(content);
    return txt ? txt.split(/\s+/).filter(Boolean).length : 0;
  }, [content]);

  const charCount = useMemo(() => htmlToPlainText(content).length, [content]);

  const featured = useMemo(() => library.slice(0, 3), [library]);
  const byCategory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const map = new Map<typeof CATEGORIES[number], ApiArticle[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const a of library) {
      if (q && !a.title.toLowerCase().includes(q) && !(a.penName || '').toLowerCase().includes(q)) continue;
      const cat = normalizeCategory(a.category);
      map.get(cat)!.push(a);
    }
    return map;
  }, [library, searchQuery]);

  const resetComposer = () => {
    setTitle(''); setContent(''); setCoverUrl('');
    setCategory('fiction'); setVisibility('public'); setPriceEuros(2);
    setPublishError(null);
  };

  const handlePublish = async () => {
    const cleanContent = sanitizeRichHtml(content);
    if (!title.trim() || !htmlToPlainText(cleanContent)) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: cleanContent,
        category,
        visibility,
        coverImage: coverUrl.trim() || undefined,
        excerpt: buildExcerpt(cleanContent),
        penName: user?.name || undefined,
      };
      if (visibility === 'paid') {
        body.priceCents = Math.max(50, Math.round(priceEuros * 100));
      }
      const res = await axios.post(`${API_URL}/api/writers`, body, { withCredentials: true });
      const article: ApiArticle = res.data?.article ?? res.data;
      if (article && typeof article.id === 'number') {
        setLibrary((prev) => [article, ...prev]);
        resetComposer();
        setTrailerFile(null);
        setTrailerError(null);
        setTrailerDone(false);
        setJustPublished(article);
        setView('library');
      } else {
        setPublishError(t('writers.publishFailed', 'Failed to publish'));
      }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 0;
      const detail = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      if (status === 401) {
        setPublishError(t('writers.errorAuthRequired', 'Sign in to publish'));
      } else if (status === 403) {
        setPublishError(t('writers.errorPlanBlocked', 'Your plan does not allow this visibility') +
          (detail ? ` (${detail})` : ''));
      } else {
        setPublishError(t('writers.publishFailed', 'Failed to publish'));
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleUploadTrailer = async () => {
    if (!trailerFile || !justPublished) return;
    setTrailerUploading(true);
    setTrailerError(null);
    try {
      const fd = new FormData();
      fd.append('video', trailerFile);
      fd.append('title', justPublished.title);
      fd.append('description', justPublished.excerpt || '');
      fd.append('sourceKind', 'writers');
      fd.append('sourceId', String(justPublished.id));
      await axios.post(`${API_URL}/api/reels/upload`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTrailerDone(true);
      setTrailerFile(null);
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setTrailerError(detail || t('writers.trailerFailed', 'Failed to upload trailer'));
    } finally {
      setTrailerUploading(false);
    }
  };

  const saveDraft = (silent = false) => {
    const cleanContent = sanitizeRichHtml(content);
    if (!title.trim() && !htmlToPlainText(cleanContent)) return;
    const draft: Draft = {
      id: Date.now().toString(),
      title, content: cleanContent,
      category, visibility,
      priceCents: visibility === 'paid' ? Math.max(50, Math.round(priceEuros * 100)) : 0,
      coverUrl, savedAt: Date.now(),
    };
    setDrafts((prev) => [draft, ...prev].slice(0, MAX_DRAFTS));
    if (!silent) resetComposer();
  };

  // Autosave every 30s while the editor has content.
  useEffect(() => {
    if (!title.trim() && !htmlToPlainText(content)) return;
    const timer = setInterval(() => saveDraft(true), 30_000);
    return () => clearInterval(timer);
    // We intentionally depend on the latest values — a new interval per
    // change keeps the snapshot fresh without leaking timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, category, visibility, priceEuros, coverUrl]);

  const loadDraft = (d: Draft) => {
    setTitle(d.title);
    setContent(d.content);
    setCategory(d.category);
    setVisibility(d.visibility);
    setPriceEuros(d.priceCents > 0 ? Math.max(0.5, d.priceCents / 100) : 2);
    setCoverUrl(d.coverUrl || '');
    setView('write');
  };

  const deleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const openReading = async (work: ApiArticle) => {
    setReadingWork(work);
    setReadingBody('');
    setReadingError(null);
    setReadingNeedsPurchase(false);
    setView('read');
    try {
      const res = await axios.get(`${API_URL}/api/writers/${work.id}`, { withCredentials: true });
      const article: ApiArticle = res.data?.article ?? res.data;
      if (article?.content) {
        setReadingBody(sanitizeRichHtml(article.content));
      } else {
        setReadingBody('');
      }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 0;
      const reason = axios.isAxiosError(err) ? err.response?.data?.reason : undefined;
      if (status === 403 && reason === 'purchase_required') {
        setReadingError(t('writers.errorPurchaseRequired', 'Purchase required to read this article'));
        setReadingNeedsPurchase(true);
      } else if (status === 404) {
        setReadingError(t('writers.errorNotFound', 'Article not found'));
      } else {
        setReadingError(t('writers.errorGeneric', 'Could not load article'));
      }
    }
  };

  // Re-fetches after a successful purchase so the reader sees the real
  // content immediately instead of needing a manual reload.
  const handlePurchaseSuccess = async () => {
    setPurchaseNotice(t('writers.purchaseSuccess', 'Purchase complete — enjoy!'));
    if (readingWork) await openReading(readingWork);
  };

  const shareToYou = async (work: ApiArticle) => {
    if (!user) return;
    setShareBusyId(work.id);
    try {
      const link = work.slug ? `/writers/${work.slug}` : `/writers/${work.id}`;
      const bodyText = `📖 ${work.title}\n${work.excerpt || ''}\n${link}`;
      await axios.post(
        `${API_URL}/api/profile/posts`,
        { content: bodyText, imageUrl: work.coverImage || null, source: 'writers', sourceId: work.id },
        { withCredentials: true },
      );
      setShareToast(t('writers.sharedToYou', 'Shared on your profile'));
    } catch {
      setShareToast(t('writers.shareFailed', 'Could not share'));
    } finally {
      setShareBusyId(null);
    }
  };

  const toggleLike = async (workId: number) => {
    // Short-circuit repeat clicks: backend's `likeWriterPage` unconditionally
    // increments, so without this guard a user could inflate any article's
    // like count by spamming the button.
    if (likedIds.has(workId)) return;
    setLikedIds((prev) => {
      const next = new Set(prev);
      next.add(workId);
      return next;
    });
    // Reading mode renders `readingWork.likes`, not `library[i].likes`, so
    // bump both — otherwise the counter in the reader appears frozen even
    // though the request was sent.
    setLibrary((lib) => lib.map((w) => w.id === workId ? { ...w, likes: (w.likes || 0) + 1 } : w));
    setReadingWork((prev) => (prev && prev.id === workId ? { ...prev, likes: (prev.likes || 0) + 1 } : prev));
    try {
      await axios.post(`${API_URL}/api/writers/${workId}/like`, {}, { withCredentials: true });
    } catch { /* optimistic — counter stays incremented locally */ }
  };

  const deleteArticle = async (workId: number) => {
    if (!window.confirm(t('writers.deleteConfirm'))) return;
    try {
      await axios.delete(`${API_URL}/api/writers/${workId}`, { withCredentials: true });
      setLibrary((prev) => prev.filter((w) => w.id !== workId));
      if (readingWork?.id === workId) setView('library');
    } catch { /* silent */ }
  };

  // Track reading scroll progress via the scrollable `.writers-content` container.
  useEffect(() => {
    if (view !== 'read') { setReadProgress(0); return; }
    const container = document.querySelector('.writers-content') as HTMLElement | null;
    if (!container) return;
    setReadProgress(0);
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollable = scrollHeight - clientHeight;
      setReadProgress(scrollable > 0 ? Math.round((scrollTop / scrollable) * 100) : 100);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [view, readingBody]);

  const askMaraAI = async () => {
    if (!maraPrompt.trim()) return;
    setAskingMara(true);
    try {
      const contextSnippet = htmlToPlainText(content).slice(0, 300);
      const res = await axios.post(
        `${API_URL}/api/chat`,
        {
          message: `[Mara Writers Assistant] ${maraPrompt}. Context: title="${title}", category="${category}", excerpt="${contextSnippet}"`,
          userId: user?.id || 'anon',
        },
        { withCredentials: true },
      );
      const text = res.data?.response || res.data?.message;
      setMaraSuggestion(typeof text === 'string' && text ? text : t('writers.maraNoSuggestion'));
    } catch { setMaraSuggestion(t('writers.maraError')); }
    finally { setAskingMara(false); setMaraPrompt(''); }
  };

  const insertSuggestion = () => {
    if (!maraSuggestion) return;
    // `maraSuggestion` is plain text from the chat API — HTML-escape it
    // instead of running it through DOMPurify, which would parse tag-like
    // tokens (`<section>`, `<script>`, ...) as real elements and strip them,
    // silently losing content.
    setContent((prev) => `${prev}<p>${escapeHtml(maraSuggestion)}</p>`);
    setMaraSuggestion('');
  };

  const translateCategory = (cat: string): string =>
    t(`writers.category.${normalizeCategory(cat)}`, { defaultValue: t(`writers.${cat}`, { defaultValue: cat }) });

  return (
    <div className="writers-container orbit-ambient" data-module="writers">
      {shareToast && <div className="writers-toast">{shareToast}</div>}
      {purchaseNotice && <div className="writers-toast">{purchaseNotice}</div>}

      <div className="writers-header orbit-header">
        <h1 className="writers-title">{t('writers.title')}</h1>
        <div className="writers-header-tagline">{t('writers.tagline', 'The platform for writers')}</div>
        <button onClick={onClose} className="writers-close-btn" aria-label={t('writers.close', 'Close')}>✕</button>
      </div>

      <OrbNavStrip current="writers" />

      <div className="writers-tabs">
        <button onClick={() => setView('landing')} className={`writers-tab ${view === 'landing' ? 'active' : ''}`}>
          🏛 {t('writers.home', 'Home')}
        </button>
        <button onClick={() => setView('classics')} className={`writers-tab ${view === 'classics' ? 'active' : ''}`}>
          🏛️ {t('writers.classicsTab', 'Public Library')}
        </button>
        <button onClick={() => setView('write')} className={`writers-tab ${view === 'write' ? 'active' : ''}`}>
          🖋 {t('writers.workshop')}
        </button>
        <button onClick={() => setView('library')} className={`writers-tab ${view === 'library' ? 'active' : ''}`}>
          📚 {t('writers.library')}
        </button>
        <button onClick={() => setView('drafts')} className={`writers-tab ${view === 'drafts' ? 'active' : ''}`}>
          📂 {t('writers.drafts')}
        </button>
        {user && (
          <button onClick={() => setView('sales')} className={`writers-tab ${view === 'sales' ? 'active' : ''}`}>
            💰 {t('writers.sales', 'My Sales')}
          </button>
        )}
        {readingWork && (
          <button onClick={() => setView('read')} className={`writers-tab ${view === 'read' ? 'active' : ''}`}>
            📖 {t('writers.reading')}
          </button>
        )}
      </div>

      <div className="writers-content">
        {/* LANDING */}
        {view === 'landing' && (
          <div className="writers-landing">
            <section className="writers-hero">
              <h2>{t('writers.heroTitle', 'Write. Publish. Reach readers.')}</h2>
              <p>{t('writers.heroBody', "Writers Hub is the writers' home on MaraAI — public, VIP and premium articles, a rich editor, and the community's attention all in one place.")}</p>
              <div className="writers-hero-actions">
                <button className="writers-button" onClick={() => setView('write')}>
                  ✍ {t('writers.ctaWrite', 'Start writing')}
                </button>
                <button className="writers-button secondary" onClick={() => setView('library')}>
                  📚 {t('writers.ctaExplore', 'Explore library')}
                </button>
              </div>
            </section>

            <section className="writers-chips">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="writers-chip"
                  onClick={() => { setCategory(c); setView('library'); }}
                >
                  {t(`writers.category.${c}`)}
                </button>
              ))}
            </section>

            {featured.length > 0 && (
              <section className="writers-featured">
                <h3>{t('writers.featured', 'Featured')}</h3>
                <div className="writers-featured-grid">
                  {featured.map((w) => (
                    <article key={w.id} className="writers-featured-card" onClick={() => openReading(w)}>
                      {w.coverImage && (
                        <div className="writers-featured-cover" style={{ backgroundImage: `url("${w.coverImage}")` }} />
                      )}
                      <div className="writers-featured-body">
                        <div className="writers-featured-cat">{translateCategory(w.category)}</div>
                        <h4>{w.title}</h4>
                        <p>{w.excerpt || ''}</p>
                        <div className="writers-featured-meta">
                          <span>
                            {t('writers.by')}{' '}
                            <Link
                              to={`/profile/${w.userId}?from=writers&fromId=${w.id}`}
                              className="writers-author-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {w.penName}
                            </Link>
                          </span>
                          {typeof w.readTimeMinutes === 'number' && (
                            <span>· {t('writers.readTime', '{{n}} min', { n: w.readTimeMinutes })}</span>
                          )}
                          <span className={`writers-vis writers-vis-${w.visibility}`}>{t(`writers.visibility.${w.visibility}`)}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* WRITE */}
        {view === 'write' && (
          <div className="writers-form">
            <input
              placeholder={t('writers.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="writers-input"
              maxLength={200}
            />

            <div className="writers-form-row">
              <label className="writers-field">
                <span>{t('writers.categoryLabel', 'Category')}</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
                  className="writers-select"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`writers.category.${c}`)}</option>
                  ))}
                </select>
              </label>

              <label className="writers-field">
                <span>{t('writers.visibilityLabel', 'Visibility')}</span>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                  className="writers-select"
                >
                  <option value="public">{t('writers.visibility.public')}</option>
                  <option value="paid">{t('writers.visibility.paid')}</option>
                </select>
              </label>

              {visibility === 'paid' && (
                <label className="writers-field">
                  <span>{t('writers.priceLabel', 'Price (EUR)')}</span>
                  <input
                    type="number"
                    min={0.5}
                    max={500}
                    step={0.5}
                    value={priceEuros}
                    onChange={(e) => setPriceEuros(Number(e.target.value) || 0.5)}
                    className="writers-input"
                  />
                </label>
              )}
            </div>

            {visibility === 'paid' && (
              <PayoutEmailField />
            )}

            <div className="writers-cover-uploader">
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt=""
                  style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(168,85,247,0.35)' }}
                />
              )}
              <input
                ref={coverFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setCoverUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append('image', f);
                    const res = await axios.post<{ url: string }>(
                      `${API_URL}/api/uploads/image`,
                      fd,
                      { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } },
                    );
                    setCoverUrl(res.data.url);
                  } catch {
                    setShareToast(t('writers.coverUploadFailed', 'Cover upload failed. Try a URL instead.'));
                  } finally {
                    setCoverUploading(false);
                    if (coverFileRef.current) coverFileRef.current.value = '';
                  }
                }}
              />
              <button
                type="button"
                className="writers-btn-secondary"
                disabled={coverUploading}
                onClick={() => coverFileRef.current?.click()}
              >
                {coverUploading
                  ? t('writers.uploading', 'Uploading…')
                  : t('writers.uploadCover', 'Upload cover')}
              </button>
              <input
                placeholder={t('writers.coverUrl')}
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                className="writers-input"
              />
              {coverUrl && (
                <button
                  type="button"
                  className="writers-btn-secondary"
                  onClick={() => setCoverUrl('')}
                >
                  {t('writers.removeCover', 'Remove')}
                </button>
              )}
            </div>

            <RichEditor
              initialHtml={content}
              placeholder={t('writers.contentPlaceholder')}
              onChange={setContent}
            />

            <div className="writers-word-count">
              {t('writers.wordCount', { words: wordCount, chars: charCount })}
            </div>

            {publishError && <div className="writers-error">{publishError}</div>}

            {/* Mara Assistant */}
            <div className="writers-mara-section">
              <p className="writers-mara-label">{t('writers.maraAssistant')}</p>
              <div className="writers-mara-row">
                <input
                  placeholder={t('writers.maraPromptPlaceholder')}
                  value={maraPrompt}
                  onChange={(e) => setMaraPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && askMaraAI()}
                  className="writers-input"
                />
                <button onClick={askMaraAI} disabled={askingMara} className="writers-button small">
                  {askingMara ? '…' : t('writers.inspireme')}
                </button>
              </div>
              {maraSuggestion && (
                <div className="writers-mara-suggestion">
                  <p>{maraSuggestion}</p>
                  <button onClick={insertSuggestion} className="writers-button small secondary">
                    {t('writers.insertInText')}
                  </button>
                </div>
              )}
            </div>

            <div className="writers-actions">
              <button
                onClick={handlePublish}
                disabled={publishing || !title.trim() || !htmlToPlainText(content)}
                className="writers-button"
              >
                {publishing ? t('writers.publishing') : t('writers.publish')}
              </button>
              <button onClick={() => saveDraft(false)} className="writers-button secondary">
                {t('writers.saveDraft')}
              </button>
            </div>
          </div>
        )}

        {/* LIBRARY */}
        {view === 'library' && (
          <div className="writers-library">
            <div className="writers-library-header">
              <h2 className="writers-section-title">{t('writers.libraryTitle')}</h2>
              <input
                className="writers-search-input"
                placeholder={t('writers.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {justPublished && (
              <div className="writers-trailer-card">
                <p className="writers-trailer-title">
                  {t('writers.publishedTitle', { title: justPublished.title, defaultValue: `"${justPublished.title}" is live!` })}
                </p>
                {trailerDone ? (
                  <p className="writers-trailer-done">{t('writers.trailerShared', 'Trailer Spark posted!')}</p>
                ) : (
                  <>
                    <p className="writers-trailer-hint">
                      {t('writers.trailerHint', 'Record a short Spark to help readers discover it.')}
                    </p>
                    <div className="writers-trailer-row">
                      <input
                        ref={trailerFileRef}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                        onChange={(e) => setTrailerFile(e.target.files?.[0] ?? null)}
                        className="writers-trailer-input"
                      />
                      <button
                        onClick={handleUploadTrailer}
                        disabled={!trailerFile || trailerUploading}
                        className="writers-button small"
                      >
                        {trailerUploading ? t('writers.trailerUploading', 'Uploading…') : t('writers.trailerShare', 'Share as Spark')}
                      </button>
                    </div>
                    {trailerError && <p className="writers-trailer-error">{trailerError}</p>}
                  </>
                )}
                <button onClick={() => setJustPublished(null)} className="writers-button small secondary">
                  {t('writers.dismiss', 'Dismiss')}
                </button>
              </div>
            )}

            {loading && <p className="writers-dim">{t('writers.loadingLibrary')}</p>}
            {!loading && library.length === 0 && (
              <p className="writers-dim">{t('writers.emptyLibrary')}</p>
            )}

            {CATEGORIES.map((c) => {
              const items = byCategory.get(c) || [];
              if (items.length === 0) return null;
              return (
                <section key={c} className="writers-cat-section">
                  <h3 className="writers-cat-heading">{t(`writers.category.${c}`)}</h3>
                  <div className="writers-cat-grid">
                    {items.map((w) => (
                      <article key={w.id} className="writers-manuscript-card">
                        {w.coverImage && (
                          <div className="writers-cover" style={{ backgroundImage: `url("${w.coverImage}")` }} />
                        )}
                        <div
                          className="writers-manuscript-title"
                          onClick={() => openReading(w)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && openReading(w)}
                        >
                          {w.title}
                          <span className={`writers-vis writers-vis-${w.visibility}`}>{t(`writers.visibility.${w.visibility}`)}</span>
                        </div>
                        <div className="writers-manuscript-author">
                          {t('writers.by')}{' '}
                          <Link to={`/profile/${w.userId}?from=writers&fromId=${w.id}`} className="writers-author-link">
                            {w.penName}
                          </Link>
                          {typeof w.readTimeMinutes === 'number' && (
                            <> · {t('writers.readTime', '{{n}} min', { n: w.readTimeMinutes })}</>
                          )}
                        </div>
                        <div className="writers-manuscript-content">{w.excerpt || ''}</div>
                        <div className="writers-manuscript-meta">
                          <button
                            className={`writers-like-btn ${likedIds.has(w.id) ? 'liked' : ''}`}
                            onClick={() => toggleLike(w.id)}
                            aria-label={t('writers.likes')}
                            aria-pressed={likedIds.has(w.id) ? 'true' : 'false'}
                            disabled={likedIds.has(w.id)}
                          >
                            {likedIds.has(w.id) ? '❤️' : '🤍'} {w.likes ?? 0}
                          </button>
                          <button className="writers-read-btn" onClick={() => openReading(w)}>
                            {t('writers.readMore')}
                          </button>
                          {user && (
                            <button
                              className="writers-share-btn"
                              onClick={() => shareToYou(w)}
                              disabled={shareBusyId === w.id}
                              title={t('writers.shareOnYou', 'Share on You')}
                            >
                              {shareBusyId === w.id ? '…' : '📣 ' + t('writers.shareOnYou', 'Share on You')}
                            </button>
                          )}
                          {user && w.userId === user.id && (
                            <button
                              className="writers-delete-btn"
                              onClick={() => deleteArticle(w.id)}
                              title={t('common.delete')}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* DRAFTS */}
        {view === 'drafts' && (
          <div className="writers-drafts">
            <h2 className="writers-section-title">
              {t('writers.draftsTitle', { count: drafts.length })}
            </h2>
            {drafts.length === 0 && <p className="writers-dim">{t('writers.noDrafts')}</p>}
            {drafts.map((d) => (
              <div key={d.id} className="writers-draft-card">
                <div className="writers-draft-info">
                  <h3>{d.title || t('writers.untitled')}</h3>
                  <span className="writers-draft-genre">{t(`writers.category.${d.category}`, { defaultValue: d.category })}</span>
                  <p>{htmlToPlainText(d.content).slice(0, 140)}…</p>
                  <small>{new Date(d.savedAt).toLocaleString(i18n.language)}</small>
                </div>
                <div className="writers-draft-actions">
                  <button onClick={() => loadDraft(d)} className="writers-button small">
                    {t('writers.editDraft')}
                  </button>
                  <button onClick={() => deleteDraft(d.id)} className="writers-button small danger">
                    {t('writers.deleteDraft')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SALES */}
        {view === 'sales' && (
          <div className="writers-sales">
            <h2 className="writers-section-title">{t('writers.salesTitle', 'My Sales')}</h2>
            {salesLoading && <p className="writers-dim">{t('common.loading')}</p>}
            {!salesLoading && sales && sales.totalSales === 0 && (
              <p className="writers-dim">{t('writers.noSales', "No sales yet — set a price on a paid article to start selling.")}</p>
            )}
            {!salesLoading && sales && sales.totalSales > 0 && (
              <>
                <div className="writers-sales-summary">
                  <div className="writers-sales-stat">
                    <span className="writers-sales-stat-value">{sales.totalSales}</span>
                    <span className="writers-sales-stat-label">{t('writers.salesCount', 'Sales')}</span>
                  </div>
                  <div className="writers-sales-stat">
                    <span className="writers-sales-stat-value">€{(sales.totalEarnedCents / 100).toFixed(2)}</span>
                    <span className="writers-sales-stat-label">{t('writers.salesEarned', 'Earned (90%)')}</span>
                  </div>
                  <div className="writers-sales-stat">
                    <span className="writers-sales-stat-value writers-sales-stat-value--sent">€{(sales.totalSentCents / 100).toFixed(2)}</span>
                    <span className="writers-sales-stat-label">{t('writers.salesSent', 'Sent to PayPal')}</span>
                  </div>
                  {sales.totalOwedCents > 0 && (
                    <div className="writers-sales-stat">
                      <span className="writers-sales-stat-value writers-sales-stat-value--owed">€{(sales.totalOwedCents / 100).toFixed(2)}</span>
                      <span className="writers-sales-stat-label">{t('writers.salesOwed', 'Owed (not sent yet)')}</span>
                    </div>
                  )}
                </div>
                <div className="writers-sales-list">
                  {sales.sales.map((s) => (
                    <div key={s.purchaseId} className="writers-sales-row">
                      <span className="writers-sales-row-title">{s.pageTitle}</span>
                      <span className="writers-sales-row-amount">€{(s.authorShareCents / 100).toFixed(2)}</span>
                      <span className={`writers-sales-row-status writers-sales-row-status--${s.payoutStatus}`}>
                        {s.payoutStatus === 'sent' ? t('writers.payoutSent', '✓ Sent')
                          : s.payoutStatus === 'no_payout_email' ? t('writers.payoutNoEmail', '⚠ No PayPal email')
                          : s.payoutStatus === 'failed' ? t('writers.payoutFailed', '⚠ Failed — will retry')
                          : t('writers.payoutPending', '⏳ Pending')}
                      </span>
                      <span className="writers-sales-row-date">{new Date(s.createdAt).toLocaleDateString(i18n.language)}</span>
                    </div>
                  ))}
                </div>
                {sales.totalOwedCents > 0 && (
                  <p className="writers-payout-warning" style={{ marginTop: 12 }}>
                    ⚠️ {t('writers.salesOwedHint', 'Set your PayPal email (in the composer, under "paid" visibility) so future sales — and this owed amount — can be sent.')}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* CLASSICS — Public Library (Gutendex / Project Gutenberg) */}
        {view === 'classics' && <PublicLibraryTab />}

        {/* READ */}
        {view === 'read' && readingWork && (
          <div className="writers-reading-mode">
            <div className="writers-read-progress-bar" style={{ width: `${readProgress}%` }} />
            <button onClick={() => setView('library')} className="writers-back-btn">
              ← {t('writers.closeReading')}
            </button>
            <div className="writers-reading-header">
              {readingWork.coverImage && (
                <div className="writers-reading-cover" style={{ backgroundImage: `url("${readingWork.coverImage}")` }} />
              )}
              <h1>{readingWork.title}</h1>
              <p className="writers-reading-author">
                {t('writers.by')}{' '}
                <Link to={`/profile/${readingWork.userId}?from=writers&fromId=${readingWork.id}`} className="writers-author-link">
                  {readingWork.penName}
                </Link>
                {' · '}{translateCategory(readingWork.category)}
                {' · '}
                <span className={`writers-vis writers-vis-${readingWork.visibility}`}>
                  {t(`writers.visibility.${readingWork.visibility}`)}
                </span>
              </p>
            </div>

            {readingError ? (
              <div className="writers-paywall">
                <p className="writers-error">{readingError}</p>
                {readingNeedsPurchase && (
                  <PayPalArticleButton
                    articleId={readingWork.id}
                    priceCents={readingWork.priceCents ?? 0}
                    onSuccess={handlePurchaseSuccess}
                    onError={(msg) => setPurchaseNotice(msg)}
                  />
                )}
              </div>
            ) : (
              <div
                className="writers-rich-body"
                // Sanitisation happened in openReading — this is the trusted
                // DOMPurify output, not raw server HTML.
                dangerouslySetInnerHTML={{ __html: readingBody }}
              />
            )}

            <div className="writers-reading-footer">
              <button
                className={`writers-like-btn ${likedIds.has(readingWork.id) ? 'liked' : ''}`}
                onClick={() => toggleLike(readingWork.id)}
                aria-pressed={likedIds.has(readingWork.id) ? 'true' : 'false'}
                disabled={likedIds.has(readingWork.id)}
              >
                {likedIds.has(readingWork.id) ? '❤️' : '🤍'} {readingWork.likes ?? 0} {t('writers.likes')}
              </button>
              {user && (
                <button
                  className="writers-share-btn"
                  onClick={() => shareToYou(readingWork)}
                  disabled={shareBusyId === readingWork.id}
                >
                  {shareBusyId === readingWork.id ? '…' : '📣 ' + t('writers.shareOnYou', 'Share on You')}
                </button>
              )}
              <ShareButton
                sourceModule="article"
                sourceId={readingWork.id}
                title={readingWork.title}
                caption={readingWork.title}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface LibraryBook {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  subjects: string[];
  coverUrl: string | null;
  downloadCount: number;
}

interface LibraryBookContent {
  id: number;
  title: string;
  authors: string[];
  subjects: string[];
  coverUrl: string | null;
  content: string;
  wordCount: number;
  savedByUser: boolean;
  resumePage: number | null;
}

interface MyLibraryBook {
  id: number;
  title: string;
  authors: string[];
  coverUrl: string | null;
  lastPage: number;
  totalPages: number;
  addedAt: string;
  updatedAt: string;
}

const LIBRARY_LANGS = ['ro', 'en', 'de'] as const;
// Whole paragraphs only — never split mid-paragraph — grouped up to this
// target so a page never lands mid-thought as it would with a raw character
// cut. Roughly a few printed pages per screen.
const LIBRARY_PAGE_TARGET_WORDS = 2200;
// The backend's own text-download timeout is 40s (Gutenberg's mirrors are
// slow) — this must exceed that, or the frontend gives up and shows an
// error while the backend is still legitimately working. Without ANY
// timeout here (the original bug), a stalled connection left the reader
// spinning forever with no way out except leaving the page.
const LIBRARY_READ_TIMEOUT_MS = 45_000;
const LIBRARY_SEARCH_TIMEOUT_MS = 15_000;

function paginateBookContent(content: string): string[] {
  // Confirmed against a real Gutenberg file: paragraph breaks are "\r\n\r\n"
  // (Windows line endings), not "\n\n" — the two \n in "\r\n\r\n" aren't
  // adjacent, so /\n{2,}/ never matched at all and the entire book became
  // one giant "paragraph" (and therefore one page). Normalize first.
  const normalized = content.replace(/\r\n/g, '\n');
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (currentWords > 0 && currentWords + words > LIBRARY_PAGE_TARGET_WORDS) {
      pages.push(current.join('\n\n'));
      current = [];
      currentWords = 0;
    }
    current.push(para);
    currentWords += words;
  }
  if (current.length) pages.push(current.join('\n\n'));
  return pages.length ? pages : [content];
}

/**
 * Free classic books via Gutendex (Project Gutenberg's API). Search/browse
 * always hits the live API; a book's text is fetched from Gutenberg once
 * on first read and cached server-side from then on — see
 * server/modules/library.ts for the full architecture. Kept as its own
 * component (rather than more state threaded into WritersHub) since it has
 * no dependency on the editor/drafts/sales state above.
 */
const PublicLibraryTab: React.FC = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [langFilter, setLangFilter] = useState<'' | typeof LIBRARY_LANGS[number]>('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<LibraryBook[]>([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openBook, setOpenBook] = useState<LibraryBookContent | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [openSlow, setOpenSlow] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [bookPages, setBookPages] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTurning, setPageTurning] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [savingBook, setSavingBook] = useState(false);

  const [myLibrary, setMyLibrary] = useState<MyLibraryBook[]>([]);
  const [myLibraryLoading, setMyLibraryLoading] = useState(false);
  const [showMyLibrary, setShowMyLibrary] = useState(false);

  // "Clasici români" curated shelf — a handful of hand-picked Wikisource
  // classics, shown up front regardless of the active language filter so
  // the library doesn't look empty/generic on first open. Independent of
  // the search results below; fetched once.
  const [curatedRo, setCuratedRo] = useState<LibraryBook[]>([]);
  useEffect(() => {
    axios.get(`${API_URL}/api/library/curated/ro-classics`, { timeout: LIBRARY_SEARCH_TIMEOUT_MS })
      .then((res) => setCuratedRo(Array.isArray(res.data?.books) ? res.data.books : []))
      .catch(() => { /* silent — the shelf just doesn't render */ });
  }, []);

  const fetchMyLibrary = useCallback(async () => {
    if (!user) { setMyLibrary([]); return; }
    setMyLibraryLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/library/mine`, { withCredentials: true, timeout: LIBRARY_SEARCH_TIMEOUT_MS });
      setMyLibrary(Array.isArray(res.data?.books) ? res.data.books : []);
    } catch {
      // Silent — the "continue reading" strip and My Library tab just stay empty; not worth an error banner on the main view.
    } finally {
      setMyLibraryLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchMyLibrary(); }, [fetchMyLibrary]);

  const savedIds = useMemo(() => new Set(myLibrary.map((b) => b.id)), [myLibrary]);
  const continueBook = myLibrary.length > 0 ? myLibrary[0] : null; // server orders by updated_at desc — most recently read first

  const runSearch = useCallback(async (q: string, lang: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/library/search`, {
        params: { q: q || undefined, lang: lang || undefined, page: p },
        timeout: LIBRARY_SEARCH_TIMEOUT_MS,
      });
      setResults(Array.isArray(res.data?.books) ? res.data.books : []);
      setCount(Number(res.data?.count ?? 0));
      setHasNext(Boolean(res.data?.hasNext));
    } catch {
      setResults([]);
      setError(t('writers.classicsLoadError', 'The public library is temporarily unavailable. Try again shortly.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { runSearch(query, langFilter, page); }, [langFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps
  // Initial load only — search-by-query is explicit (submit button/Enter),
  // so it isn't in the effect above (that would re-fire on every keystroke).
  useEffect(() => { runSearch('', '', 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    runSearch(query, langFilter, 1);
  };

  const openBookReader = async (id: number) => {
    setShowMyLibrary(false);
    setOpeningId(id);
    setOpenLoading(true);
    setOpenSlow(false);
    setOpenError(null);
    setOpenBook(null);
    // Most books open instantly (already cached) — this only shows once the
    // wait has gone on long enough to plausibly be a first-time download,
    // so it doesn't flash on every normal open.
    const slowTimer = window.setTimeout(() => setOpenSlow(true), 3000);
    try {
      const res = await axios.get(`${API_URL}/api/library/${id}/read`, { withCredentials: true, timeout: LIBRARY_READ_TIMEOUT_MS });
      const data: LibraryBookContent = res.data;
      const pages = paginateBookContent(data.content);
      setOpenBook(data);
      setBookPages(pages);
      const resumeIndex = data.resumePage != null ? Math.min(Math.max(data.resumePage, 0), pages.length - 1) : 0;
      setPageIndex(resumeIndex);
    } catch {
      setOpenError(t('writers.classicsOpeningError', "Couldn't open this book. Please try again."));
    } finally {
      window.clearTimeout(slowTimer);
      setOpenLoading(false);
    }
  };

  const closeReader = () => {
    setOpenBook(null);
    setBookPages([]);
    setPageIndex(0);
    setOpenError(null);
    setOpeningId(null);
    fetchMyLibrary(); // reading position may have changed
  };

  // Debounced auto-save of reading position — only for books already saved
  // to "My Library" (that's what turns a page-turn into a bookmark).
  const progressTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!openBook?.savedByUser || bookPages.length === 0) return;
    if (progressTimer.current) window.clearTimeout(progressTimer.current);
    progressTimer.current = window.setTimeout(() => {
      axios.patch(
        `${API_URL}/api/library/${openBook.id}/progress`,
        { page: pageIndex, totalPages: bookPages.length },
        { withCredentials: true, timeout: LIBRARY_SEARCH_TIMEOUT_MS },
      ).catch(() => { /* best-effort — a missed save just means resume isn't perfectly up to date */ });
    }, 800);
    return () => { if (progressTimer.current) window.clearTimeout(progressTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, openBook?.id, openBook?.savedByUser, bookPages.length]);

  const goToPage = (next: number) => {
    setPageIndex(next);
    setPageTurning(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => setPageTurning(false), 250);
  };

  // Keyboard paging — arrow keys, only while the reader is open.
  useEffect(() => {
    if (!openBook) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') goToPage(Math.min(bookPages.length - 1, pageIndex + 1));
      else if (e.key === 'ArrowLeft') goToPage(Math.max(0, pageIndex - 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBook, pageIndex, bookPages.length]);

  const handleSaveToggle = async () => {
    if (!openBook || !user) return;
    setSavingBook(true);
    try {
      if (openBook.savedByUser) {
        await axios.delete(`${API_URL}/api/library/${openBook.id}/save`, { withCredentials: true });
        setOpenBook({ ...openBook, savedByUser: false });
      } else {
        await axios.post(
          `${API_URL}/api/library/${openBook.id}/save`,
          { title: openBook.title, authors: openBook.authors, coverUrl: openBook.coverUrl },
          { withCredentials: true },
        );
        setOpenBook({ ...openBook, savedByUser: true });
      }
      fetchMyLibrary();
    } catch {
      // silent — the button just doesn't flip; not worth interrupting reading over
    } finally {
      setSavingBook(false);
    }
  };

  const handleQuickSave = async (e: React.MouseEvent | React.KeyboardEvent, book: LibraryBook) => {
    e.stopPropagation();
    if (!user) return;
    try {
      if (savedIds.has(book.id)) {
        await axios.delete(`${API_URL}/api/library/${book.id}/save`, { withCredentials: true });
      } else {
        await axios.post(
          `${API_URL}/api/library/${book.id}/save`,
          { title: book.title, authors: book.authors, coverUrl: book.coverUrl },
          { withCredentials: true },
        );
      }
      fetchMyLibrary();
    } catch {
      // silent
    }
  };

  const handleCopyPage = async () => {
    const text = bookPages[pageIndex];
    if (!text) return;
    await copyToClipboard(text);
    setCopyDone(true);
    window.setTimeout(() => setCopyDone(false), 2000);
  };

  const openFromMyLibrary = (id: number) => openBookReader(id);

  if (openLoading || openBook || openError) {
    return (
      <div className="writers-reading-mode library-reader">
        <button onClick={closeReader} className="writers-back-btn">
          ← {t('writers.classicsBack', 'Back to library')}
        </button>
        {openLoading && (
          <div className="library-open-loading">
            <p className="writers-dim">{t('writers.classicsLoading', 'Searching…')}</p>
            {openSlow && (
              <p className="writers-dim library-open-slow-hint">
                {t('writers.classicsFirstDownload', "Downloading this book for the first time — this can take up to 30 seconds. It will open instantly for everyone after this.")}
              </p>
            )}
          </div>
        )}
        {openError && (
          <div className="library-open-error">
            <p className="writers-error">{openError}</p>
            {openingId != null && (
              <button className="writers-button" onClick={() => openBookReader(openingId)}>
                {t('writers.classicsRetry', 'Try again')}
              </button>
            )}
          </div>
        )}
        {openBook && (
          <>
            <div className="writers-reading-header">
              {openBook.coverUrl && (
                <div className="writers-reading-cover" style={{ backgroundImage: `url("${openBook.coverUrl}")` }} />
              )}
              <h1>{openBook.title}</h1>
              <p className="writers-reading-author">
                {openBook.authors.length > 0 && <>{t('writers.classicsBy', 'by')} {openBook.authors.join(', ')} · </>}
                {openBook.wordCount.toLocaleString(i18n.language)} {t('writers.classicsWords', 'words')}
              </p>
              {user && (
                <button
                  type="button"
                  className={`library-save-btn ${openBook.savedByUser ? 'library-save-btn--active' : ''}`}
                  onClick={handleSaveToggle}
                  disabled={savingBook}
                >
                  {openBook.savedByUser ? `🔖 ${t('writers.classicsSaved', 'In your library')}` : `+ ${t('writers.classicsSave', 'Add to My Library')}`}
                </button>
              )}
            </div>

            <div className={`library-page-card ${pageTurning ? 'library-page-card--turning' : ''}`}>
              <div className="writers-rich-body library-book-body">
                {bookPages[pageIndex]?.split(/\n{2,}/).map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
              <div className="library-page-number">{pageIndex + 1}</div>
            </div>

            <div className="library-page-actions">
              <button type="button" className="library-copy-btn" onClick={handleCopyPage}>
                {copyDone ? `✓ ${t('writers.classicsCopied', 'Copied')}` : `⧉ ${t('writers.classicsCopyPage', 'Copy page')}`}
              </button>
              <ShareButton
                sourceModule="article"
                sourceId={openBook.id}
                title={openBook.title}
                caption={`${openBook.title} — ${t('writers.classicsPage', 'Page {{current}} of {{total}}', { current: pageIndex + 1, total: bookPages.length })}`}
                compact
              />
            </div>

            {bookPages.length > 1 && (
              <div className="library-pager">
                <button
                  className="writers-button secondary"
                  disabled={pageIndex === 0}
                  onClick={() => goToPage(Math.max(0, pageIndex - 1))}
                >
                  {t('writers.classicsPrev', '← Previous')}
                </button>
                <span className="library-pager-status">
                  {t('writers.classicsPage', 'Page {{current}} of {{total}}', { current: pageIndex + 1, total: bookPages.length })}
                </span>
                <button
                  className="writers-button"
                  disabled={pageIndex >= bookPages.length - 1}
                  onClick={() => goToPage(Math.min(bookPages.length - 1, pageIndex + 1))}
                >
                  {t('writers.classicsNext', 'Next →')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (showMyLibrary) {
    return (
      <div className="writers-classics">
        <button onClick={() => setShowMyLibrary(false)} className="writers-back-btn">
          ← {t('writers.classicsBack', 'Back to library')}
        </button>
        <h2 className="writers-section-title">{t('writers.classicsMyLibrary', 'My Library')}</h2>
        {myLibraryLoading && <p className="writers-dim">{t('common.loading')}</p>}
        {!myLibraryLoading && myLibrary.length === 0 && (
          <p className="writers-dim">{t('writers.classicsMyLibraryEmpty', "You haven't saved any books yet — open one and add it to your library.")}</p>
        )}
        {!myLibraryLoading && myLibrary.length > 0 && (
          <div className="library-grid">
            {myLibrary.map((book) => {
              const pct = book.totalPages > 0 ? Math.min(100, Math.round(((book.lastPage + 1) / book.totalPages) * 100)) : 0;
              return (
                <div key={book.id} role="button" tabIndex={0} className="library-card"
                  onClick={() => openFromMyLibrary(book.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromMyLibrary(book.id); } }}
                >
                  <div className="library-card-cover" style={book.coverUrl ? { backgroundImage: `url("${book.coverUrl}")` } : undefined}>
                    {!book.coverUrl && <span className="library-card-cover-fallback">📖</span>}
                  </div>
                  <div className="library-card-body">
                    <span className="library-card-title">{book.title}</span>
                    {book.authors.length > 0 && <span className="library-card-author">{book.authors.join(', ')}</span>}
                    {book.totalPages > 0 ? (
                      <div className="library-progress">
                        <div className="library-progress-bar"><div className="library-progress-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="library-progress-label">{t('writers.classicsProgress', '{{pct}}% read', { pct })}</span>
                      </div>
                    ) : (
                      <span className="library-card-read">{t('writers.classicsReadBtn', 'Read')} →</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="writers-classics">
      <h2 className="writers-section-title">{t('writers.classicsTitle', 'Public Library')}</h2>
      <p className="writers-dim">{t('writers.classicsSubtitle', "Thousands of free classic books from Project Gutenberg — read them right on the platform.")}</p>

      {user && (
        <div className="library-toolbar">
          <button type="button" className="writers-chip" onClick={() => setShowMyLibrary(true)}>
            📚 {t('writers.classicsMyLibrary', 'My Library')}{myLibrary.length > 0 ? ` (${myLibrary.length})` : ''}
          </button>
        </div>
      )}

      {continueBook && (
        <div role="button" tabIndex={0} className="library-continue-card"
          onClick={() => openFromMyLibrary(continueBook.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromMyLibrary(continueBook.id); } }}
        >
          <div className="library-continue-cover" style={continueBook.coverUrl ? { backgroundImage: `url("${continueBook.coverUrl}")` } : undefined}>
            {!continueBook.coverUrl && <span className="library-card-cover-fallback">📖</span>}
          </div>
          <div className="library-continue-body">
            <span className="library-continue-label">{t('writers.classicsContinue', 'Continue reading')}</span>
            <span className="library-continue-title">{continueBook.title}</span>
            {continueBook.totalPages > 0 && (
              <span className="library-continue-progress">
                {t('writers.classicsPage', 'Page {{current}} of {{total}}', { current: continueBook.lastPage + 1, total: continueBook.totalPages })}
              </span>
            )}
          </div>
          <span className="library-continue-arrow">→</span>
        </div>
      )}

      {curatedRo.length > 0 && (
        <div className="library-shelf">
          <h3 className="library-shelf-title">📚 {t('writers.classicsRoShelfTitle', 'Clasici români')}</h3>
          <div className="library-shelf-row">
            {curatedRo.map((book) => (
              <div key={book.id} role="button" tabIndex={0} className="library-shelf-card"
                onClick={() => openBookReader(book.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBookReader(book.id); } }}
              >
                <div className="library-shelf-cover">
                  <span className="library-card-cover-fallback">📖</span>
                </div>
                <span className="library-shelf-card-title">{book.title}</span>
                {book.authors.length > 0 && <span className="library-shelf-card-author">{book.authors.join(', ')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="library-search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('writers.classicsSearchPlaceholder', 'Search by title or author…')}
          className="library-search-input"
        />
        <button type="submit" className="writers-button">{t('writers.classicsSearchBtn', 'Search')}</button>
      </form>

      <div className="library-lang-chips">
        <button
          type="button"
          className={`writers-chip ${langFilter === '' ? 'active' : ''}`}
          onClick={() => { setLangFilter(''); setPage(1); }}
        >
          {t('writers.classicsAllLangs', 'All languages')}
        </button>
        {LIBRARY_LANGS.map((lang) => (
          <button
            key={lang}
            type="button"
            className={`writers-chip ${langFilter === lang ? 'active' : ''}`}
            onClick={() => { setLangFilter(lang); setPage(1); }}
          >
            {t(`writers.classicsLang${lang === 'ro' ? 'Ro' : lang === 'en' ? 'En' : 'De'}`)}
          </button>
        ))}
      </div>

      {langFilter === 'ro' && count > 0 && count < 20 && (
        <p className="writers-dim library-ro-hint">
          ℹ️ {t('writers.classicsRoHint', 'Only a few Romanian-language titles are available through this source right now — more Romanian books are being added separately.')}
        </p>
      )}

      {loading && <p className="writers-dim">{t('writers.classicsLoading', 'Searching…')}</p>}
      {!loading && error && <p className="writers-error">{error}</p>}
      {!loading && !error && results.length === 0 && (
        <p className="writers-dim">{t('writers.classicsEmpty', 'No books found. Try different search terms.')}</p>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="library-grid">
            {results.map((book) => (
              <div key={book.id} role="button" tabIndex={0} className="library-card"
                onClick={() => openBookReader(book.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBookReader(book.id); } }}
              >
                <div className="library-card-cover" style={book.coverUrl ? { backgroundImage: `url("${book.coverUrl}")` } : undefined}>
                  {!book.coverUrl && <span className="library-card-cover-fallback">📖</span>}
                  {user && (
                    <button
                      type="button"
                      className={`library-card-save ${savedIds.has(book.id) ? 'library-card-save--active' : ''}`}
                      onClick={(e) => handleQuickSave(e, book)}
                      aria-label={savedIds.has(book.id) ? t('writers.classicsSaved', 'In your library') : t('writers.classicsSave', 'Add to My Library')}
                      title={savedIds.has(book.id) ? t('writers.classicsSaved', 'In your library') : t('writers.classicsSave', 'Add to My Library')}
                    >
                      {savedIds.has(book.id) ? '🔖' : '➕'}
                    </button>
                  )}
                </div>
                <div className="library-card-body">
                  <span className="library-card-title">{book.title}</span>
                  {book.authors.length > 0 && <span className="library-card-author">{book.authors.join(', ')}</span>}
                  <span className="library-card-read">{t('writers.classicsReadBtn', 'Read')} →</span>
                </div>
              </div>
            ))}
          </div>
          {(page > 1 || hasNext) && (
            <div className="library-pager">
              <button className="writers-button secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('writers.classicsPrev', '← Previous')}
              </button>
              <span className="library-pager-status">{count.toLocaleString(i18n.language)}</span>
              <button className="writers-button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
                {t('writers.classicsNext', 'Next →')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Where a writer sets the PayPal address their 90% share gets sent to —
 * shown inline in the composer once "paid" visibility is picked. One-time
 * setup, reused for every future sale (server/modules/writers.ts's
 * captureArticlePurchase reads it at payout time, not at publish time, so
 * saving it here doesn't require republishing anything already live).
 */
const PayoutEmailField: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/writers/payout-email`, { withCredentials: true })
      .then((res) => {
        if (cancelled) return;
        const value: string | null = res.data?.paypalPayoutEmail ?? null;
        setSaved(value);
        setEmail(value ?? '');
      })
      .catch(() => { /* leave the field empty — not fatal, they can still type one in */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.patch(`${API_URL}/api/writers/payout-email`, { email }, { withCredentials: true });
      setSaved(res.data?.paypalPayoutEmail ?? email);
    } catch {
      setError(t('writers.payoutEmailError', 'Could not save PayPal email — check it looks right and try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="writers-payout-field">
      <span className="writers-payout-label">
        💸 {t('writers.payoutEmailLabel', 'PayPal email for payouts — you keep 90% of every sale, sent automatically')}
      </span>
      <div className="writers-payout-row">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="writers-input"
        />
        <button
          type="button"
          className="writers-btn-secondary"
          onClick={handleSave}
          disabled={saving || !email.trim() || email === saved}
        >
          {saving ? t('writers.saving', 'Saving…') : t('writers.savePayoutEmail', 'Save')}
        </button>
      </div>
      {saved ? (
        <p className="writers-payout-saved">✓ {t('writers.payoutEmailSaved', 'Payouts go to {{email}}', { email: saved })}</p>
      ) : (
        <p className="writers-payout-warning">⚠️ {t('writers.payoutEmailMissing', "Set this before anyone buys your paid content, or your share can't be sent yet.")}</p>
      )}
      {error && <p className="writers-error">{error}</p>}
    </div>
  );
};
