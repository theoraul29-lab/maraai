import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import '../styles/Messenger.css';

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

interface MessengerProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipientId?: string;
  initialRecipientName?: string;
}

const Messenger: React.FC<MessengerProps> = ({
  isOpen,
  onClose,
  initialRecipientId,
  initialRecipientName,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedOtherName, setSelectedOtherName] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await axios.get<{ user: { id: string } }>(`${API_URL}/api/profile/me`, { withCredentials: true });
      setCurrentUserId(res.data.user.id);
    } catch { /* user not logged in */ }
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await axios.get<{ items: Conversation[] }>(
        `${API_URL}/api/messenger/conversations`,
        { withCredentials: true },
      );
      setConversations(res.data.items || []);
    } catch { /* silent */ }
    setLoadingConvs(false);
  }, []);

  const fetchMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const res = await axios.get<{ items: Message[] }>(
        `${API_URL}/api/messenger/conversations/${convId}/messages?limit=50`,
        { withCredentials: true },
      );
      setMessages(res.data.items || []);
      // Mark as read
      await axios.post(
        `${API_URL}/api/messenger/conversations/${convId}/read`,
        {},
        { withCredentials: true },
      ).catch(() => {});
    } catch { /* silent */ }
    setLoadingMsgs(false);
  }, []);

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

  // On open: fetch user + conversations
  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
      fetchConversations();
    }
  }, [isOpen, fetchCurrentUser, fetchConversations]);

  // Auto-open recipient conversation if provided
  useEffect(() => {
    if (isOpen && initialRecipientId && initialRecipientName) {
      openOrCreateConv(initialRecipientId, initialRecipientName);
    }
  }, [isOpen, initialRecipientId, initialRecipientName, openOrCreateConv]);

  // Poll messages when a conversation is selected
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedConvId && isOpen) {
      pollRef.current = setInterval(() => {
        fetchMessages(selectedConvId);
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedConvId, isOpen, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectConversation = async (conv: Conversation) => {
    setSelectedConvId(conv.id);
    setSelectedOtherName(conv.otherName || 'User');
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

  if (!isOpen) return null;

  return (
    <div className="messenger-backdrop" onClick={onClose}>
      <div className="messenger-panel" onClick={e => e.stopPropagation()}>
        <div className="messenger-header">
          <span className="messenger-title">💬 Messages</span>
          <button className="messenger-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="messenger-body">
          {/* Conversation list */}
          <div className="messenger-convs">
            {loadingConvs && <p className="messenger-muted">Loading…</p>}
            {!loadingConvs && conversations.length === 0 && (
              <p className="messenger-muted">No conversations yet.</p>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                className={`messenger-conv-item${selectedConvId === conv.id ? ' active' : ''}`}
                onClick={() => selectConversation(conv)}
              >
                <div className="messenger-conv-avatar">
                  {conv.otherAvatar ? (
                    <img src={conv.otherAvatar} alt="" />
                  ) : (
                    <span>{(conv.otherName || '?').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="messenger-conv-info">
                  <strong>{conv.otherName || 'User'}</strong>
                  {conv.lastMessage && (
                    <span className="messenger-conv-preview">{conv.lastMessage}</span>
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span className="messenger-badge">{conv.unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Message thread */}
          <div className="messenger-thread">
            {!selectedConvId && (
              <p className="messenger-muted messenger-muted-center">Select a conversation</p>
            )}
            {selectedConvId && (
              <>
                <div className="messenger-thread-header">
                  <strong>{selectedOtherName}</strong>
                </div>
                <div className="messenger-messages">
                  {loadingMsgs && <p className="messenger-muted">Loading…</p>}
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`messenger-message${msg.senderId === currentUserId ? ' messenger-message-own' : ''}`}
                    >
                      <span className="messenger-message-content">{msg.content}</span>
                      <span className="messenger-message-time">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="messenger-input-row">
                  <input
                    className="messenger-input"
                    placeholder="Write a message…"
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    maxLength={5000}
                  />
                  <button
                    className="messenger-send-btn"
                    onClick={sendMessage}
                    disabled={sending || !messageInput.trim()}
                  >
                    ➤
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
