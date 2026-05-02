import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import './styles/WritersHub.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const DRAFTS_KEY = 'mara_writers_drafts';

interface Comment { id: number; user: string; text: string; date: string; }
interface Manuscript {
  id: number;
  title: string;
  content: string;
  author: string;    // mapped from penName
  likes: number;
  genre: string;     // mapped from category
  comments: Comment[];
  coverUrl?: string; // mapped from coverImage
}

/** Map a raw backend article row to the Manuscript shape used by the UI. */
function toManuscript(raw: any): Manuscript {
  return {
    id: raw.id,
    title: raw.title || '',
    content: raw.content || raw.excerpt || '',
    author: raw.author || raw.penName || 'Anonymous',
    likes: raw.likes ?? 0,
    genre: raw.genre || raw.category || 'story',
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    coverUrl: raw.coverUrl || raw.coverImage || undefined,
  };
}

interface Draft { id: string; title: string; content: string; genre: string; coverUrl: string; savedAt: number; }

interface Props { onClose: () => void; }

export const WritersHub: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'write' | 'library' | 'my-works' | 'read'>('write');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState('fiction');
  const [coverUrl, setCoverUrl] = useState('');
  const [library, setLibrary] = useState<Manuscript[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  // Drafts
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch { return []; }
  });

  // Reading mode
  const [readingWork, setReadingWork] = useState<Manuscript | null>(null);

  // Like tracking
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  // Comment input per manuscript
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});

  // Mara AI assistant
  const [maraPrompt, setMaraPrompt] = useState('');
  const [maraSuggestion, setMaraSuggestion] = useState('');
  const [askingMara, setAskingMara] = useState(false);

  // Fetch library — API returns { items: [...], limit, offset }
  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axios.get(`${API_URL}/api/writers/library`);
      const raw: any[] = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.items)
        ? res.data.items
        : [];
      setLibrary(raw.map(r => toManuscript(r)));
    } catch {
      setFetchError(t('writers.loadError', { defaultValue: 'Failed to load library. Please try again.' }));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);
  useEffect(() => { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); }, [drafts]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Auto-save draft every 30s if content exists
  useEffect(() => {
    if (!title && !content) return;
    const timer = setInterval(() => {
      saveDraft(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [title, content, genre, coverUrl]);

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) return;
    setPublishing(true);
    setPublishError('');
    try {
      const res = await axios.post(`${API_URL}/api/writers/publish`, {
        title,
        content,
        penName: user?.name || t('writers.anonymous'),
        category: genre,
        coverImage: coverUrl || undefined,
        visibility: 'public',
      });
      // Backend returns { article: {...} }
      const saved = res.data?.article ?? res.data;
      setLibrary([toManuscript(saved), ...library]);
      setTitle(''); setContent(''); setCoverUrl('');
      setView('library');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message
        || t('writers.publishError', { defaultValue: 'Publish failed. Please try again.' });
      setPublishError(msg);
    } finally { setPublishing(false); }
  };

  const saveDraft = (silent = false) => {
    if (!title.trim() && !content.trim()) return;
    const draft: Draft = { id: Date.now().toString(), title, content, genre, coverUrl, savedAt: Date.now() };
    setDrafts(prev => [draft, ...prev.slice(0, 19)]);
    if (!silent) { setTitle(''); setContent(''); setCoverUrl(''); }
  };

  const loadDraft = (d: Draft) => {
    setTitle(d.title); setContent(d.content); setGenre(d.genre); setCoverUrl(d.coverUrl || '');
    setView('write');
  };

  const deleteDraft = (id: string) => { setDrafts(drafts.filter(d => d.id !== id)); };

  const toggleLike = async (workId: number) => {
    const isLiked = likedIds.has(workId);
    setLikedIds(prev => {
      const next = new Set(prev);
      isLiked ? next.delete(workId) : next.add(workId);
      return next;
    });
    setLibrary(lib => lib.map(w => w.id === workId ? { ...w, likes: w.likes + (isLiked ? -1 : 1) } : w));
    try { await axios.post(`${API_URL}/api/writers/${workId}/like`); } catch { /* optimistic */ }
  };

  const addComment = async (workId: number) => {
    const text = commentInputs[workId]?.trim();
    if (!text) return;
    const comment: Comment = { id: Date.now(), user: user?.name || t('writers.anonymous'), text, date: new Date().toLocaleDateString(i18n.language) };
    setLibrary(lib => lib.map(w => w.id === workId ? { ...w, comments: [...w.comments, comment] } : w));
    setCommentInputs(prev => ({ ...prev, [workId]: '' }));
    try { await axios.post(`${API_URL}/api/writers/${workId}/comment`, comment); } catch { /* optimistic */ }
  };

  const openReading = (work: Manuscript) => {
    setReadingWork(work);
    setView('read');
  };

  const askMaraAI = async () => {
    if (!maraPrompt.trim()) return;
    setAskingMara(true);
    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        message: `[Mara Writers Assistant] ${maraPrompt}. Context: titlu="${title}", gen="${genre}", conținut (primele 300 caractere)="${content.substring(0, 300)}"`,
        userId: user?.id || 'anon',
      });
      setMaraSuggestion(res.data.response || res.data.message || t('writers.maraNoSuggestion'));
    } catch { setMaraSuggestion(t('writers.maraError')); }
    finally { setAskingMara(false); setMaraPrompt(''); }
  };

  const insertSuggestion = () => {
    if (maraSuggestion) {
      setContent(prev => prev + '\n\n' + maraSuggestion);
      setMaraSuggestion('');
    }
  };

  return (
    <div className="writers-container">
      <div className="writers-header">
        <h1 className="writers-title">{t('writers.title')}</h1>
        <button onClick={onClose} className="writers-close-btn">✕</button>
      </div>

      <div className="writers-tabs">
        <button onClick={() => setView('write')} className={`writers-tab ${view === 'write' ? 'active' : ''}`}>🖋️ {t('writers.workshop')}</button>
        <button onClick={() => setView('library')} className={`writers-tab ${view === 'library' ? 'active' : ''}`}>📚 {t('writers.library')}</button>
        <button onClick={() => setView('my-works')} className={`writers-tab ${view === 'my-works' ? 'active' : ''}`}>📂 {t('writers.drafts')}</button>
        {readingWork && <button onClick={() => setView('read')} className={`writers-tab ${view === 'read' ? 'active' : ''}`}>📖 {t('writers.reading')}</button>}
      </div>

      <div className="writers-content">
        {/* WRITE TAB */}
        {view === 'write' && (
          <div className="writers-form">
            <input placeholder={t('writers.titlePlaceholder')} value={title} onChange={e => setTitle(e.target.value)} className="writers-input" />
            <div className="writers-form-row">
              <select value={genre} onChange={e => setGenre(e.target.value)} className="writers-select">
                <option value="fiction">{t('writers.fiction')}</option>
                <option value="poetry">{t('writers.poetry')}</option>
                <option value="essay">{t('writers.essay')}</option>
                <option value="drama">{t('writers.drama')}</option>
                <option value="sfFantasy">{t('writers.sfFantasy')}</option>
                <option value="nonFiction">{t('writers.nonFiction')}</option>
                <option value="memoir">{t('writers.memoir')}</option>
                <option value="script">{t('writers.script')}</option>
              </select>
              <input placeholder={t('writers.coverUrl')} value={coverUrl} onChange={e => setCoverUrl(e.target.value)} className="writers-input writers-cover-input" />
            </div>
            <textarea
              placeholder={t('writers.contentPlaceholder')}
              value={content} onChange={e => setContent(e.target.value)}
              className="writers-textarea"
            />
            <div className="writers-word-count">
              {t('writers.wordCount', { words: content.split(/\s+/).filter(Boolean).length, chars: content.length })}
            </div>

            {/* Mara AI Assistant */}
            <div className="writers-mara-section">
              <p className="writers-mara-label">{t('writers.maraAssistant')}</p>
              <div className="writers-mara-row">
                <input placeholder={t('writers.maraPromptPlaceholder')} value={maraPrompt}
                  onChange={e => setMaraPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && askMaraAI()}
                  className="writers-input" />
                <button onClick={askMaraAI} disabled={askingMara} className="writers-button small">
                  {askingMara ? '...' : t('writers.inspireme')}
                </button>
              </div>
              {maraSuggestion && (
                <div className="writers-mara-suggestion">
                  <p>{maraSuggestion}</p>
                  <button onClick={insertSuggestion} className="writers-button small secondary">{t('writers.insertInText')}</button>
                </div>
              )}
            </div>

            {publishError && (
              <div style={{ background: 'rgba(255,34,34,0.12)', border: '1px solid rgba(255,34,34,0.35)', borderRadius: '8px', padding: '8px 14px', marginBottom: '8px', color: '#ff6b6b', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {publishError}</span>
                <button onClick={() => setPublishError('')} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '16px' }}>✕</button>
              </div>
            )}

            <div className="writers-actions">
              <button onClick={handlePublish} disabled={publishing || !title.trim() || !content.trim()} className="writers-button">
                {publishing ? t('writers.publishing') : t('writers.publish')}
              </button>
              <button onClick={() => saveDraft(false)} className="writers-button secondary">{t('writers.saveDraft')}</button>
            </div>
          </div>
        )}

        {/* LIBRARY TAB */}
        {view === 'library' && (
          <div className="writers-library">
            <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#8b5cf6' }}>{t('writers.libraryTitle')}</h2>
            {loading && <p style={{ textAlign: 'center', color: '#888' }}>{t('writers.loadingLibrary')}</p>}
            {fetchError && (
              <div style={{ background: 'rgba(255,34,34,0.12)', border: '1px solid rgba(255,34,34,0.35)', borderRadius: '8px', padding: '8px 14px', margin: '0 0 16px', color: '#ff6b6b', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {fetchError}</span>
                <button onClick={() => { setFetchError(''); fetchLibrary(); }} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '13px' }}>↺ Retry</button>
              </div>
            )}
            {!loading && !fetchError && library.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>{t('writers.emptyLibrary')}</p>}
            {library.map(work => (
              <div key={work.id} className="writers-manuscript-card">
                {work.coverUrl && <div className="writers-cover" style={{ backgroundImage: `url(${work.coverUrl})` }} />}
                <div className="writers-manuscript-title" onClick={() => openReading(work)} style={{ cursor: 'pointer' }}>{work.title}</div>
                <div className="writers-manuscript-author">{t('writers.by')} {work.author}</div>
                <div className="writers-manuscript-genre">{t(`writers.${work.genre}`, { defaultValue: work.genre })}</div>
                <div className="writers-manuscript-content">{work.content.substring(0, 150)}...</div>
                <div className="writers-manuscript-meta">
                  <button className={`writers-like-btn ${likedIds.has(work.id) ? 'liked' : ''}`} onClick={() => toggleLike(work.id)}>
                    {likedIds.has(work.id) ? '❤️' : '🤍'} {work.likes}
                  </button>
                  <span>💬 {work.comments.length}</span>
                  <button className="writers-read-btn" onClick={() => openReading(work)}>{t('writers.readMore')}</button>
                </div>
                {/* Comments */}
                <div className="writers-comments">
                  {work.comments.slice(-3).map(c => (
                    <div key={c.id} className="writers-comment">
                      <strong>{c.user}:</strong> {c.text}
                      <span className="writers-comment-date">{c.date}</span>
                    </div>
                  ))}
                  <div className="writers-comment-form">
                    <input placeholder={t('writers.writeComment')} value={commentInputs[work.id] || ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [work.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addComment(work.id)}
                      className="writers-comment-input" />
                    <button onClick={() => addComment(work.id)} className="writers-comment-send">→</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DRAFTS TAB */}
        {view === 'my-works' && (
          <div className="writers-drafts">
            <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#8b5cf6' }}>{t('writers.draftsTitle', { count: drafts.length })}</h2>
            {drafts.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>{t('writers.noDrafts')}</p>}
            {drafts.map(d => (
              <div key={d.id} className="writers-draft-card">
                <div className="writers-draft-info">
                  <h3>{d.title || t('writers.untitled')}</h3>
                  <span className="writers-draft-genre">{t(`writers.${d.genre}`, { defaultValue: d.genre })}</span>
                  <p>{d.content.substring(0, 100)}...</p>
                  <small>{new Date(d.savedAt).toLocaleString(i18n.language)}</small>
                </div>
                <div className="writers-draft-actions">
                  <button onClick={() => loadDraft(d)} className="writers-button small">{t('writers.editDraft')}</button>
                  <button onClick={() => deleteDraft(d.id)} className="writers-button small danger">{t('writers.deleteDraft')}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* READING MODE */}
        {view === 'read' && readingWork && (
          <div className="writers-reading-mode">
            <button onClick={() => setView('library')} className="writers-back-btn">{t('writers.closeReading')}</button>
            <div className="writers-reading-header">
              <h1>{readingWork.title}</h1>
              <p className="writers-reading-author">de {readingWork.author} · {readingWork.genre}</p>
            </div>
            <div className="writers-reading-body">
              {readingWork.content.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <div className="writers-reading-footer">
              <button className={`writers-like-btn ${likedIds.has(readingWork.id) ? 'liked' : ''}`} onClick={() => toggleLike(readingWork.id)}>
                {likedIds.has(readingWork.id) ? '❤️' : '🤍'} {readingWork.likes} {t('writers.likes')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
