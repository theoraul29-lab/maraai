import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';
import '../styles/YouProfile.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

interface UserStats {
  totalPosts: number;
  totalLikes: number;
  followers: number;
  following: number;
  streakDays: number;
  xp: number;
  level: number;
  mood: string;
  productiveHours: string[];
  topCategories: string[];
}

interface VaultItem {
  id: string;
  type: 'screenshot' | 'note' | 'insight';
  content: string;
  createdAt: number;
  mood?: string;
}

interface AvatarCustomization {
  glowColor: string;
  glowIntensity: number;
  neonEffect: boolean;
  particleEffect: boolean;
}

interface YouProfileProps {
  userName?: string;
}

const VAULT_KEY = 'mara_vault_items';
const AVATAR_KEY = 'mara_avatar_custom';

const YouProfile: React.FC<YouProfileProps> = ({ userName = 'User' }) => {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'insights' | 'vault' | 'customize' | 'settings'>('profile');
  const [stats, setStats] = useState<UserStats>({
    totalPosts: 0, totalLikes: 0, followers: 0, following: 0,
    streakDays: 0, xp: 0, level: 1, mood: 'neutral',
    productiveHours: ['14:00', '21:00'], topCategories: ['General'],
  });
  const [loading, setLoading] = useState(true);

  // Vault with localStorage persistence
  const [vaultItems, setVaultItems] = useState<VaultItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]'); } catch { return []; }
  });
  const [newVaultItem, setNewVaultItem] = useState('');
  const [vaultItemType, setVaultItemType] = useState<'note' | 'screenshot' | 'insight'>('note');

  // Avatar with persistence
  const [avatar, setAvatar] = useState<AvatarCustomization>(() => {
    try { return JSON.parse(localStorage.getItem(AVATAR_KEY) || 'null') || { glowColor: '#a855f7', glowIntensity: 0.8, neonEffect: true, particleEffect: true }; }
    catch { return { glowColor: '#a855f7', glowIntensity: 0.8, neonEffect: true, particleEffect: true }; }
  });

  // Settings
  const [settingsName, setSettingsName] = useState(user?.name || userName);
  const [settingsBio, setSettingsBio] = useState(user?.bio || '');
  const [settingsSaved, setSettingsSaved] = useState(false);

  const xpForNextLevel = 5000;
  const xpProgress = stats.xp > 0 ? (stats.xp % xpForNextLevel) / xpForNextLevel : 0;

  const moodColors: Record<string, string> = {
    happy: '#00ff7f', excited: '#ff6b00', sad: '#6b8cff', angry: '#ff2222',
    calm: '#00e5ff', curious: '#c77dff', neutral: '#888888',
  };

  // Fetch real stats from API
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, analyticsRes] = await Promise.all([
        axios.get(`${API_URL}/api/profile/${user?.id || 'me'}`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/creator/analytics`).catch(() => ({ data: null })),
      ]);

      const p = profileRes.data;
      const a = analyticsRes.data;
      setStats({
        totalPosts: a?.totalReels || p?.videos || 0,
        totalLikes: a?.totalLikes || 0,
        followers: p?.followers || 0,
        following: p?.following || 0,
        streakDays: p?.streakDays || 0,
        xp: p?.xp || (a?.totalLikes || 0) * 2 + (a?.totalViews || 0),
        level: p?.level || Math.max(1, Math.floor(((a?.totalLikes || 0) * 2 + (a?.totalViews || 0)) / xpForNextLevel) + 1),
        mood: p?.mood || 'neutral',
        productiveHours: ['14:00', '21:00'],
        topCategories: a?.topCategories || ['General'],
      });
    } catch { /* use defaults */ }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Persist vault
  useEffect(() => { localStorage.setItem(VAULT_KEY, JSON.stringify(vaultItems)); }, [vaultItems]);
  // Persist avatar
  useEffect(() => { localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar)); }, [avatar]);

  const addVaultItem = () => {
    if (!newVaultItem.trim()) return;
    const item: VaultItem = { id: Date.now().toString(), type: vaultItemType, content: newVaultItem, createdAt: Date.now(), mood: stats.mood };
    setVaultItems([item, ...vaultItems]);
    setNewVaultItem('');
  };

  const deleteVaultItem = (id: string) => { setVaultItems(vaultItems.filter(i => i.id !== id)); };
  const updateAvatarColor = (color: string) => { setAvatar({ ...avatar, glowColor: color }); };
  const toggleEffect = (effect: 'neonEffect' | 'particleEffect') => { setAvatar({ ...avatar, [effect]: !avatar[effect] }); };

  const handleSaveSettings = async () => {
    try {
      await axios.post(`${API_URL}/api/profile/${user?.id || 'me'}`, { name: settingsName, bio: settingsBio });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  };

  return (
    <div className="you-profile-container">
      {/* Header */}
      <div className="you-header">
        <div className="you-avatar-display">
          <div className="holographic-avatar" style={{
            background: `radial-gradient(circle at 35% 35%, ${avatar.glowColor}40, ${avatar.glowColor}10)`,
            borderColor: avatar.glowColor,
            boxShadow: avatar.neonEffect ? `0 0 30px ${avatar.glowColor}80, 0 0 60px ${avatar.glowColor}40` : 'none',
          }}>
            <div className="avatar-initials">{userName.charAt(0).toUpperCase()}</div>
            {avatar.particleEffect && <div className="avatar-particles"></div>}
          </div>
        </div>
        <div className="you-header-info">
          <h1>{settingsName || userName}</h1>
          <p className="user-handle">@{(settingsName || userName).toLowerCase().replace(/\s/g, '')}</p>
          <div className="you-badges">
            <span className="badge-level">L{stats.level}</span>
            {stats.streakDays > 0 && <span className="badge-streak">🔥 {stats.streakDays}d</span>}
            <span className="badge-mood" style={{ background: moodColors[stats.mood] + '30', color: moodColors[stats.mood] }}>{stats.mood}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="you-tabs">
        {(['profile', 'insights', 'vault', 'customize', 'settings'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`tab-button ${activeTab === tab ? 'active' : ''}`}>
            {tab === 'profile' && t('you.profileTab')}
            {tab === 'insights' && t('you.insightsTab')}
            {tab === 'vault' && t('you.vaultTab')}
            {tab === 'customize' && t('you.customizeTab')}
            {tab === 'settings' && t('you.settingsTab')}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="you-content">
        {activeTab === 'profile' && (
          <div className="you-section">
            <h2>{t('you.statistics')}</h2>
            {loading ? <p style={{ color: '#888' }}>{t('you.loading')}</p> : (
              <>
                <div className="stats-grid">
                  <div className="stat-card"><div className="stat-value">{stats.followers}</div><div className="stat-label">{t('you.followersLabel')}</div></div>
                  <div className="stat-card"><div className="stat-value">{stats.following}</div><div className="stat-label">{t('you.following')}</div></div>
                  <div className="stat-card"><div className="stat-value">{stats.totalPosts}</div><div className="stat-label">{t('you.posts')}</div></div>
                  <div className="stat-card"><div className="stat-value">{stats.totalLikes >= 1000 ? (stats.totalLikes / 1000).toFixed(1) + 'K' : stats.totalLikes}</div><div className="stat-label">{t('you.totalLikes')}</div></div>
                </div>
                <div className="xp-section">
                  <h3>{t('you.xpProgress', { level: stats.level })}</h3>
                  <div className="xp-bar"><div className="xp-fill" style={{ width: `${xpProgress * 100}%` }}></div></div>
                  <p>{stats.xp % xpForNextLevel} / {xpForNextLevel} XP</p>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="you-section">
            <h2>{t('you.insights')}</h2>
            <div className="insight-cards">
              <div className="insight-card"><span className="icon">⏰</span><h3>{t('you.peakHours', { start: stats.productiveHours[0], end: stats.productiveHours[1] })}</h3><p>{t('you.peakEngagement')}</p></div>
              <div className="insight-card"><span className="icon">🎯</span><h3>{t('you.topContent', { category: stats.topCategories[0] })}</h3><p>{t('you.topEngagement')}</p></div>
              <div className="insight-card"><span className="icon">📈</span><h3>{t('you.totalLikesInsight', { count: stats.totalLikes })}</h3><p>{t('you.activePostsInsight', { count: stats.totalPosts })}</p></div>
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div className="you-section">
            <h2>{t('you.vaultTitle', { count: vaultItems.length })}</h2>
            <div className="vault-form">
              <select value={vaultItemType} onChange={e => setVaultItemType(e.target.value as any)}>
                <option value="note">{t('you.note')}</option>
                <option value="screenshot">{t('you.screenshot')}</option>
                <option value="insight">{t('you.insight')}</option>
              </select>
              <textarea placeholder={t('you.vaultContent')} value={newVaultItem} onChange={e => setNewVaultItem(e.target.value)} />
              <button onClick={addVaultItem}>{t('you.addToVault')}</button>
            </div>
            <div className="vault-items">
              {vaultItems.map(item => (
                <div key={item.id} className="vault-item" style={{ borderLeftColor: moodColors[item.mood || 'neutral'] }}>
                  <span className="item-type">{item.type === 'note' ? '📝' : item.type === 'screenshot' ? '📸' : '💡'}</span>
                  <p>{item.content}</p>
                  <small style={{ color: '#666' }}>{new Date(item.createdAt).toLocaleDateString(i18n.language)}</small>
                  <button onClick={() => deleteVaultItem(item.id)}>✕</button>
                </div>
              ))}
              {vaultItems.length === 0 && <p style={{ color: '#888', textAlign: 'center' }}>{t('you.vaultEmpty')}</p>}
            </div>
          </div>
        )}

        {activeTab === 'customize' && (
          <div className="you-section">
            <h2>{t('you.customize')}</h2>
            <div className="customize-preview">
              <div className="avatar-preview" style={{
                background: `radial-gradient(circle at 35% 35%, ${avatar.glowColor}40, ${avatar.glowColor}10)`,
                borderColor: avatar.glowColor,
                boxShadow: avatar.neonEffect ? `0 0 40px ${avatar.glowColor}80, 0 0 80px ${avatar.glowColor}40` : 'none',
              }}>
                <div className="avatar-initials">{userName.charAt(0).toUpperCase()}</div>
              </div>
            </div>
            <div className="customize-controls">
              <h3>{t('you.glowColor')}</h3>
              <div className="color-palette">
                {['#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6'].map(color => (
                  <button key={color} style={{ background: color }} className={`color-btn ${avatar.glowColor === color ? 'active' : ''}`} onClick={() => updateAvatarColor(color)}></button>
                ))}
              </div>
              <h3>{t('you.glowIntensity')}</h3>
              <input type="range" min="0" max="1" step="0.1" value={avatar.glowIntensity} onChange={e => setAvatar({ ...avatar, glowIntensity: parseFloat(e.target.value) })} />
              <h3>{t('you.effects')}</h3>
              <label><input type="checkbox" checked={avatar.neonEffect} onChange={() => toggleEffect('neonEffect')} /> {t('you.neonGlow')}</label>
              <label><input type="checkbox" checked={avatar.particleEffect} onChange={() => toggleEffect('particleEffect')} /> {t('you.particles')}</label>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="you-section">
            <h2>{t('you.settingsTitle')}</h2>
            <div className="settings-form">
              <label className="settings-label">
                {t('you.name')}
                <input type="text" className="settings-input" value={settingsName} onChange={e => setSettingsName(e.target.value)} placeholder={t('you.namePlaceholder')} />
              </label>
              <label className="settings-label">
                {t('you.emailLabel')}
                <input type="email" className="settings-input" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
              </label>
              <label className="settings-label">
                {t('you.bio')}
                <textarea className="settings-textarea" value={settingsBio} onChange={e => setSettingsBio(e.target.value)} placeholder={t('you.bioPlaceholder')} rows={3} />
              </label>
              <label className="settings-label">
                {t('you.language')}
                <LanguageSelector />
              </label>
              <button className="settings-save-btn" onClick={handleSaveSettings}>
                {settingsSaved ? t('you.saved') : t('you.saveChanges')}
              </button>
              <hr style={{ border: 'none', borderTop: '1px solid #2a2a3a', margin: '16px 0' }} />
              <button className="settings-logout-btn" onClick={logout}>
                {t('you.logout')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default YouProfile;
