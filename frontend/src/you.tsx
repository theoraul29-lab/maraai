import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import YouProfile from './components/YouProfile';
import MessengerPanel from './components/MessengerPanel';
import './styles/YouProfile.css';
import './styles/You.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

type YouTab = 'profile' | 'messages';

const You: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [unreadCount, setUnreadCount] = useState(0);

  const tabParam = searchParams.get('tab') as YouTab | null;
  const activeTab: YouTab = tabParam === 'messages' ? 'messages' : 'profile';
  const startWith = searchParams.get('startWith') || undefined;

  // Fetch unread count for badge on Messages tab
  useEffect(() => {
    axios
      .get<{ items: { unreadCount: number }[] }>(`${API_URL}/api/messenger/conversations`, { withCredentials: true })
      .then(res => {
        const total = (res.data.items || []).reduce((s, c) => s + (c.unreadCount || 0), 0);
        setUnreadCount(total);
      })
      .catch(() => {});
  }, []);

  const switchTab = (tab: YouTab) => {
    if (tab === 'profile') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  // When navigating to messages with startWith, we need display name too.
  // We derive initialUserName from the URL or leave it as the user ID — the panel
  // calls openOrCreateConv which uses recipientId, so the name shown updates after load.
  const initialUserName = searchParams.get('startWithName') || startWith || '';

  return (
    <div className="you-page">
      <div className="you-tabs">
        <button
          className={`you-tab${activeTab === 'profile' ? ' active' : ''}`}
          onClick={() => switchTab('profile')}
        >
          {t('you.profile', 'Profile')}
        </button>
        <button
          className={`you-tab${activeTab === 'messages' ? ' active' : ''}`}
          onClick={() => switchTab('messages')}
        >
          {t('you.messages', 'Messages')}
          {unreadCount > 0 && <span className="you-tab-badge">{unreadCount}</span>}
        </button>
      </div>

      <div className="you-content">
        {activeTab === 'profile' && (
          <YouProfile userName={user?.name || 'User'} />
        )}
        {activeTab === 'messages' && (
          <div className="you-messenger-wrap">
            <MessengerPanel
              initialUserId={startWith}
              initialUserName={initialUserName}
              onUnreadCountChange={setUnreadCount}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default You;
