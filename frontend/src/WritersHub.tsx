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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { useAuth } from './contexts/AuthContext';
import { RichEditor, sanitizeRichHtml } from './components/RichEditor';
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

  const [view, setView] = useState<'landing' | 'write' | 'library' | 'drafts' | 'read'>('landing');

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); // HTML
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('fiction');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [priceEuros, setPriceEuros] = useState<number>(2);
  const [coverUrl, setCoverUrl] = useState('');

  const [library, setLibrary] = useState<ApiArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

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
      const res = await axios.get(`${API_URL}/api/writers/library`);
      // New endpoint returns `{ items, limit, offset }`; old endpoint returns
      // a bare array. Accept both so we don't break in-flight deployments.
      const raw = res.data?.items ?? res.data ?? [];
      setLibrary(Array.isArray(raw) ? raw : []);
    } catch { /* silent — empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

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
    const map = new Map<typeof CATEGORIES[number], ApiArticle[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const a of library) {
      const cat = normalizeCategory(a.category);
      map.get(cat)!.push(a);
    }
    return map;
  }, [library]);

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
      if (status === 403 && reason === 'vip_required') {
        setReadingError(t('writers.errorVipRequired', 'VIP subscription required to read this article'));
      } else if (status === 403 && reason === 'purchase_required') {
        setReadingError(t('writers.errorPurchaseRequired', 'Purchase required to read this article'));
      } else if (status === 404) {
        setReadingError(t('writers.errorNotFound', 'Article not found'));
      } else {
        setReadingError(t('writers.errorGeneric', 'Could not load article'));
      }
    }
  };

  const shareToYou = async (work: ApiArticle) => {
    if (!user) return;
    setShareBusyId(work.id);
    try {
      const link = work.slug ? `/writers/${work.slug}` : `/writers/${work.id}`;
      const bodyText = `📖 ${work.title}\n${work.excerpt || ''}\n${link}`;
      await axios.post(
        `${API_URL}/api/profile/posts`,
        { body: bodyText, imageUrl: work.coverImage || null, source: 'writers', sourceId: work.id },
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
    <div className="writers-container">
      {shareToast && <div className="writers-toast">{shareToast}</div>}

      <div className="writers-header">
        <h1 className="writers-title">{t('writers.title')}</h1>
        <div className="writers-header-tagline">{t('writers.tagline', 'Platforma dedicată scriitorilor')}</div>
        <button onClick={onClose} className="writers-close-btn" aria-label={t('writers.close', 'Close')}>✕</button>
      </div>

      <div className="writers-tabs">
        <button onClick={() => setView('landing')} className={`writers-tab ${view === 'landing' ? 'active' : ''}`}>
          🏛 {t('writers.home', 'Home')}
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
              <h2>{t('writers.heroTitle', 'Scrie. Publică. Câștigă cititori.')}</h2>
              <p>{t('writers.heroBody', 'Writers Hub este casa scriitorilor pe MaraAI — articole publice, VIP și premium, editor cu format bogat și audiența comunității într-un singur loc.')}</p>
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
                          <span>{t('writers.by')} {w.penName}</span>
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
                  <option value="vip">{t('writers.visibility.vip')}</option>
                  <option value="paid">{t('writers.visibility.paid')}</option>
                </select>
              </label>

              {visibility === 'paid' && (
                <label className="writers-field">
                  <span>{t('writers.priceLabel', 'Price (EUR)')}</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={priceEuros}
                    onChange={(e) => setPriceEuros(Number(e.target.value) || 0.5)}
                    className="writers-input"
                  />
                </label>
              )}
            </div>

            <input
              placeholder={t('writers.coverUrl')}
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="writers-input"
            />

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
            <h2 className="writers-section-title">{t('writers.libraryTitle')}</h2>
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
                          {t('writers.by')} {w.penName}
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

        {/* READ */}
        {view === 'read' && readingWork && (
          <div className="writers-reading-mode">
            <button onClick={() => setView('library')} className="writers-back-btn">
              ← {t('writers.closeReading')}
            </button>
            <div className="writers-reading-header">
              {readingWork.coverImage && (
                <div className="writers-reading-cover" style={{ backgroundImage: `url("${readingWork.coverImage}")` }} />
              )}
              <h1>{readingWork.title}</h1>
              <p className="writers-reading-author">
                {t('writers.by')} {readingWork.penName}
                {' · '}{translateCategory(readingWork.category)}
                {' · '}
                <span className={`writers-vis writers-vis-${readingWork.visibility}`}>
                  {t(`writers.visibility.${readingWork.visibility}`)}
                </span>
              </p>
            </div>

            {readingError ? (
              <div className="writers-error">{readingError}</div>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
