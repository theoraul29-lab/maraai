import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';
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
// Types — reflect `/api/profile/me` and `/api/profile/:id/posts` payloads.
// The backend adds cover/location/website fields in migration 0007.
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
}

interface UserPost {
  id: number;
  userId: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

interface YouProfileProps {
  userName?: string;
}

const YouProfile: React.FC<YouProfileProps> = ({ userName = 'User' }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'about' | 'settings'>('timeline');

  // Composer state
  const [postContent, setPostContent] = useState('');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postImageUploading, setPostImageUploading] = useState(false);
  const composerFileRef = useRef<HTMLInputElement>(null);

  // Edit-modal upload state — kept separate so a slow cover upload doesn't
  // disable the avatar picker and vice versa.
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

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
        `${API_URL}/api/profile/${profileId}/posts?limit=20`,
      );
      setPosts(res.data.items || []);
    } catch {
      setPosts([]);
    }
  }, []);

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

  // ------- Composer -------------------------------------------------------

  const submitPost = async () => {
    const trimmed = postContent.trim();
    if (!trimmed) return;
    setPosting(true);
    setPostError(null);
    try {
      const body: { content: string; imageUrl?: string } = { content: trimmed };
      const img = postImageUrl.trim();
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
    // Build patch with only-changed fields so we don't send e.g. an empty
    // displayName and trigger invalid_display_name.
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

  return (
    <div className="you-fb-container">
      {/* --- Cover banner ------------------------------------------------ */}
      <div className="you-fb-cover" style={coverStyle}>
        {!profile?.user.coverImageUrl && <div className="you-fb-cover-placeholder" />}
        {profile?.isSelf && (
          <button className="you-fb-cover-edit" onClick={openEdit} aria-label={t('you.editProfile', 'Edit profile')}>
            📷 {t('you.editCover', 'Edit cover')}
          </button>
        )}
      </div>

      {/* --- Identity row ------------------------------------------------ */}
      <div className="you-fb-identity">
        <div className="you-fb-avatar-wrap">
          {profile?.user.profileImageUrl ? (
            <img
              className="you-fb-avatar"
              src={profile.user.profileImageUrl}
              alt={displayName}
            />
          ) : (
            <div className="you-fb-avatar you-fb-avatar-fallback">{avatarInitial}</div>
          )}
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
                rel="noreferrer noopener"
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
        {profile?.isSelf && (
          <div className="you-fb-actions">
            <button className="you-fb-btn you-fb-btn-primary" onClick={openEdit}>
              ✏️ {t('you.editProfile', 'Edit profile')}
            </button>
          </div>
        )}
      </div>

      {/* --- Tab bar ---------------------------------------------------- */}
      <div className="you-fb-tabs">
        {(['timeline', 'about', 'settings'] as const).map(tab => (
          <button
            key={tab}
            className={`you-fb-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'timeline' && t('you.timeline', 'Timeline')}
            {tab === 'about' && t('you.about', 'About')}
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
                  disabled={posting || postContent.trim().length === 0}
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
            {posts.map(p => (
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
                <p className="you-fb-post-body">{p.content}</p>
                {p.imageUrl && (
                  <img className="you-fb-post-image" src={p.imageUrl} alt="" loading="lazy" />
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
              <a href={profile.user.website} target="_blank" rel="noreferrer noopener">
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
    </div>
  );
};

export default YouProfile;
