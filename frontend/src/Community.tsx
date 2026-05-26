import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './contexts/AuthContext';
import './styles/Community.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

type Tab = 'all' | 'articles' | 'missions' | 'journal';

interface Article {
  id: number;
  penName: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  category: string;
  visibility: string;
  likes: number;
  views: number;
  createdAt: number;
}

interface MissionShare {
  id: number;
  caption: string | null;
  platform: string;
  created_at: string;
  display_name: string | null;
  profile_image_url: string | null;
  mission_title: string;
  pillar: string;
  proof_text: string | null;
  mara_feedback: string | null;
}

interface JournalEntry {
  mara_page: string;
  mood: string | null;
  day_number: number | null;
  created_at: string;
  tags: string | null;
  program_name: string | null;
  display_name: string | null;
}

interface FeedItem {
  kind: 'article' | 'mission' | 'journal';
  id: string;
  ts: number;
  data: Article | MissionShare | JournalEntry;
}

const PILLAR_COLORS: Record<string, string> = {
  mental: '#8b5cf6',
  physical: '#ef4444',
  financial: '#f59e0b',
  social: '#06b6d4',
  creative: '#ec4899',
  spiritual: '#22c55e',
};

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', excited: '🤩', sad: '😢', angry: '😠',
  calm: '😌', curious: '🤔', neutral: '😐', grateful: '🙏',
};

