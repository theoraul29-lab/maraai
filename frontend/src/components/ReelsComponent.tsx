import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import TikTokFeed from './TikTokFeed';
import type { TikTokReel } from './TikTokFeed';
import '../styles/Reels.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

interface Reel {
  id: number;
  creator: string;
  avatar: string;
  title: string;
  url: string;
  videoUrl: string;
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  isSaved: boolean;
  views: number;
  duration: string;
  music?: string;
  tags: string[];
  description: string;
  createdAt: string;
  topic?: string;
}

interface CreatorStats {
  totalReels: number;
  totalViews: number;
  totalLikes: number;
  followers: number;
  engagementRate: number;
}

const ReelsComponent: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [activeMode, setActiveMode] = useState<'feed' | 'create' | 'myreels' | 'stats'>('feed');
  const [reels, setReels] = useState<Reel[]>([]);
  const [myReels, setMyReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [creatorStats, setCreatorStats] = useState<CreatorStats>({ totalReels: 0, totalViews: 0, totalLikes: 0, followers: 0, engagementRate: 0 });
  const [filterTag, setFilterTag] = useState<string>('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [newReel, setNewReel] = useState({ title: '', description: '', music: '', tags: '', url: '' });
  const [uploading, setUploading] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Fetch feed from API
  const fetchFeed = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/mara-feed`, {
        params: { page: reset ? 0 : page, topic: filterTag || undefined }
      });
      const data = res.data;
      // Flatten categories into a single feed
      let feedItems: Reel[] = [];
      if (Array.isArray(data)) {
        feedItems = data;
      } else if (data.categories) {
        feedItems = data.categories.flatMap((cat: any) => cat.videos || []);
      } else if (data.videos) {
        feedItems = data.videos;
      }

      const mapped = feedItems.map((v: any) => ({
        id: v.id,
        creator: v.creator || v.username || 'Creator',
        avatar: '🎬',
        title: v.title || 'Untitled',
        url: v.url || v.videoUrl || '#',
        videoUrl: v.url || v.videoUrl || '#',
        likes: v.likes || 0,
        comments: v.comments || 0,
        shares: v.shares || 0,
        isLiked: v.isLiked || false,
        isSaved: v.isSaved || false,
        views: v.views || 0,
        duration: v.duration || '0:30',
        music: v.music || 'Original Audio',
        tags: v.tags || [v.topic || 'General'],
        description: v.description || '',
        createdAt: v.createdAt || new Date().toISOString(),
        topic: v.topic,
      }));

      if (reset) {
        setReels(mapped);
        setPage(1);
      } else {
        setReels(prev => [...prev, ...mapped]);
        setPage(prev => prev + 1);
      }
      setHasMore(mapped.length >= 10);
    } catch {
      setError(t('reels.feedLoadError'));
    } finally {
      setLoading(false);
    }
  }, [page, filterTag]);

  // Fetch creator stats & my videos
  const fetchMyData = useCallback(async () => {
    try {
      const [statsRes, videosRes] = await Promise.all([
        axios.get(`${API_URL}/api/creator/analytics`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/creator/my-videos`).catch(() => ({ data: [] })),
      ]);
      if (statsRes.data) setCreatorStats(statsRes.data);
      if (Array.isArray(videosRes.data)) {
        setMyReels(videosRes.data.map((v: any) => ({
          id: v.id,
          creator: 'You',
          avatar: '👤',
          title: v.title || 'Untitled',
          url: v.url || '#',
          videoUrl: v.url || '#',
          likes: v.likes || 0,
          comments: 0,
          shares: 0,
          isLiked: false,
          isSaved: false,
          views: v.views || 0,
          duration: '0:30',
          tags: v.tags || [],
          description: v.description || '',
          createdAt: v.createdAt || new Date().toISOString(),
        })));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchFeed(true); }, [filterTag]);
  useEffect(() => { fetchMyData(); }, []);

  const handleLike = async (reelId: number) => {
    try {
      await axios.post(`${API_URL}/api/videos/${reelId}/like`);
      setReels(reels.map(r => r.id === reelId ? { ...r, isLiked: !r.isLiked, likes: r.isLiked ? r.likes - 1 : r.likes + 1 } : r));
      if (selectedReel?.id === reelId) {
        setSelectedReel({ ...selectedReel, isLiked: !selectedReel.isLiked, likes: selectedReel.isLiked ? selectedReel.likes - 1 : selectedReel.likes + 1 });
      }
    } catch {
      setReels(reels.map(r => r.id === reelId ? { ...r, isLiked: !r.isLiked, likes: r.isLiked ? r.likes - 1 : r.likes + 1 } : r));
    }
  };

  const handleSave = async (reelId: number) => {
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;
    try {
      if (reel.isSaved) {
        await axios.delete(`${API_URL}/api/videos/${reelId}/save`);
      } else {
        await axios.post(`${API_URL}/api/videos/${reelId}/save`);
      }
      setReels(reels.map(r => r.id === reelId ? { ...r, isSaved: !r.isSaved } : r));
    } catch { /* silent */ }
  };

  const handleView = async (reelId: number) => {
    try { await axios.post(`${API_URL}/api/videos/${reelId}/view`); } catch { /* silent */ }
  };

  const handleCreateReel = async () => {
    if (!newReel.title.trim()) {
      setError(t('reels.titleUrlRequired'));
      return;
    }
    // Two valid paths: (a) attach a real video file → multipart upload
    // through /api/reels/upload, the backend writes bytes to the video
    // volume and returns a record we treat the same as the YouTube/external
    // case; (b) paste an external URL (YouTube etc.) → fall back to the
    // legacy /api/creator/post-reel endpoint.
    if (!videoFile && !newReel.url.trim()) {
      setError(t('reels.titleUrlRequired'));
      return;
    }
    setUploading(true);
    setError('');
    try {
      if (videoFile) {
        const fd = new FormData();
        fd.append('video', videoFile);
        fd.append('title', newReel.title);
        fd.append('description', newReel.description);
        fd.append('type', 'creator');
        await axios.post(`${API_URL}/api/reels/upload`, fd, {
          withCredentials: true,
          // Do NOT set Content-Type — axios auto-adds multipart/form-data
          // with the boundary string when given FormData. An explicit header
          // without a boundary breaks multer's body parser.
        });
      } else {
        await axios.post(`${API_URL}/api/creator/post-reel`, {
          title: newReel.title,
          url: newReel.url,
          description: newReel.description,
          tags: newReel.tags.split(',').map(t => t.trim()).filter(Boolean),
        });
      }
      setNewReel({ title: '', description: '', music: '', tags: '', url: '' });
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(null);
      setVideoPreviewUrl('');
      setActiveMode('myreels');
      fetchMyData();
      fetchFeed(true);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || t('reels.publishError'));
    } finally {
      setUploading(false);
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const filteredReels = filterTag ? reels.filter(r => r.tags.some(t => t.toLowerCase() === filterTag.toLowerCase()) || r.topic === filterTag) : reels;

  return (
    <div className="reels-container">
      {/* Header */}
      <div className="reels-header">
        <h1>🎬 REELS</h1>
        <div className="reels-header-actions">
          <button className={`header-btn ${activeMode === 'feed' ? 'active' : ''}`} onClick={() => setActiveMode('feed')}>📺 {t('reels.feed')}</button>
          <button className={`header-btn ${activeMode === 'create' ? 'active' : ''}`} onClick={() => setActiveMode('create')}>➕ {t('reels.create')}</button>
          <button className={`header-btn ${activeMode === 'myreels' ? 'active' : ''}`} onClick={() => setActiveMode('myreels')}>📹 {t('reels.myReels')}</button>
          <button className={`header-btn ${activeMode === 'stats' ? 'active' : ''}`} onClick={() => setActiveMode('stats')}>📊 {t('reels.stats')}</button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,34,34,0.15)', border: '1px solid rgba(255,34,34,0.4)', borderRadius: '8px', padding: '10px 14px', margin: '8px 16px', color:'#ff6b6b', fontSize:'13px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background:'none', border:'none', color:'#ff6b6b', cursor:'pointer', fontSize:'16px' }}>✕</button>
        </div>
      )}

      {/* Feed Mode - TikTok-style vertical full-screen */}
      {activeMode === 'feed' && (
        <div className="reels-feed reels-feed-tiktok">
          <div className="tiktok-tag-bar">
            {['AI', 'Tech', 'Future', 'Design', 'Music', 'Comedy', 'Trading', 'Tutorial'].map(tag => (
              <button
                key={tag}
                className={`tiktok-tag-btn ${filterTag === tag ? 'active' : ''}`}
                onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
              >#{tag}</button>
            ))}
          </div>

          <TikTokFeed
            reels={filteredReels as TikTokReel[]}
            onLike={handleLike}
            onSave={handleSave}
            onView={handleView}
            onComment={(id) => {
              const r = reels.find(x => x.id === id);
              if (r) setSelectedReel(r);
            }}
            onShare={async (id) => {
              try {
                await axios.post(`${API_URL}/api/videos/${id}/share`);
                setReels(prev => prev.map(r => r.id === id ? { ...r, shares: r.shares + 1 } : r));
              } catch { /* silent */ }
            }}
            onLoadMore={() => { if (hasMore && !loading) fetchFeed(false); }}
            loading={loading}
            hasMore={hasMore}
          />
        </div>
      )}

      {/* Create Mode */}
      {activeMode === 'create' && (
        <div className="reels-create">
          <h2>{t('reels.createReel')}</h2>
          <div className="create-form">
            <div className="form-group">
              <label>{t('reels.titleLabel')}</label>
              <input type="text" value={newReel.title} onChange={e => setNewReel({ ...newReel, title: e.target.value })} placeholder={t('reels.reelTitle')} />
            </div>
            <div className="form-group">
              <label>{t('reels.uploadVideoLabel', 'Video file (mp4, webm, mov)')}</label>
              <input
                ref={videoFileRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                  setVideoFile(f);
                  setVideoPreviewUrl(f ? URL.createObjectURL(f) : '');
                }}
              />
              {videoPreviewUrl && (
                <video
                  src={videoPreviewUrl}
                  controls
                  style={{ marginTop: 8, maxWidth: '100%', borderRadius: 8 }}
                />
              )}
            </div>
            <div className="form-group">
              <label>{t('reels.urlLabelOrPaste', 'Or paste a URL (YouTube etc.)')}</label>
              <input
                type="url"
                value={newReel.url}
                onChange={e => setNewReel({ ...newReel, url: e.target.value })}
                placeholder={t('reels.reelUrl')}
                disabled={!!videoFile}
              />
            </div>
            <div className="form-group">
              <label>{t('reels.descLabel')}</label>
              <textarea value={newReel.description} onChange={e => setNewReel({ ...newReel, description: e.target.value })} placeholder={t('reels.reelDescription')} rows={3} />
            </div>
            <div className="form-group">
              <label>{t('reels.tagsLabel')}</label>
              <input type="text" value={newReel.tags} onChange={e => setNewReel({ ...newReel, tags: e.target.value })} placeholder={t('reels.reelTags')} />
            </div>
            <div className="form-actions">
              <button className="btn-submit" onClick={handleCreateReel} disabled={uploading}>
                {uploading ? t('reels.publishing') : t('reels.publish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Reels Mode */}
      {activeMode === 'myreels' && (
        <div className="reels-myreels">
          <h2>{t('reels.myReelsTitle', { count: myReels.length })}</h2>
          {myReels.length === 0 ? (
            <div className="empty-state">
              <p>{t('reels.noMyReels')}</p>
              <button onClick={() => setActiveMode('create')}>{t('reels.createFirst')}</button>
            </div>
          ) : (
            <div className="myreels-grid">
              {myReels.map(reel => (
                <div key={reel.id} className="myreel-card">
                  <div className="reel-thumbnail">
                    {(reel.url.includes('youtube') || reel.url.includes('youtu.be')) ? (
                      <img src={`https://img.youtube.com/vi/${extractYouTubeId(reel.url)}/mqdefault.jpg`} alt={reel.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    ) : (
                      <span className="reel-duration">🎬</span>
                    )}
                  </div>
                  <div className="myreel-info">
                    <h4>{reel.title}</h4>
                    <div className="myreel-stats">
                      <span>👁️ {formatNumber(reel.views)}</span>
                      <span>❤️ {formatNumber(reel.likes)}</span>
                    </div>
                    <small>{new Date(reel.createdAt).toLocaleDateString(i18n.language)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Mode */}
      {activeMode === 'stats' && (
        <div className="reels-stats">
          <h2>{t('reels.statsTitle')}</h2>
          <div className="stats-overview">
            <div className="stat-card"><div className="stat-icon">📹</div><div className="stat-details"><div className="stat-value">{creatorStats.totalReels}</div><div className="stat-label">{t('reels.totalReels')}</div></div></div>
            <div className="stat-card"><div className="stat-icon">👁️</div><div className="stat-details"><div className="stat-value">{formatNumber(creatorStats.totalViews)}</div><div className="stat-label">{t('reels.totalViews')}</div></div></div>
            <div className="stat-card"><div className="stat-icon">❤️</div><div className="stat-details"><div className="stat-value">{formatNumber(creatorStats.totalLikes)}</div><div className="stat-label">{t('reels.totalLikes')}</div></div></div>
            <div className="stat-card"><div className="stat-icon">👥</div><div className="stat-details"><div className="stat-value">{formatNumber(creatorStats.followers)}</div><div className="stat-label">{t('reels.followersLabel')}</div></div></div>
            <div className="stat-card"><div className="stat-icon">📊</div><div className="stat-details"><div className="stat-value">{creatorStats.engagementRate.toFixed(1)}%</div><div className="stat-label">{t('reels.engagementLabel')}</div></div></div>
          </div>
        </div>
      )}

      {/* Reel Detail Modal */}
      {selectedReel && (
        <div className="reel-modal-overlay" onClick={() => setSelectedReel(null)}>
          <div className="reel-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedReel(null)}>✕</button>
            <div className="reel-player">
              {(selectedReel.url.includes('youtube') || selectedReel.url.includes('youtu.be')) ? (
                <iframe
                  src={`https://www.youtube.com/embed/${extractYouTubeId(selectedReel.url)}?autoplay=1`}
                  style={{ width:'100%', height:'100%', border:'none' }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title={selectedReel.title}
                />
              ) : selectedReel.url !== '#' ? (
                <video src={selectedReel.url} controls autoPlay style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              ) : (
                <div className="player-placeholder">🎬 Video Player</div>
              )}
            </div>
            <div className="reel-details">
              <div className="reel-header">
                <div className="reel-creator-info">
                  <span className="creator-avatar">{selectedReel.avatar}</span>
                  <div>
                    <div className="creator-name">{selectedReel.creator}</div>
                  </div>
                </div>
                <span className="reel-duration">👁️ {formatNumber(selectedReel.views)}</span>
              </div>
              <h3>{selectedReel.title}</h3>
              {selectedReel.description && <p className="reel-description">{selectedReel.description}</p>}
              <div className="reel-actions">
                <button className={`action-btn ${selectedReel.isLiked ? 'liked' : ''}`} onClick={() => handleLike(selectedReel.id)}>❤️ {formatNumber(selectedReel.likes)}</button>
                <button className="action-btn">💬 {selectedReel.comments}</button>
                <button className={`action-btn ${selectedReel.isSaved ? 'liked' : ''}`} onClick={() => handleSave(selectedReel.id)}>🔖 {selectedReel.isSaved ? t('reels.saved') : t('reels.saveLabel')}</button>
              </div>
              <div className="reel-tags">
                {selectedReel.tags.map(tag => <span key={tag} className="tag">#{tag}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function extractYouTubeId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}

export default ReelsComponent;
