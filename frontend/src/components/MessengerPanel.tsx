import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import './MessengerPanel.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

interface Conversation {
  id: number;
  otherId: string;
  otherName: string | null;
  otherAvatar: string | null;
  lastMessageAt: string | null;
  lastMessage: string | null;
  unreadCount: number;
}

interface Message {
  id: number;
  senderId: string;
  content: string;
  read: number;
  createdAt: string;
}

interface MessengerPanelProps {
  initialUserId?: string;
  initialUserName?: string;
  onUnreadCountChange?: (count: number) => void;
}

const MessengerPanel: React.FC<MessengerPanelProps> = ({
  initialUserId,
  initialUserName,
  onUnreadCountChange,
}) => {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedOtherName, setSelectedOtherName] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [initialDone, setInitialDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await axios.get<{ user: { id: string } }>(`${API_URL}/api/profile/me`, { withCredentials: true });
      setCurrentUserId(res.data.user.id);
    } catch { /* silent */ }
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await axios.get<{ items: Conversation[] }>(
        `${API_URL}/api/messenger/conversations`,
        { withCredentials: true },
      );
      const items = res.data.items || [];
      setConversations(items);
      const total = items.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      onUnreadCountChange?.(total);
    } catch { /* silent */ }
    setLoadingConvs(false);
  }, [onUnreadCountChange]);

  const fetchMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const res = await axios.get<{ items: Message[] }>(
        `${API_URL}/api/messenger/conversations/${convId}/messages?limit=50`,
        { withCredentials: true },
      );
      setMessages(res.data.items || []);
      await axios.post(
        `${API_URL}/api/messenger/conversations/${convId}/read`,
        {},
        { withCredentials: true },
      ).catch(() => {});
      // Refresh unread counts
      fetchConversations();
    } catch { /* silent */ }
    setLoadingMsgs(false);
  }, [fetchConversations]);

  const openOrCreateConv = useCallback(async (recipientId: string, recipientName: string) => {
    try {
      const res = await axios.post<{ id: number }>(
        `${API_URL}/api/messenger/conversations`,
        { recipientId },
        { withCredentials: true },
      );
      setSelectedConvId(res.data.id);
      setSelectedOtherName(recipientName);
      await fetchMessages(res.data.id);
    } catch { /* silent */ }
  }, [fetchMessages]);

  // Initial load
  useEffect(() => {
    fetchCurrentUser();
    fetchConversations();
  }, [fetchCurrentUser, fetchConversations]);

  // Deep-link: open conversation with specific user
  useEffect(() => {
    if (!initialDone && initialUserId && initialUserName) {
      setInitialDone(true);
      openOrCreateConv(initialUserId, initialUserName);
    }
  }, [initialDone, initialUserId, initialUserName, openOrCreateConv]);

  // Poll messages when conversation selected
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedConvId) {
      pollRef.current = setInterval(() => {
        fetchMessages(selectedConvId);
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedConvId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectConversation = async (conv: Conversation) => {
    setSelectedConvId(conv.id);
    setSelectedOtherName(conv.otherName || t('messenger.userFallback'));
    await fetchMessages(conv.id);
  };

  const sendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedConvId) return;
    setSending(true);
    try {
      const res = await axios.post<Message>(
        `${API_URL}/api/messenger/conversations/${selectedConvId}/messages`,
        { content },
        { withCredentials: true },
      );
      setMessages(prev => [...prev, res.data]);
      setMessageInput('');
      await fetchConversations();
    } catch { /* silent */ }
    setSending(false);
  };

  return (
    <div className="mp-root">
      {/* Conversation list */}
      <div className="mp-sidebar">
        <div className="mp-sidebar-header">
          <span className="mp-sidebar-title">{t('messenger.title')}</span>
        </div>
        <div className="mp-convs">
          {loadingConvs && <p className="mp-muted">{t('messenger.loading')}</p>}
          {!loadingConvs && conversations.length === 0 && (
            <p className="mp-muted">{t('messenger.noConversations')}</p>
          )}
          {conversations.map(conv => (
            <button
              key={conv.id}
              className={`mp-conv-item${selectedConvId === conv.id ? ' active' : ''}`}
              onClick={() => selectConversation(conv)}
            >
              <div className="mp-conv-avatar">
                {conv.otherAvatar ? (
                  <img src={conv.otherAvatar} alt="" />
                ) : (
                  <span>{(conv.otherName || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="mp-conv-info">
                <strong className="mp-conv-name">{conv.otherName || t('messenger.userFallback')}</strong>
                {conv.lastMessage && (
                  <span className="mp-conv-preview">{conv.lastMessage}</span>
                )}
              </div>
              {conv.unreadCount > 0 && (
                <span className="mp-badge">{conv.unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Message thread */}
      <div className="mp-thread">
        {!selectedConvId ? (
          <div className="mp-empty">
            <p>{t('messenger.selectConversation')}</p>
          </div>
        ) : (
          <>
            <div className="mp-thread-header">
              <button className="mp-back-btn" onClick={() => setSelectedConvId(null)}>←</button>
              <strong>{selectedOtherName}</strong>
            </div>
            <div className="mp-messages">
              {loadingMsgs && <p className="mp-muted">{t('messenger.loading')}</p>}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`mp-message${msg.senderId === currentUserId ? ' mp-message-own' : ''}`}
                >
                  <span className="mp-message-content">{msg.content}</span>
                  <span className="mp-message-time">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="mp-input-row">
              <input
                className="mp-input"
                placeholder={t('messenger.messagePlaceholder')}
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                maxLength={5000}
              />
              <button
                className="mp-send-btn"
                onClick={sendMessage}
                disabled={sending || !messageInput.trim()}
                aria-label={t('messenger.send')}
              >
                ➤
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MessengerPanel;
