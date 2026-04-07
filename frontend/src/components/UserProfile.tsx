import React, { useState, useEffect } from 'react';
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
  earnings: number;
  isFollowed: boolean;
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

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/profile`);
      const data: UserProfileData = await response.json();
      setProfile(data);
      setIsFollowing(data.isFollowed);
      setEditData({
        bio: data.bio,
        website: data.website || '',
        location: data.location || '',
        profileColor: (data as any).profileColor || '#9d4edd',
      });

      // Load user posts
      const postsResponse = await fetch(`/api/users/${userId}/posts`);
      const posts = await postsResponse.json();
      setUserPosts(Array.isArray(posts) ? posts : []);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!profile) return;
    try {
      const response = await fetch(`/api/users/${profile.id}/follow`, {
        method: 'POST',
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

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const formData = new FormData();
    formData.append('banner', file);

    try {
      const response = await fetch(`/api/users/${profile.id}/banner`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        setProfile({ ...profile, banner: data.banner });
      }
    } catch (error) {
      console.error('Error uploading banner:', error);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch(`/api/users/${profile.id}/avatar`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        setProfile({ ...profile, avatar: data.avatar });
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    try {
      const response = await fetch(`/api/users/${profile.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
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
          <div className="profile-loading">Loading profile...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-overlay" onClick={onClose}>
        <div className="profile-container" onClick={(e) => e.stopPropagation()}>
          <div className="profile-error">Profile not found</div>
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
                ? 'linear-gradient(135deg, #FF3333 0%, #000000 100%)'
                : undefined,
            }}
          >
            {profile.isSelf && (
              <label className="banner-upload-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerUpload}
                  hidden
                />
                📸 Change Banner
              </label>
            )}
          </div>

          {/* Profile Picture */}
          <div className="profile-pic-container">
            <div className="profile-pic-wrapper">
              <div 
                className="profile-pic" 
                style={{ 
                  backgroundImage: profile.avatar && profile.avatar.startsWith('http') ? `url(${profile.avatar})` : undefined,
                  backgroundColor: !profile.avatar || !profile.avatar.startsWith('http') ? profile.avatar : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  fontSize: profile.avatar && !profile.avatar.startsWith('http') ? '48px' : '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {profile.avatar && !profile.avatar.startsWith('http') && profile.avatar}
              </div>
              {profile.isSelf && (
                <label className="avatar-upload-badge">
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
                <>
                  <button
                    className={`action-btn follow-btn ${isFollowing ? 'following' : ''}`}
                    onClick={handleFollow}
                  >
                    {isFollowing ? '✓ Following' : '+ Follow'}
                  </button>
                  <button className="action-btn message-btn">💬 Message</button>
                </>
              ) : (
                <button
                  className="action-btn edit-btn"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? '✕ Cancel' : '✎ Edit Profile'}
                </button>
              )}
            </div>
          </div>

          {/* Bio */}
          {isEditing ? (
            <div className="edit-bio-section">
              <textarea
                value={editData.bio}
                onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                placeholder="Your bio..."
                className="edit-input"
                maxLength={160}
              />
              <div className="edit-meta">
                <input
                  type="text"
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  placeholder="Location"
                  className="edit-input"
                />
                <input
                  type="url"
                  value={editData.website}
                  onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                  placeholder="Website URL"
                  className="edit-input"
                />
                <div className="edit-color-picker">
                  <label>Profile Theme Color:</label>
                  <input
                    type="color"
                    value={editData.profileColor}
                    onChange={(e) => setEditData({ ...editData, profileColor: e.target.value })}
                    className="color-input"
                  />
                </div>
              </div>
              <button className="save-btn" onClick={handleSaveProfile}>
                Save Changes
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
            <div className="stat-label">Posts</div>
          </div>
          <div className="stat-card followers">
            <div className="stat-icon">👥</div>
            <div className="stat-value">{profile.followers.toLocaleString()}</div>
            <div className="stat-label">Followers</div>
          </div>
          <div className="stat-card following">
            <div className="stat-icon">🔗</div>
            <div className="stat-value">{profile.following}</div>
            <div className="stat-label">Following</div>
          </div>
          <div className="stat-card earnings">
            <div className="stat-icon">💰</div>
            <div className="stat-value">${profile.earnings.toFixed(0)}</div>
            <div className="stat-label">Earnings</div>
          </div>
        </div>

        {/* Posts Feed */}
        <div className="profile-posts-section">
          <h2>Recent Posts</h2>
          <div className="profile-posts-list">
            {userPosts.length === 0 ? (
              <div className="no-posts">
                <p>No posts yet</p>
              </div>
            ) : (
              userPosts.map((post: any) => (
                <div key={post.id} className="profile-post-card">
                  <p>{post.content}</p>
                  <div className="post-engagement">
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.comments}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
