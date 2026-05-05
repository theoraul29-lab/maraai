import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';
import Messenger from './Messenger';
import '../styles/YouProfile.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

// Multipart upload to /api/uploads/image. Returns the public URL the
// existing PATCH /api/profile/me / POST /api/profile/posts handlers
// already accept as a string. Throwing here lets the caller surface a
// localized error in whatever UI it owns.
async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('image', file);
  const res = await axios.post<{ url: string }>(`${API_URL}/api/uploads/image`, fd, {
    withCredentials: true,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.url;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileUser {
  id: string;
  displayName: string | null;
  firstName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  location: string | null;
  website: string | null;
  createdAt: string | null;
  email?: string;
}

interface ProfilePayload {
  user: ProfileUser;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isSelf: boolean;
  isFollowing?: boolean;
}

interface UserPost {
  id: number;
  userId: string;
  content: string;
  imageUrl: string | null;
  // Cross-module attribution (Phase 2 P2.2). Set when the post originated
  // from Writers Hub / Trading Akademie / a reel — drives the "from X"
  // badge below. Plain user posts leave both null.
  sourceKind: 'writers' | 'trading' | 'reel' | null;
  sourceId: number | null;
  createdAt: string;
  // Server-side counts injected by GET /api/profile/:id/posts (via
  // listProfilePosts). Used to seed like/comment UI immediately so the
  // numbers don't render as 0 until the user opens each post.
  likeCount?: number;
  liked?: boolean;
  commentCount?: number;
}

interface CommentItem {
  id: number;
  postId: number;
  userId: string;
  content: string;
  createdAt: string;
  userName?: string | null;
}

interface FollowUser {
  id: string;
  displayName: string | null;
  firstName: string | null;
  profileImageUrl: string | null;
  followedAt: string | null;
}

interface YouProfileProps {
  userName?: string;
}

const YouProfile: React.FC<YouProfileProps> = ({ userName = 'User' }) => {
  const { user, logout, refreshUser } = useAuth();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'about' | 'friends' | 'photos' | 'videos' | 'settings'>('timeline');

  // Composer state
  const [postContent, setPostContent] = useState('');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postImageUploading, setPostImageUploading] = useState(false);
  const composerFileRef = useRef<HTMLInputElement>(null);

  // Edit-modal upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Direct tap-to-change refs (outside modal)
  const [directAvatarUploading, setDirectAvatarUploading] = useState(false);
  const [directCoverUploading, setDirectCoverUploading] = useState(false);
  const [directUploadError, setDirectUploadError] = useState<string | null>(null);
  const directAvatarRef = useRef<HTMLInputElement>(null);
  const directCoverRef = useRef<HTMLInputElement>(null);

  // Photos tab — direct multi-photo upload + lightbox
  const photosFileRef = useRef<HTMLInputElement>(null);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Edit-profile modal state
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    displayName: string;
    bio: string;
    profileImageUrl: string;
    coverImageUrl: string;
    location: string;
    website: string;
  }>({
    displayName: '',
    bio: '',
    profileImageUrl: '',
    coverImageUrl: '',
    location: '',
    website: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Post likes & comments state
  const [postLikeState, setPostLikeState] = useState<Map<number, { liked: boolean; count: number }>>(new Map());
  const [postComments, setPostComments] = useState<Map<number, CommentItem[]>>(new Map());
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Map<number, string>>(new Map());
  const [commentSubmitting, setCommentSubmitting] = useState<Set<number>>(new Set());

  // Friends tab state
  const [friendsSubTab, setFriendsSubTab] = useState<'followers' | 'following'>('followers');
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Messenger state
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [messengerRecipient, setMessengerRecipient] = useState<{ id: string; name: string } | undefined>();

  const displayName = useMemo(
    () => profile?.user.displayName || profile?.user.firstName || userName || 'User',
    [profile, userName],
  );
  const handle = useMemo(
    () => '@' + (String(displayName).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user'),
    [displayName],
  );

  // ------- Data fetchers --------------------------------------------------

  const fetchProfile = useCallback(async () => {
    try {
      const res = await axios.get<ProfilePayload>(`${API_URL}/api/profile/me`, {
        withCredentials: true,
      });
      setProfile(res.data);
    } catch {
      setProfile(null);
    }
  }, []);

  const fetchPosts = useCallback(async (profileId: string) => {
    try {
      const res = await axios.get<{ items: UserPost[] }>(
        `${API_URL}/api/profile/${profileId}/posts?limit=50`,
        { withCredentials: true },
      );
      const items = res.data.items || [];
      setPosts(items);
      // Seed like state map from server-side counts so the UI shows the
      // real numbers immediately instead of waiting for a toggle round-trip.
      setPostLikeState((prev) => {
        const next = new Map(prev);
        for (const p of items) {
          next.set(p.id, { liked: !!p.liked, count: p.likeCount ?? 0 });
        }
        return next;
      });
    } catch {
      setPosts([]);
    }
  }, []);

  const fetchFriends = useCallback(async (profileId: string) => {
    setFriendsLoading(true);
    try {
      const [follRes, followRes] = await Promise.all([
        axios.get<{ items: FollowUser[] }>(`${API_URL}/api/profile/${profileId}/followers?limit=100`),
        axios.get<{ items: FollowUser[] }>(`${API_URL}/api/profile/${profileId}/following?limit=100`),
      ]);
      setFollowers(follRes.data.items || []);
      setFollowing(followRes.data.items || []);
      // Track who the current user is following for the follow button
      if (profile?.isSelf) {
        setFollowingIds(new Set((followRes.data.items || []).map(u => u.id)));
      }
    } catch { /* silent */ }
    setFriendsLoading(false);
  }, [profile?.isSelf]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchProfile();
      if (cancelled) return;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchProfile]);

  useEffect(() => {
    if (profile?.user.id) {
      fetchPosts(profile.user.id);
    }
  }, [profile?.user.id, fetchPosts]);

  useEffect(() => {
    if (activeTab === 'friends' && profile?.user.id) {
      fetchFriends(profile.user.id);
    }
  }, [activeTab, profile?.user.id, fetchFriends]);

  // ------- Composer -------------------------------------------------------

  const submitPost = async () => {
    const trimmed = postContent.trim();
    const img = postImageUrl.trim();
    // FB-style: text or image is enough — don’t require both.
    if (!trimmed && !img) return;
    setPosting(true);
    setPostError(null);
    try {
      const body: { content: string; imageUrl?: string } = { content: trimmed };
      if (img) body.imageUrl = img;
      const res = await axios.post<UserPost>(
        `${API_URL}/api/profile/posts`,
        body,
        { withCredentials: true },
      );
      setPosts(prev => [res.data, ...prev]);
      setProfile(p => (p ? { ...p, postCount: (p.postCount || 0) + 1 } : p));
      setPostContent('');
      setPostImageUrl('');
    } catch (err: unknown) {
      const code =
        (err as { response?: { data?: { code?: string } } })?.response?.data?.code ||
        'post_failed';
      setPostError(code);
    } finally {
      setPosting(false);
    }
  };

  const deletePost = async (postId: number) => {
    try {
      await axios.delete(`${API_URL}/api/profile/posts/${postId}`, { withCredentials: true });
      setPosts(prev => prev.filter(p => p.id !== postId));
      setProfile(p => (p ? { ...p, postCount: Math.max(0, (p.postCount || 0) - 1) } : p));
    } catch { /* silent */ }
  };

  // ------- Post Likes -------------------------------------------------------

  const toggleLike = async (postId: number) => {
    try {
      const res = await axios.post<{ liked: boolean; likeCount: number }>(
        `${API_URL}/api/profile/posts/${postId}/like`,
        {},
        { withCredentials: true },
      );
      setPostLikeState(prev => {
        const next = new Map(prev);
        next.set(postId, { liked: res.data.liked, count: res.data.likeCount });
        return next;
      });
    } catch { /* silent */ }
  };

  // ------- Post Comments ----------------------------------------------------

  const toggleComments = async (postId: number) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
    if (!expandedComments.has(postId) && !postComments.has(postId)) {
      try {
        const res = await axios.get<{ items: CommentItem[] }>(
          `${API_URL}/api/profile/posts/${postId}/comments?limit=50`,
        );
        setPostComments(prev => new Map(prev).set(postId, res.data.items || []));
      } catch { /* silent */ }
    }
  };

  const submitComment = async (postId: number) => {
    const content = (commentInputs.get(postId) || '').trim();
    if (!content) return;
    setCommentSubmitting(prev => new Set(prev).add(postId));
    try {
      const res = await axios.post<CommentItem>(
        `${API_URL}/api/profile/posts/${postId}/comments`,
        { content },
        { withCredentials: true },
      );
      setPostComments(prev => {
        const next = new Map(prev);
        next.set(postId, [...(next.get(postId) || []), res.data]);
        return next;
      });
      setCommentInputs(prev => { const n = new Map(prev); n.delete(postId); return n; });
    } catch { /* silent */ }
    setCommentSubmitting(prev => { const n = new Set(prev); n.delete(postId); return n; });
  };

  const deleteComment = async (postId: number, commentId: number) => {
    try {
      await axios.delete(`${API_URL}/api/profile/posts/comments/${commentId}`, { withCredentials: true });
      setPostComments(prev => {
        const next = new Map(prev);
        next.set(postId, (next.get(postId) || []).filter(c => c.id !== commentId));
        return next;
      });
    } catch { /* silent */ }
  };

  // ------- Follow toggle (friends tab) -------------------------------------

  const toggleFollow = async (targetId: string) => {
    try {
      const res = await axios.post<{ following: boolean }>(
        `${API_URL}/api/profile/${targetId}/follow`,
        {},
        { withCredentials: true },
      );
      setFollowingIds(prev => {
        const next = new Set(prev);
        if (res.data.following) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
    } catch { /* silent */ }
  };

  // ------- Direct tap-to-change handlers ----------------------------------

  const handleDirectAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDirectAvatarUploading(true);
    setDirectUploadError(null);
    try {
      const url = await uploadImageFile(f);
      await axios.patch(`${API_URL}/api/profile/me`, { profileImageUrl: url }, { withCredentials: true });
      setProfile(p => p ? { ...p, user: { ...p.user, profileImageUrl: url } } : p);
      await refreshUser();
    } catch (err: unknown) {
      const code =
        (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data?.code ||
        (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data?.error ||
        'upload_failed';
      setDirectUploadError(code);
    }
    setDirectAvatarUploading(false);
    if (directAvatarRef.current) directAvatarRef.current.value = '';
  };

  const handleDirectCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDirectCoverUploading(true);
    setDirectUploadError(null);
    try {
      const url = await uploadImageFile(f);
      await axios.patch(`${API_URL}/api/profile/me`, { coverImageUrl: url }, { withCredentials: true });
      setProfile(p => p ? { ...p, user: { ...p.user, coverImageUrl: url } } : p);
    } catch (err: unknown) {
      const code =
        (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data?.code ||
        (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data?.error ||
        'upload_failed';
      setDirectUploadError(code);
    }
    setDirectCoverUploading(false);
    if (directCoverRef.current) directCoverRef.current.value = '';
  };

  // Photos tab: upload one or more photos to the gallery as photo-only
  // posts. Each file becomes a single user_post with imageUrl set and
  // empty content — backend now accepts that as a valid "photo post".
  const handlePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPhotosUploading(true);
    setPhotosError(null);
    let added = 0;
    for (const f of files) {
      try {
        const url = await uploadImageFile(f);
        const res = await axios.post<UserPost>(
          `${API_URL}/api/profile/posts`,
          { content: '', imageUrl: url },
          { withCredentials: true },
        );
        setPosts((prev) => [res.data, ...prev]);
        added += 1;
      } catch (err: unknown) {
        const code =
          (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data?.code ||
          (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data?.error ||
          'upload_failed';
        setPhotosError(code);
        break;
      }
    }
    if (added > 0) {
      setProfile((p) => (p ? { ...p, postCount: (p.postCount || 0) + added } : p));
    }
    setPhotosUploading(false);
    if (photosFileRef.current) photosFileRef.current.value = '';
  };

  // ------- Edit-profile modal --------------------------------------------

  const openEdit = () => {
    if (!profile) return;
    setEditDraft({
      displayName: profile.user.displayName || '',
      bio: profile.user.bio || '',
      profileImageUrl: profile.user.profileImageUrl || '',
      coverImageUrl: profile.user.coverImageUrl || '',
      location: profile.user.location || '',
      website: profile.user.website || '',
    });
    setEditError(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    setEditError(null);
    const patch: Record<string, string | null> = {};
    const draftName = editDraft.displayName.trim();
    if (draftName.length > 0 && draftName !== (profile?.user.displayName || '')) {
      patch.displayName = draftName;
    }
    if (editDraft.bio !== (profile?.user.bio || '')) patch.bio = editDraft.bio;
    if (editDraft.profileImageUrl !== (profile?.user.profileImageUrl || '')) {
      patch.profileImageUrl = editDraft.profileImageUrl || null;
    }
    if (editDraft.coverImageUrl !== (profile?.user.coverImageUrl || '')) {
      patch.coverImageUrl = editDraft.coverImageUrl || null;
    }
    if (editDraft.location !== (profile?.user.location || '')) {
      patch.location = editDraft.location || null;
    }
    if (editDraft.website !== (profile?.user.website || '')) {
      patch.website = editDraft.website || null;
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      setSavingEdit(false);
      return;
    }
    try {
      await axios.patch(`${API_URL}/api/profile/me`, patch, { withCredentials: true });
      await fetchProfile();
      await refreshUser();
      setEditing(false);
    } catch (err: unknown) {
      const code =
        (err as { response?: { data?: { code?: string } } })?.response?.data?.code ||
        'update_failed';
      setEditError(code);
    } finally {
      setSavingEdit(false);
    }
  };

  // ------- Render ---------------------------------------------------------

  const coverStyle: React.CSSProperties = profile?.user.coverImageUrl
    ? { backgroundImage: `url("${profile.user.coverImageUrl}")` }
    : {};

  const avatarInitial = (displayName || 'U').trim().charAt(0).toUpperCase();

  // Photos derived from posts
  const photoUrls = useMemo(
    () => posts.filter(p => p.imageUrl).map(p => p.imageUrl as string),
    [posts],
  );

  return (
    <div className="you-fb-container">
      {/* Hidden file inputs for direct tap-to-change */}
      <input
        ref={directAvatarRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleDirectAvatarChange}
      />
      <input
        ref={directCoverRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleDirectCoverChange}
      />

      {/* --- Cover banner ------------------------------------------------ */}
      <div
        className={`you-fb-cover${profile?.isSelf ? ' you-fb-cover-clickable' : ''}`}
        style={coverStyle}
        onClick={profile?.isSelf && !directCoverUploading ? () => directCoverRef.current?.click() : undefined}
        role={profile?.isSelf ? 'button' : undefined}
        aria-label={profile?.isSelf ? t('you.changeCover', 'Change cover photo') : undefined}
      >
        {!profile?.user.coverImageUrl && <div className="you-fb-cover-placeholder" />}
        {profile?.isSelf && (
          <div className="you-fb-cover-overlay">
            {directCoverUploading ? '⏳' : '📷'}
          </div>
        )}
        {profile?.isSelf && (
          <button className="you-fb-cover-edit" onClick={(e) => { e.stopPropagation(); openEdit(); }} aria-label={t('you.editProfile', 'Edit profile')}>
            📷 {t('you.editCover', 'Edit cover')}
          </button>
        )}
      </div>

      {/* --- Identity row ------------------------------------------------ */}
      <div className="you-fb-identity">
        <div className="you-fb-avatar-wrap">
          <div
            className={`you-fb-avatar-click-wrap${profile?.isSelf ? ' you-fb-avatar-clickable' : ''}`}
            onClick={profile?.isSelf && !directAvatarUploading ? () => directAvatarRef.current?.click() : undefined}
            role={profile?.isSelf ? 'button' : undefined}
            aria-label={profile?.isSelf ? t('you.changeAvatar', 'Change profile photo') : undefined}
          >
            {profile?.user.profileImageUrl ? (
              <img
                className="you-fb-avatar"
                src={profile.user.profileImageUrl}
                alt={displayName}
              />
            ) : (
              <div className="you-fb-avatar you-fb-avatar-fallback">{avatarInitial}</div>
            )}
            {profile?.isSelf && (
              <div className="you-fb-avatar-overlay">
                {directAvatarUploading ? '⏳' : '📷'}
              </div>
            )}
          </div>
        </div>
        <div className="you-fb-identity-main">
          <h1 className="you-fb-name">{displayName}</h1>
          <p className="you-fb-handle">{handle}</p>
          {profile?.user.bio && <p className="you-fb-bio">{profile.user.bio}</p>}
          <div className="you-fb-meta">
            {profile?.user.location && (
              <span className="you-fb-meta-item">📍 {profile.user.location}</span>
            )}
            {profile?.user.website && (
              <a
                className="you-fb-meta-item you-fb-link"
                href={profile.user.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                🔗 {profile.user.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
          <div className="you-fb-counts">
            <span><strong>{profile?.postCount ?? 0}</strong> {t('you.posts', 'posts')}</span>
            <span><strong>{profile?.followerCount ?? 0}</strong> {t('you.followersLabel', 'followers')}</span>
            <span><strong>{profile?.followingCount ?? 0}</strong> {t('you.following', 'following')}</span>
          </div>
        </div>
        <div className="you-fb-actions">
          {profile?.isSelf && (
            <button className="you-fb-btn you-fb-btn-primary" onClick={openEdit}>
              ✏️ {t('you.editProfile', 'Edit profile')}
            </button>
          )}
          {!profile?.isSelf && profile?.user.id && (
            <>
              <button
                className={`you-fb-btn ${profile.isFollowing ? 'you-fb-btn-ghost' : 'you-fb-btn-primary'}`}
                onClick={() => toggleFollow(profile.user.id)}
              >
                {profile.isFollowing ? t('you.unfollow', 'Unfollow') : t('you.follow', 'Follow')}
              </button>
              <button
                className="you-fb-btn you-fb-btn-ghost"
                onClick={() => {
                  setMessengerRecipient({ id: profile.user.id, name: displayName });
                  setMessengerOpen(true);
                }}
              >
                💬 {t('you.message', 'Message')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* --- Tab bar ---------------------------------------------------- */}
      <div className="you-fb-tabs">
        {(['timeline', 'about', 'friends', 'photos', 'videos', 'settings'] as const).map(tab => (
          <button
            key={tab}
            className={`you-fb-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'timeline' && t('you.timeline', 'Timeline')}
            {tab === 'about' && t('you.about', 'About')}
            {tab === 'friends' && t('you.friends', 'Friends')}
            {tab === 'photos' && t('you.photos', 'Photos')}
            {tab === 'videos' && t('you.videos', 'Videos')}
            {tab === 'settings' && t('you.settingsTab', 'Settings')}
          </button>
        ))}
      </div>

      {/* --- Timeline tab: composer + feed ----------------------------- */}
      {activeTab === 'timeline' && (
        <div className="you-fb-timeline">
          {profile?.isSelf && (
            <div className="you-fb-composer">
              <div className="you-fb-composer-top">
                {profile.user.profileImageUrl ? (
                  <img className="you-fb-composer-avatar" src={profile.user.profileImageUrl} alt="" />
                ) : (
                  <div className="you-fb-composer-avatar you-fb-avatar-fallback">{avatarInitial}</div>
                )}
                <textarea
                  className="you-fb-composer-textarea"
                  placeholder={t('you.whatOnYourMind', "What's on your mind?")}
                  value={postContent}
                  onChange={e => setPostContent(e.target.value)}
                  rows={3}
                  maxLength={5000}
                />
              </div>
              <div className="you-fb-upload-row">
                {postImageUrl && (
                  <img
                    className="you-fb-upload-preview you-fb-upload-preview-wide"
                    src={postImageUrl}
                    alt=""
                  />
                )}
                <input
                  ref={composerFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPostImageUploading(true);
                    setPostError(null);
                    try {
                      const url = await uploadImageFile(f);
                      setPostImageUrl(url);
                    } catch {
                      setPostError('upload_failed');
                    } finally {
                      setPostImageUploading(false);
                      if (composerFileRef.current) composerFileRef.current.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  className="you-fb-btn"
                  disabled={postImageUploading}
                  onClick={() => composerFileRef.current?.click()}
                >
                  📷 {postImageUploading
                    ? t('you.uploading', 'Uploading…')
                    : t('you.addPhoto', 'Add photo')}
                </button>
                {postImageUrl && (
                  <button
                    type="button"
                    className="you-fb-btn"
                    onClick={() => setPostImageUrl('')}
                  >
                    {t('you.removePhoto', 'Remove')}
                  </button>
                )}
              </div>
              {postError && (
                <p className="you-fb-error">
                  {postError === 'invalid_content' ? t('you.postTooShort', 'Post cannot be empty or too long.') :
                   postError === 'invalid_image_url' ? t('you.badImageUrl', 'Image URL is invalid.') :
                   t('you.postFailed', 'Could not publish post.')}
                </p>
              )}
              <div className="you-fb-composer-actions">
                <button
                  className="you-fb-btn you-fb-btn-primary"
                  onClick={submitPost}
                  disabled={
                    posting ||
                    (postContent.trim().length === 0 && postImageUrl.trim().length === 0)
                  }
                >
                  {posting ? t('you.posting', 'Posting...') : t('you.post', 'Post')}
                </button>
              </div>
            </div>
          )}

          <div className="you-fb-feed">
            {loading && <p className="you-fb-muted">{t('you.loading', 'Loading...')}</p>}
            {!loading && posts.length === 0 && (
              <p className="you-fb-muted">
                {profile?.isSelf
                  ? t('you.emptyFeedSelf', 'No posts yet. Share what you are thinking!')
                  : t('you.emptyFeed', 'No posts yet.')}
              </p>
            )}
            {posts.map(p => {
              const likeInfo = postLikeState.get(p.id) ?? { liked: false, count: 0 };
              const comments = postComments.get(p.id) ?? [];
              const isExpanded = expandedComments.has(p.id);
              return (
                <article key={p.id} className="you-fb-post">
                  <header className="you-fb-post-head">
                    {profile?.user.profileImageUrl ? (
                      <img className="you-fb-post-avatar" src={profile.user.profileImageUrl} alt="" />
                    ) : (
                      <div className="you-fb-post-avatar you-fb-avatar-fallback">{avatarInitial}</div>
                    )}
                    <div className="you-fb-post-meta">
                      <strong>{displayName}</strong>
                      <time>{new Date(p.createdAt).toLocaleString()}</time>
                    </div>
                    {profile?.isSelf && (
                      <button
                        className="you-fb-post-delete"
                        onClick={() => deletePost(p.id)}
                        aria-label={t('you.deletePost', 'Delete post')}
                      >
                        ✕
                      </button>
                    )}
                  </header>
                  {p.content && p.content.length > 0 && (
                    <p className="you-fb-post-body">{p.content}</p>
                  )}
                  {p.imageUrl && (
                    <img
                      className="you-fb-post-image"
                      src={p.imageUrl}
                      alt=""
                      loading="lazy"
                      onClick={() => setLightboxUrl(p.imageUrl as string)}
                      style={{ cursor: 'zoom-in' }}
                    />
                  )}
                  {/* Like + Comment actions */}
                  <div className="you-fb-post-actions">
                    <button
                      className={`you-fb-post-action-btn${likeInfo.liked ? ' you-fb-post-action-active' : ''}`}
                      onClick={() => toggleLike(p.id)}
                    >
                      {likeInfo.liked ? '❤️' : '🤍'} {likeInfo.count > 0 ? likeInfo.count : ''} {t('you.like', 'Like')}
                    </button>
                    <button
                      className="you-fb-post-action-btn"
                      onClick={() => toggleComments(p.id)}
                    >
                      💬 {(comments.length || p.commentCount || 0) > 0
                        ? (comments.length || p.commentCount)
                        : ''} {t('you.comment', 'Comment')}
                    </button>
                  </div>
                  {/* Comments section */}
                  {isExpanded && (
                    <div className="you-fb-comments">
                      {comments.map(c => (
                        <div key={c.id} className="you-fb-comment">
                          <span className="you-fb-comment-user">{c.userName || c.userId.slice(0, 8)}</span>
                          <span className="you-fb-comment-content">{c.content}</span>
                          {(profile?.isSelf || c.userId === profile?.user.id) && (
                            <button
                              className="you-fb-comment-delete"
                              onClick={() => deleteComment(p.id, c.id)}
                              aria-label={t('you.deleteComment', 'Delete')}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {user && (
                        <div className="you-fb-comment-form">
                          <input
                            className="you-fb-comment-input"
                            placeholder={t('you.writeComment', 'Write a comment…')}
                            value={commentInputs.get(p.id) || ''}
                            onChange={e => setCommentInputs(prev => new Map(prev).set(p.id, e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(p.id); } }}
                            maxLength={1000}
                          />
                          <button
                            className="you-fb-btn you-fb-btn-primary"
                            onClick={() => submitComment(p.id)}
                            disabled={commentSubmitting.has(p.id) || !(commentInputs.get(p.id) || '').trim()}
                          >
                            {t('you.send', 'Send')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </header>
                <p className="you-fb-post-body">{p.content}</p>
                {p.imageUrl && (
                  <img className="you-fb-post-image" src={p.imageUrl} alt="" loading="lazy" />
                )}
                {p.sourceKind && (
                  <div className="you-fb-post-source">
                    {p.sourceKind === 'writers' && (
                      <span className="you-fb-post-source-badge">
                        ✍️ {t('you.sourceWriters', 'From Writers Hub')}
                      </span>
                    )}
                    {p.sourceKind === 'trading' && (
                      <span className="you-fb-post-source-badge">
                        📊 {t('you.sourceTrading', 'From Trading Akademie')}
                      </span>
                    )}
                    {p.sourceKind === 'reel' && (
                      <span className="you-fb-post-source-badge">
                        🎬 {t('you.sourceReel', 'From Reels')}
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {/* --- About tab -------------------------------------------------- */}
      {activeTab === 'about' && (
        <div className="you-fb-about">
          <div className="you-fb-about-row">
            <strong>{t('you.bio', 'Bio')}:</strong>
            <span>{profile?.user.bio || t('you.notSet', '—')}</span>
          </div>
          <div className="you-fb-about-row">
            <strong>📍 {t('you.location', 'Location')}:</strong>
            <span>{profile?.user.location || t('you.notSet', '—')}</span>
          </div>
          <div className="you-fb-about-row">
            <strong>🔗 {t('you.website', 'Website')}:</strong>
            {profile?.user.website ? (
              <a href={profile.user.website} target="_blank" rel="noopener noreferrer">
                {profile.user.website}
              </a>
            ) : (
              <span>{t('you.notSet', '—')}</span>
            )}
          </div>
          <div className="you-fb-about-row">
            <strong>{t('you.joined', 'Joined')}:</strong>
            <span>
              {profile?.user.createdAt
                ? new Date(profile.user.createdAt).toLocaleDateString()
                : '—'}
            </span>
          </div>
        </div>
      )}

      {/* --- Friends tab ------------------------------------------------ */}
      {activeTab === 'friends' && (
        <div className="you-fb-friends">
          <div className="you-fb-friends-subtabs">
            <button
              className={`you-fb-tab ${friendsSubTab === 'followers' ? 'active' : ''}`}
              onClick={() => setFriendsSubTab('followers')}
            >
              {t('you.followers', 'Followers')} ({followers.length})
            </button>
            <button
              className={`you-fb-tab ${friendsSubTab === 'following' ? 'active' : ''}`}
              onClick={() => setFriendsSubTab('following')}
            >
              {t('you.following', 'Following')} ({following.length})
            </button>
          </div>
          {friendsLoading && <p className="you-fb-muted">{t('you.loading', 'Loading...')}</p>}
          <div className="you-fb-friends-list">
            {(friendsSubTab === 'followers' ? followers : following).map(u => (
              <div key={u.id} className="you-fb-friend-card">
                {u.profileImageUrl ? (
                  <img className="you-fb-friend-avatar" src={u.profileImageUrl} alt={u.displayName || u.firstName || ''} />
                ) : (
                  <div className="you-fb-friend-avatar you-fb-avatar-fallback">
                    {(u.displayName || u.firstName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="you-fb-friend-name">{u.displayName || u.firstName || t('you.unknownUser', 'User')}</span>
                {!profile?.isSelf && u.id !== profile?.user.id && (
                  <button
                    className={`you-fb-btn ${followingIds.has(u.id) ? 'you-fb-btn-ghost' : 'you-fb-btn-primary'}`}
                    onClick={() => toggleFollow(u.id)}
                  >
                    {followingIds.has(u.id) ? t('you.unfollow', 'Unfollow') : t('you.follow', 'Follow')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Photos tab ------------------------------------------------- */}
      {activeTab === 'photos' && (
        <div className="you-fb-photos">
          <div className="you-fb-photos-header">
            <p className="you-fb-muted">
              {photoUrls.length} {t('you.photosCount', 'photos')}
            </p>
            {profile?.isSelf && (
              <>
                <input
                  ref={photosFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handlePhotosUpload}
                />
                <button
                  type="button"
                  className="you-fb-btn you-fb-btn-primary"
                  disabled={photosUploading}
                  onClick={() => photosFileRef.current?.click()}
                >
                  {photosUploading
                    ? t('you.uploading', 'Uploading…')
                    : t('you.addPhotos', '📷 Add photos')}
                </button>
              </>
            )}
          </div>
          {photosError && (
            <p className="you-fb-error">
              {photosError === 'invalid_image_url'
                ? t('you.badImageUrl', 'Image URL is invalid.')
                : t('you.uploadFailed', 'Could not upload one or more photos.')}
            </p>
          )}
          {photoUrls.length === 0 ? (
            <p className="you-fb-muted">{t('you.noPhotos', 'No photos yet.')}</p>
          ) : (
            <div className="you-fb-photos-grid">
              {photoUrls.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  className="you-fb-photo-thumb-btn"
                  onClick={() => setLightboxUrl(url)}
                  aria-label={t('you.viewPhoto', 'View photo')}
                >
                  <img className="you-fb-photo-thumb" src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Photo lightbox -------------------------------------------- */}
      {lightboxUrl && (
        <div
          className="you-fb-lightbox"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-label={t('you.viewPhoto', 'View photo')}
        >
          <button
            className="you-fb-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            aria-label={t('you.close', 'Close')}
          >
            ✕
          </button>
          <img
            className="you-fb-lightbox-img"
            src={lightboxUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* --- Direct upload error toast -------------------------------- */}
      {directUploadError && (
        <div
          className="you-fb-toast you-fb-toast-error"
          role="alert"
          onClick={() => setDirectUploadError(null)}
        >
          {directUploadError === 'invalid_image_url'
            ? t('you.badImageUrl', 'Image URL is invalid.')
            : directUploadError === 'invalid_cover_url'
            ? t('you.badCoverUrl', 'Cover image URL is invalid.')
            : t('you.uploadFailed', 'Could not upload photo.')}
        </div>
      )}

      {/* --- Videos tab ------------------------------------------------- */}
      {activeTab === 'videos' && profile?.user.id && (
        <VideosTab profileId={profile.user.id} />
      )}

      {/* --- Settings tab ---------------------------------------------- */}
      {activeTab === 'settings' && (
        <div className="you-fb-settings">
          <label className="you-fb-field">
            <span>{t('you.emailLabel', 'Email')}</span>
            <input type="email" value={profile?.user.email || user?.email || ''} disabled />
          </label>
          <label className="you-fb-field">
            <span>{t('you.language', 'Language')}</span>
            <LanguageSelector />
          </label>
          <button className="you-fb-btn you-fb-btn-primary" onClick={openEdit}>
            ✏️ {t('you.editProfile', 'Edit profile')}
          </button>
          <button className="you-fb-btn you-fb-btn-danger" onClick={logout}>
            {t('you.logout', 'Logout')}
          </button>
        </div>
      )}

      {/* --- Edit-profile modal --------------------------------------- */}
      {editing && (
        <div className="you-fb-modal-backdrop" onClick={() => !savingEdit && setEditing(false)}>
          <div className="you-fb-modal" onClick={e => e.stopPropagation()}>
            <h2>{t('you.editProfile', 'Edit profile')}</h2>

            <label className="you-fb-field">
              <span>{t('you.name', 'Name')}</span>
              <input
                type="text"
                value={editDraft.displayName}
                onChange={e => setEditDraft(d => ({ ...d, displayName: e.target.value }))}
                maxLength={60}
              />
            </label>

            <label className="you-fb-field">
              <span>{t('you.bio', 'Bio')}</span>
              <textarea
                value={editDraft.bio}
                onChange={e => setEditDraft(d => ({ ...d, bio: e.target.value }))}
                rows={3}
                maxLength={500}
              />
            </label>

            <label className="you-fb-field">
              <span>{t('you.profileImage', 'Profile photo')}</span>
              <div className="you-fb-upload-row">
                {editDraft.profileImageUrl && (
                  <img
                    className="you-fb-upload-preview"
                    src={editDraft.profileImageUrl}
                    alt=""
                  />
                )}
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setAvatarUploading(true);
                    setEditError(null);
                    try {
                      const url = await uploadImageFile(f);
                      setEditDraft(d => ({ ...d, profileImageUrl: url }));
                    } catch {
                      setEditError('upload_failed');
                    } finally {
                      setAvatarUploading(false);
                      if (avatarFileRef.current) avatarFileRef.current.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  className="you-fb-btn"
                  disabled={avatarUploading}
                  onClick={() => avatarFileRef.current?.click()}
                >
                  {avatarUploading
                    ? t('you.uploading', 'Uploading…')
                    : t('you.uploadPhoto', 'Upload photo')}
                </button>
                {editDraft.profileImageUrl && (
                  <button
                    type="button"
                    className="you-fb-btn"
                    onClick={() => setEditDraft(d => ({ ...d, profileImageUrl: '' }))}
                  >
                    {t('you.removePhoto', 'Remove')}
                  </button>
                )}
              </div>
            </label>

            <label className="you-fb-field">
              <span>{t('you.coverImage', 'Cover photo')}</span>
              <div className="you-fb-upload-row">
                {editDraft.coverImageUrl && (
                  <img
                    className="you-fb-upload-preview you-fb-upload-preview-wide"
                    src={editDraft.coverImageUrl}
                    alt=""
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
                    setEditError(null);
                    try {
                      const url = await uploadImageFile(f);
                      setEditDraft(d => ({ ...d, coverImageUrl: url }));
                    } catch {
                      setEditError('upload_failed');
                    } finally {
                      setCoverUploading(false);
                      if (coverFileRef.current) coverFileRef.current.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  className="you-fb-btn"
                  disabled={coverUploading}
                  onClick={() => coverFileRef.current?.click()}
                >
                  {coverUploading
                    ? t('you.uploading', 'Uploading…')
                    : t('you.uploadCover', 'Upload cover')}
                </button>
                {editDraft.coverImageUrl && (
                  <button
                    type="button"
                    className="you-fb-btn"
                    onClick={() => setEditDraft(d => ({ ...d, coverImageUrl: '' }))}
                  >
                    {t('you.removePhoto', 'Remove')}
                  </button>
                )}
              </div>
            </label>

            <label className="you-fb-field">
              <span>📍 {t('you.location', 'Location')}</span>
              <input
                type="text"
                value={editDraft.location}
                onChange={e => setEditDraft(d => ({ ...d, location: e.target.value }))}
                maxLength={120}
              />
            </label>

            <label className="you-fb-field">
              <span>🔗 {t('you.website', 'Website')}</span>
              <input
                type="url"
                value={editDraft.website}
                onChange={e => setEditDraft(d => ({ ...d, website: e.target.value }))}
                placeholder="https://..."
              />
            </label>

            {editError && (
              <p className="you-fb-error">
                {editError === 'invalid_image_url' && t('you.badImageUrl', 'Profile image URL is invalid.')}
                {editError === 'invalid_cover_url' && t('you.badCoverUrl', 'Cover image URL is invalid.')}
                {editError === 'invalid_website' && t('you.badWebsite', 'Website URL is invalid.')}
                {editError === 'invalid_location' && t('you.badLocation', 'Location is invalid.')}
                {editError === 'invalid_display_name' && t('you.badName', 'Name is invalid.')}
                {editError === 'invalid_bio' && t('you.badBio', 'Bio is too long.')}
                {![
                  'invalid_image_url',
                  'invalid_cover_url',
                  'invalid_website',
                  'invalid_location',
                  'invalid_display_name',
                  'invalid_bio',
                ].includes(editError) && t('you.updateFailed', 'Could not save changes.')}
              </p>
            )}

            <div className="you-fb-modal-actions">
              <button
                className="you-fb-btn you-fb-btn-ghost"
                onClick={() => setEditing(false)}
                disabled={savingEdit}
              >
                {t('you.cancel', 'Cancel')}
              </button>
              <button
                className="you-fb-btn you-fb-btn-primary"
                onClick={saveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? t('you.saving', 'Saving...') : t('you.saveChanges', 'Save changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Messenger drawer ----------------------------------------- */}
      <Messenger
        isOpen={messengerOpen}
        onClose={() => setMessengerOpen(false)}
        initialRecipientId={messengerRecipient?.id}
        initialRecipientName={messengerRecipient?.name}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Videos sub-component
// ---------------------------------------------------------------------------
interface VideoItem {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  url: string;
  createdAt: string;
}

const VideosTab: React.FC<{ profileId: string }> = ({ profileId }) => {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<VideoItem[]>(`${API_URL}/api/profile/${profileId}/videos`)
      .then(r => { if (!cancelled) setVideos(r.data || []); })
      .catch(() => { if (!cancelled) setVideos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  if (loading) return <p className="you-fb-muted">{t('you.loading', 'Loading...')}</p>;
  if (videos.length === 0) return <p className="you-fb-muted">{t('you.noVideos', 'No videos yet.')}</p>;

  return (
    <div className="you-fb-videos-grid">
      {videos.map(v => (
        <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="you-fb-video-card">
          {v.thumbnailUrl ? (
            <img className="you-fb-video-thumb" src={v.thumbnailUrl} alt={v.title} loading="lazy" />
          ) : (
            <div className="you-fb-video-thumb you-fb-video-placeholder">▶</div>
          )}
          <p className="you-fb-video-title">{v.title}</p>
        </a>
      ))}
    </div>
  );
};


export default YouProfile;
