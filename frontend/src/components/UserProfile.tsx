import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ShareButton from './ShareButton';
import '../styles/UserProfile.css';

export interface UserProfileData {
  id: string;
  name: string;
  email: string;
  avatar: string;
  banner?: string;
  bio: string;
  tier: string;
  followers: number;
  following: number;
  posts: number;
  isFollowed: boolean;
  isBlockedByMe: boolean;
  isBlockingMe: boolean;
  isSelf: boolean;
  joinDate: number;
  website?: string;
  location?: string;
}

interface UserProfileProps {
  userId: string;
  onClose: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ userId, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    bio: '',
    website: '',
    location: '',
    profileColor: '#9d4edd',
  });
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      // The backend serves the public profile under /api/profile/:id and the
      // user posts under /api/profile/:id/posts. The previous /api/users/:id/*
      // routes never existed and returned the SPA index.html, leaving the
      // profile page stuck on "Loading profile..." indefinitely.
      const response = await fetch(`/api/profile/${userId}`, { credentials: 'include' });
      const payload = await response.json() as {
        user: {
          id: string;
          displayName: string | null;
          firstName: string | null;
          bio: string | null;
          profileImageUrl: string | null;
          coverImageUrl: string | null;
          location: string | null;
          website: string | null;
          createdAt: number | string | null;
        };
        videoCount: number;
        postCount: number;
        followerCount: number;
        followingCount: number;
        isFollowing: boolean;
        isBlockedByMe: boolean;
        isBlockingMe: boolean;
        isSelf: boolean;
      };
      const u = payload.user;
      const joinDateMs = (() => {
        if (!u.createdAt) return Date.now();
        if (typeof u.createdAt === 'number') return u.createdAt > 1e12 ? u.createdAt : u.createdAt * 1000;
        const parsed = Date.parse(u.createdAt);
        return Number.isFinite(parsed) ? parsed : Date.now();
      })();
      const mapped: UserProfileData = {
        id: u.id,
        name: u.displayName ?? u.firstName ?? 'User',
        email: '',
        avatar: u.profileImageUrl ?? '',
        banner: u.coverImageUrl ?? undefined,
        bio: u.bio ?? '',
        tier: '',
        followers: payload.followerCount,
        following: payload.followingCount,
        posts: payload.postCount,
        isFollowed: payload.isFollowing,
        isBlockedByMe: payload.isBlockedByMe,
        isBlockingMe: payload.isBlockingMe,
        isSelf: payload.isSelf,
        joinDate: joinDateMs,
        website: u.website ?? undefined,
        location: u.location ?? undefined,
      };
      setProfile(mapped);
      setIsFollowing(mapped.isFollowed);
      setEditData({
        bio: mapped.bio,
        website: mapped.website || '',
        location: mapped.location || '',
        profileColor: '#9d4edd',
      });

      // Load user posts from the existing /api/profile/:id/posts endpoint.
      const postsResponse = await fetch(`/api/profile/${userId}/posts`, { credentials: 'include' });
      const postsData = await postsResponse.json();
      setUserPosts(Array.isArray(postsData?.items) ? postsData.items : []);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!profile) return;
    try {
      // Creator Growth Path: if this profile view was reached from a Spark
      // or a Writers Hub article (?from=spark|writers&fromId=<content id>),
      // attribute the follow to that surface so the creator can see where
      // their growth is actually coming from. Only sent on the follow
      // action itself, never on unfollow.
      const from = searchParams.get('from');
      const fromId = searchParams.get('fromId');
      const attributeSource = !isFollowing && (from === 'spark' || from === 'writers') && !!fromId;
      const response = await fetch(`/api/profile/${profile.id}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: attributeSource ? { 'Content-Type': 'application/json' } : undefined,
        body: attributeSource ? JSON.stringify({ sourceKind: from, sourceId: fromId }) : undefined,
      });
      if (response.ok) {
        setIsFollowing(!isFollowing);
        setProfile({
          ...profile,
          followers: isFollowing ? profile.followers - 1 : profile.followers + 1,
          isFollowed: !isFollowing,
        });
      }
    } catch (error) {
      console.error('Error following user:', error);
    }
  };

  const handleBlock = async () => {
    if (!profile) return;
    const nowBlocked = !profile.isBlockedByMe;
    if (nowBlocked && !window.confirm(t('userProfile.confirmBlock', { name: profile.name }))) return;
    try {
      const response = await fetch(`/api/profile/${profile.id}/block`, {
        method: nowBlocked ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        setIsFollowing(nowBlocked ? false : isFollowing);
        setProfile({
          ...profile,
          isBlockedByMe: nowBlocked,
          isFollowed: nowBlocked ? false : profile.isFollowed,
        });
      }
    } catch (error) {
      console.error('Error blocking user:', error);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Banner / avatar uploads are routed through the generic image upload
    // endpoint; profile-row updates are then issued via PATCH /api/profile/me.
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/uploads/image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json() as { url?: string };
        if (data.url) {
          await fetch('/api/profile/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ coverImageUrl: data.url }),
          });
          setProfile({ ...profile, banner: data.url });
        }
      }
    } catch (error) {
      console.error('Error uploading banner:', error);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/uploads/image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json() as { url?: string };
        if (data.url) {
          await fetch('/api/profile/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ profileImageUrl: data.url }),
          });
          setProfile({ ...profile, avatar: data.url });
        }
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    try {
      const response = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bio: editData.bio,
          website: editData.website || null,
          location: editData.location || null,
        }),
      });

      if (response.ok) {
        setProfile({
          ...profile,
          bio: editData.bio,
          website: editData.website,
          location: editData.location,
        });
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="profile-overlay" onClick={onClose}>
        <div className="profile-container" onClick={(e) => e.stopPropagation()}>
          <div className="profile-loading">{t('userProfile.loading')}</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-overlay" onClick={onClose}>
        <div className="profile-container" onClick={(e) => e.stopPropagation()}>
          <div className="profile-error">{t('userProfile.notFound')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-container" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="profile-close" onClick={onClose}>✕</button>

        {/* Banner Section */}
        <div className="profile-banner-section">
          <div
            className="profile-banner"
            style={{
              backgroundImage: profile.banner ? `url(${profile.banner})` : undefined,
              background: !profile.banner
                ? 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)'
                : undefined,
              cursor: profile.banner ? 'pointer' : undefined,
            }}
            onClick={profile.banner ? () => setLightboxUrl(profile.banner!) : undefined}
            role={profile.banner ? 'button' : undefined}
            aria-label={profile.banner ? t('userProfile.viewCover', 'View cover photo') : undefined}
          >
            {profile.isSelf && (
              <label className="banner-upload-btn" onClick={(e) => e.stopPropagation()}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerUpload}
                  hidden
                />
                {t('userProfile.changeBanner')}
              </label>
            )}
          </div>

          {/* Profile Picture */}
          <div className="profile-pic-container">
            <div className="profile-pic-wrapper">
              <div
                className="profile-pic"
                style={{
                  // profile.avatar is either a real (relative, e.g.
                  // /uploads/images/...) photo URL or empty — it's never a
                  // CSS color value, unlike what the previous
                  // startsWith('http') check assumed. That check treated
                  // every real photo here as "not a URL" (this app's
                  // uploads are relative paths, not absolute), rendering
                  // the raw path as garbled fallback text instead of the
                  // actual image.
                  backgroundImage: profile.avatar ? `url(${profile.avatar})` : undefined,
                  backgroundColor: !profile.avatar ? '#a855f7' : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  fontSize: !profile.avatar ? '48px' : '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: profile.avatar ? 'pointer' : undefined,
                }}
                onClick={profile.avatar ? () => setLightboxUrl(profile.avatar) : undefined}
                role={profile.avatar ? 'button' : undefined}
                aria-label={profile.avatar ? t('userProfile.viewPhoto', 'View profile photo') : undefined}
              >
                {!profile.avatar && profile.name.charAt(0).toUpperCase()}
              </div>
              {profile.isSelf && (
                <label className="avatar-upload-badge" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    hidden
                  />
                  ✎
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Profile Info Section */}
        <div className="profile-info-section">
          <div className="profile-header-row">
            <div className="profile-title">
              <h1>{profile.name}</h1>
              <span className="profile-tier-badge">{profile.tier}</span>
            </div>

            <div className="profile-actions">
              {!profile.isSelf ? (
                profile.isBlockingMe ? (
                  <span className="profile-blocked-notice">{t('userProfile.unavailable')}</span>
                ) : (
                  <>
                    {!profile.isBlockedByMe && (
                      <>
                        <button
                          className={`action-btn follow-btn ${isFollowing ? 'following' : ''}`}
                          onClick={handleFollow}
                        >
                          {isFollowing ? t('userProfile.following') : t('userProfile.follow')}
                        </button>
                        <button
                          className="action-btn message-btn"
                          onClick={() => navigate(`/you?tab=messages&startWith=${profile.id}&startWithName=${encodeURIComponent(profile.name)}`)}
                        >
                          {t('userProfile.message')}
                        </button>
                      </>
                    )}
                    <button
                      className={`action-btn block-btn ${profile.isBlockedByMe ? 'blocked' : ''}`}
                      onClick={handleBlock}
                    >
                      {profile.isBlockedByMe ? t('userProfile.unblock') : t('userProfile.block')}
                    </button>
                  </>
                )
              ) : (
                <button
                  className="action-btn edit-btn"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? t('userProfile.cancel') : t('userProfile.editProfile')}
                </button>
              )}
              <ShareButton
                sourceModule="profile"
                sourceId={profile.id}
                title={profile.name}
                caption={profile.bio || undefined}
                compact={false}
              />
            </div>
          </div>

          {/* Bio */}
          {isEditing ? (
            <div className="edit-bio-section">
              <textarea
                value={editData.bio}
                onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                placeholder={t('userProfile.bioPlaceholder')}
                className="edit-input"
                maxLength={160}
              />
              <div className="edit-meta">
                <input
                  type="text"
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  placeholder={t('userProfile.locationPlaceholder')}
                  className="edit-input"
                />
                <input
                  type="url"
                  value={editData.website}
                  onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                  placeholder={t('userProfile.websitePlaceholder')}
                  className="edit-input"
                />
                <div className="edit-color-picker">
                  <label>{t('userProfile.themeColor')}</label>
                  <input
                    type="color"
                    value={editData.profileColor}
                    onChange={(e) => setEditData({ ...editData, profileColor: e.target.value })}
                    className="color-input"
                  />
                </div>
              </div>
              <button className="save-btn" onClick={handleSaveProfile}>
                {t('userProfile.saveChanges')}
              </button>
            </div>
          ) : (
            <>
              <p className="profile-bio">{profile.bio}</p>
              {profile.location && (
                <p className="profile-meta">📍 {profile.location}</p>
              )}
              {profile.website && (
                <p className="profile-meta">
                  🔗 <a href={profile.website} target="_blank" rel="noopener noreferrer">
                    {profile.website}
                  </a>
                </p>
              )}
              <p className="profile-meta">
                Joined {new Date(profile.joinDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                })}
              </p>
            </>
          )}
        </div>

        {/* Stats Section */}
        <div className="profile-stats-grid">
          <div className="stat-card posts">
            <div className="stat-icon">📝</div>
            <div className="stat-value">{profile.posts}</div>
            <div className="stat-label">{t('userProfile.posts')}</div>
          </div>
          <div className="stat-card followers">
            <div className="stat-icon">👥</div>
            <div className="stat-value">{profile.followers.toLocaleString()}</div>
            <div className="stat-label">{t('userProfile.followers')}</div>
          </div>
          <div className="stat-card following">
            <div className="stat-icon">🔗</div>
            <div className="stat-value">{profile.following}</div>
            <div className="stat-label">{t('userProfile.following_count')}</div>
          </div>
        </div>

        {/* Posts Feed */}
        <div className="profile-posts-section">
          <h2>{t('userProfile.recentPosts')}</h2>
          <div className="profile-posts-list">
            {userPosts.length === 0 ? (
              <div className="no-posts">
                <p>{t('userProfile.noPosts')}</p>
              </div>
            ) : (
              userPosts.map((post: any) => (
                <div key={post.id} className="profile-post-card">
                  <p>{post.content}</p>
                  {post.imageUrl && (
                    <img
                      className="profile-post-image"
                      src={post.imageUrl}
                      alt=""
                      onClick={() => setLightboxUrl(post.imageUrl)}
                      style={{ cursor: 'pointer' }}
                    />
                  )}
                  <div className="post-engagement">
                    <span>❤️ {post.likeCount ?? 0}</span>
                    <span>💬 {post.commentCount ?? 0}</span>
                    <ShareButton
                      sourceModule="post"
                      sourceId={post.id}
                      title={typeof post.content === 'string' ? post.content.slice(0, 80) : undefined}
                      caption={typeof post.content === 'string' ? post.content : undefined}
                      compact={true}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <div className="profile-lightbox" onClick={() => setLightboxUrl(null)}>
          <button
            className="profile-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            aria-label={t('userProfile.close', 'Close')}
          >
            ✕
          </button>
          <img className="profile-lightbox-img" src={lightboxUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default UserProfile;
