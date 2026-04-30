import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import './styles/Creator.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

interface Video {
  id: number;
  title: string;
  url: string;
  description: string;
  views: number;
  likes: number;
  createdAt: string;
  thumbnail?: string;
}

interface Analytics {
  totalReels: number;
  totalViews: number;
  totalLikes: number;
  followers: number;
  engagementRate: number;
  thisMonth: number;
}

interface PostStatus {
  canPost: boolean;
  postsToday: number;
  maxDaily: number;
  nextPostAt?: string;
}

interface Props {
  onClose: () => void;
}

export const Creator: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'manage'>('dashboard');
  const [videos, setVideos] = useState<Video[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({ totalReels: 0, totalViews: 0, totalLikes: 0, followers: 0, engagementRate: 0, thisMonth: 0 });
  const [postStatus, setPostStatus] = useState<PostStatus>({ canPost: true, postsToday: 0, maxDaily: 5 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [analyticsRes, videosRes, statusRes] = await Promise.all([
        axios.get(`${API_URL}/api/creator/analytics`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/creator/my-videos`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/creator/post-status`, { withCredentials: true }).catch(() => ({ data: { canPost: true, postsToday: 0, maxDaily: 5 } })),
      ]);

      if (analyticsRes.data) {
        setAnalytics({
          totalReels: analyticsRes.data.totalReels || 0,
          totalViews: analyticsRes.data.totalViews || 0,
          totalLikes: analyticsRes.data.totalLikes || 0,
          followers: analyticsRes.data.followers || 0,
          engagementRate: analyticsRes.data.engagementRate || 0,
          thisMonth: analyticsRes.data.thisMonth || 0,
        });
      }
      setVideos(Array.isArray(videosRes.data) ? videosRes.data : []);
      if (statusRes.data) setPostStatus(statusRes.data);
    } catch (err) {
      setError(t('creator.dataLoadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleUpload = async () => {
    if (!uploadTitle.trim()) {
      setError(t('creator.titleUrlRequired'));
      return;
    }
    // Two valid paths: (a) attach a real video file → multipart upload
    // through /api/reels/upload (auth-required, written to the video
    // volume); (b) paste an external URL (YouTube, Vimeo) → fall back to
    // /api/creator/post-reel which only stores the URL string.
    if (!videoFile && !uploadUrl.trim()) {
      setError(t('creator.titleUrlRequired'));
      return;
    }
    if (!postStatus.canPost) {
      setError(t('creator.limitReachedMsg', { max: postStatus.maxDaily }));
      return;
    }

    setUploading(true);
    setError('');
    try {
      await axios.post(`${API_URL}/api/creator/post-reel`, {
        title: uploadTitle,
        url: uploadUrl,
        description: uploadDesc,
        tags: uploadTags.split(',').map(t => t.trim()).filter(Boolean),
      }, { withCredentials: true });
      setUploadSuccess(true);
      setUploadTitle('');
      setUploadDesc('');
      setUploadUrl('');
      setUploadTags('');
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(null);
      setVideoPreviewUrl('');
      setTimeout(() => setUploadSuccess(false), 3000);
      fetchData();
      setActiveTab('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || t('creator.publishError'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/creator/videos/${id}`, { withCredentials: true });
      setVideos(videos.filter(v => v.id !== id));
      setDeleteId(null);
      fetchData();
    } catch {
      setError(t('creator.deleteError'));
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="creator-container">
      <div className="creator-header">
        <h1 className="creator-title">{t('creator.title')}</h1>
        <button onClick={onClose} className="creator-close-btn">✕</button>
      </div>

      {/* Tab Navigation */}
      <div className="creator-tabs">
        <button className={`creator-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          📊 {t('creator.dashboard')}
        </button>
        <button className={`creator-tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
          ➕ {t('creator.upload')}
        </button>
        <button className={`creator-tab ${activeTab === 'manage' ? 'active' : ''}`} onClick={() => setActiveTab('manage')}>
          📹 {t('creator.manage')}
        </button>
      </div>

      <div className="creator-content">
        {error && (
          <div className="creator-error">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {uploadSuccess && (
          <div className="creator-success">{t('creator.videoPublished')}</div>
        )}

        {/* =========== DASHBOARD TAB =========== */}
        {activeTab === 'dashboard' && (
          <>
            <div className="creator-welcome">
              <div className="creator-welcome-title">
                {t('creator.welcome', { name: user?.name || 'Creator' })}
              </div>
              <div className="creator-welcome-text">
                <span style={{ color: '#ff6b00' }}>Mara AI</span> {t('creator.welcomeText', { today: postStatus.postsToday, max: postStatus.maxDaily })}
              </div>
            </div>

            {/* Real Stats */}
            <div className="creator-stats">
              <div className="creator-stat-card">
                <div className="creator-stat-value">{formatNumber(analytics.totalReels)}</div>
                <div className="creator-stat-label">{t('creator.totalReels')}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{formatNumber(analytics.totalViews)}</div>
                <div className="creator-stat-label">{t('creator.totalViews')}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{formatNumber(analytics.totalLikes)}</div>
                <div className="creator-stat-label">{t('creator.totalLikes')}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{analytics.engagementRate.toFixed(1)}%</div>
                <div className="creator-stat-label">{t('creator.engagement')}</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="creator-actions">
              <div className="creator-action-card" onClick={() => setActiveTab('upload')}>
                <div className="creator-action-icon">📺</div>
                <div className="creator-action-label">{t('creator.postReel')}</div>
              </div>
              <div className="creator-action-card" onClick={() => setActiveTab('manage')}>
                <div className="creator-action-icon">📁</div>
                <div className="creator-action-label">{t('creator.myVideos')}</div>
              </div>
              <div className="creator-action-card" onClick={fetchData}>
                <div className="creator-action-icon">🔄</div>
                <div className="creator-action-label">{t('creator.refreshData')}</div>
              </div>
              <div className="creator-action-card">
                <div className="creator-action-icon">📊</div>
                <div className="creator-action-label">{t('creator.trends')} {analytics.thisMonth}</div>
              </div>
            </div>

            {/* Recent Videos Preview */}
            {videos.length > 0 && (
              <div className="creator-features">
                <h3 className="creator-features-title">{t('creator.recentVideos')}</h3>
                {videos.slice(0, 4).map(video => (
                  <div key={video.id} className="creator-feature-item" onClick={() => setActiveTab('manage')}>
                    <div className="creator-feature-icon">🎬</div>
                    <div className="creator-feature-text">
                      <div className="creator-feature-name">{video.title}</div>
                      <div className="creator-feature-desc">
                        👁️ {formatNumber(video.views)} · ❤️ {formatNumber(video.likes)} · {new Date(video.createdAt).toLocaleDateString(i18n.language)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {videos.length === 0 && !loading && (
              <div className="creator-welcome" style={{ opacity: 0.7 }}>
                <div className="creator-welcome-title">{t('creator.noVideosYet')}</div>
                <div className="creator-welcome-text">{t('creator.noVideos')}</div>
                <button className="creator-button" style={{ marginTop: '12px' }} onClick={() => setActiveTab('upload')}>
                  {t('creator.publishNow')}
                </button>
              </div>
            )}
          </>
        )}

        {/* =========== UPLOAD TAB =========== */}
        {activeTab === 'upload' && (
          <>
            <div className="creator-welcome">
              <div className="creator-welcome-title">{t('creator.publishNewReel')}</div>
              <div className="creator-welcome-text">
                {postStatus.canPost
                  ? t('creator.canPostMore', { count: postStatus.maxDaily - postStatus.postsToday })
                  : t('creator.limitReachedMsg', { max: postStatus.maxDaily })}
              </div>
            </div>

            <div className="creator-upload-form">
              <label className="creator-form-label">
                {t('creator.uploadTitle')}
                <input
                  type="text"
                  className="creator-form-input"
                  placeholder={t('creator.uploadTitlePlaceholder')}
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  maxLength={100}
                />
              </label>

              <label className="creator-form-label">
                {t('creator.uploadVideoFile', 'Video file (mp4, webm, mov)')}
                <input
                  ref={videoFileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                  className="creator-form-input"
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
              </label>

              <label className="creator-form-label">
                {t('creator.uploadUrlOrPaste', 'Or paste a URL (YouTube etc.)')}
                <input
                  type="url"
                  className="creator-form-input"
                  placeholder={t('creator.uploadUrlPlaceholder')}
                  value={uploadUrl}
                  onChange={e => setUploadUrl(e.target.value)}
                  disabled={!!videoFile}
                />
              </label>

              <label className="creator-form-label">
                {t('creator.uploadDescription')}
                <textarea
                  className="creator-form-textarea"
                  placeholder={t('creator.uploadDescPlaceholder')}
                  value={uploadDesc}
                  onChange={e => setUploadDesc(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </label>

              <label className="creator-form-label">
                {t('creator.uploadTagsLabel')}
                <input
                  type="text"
                  className="creator-form-input"
                  placeholder={t('creator.uploadTagsPlaceholder')}
                  value={uploadTags}
                  onChange={e => setUploadTags(e.target.value)}
                />
              </label>

              <div className="creator-button-group">
                <button
                  className={`creator-button ${(!postStatus.canPost || uploading) ? 'disabled' : ''}`}
                  onClick={handleUpload}
                  disabled={!postStatus.canPost || uploading}
                >
                  {uploading ? t('creator.publishing') : t('creator.publishReel')}
                </button>
                <button
                  className="creator-button secondary"
                  onClick={() => {
                    setUploadTitle('');
                    setUploadDesc('');
                    setUploadUrl('');
                    setUploadTags('');
                    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                    setVideoFile(null);
                    setVideoPreviewUrl('');
                    if (videoFileRef.current) videoFileRef.current.value = '';
                  }}
                >
                  {t('creator.reset')}
                </button>
              </div>
            </div>
          </>
        )}

        {/* =========== MANAGE TAB =========== */}
        {activeTab === 'manage' && (
          <>
            <div className="creator-welcome">
              <div className="creator-welcome-title">{t('creator.videoManagerTitle')}</div>
              <div className="creator-welcome-text">{t('creator.videosPublished', { count: videos.length })}</div>
            </div>

            {loading ? (
              <div className="creator-welcome" style={{ textAlign: 'center' }}>
                <div className="creator-welcome-title">{t('creator.loading')}</div>
              </div>
            ) : videos.length === 0 ? (
              <div className="creator-welcome" style={{ opacity: 0.7 }}>
                <div className="creator-welcome-title">{t('creator.noVideosYet')}</div>
                <button className="creator-button" style={{ marginTop: '12px' }} onClick={() => setActiveTab('upload')}>
                  {t('creator.publishFirst')}
                </button>
              </div>
            ) : (
              <div className="creator-video-grid">
                {videos.map(video => (
                  <div key={video.id} className="creator-video-card">
                    <div className="creator-video-thumb">
                      {video.url.includes('youtube') || video.url.includes('youtu.be') ? (
                        <img
                          src={`https://img.youtube.com/vi/${extractYouTubeId(video.url)}/mqdefault.jpg`}
                          alt={video.title}
                          className="creator-video-thumb-img"
                        />
                      ) : (
                        <div className="creator-video-thumb-placeholder">🎬</div>
                      )}
                      <div className="creator-video-overlay">
                        <span>👁️ {formatNumber(video.views)}</span>
                        <span>❤️ {formatNumber(video.likes)}</span>
                      </div>
                    </div>
                    <div className="creator-video-info">
                      <div className="creator-video-title">{video.title}</div>
                      <div className="creator-video-date">{new Date(video.createdAt).toLocaleDateString(i18n.language)}</div>
                    </div>
                    <div className="creator-video-actions">
                      <a href={video.url} target="_blank" rel="noopener noreferrer" className="creator-video-btn view">{t('creator.view')}</a>
                      {deleteId === video.id ? (
                        <div className="creator-delete-confirm">
                          <span>{t('creator.confirmDelete')}</span>
                          <button className="creator-video-btn delete" onClick={() => handleDelete(video.id)}>{t('creator.yes')}</button>
                          <button className="creator-video-btn" onClick={() => setDeleteId(null)}>{t('creator.no')}</button>
                        </div>
                      ) : (
                        <button className="creator-video-btn delete" onClick={() => setDeleteId(video.id)}>{t('creator.deleteVideo')}</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function extractYouTubeId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}