function timeAgo(ts: number | string): string {
  const diff = Date.now() - (typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'acum';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}z`;
}

export default function Community() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const [writersRes, missionsRes, journalRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/writers/library`),
        axios.get(`${API_URL}/api/missions/community`),
        axios.get(`${API_URL}/api/journal/community`),
      ]);

      const items: FeedItem[] = [];

      if (writersRes.status === 'fulfilled') {
        const raw = writersRes.value.data?.items ?? writersRes.value.data ?? [];
        (Array.isArray(raw) ? raw : []).forEach((a: Article) => {
          items.push({ kind: 'article', id: `a-${a.id}`, ts: a.createdAt, data: a });
        });
      }
      if (missionsRes.status === 'fulfilled') {
        const raw: MissionShare[] = missionsRes.value.data?.feed ?? [];
        raw.forEach((m) => {
          items.push({ kind: 'mission', id: `m-${m.id}`, ts: new Date(m.created_at).getTime() / 1000, data: m });
        });
      }
      if (journalRes.status === 'fulfilled') {
        const raw: JournalEntry[] = journalRes.value.data?.entries ?? [];
        raw.forEach((j, i) => {
          items.push({ kind: 'journal', id: `j-${i}`, ts: new Date(j.created_at).getTime() / 1000, data: j });
        });
      }

      items.sort((a, b) => b.ts - a.ts);
      setFeed(items);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const likeArticle = async (id: number) => {
    if (likedIds.has(id) || !user) return;
    setLikedIds(prev => new Set([...prev, id]));
    setFeed(prev => prev.map(item =>
      item.kind === 'article' && (item.data as Article).id === id
        ? { ...item, data: { ...(item.data as Article), likes: (item.data as Article).likes + 1 } }
        : item
    ));
    try { await axios.post(`${API_URL}/api/writers/${id}/like`, {}, { withCredentials: true }); } catch { /* silent */ }
  };

  const filtered = feed.filter(item => {
    if (tab !== 'all' && item.kind !== ({ articles: 'article', missions: 'mission', journal: 'journal' } as Record<Tab, string>)[tab]) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (item.kind === 'article') {
      const a = item.data as Article;
      return a.title.toLowerCase().includes(q) || (a.penName || '').toLowerCase().includes(q);
    }
    if (item.kind === 'mission') {
      const m = item.data as MissionShare;
      return (m.mission_title || '').toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q);
    }
    if (item.kind === 'journal') {
      const j = item.data as JournalEntry;
      return (j.mara_page || '').toLowerCase().includes(q) || (j.display_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { all: feed.length, articles: feed.filter(i => i.kind === 'article').length, missions: feed.filter(i => i.kind === 'mission').length, journal: feed.filter(i => i.kind === 'journal').length };

  return (
    <div className="community-root">
      <div className="community-header">
        <h1 className="community-title">🌐 Community</h1>
        <p className="community-subtitle">Articole, misiuni și jurnale ale comunității</p>
        <div className="community-search-wrap">
          <input
            className="community-search"
            placeholder="🔍 Caută în feed…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="community-tabs">
        {(['all', 'articles', 'missions', 'journal'] as Tab[]).map(t2 => (
          <button
            key={t2}
            className={`community-tab ${tab === t2 ? 'active' : ''}`}
            onClick={() => setTab(t2)}
          >
            {{ all: '📋 Toate', articles: '📚 Articole', missions: '🎯 Misiuni', journal: '📓 Jurnal' }[t2]}
            <span className="community-tab-count">{counts[t2]}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="community-loading">
          <div className="community-spinner" />
          <span>Se încarcă feed-ul…</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="community-empty">
          <p>Nicio postare găsită{searchQuery ? ' pentru această căutare' : ''}.</p>
        </div>
      )}

      <div className="community-feed">
        {filtered.map(item => {
          if (item.kind === 'article') {
            const a = item.data as Article;
            return (
              <article key={item.id} className="community-card community-card--article">
                {a.coverImage && (
                  <div className="community-card-cover" style={{ backgroundImage: `url("${a.coverImage}")` }} />
                )}
                <div className="community-card-body">
                  <div className="community-card-meta">
                    <span className="community-badge community-badge--article">📚 Articol</span>
                    <span className="community-badge community-badge--cat">{a.category}</span>
                    {a.visibility !== 'public' && (
                      <span className="community-badge community-badge--vis">{a.visibility === 'vip' ? '👑 VIP' : '💎 Paid'}</span>
                    )}
                    <span className="community-time">{timeAgo(item.ts)}</span>
                  </div>
                  <h3 className="community-card-title">{a.title}</h3>
                  {a.excerpt && <p className="community-card-excerpt">{a.excerpt}</p>}
                  <div className="community-card-footer">
                    <span className="community-author">✍️ {a.penName}</span>
                    <div className="community-actions">
                      <button
                        className={`community-like-btn ${likedIds.has(a.id) ? 'liked' : ''}`}
                        onClick={() => likeArticle(a.id)}
                        disabled={likedIds.has(a.id) || !user}
                      >
                        {likedIds.has(a.id) ? '❤️' : '🤍'} {a.likes}
                      </button>
                      <span className="community-views">👁️ {a.views}</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          }

          if (item.kind === 'mission') {
            const m = item.data as MissionShare;
            const pillarColor = PILLAR_COLORS[m.pillar] || '#a855f7';
            return (
              <article key={item.id} className="community-card community-card--mission">
                <div className="community-card-body">
                  <div className="community-card-meta">
                    <span className="community-badge community-badge--mission">🎯 Misiune</span>
                    <span className="community-badge" style={{ background: `${pillarColor}22`, color: pillarColor, border: `1px solid ${pillarColor}55` }}>
                      {m.pillar}
                    </span>
                    <span className="community-time">{timeAgo(item.ts)}</span>
                  </div>
                  <div className="community-user-row">
                    {m.profile_image_url ? (
                      <img src={m.profile_image_url} alt="" className="community-avatar" />
                    ) : (
                      <div className="community-avatar-fallback">{(m.display_name || '?').charAt(0).toUpperCase()}</div>
                    )}
                    <strong className="community-username">{m.display_name || 'Anonymous'}</strong>
                    <span className="community-completed-label">a completat</span>
                  </div>
                  <h3 className="community-card-title">{m.mission_title}</h3>
                  {m.caption && <p className="community-card-excerpt">{m.caption}</p>}
                  {m.mara_feedback && (
                    <div className="community-mara-feedback">
                      <span className="community-mara-icon">🧠</span>
                      <span>{m.mara_feedback}</span>
                    </div>
                  )}
                </div>
              </article>
            );
          }

          if (item.kind === 'journal') {
            const j = item.data as JournalEntry;
            const tags = j.tags ? j.tags.split(',').filter(Boolean) : [];
            return (
              <article key={item.id} className="community-card community-card--journal">
                <div className="community-card-body">
                  <div className="community-card-meta">
                    <span className="community-badge community-badge--journal">📓 Jurnal</span>
                    {j.mood && <span className="community-badge community-badge--mood">{MOOD_EMOJI[j.mood] || '😐'} {j.mood}</span>}
                    {j.program_name && <span className="community-badge community-badge--program">{j.program_name}</span>}
                    <span className="community-time">{timeAgo(item.ts)}</span>
                  </div>
                  {j.display_name && (
                    <div className="community-user-row">
                      <div className="community-avatar-fallback">{j.display_name.charAt(0).toUpperCase()}</div>
                      <strong className="community-username">{j.display_name}</strong>
                      {j.day_number && <span className="community-day-badge">Ziua {j.day_number}</span>}
                    </div>
                  )}
                  <p className="community-journal-text">{j.mara_page}</p>
                  {tags.length > 0 && (
                    <div className="community-tags">
                      {tags.map(tag => <span key={tag} className="community-tag">#{tag.trim()}</span>)}
                    </div>
                  )}
                </div>
              </article>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
