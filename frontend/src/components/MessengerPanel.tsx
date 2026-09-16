import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useP2PFileTransfer, type FileTransfer } from '../hooks/useP2PFileTransfer';
import './MessengerPanel.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

// Text messages stay a plain string column server-side (no schema change) —
// a file "message" is a normal message whose content carries this marker
// prefix plus JSON metadata, so the thread survives a reload even though
// the actual bytes only ever travel peer-to-peer and are never stored here.
const FILE_MARKER = 'FILE';

interface FileMarkerMeta {
  id: string;
  name: string;
  size: number;
  mime: string;
}

function parseFileMarker(content: string): FileMarkerMeta | null {
  if (!content.startsWith(FILE_MARKER)) return null;
  try {
    const meta = JSON.parse(content.slice(FILE_MARKER.length));
    if (meta && typeof meta.id === 'string' && typeof meta.name === 'string') return meta;
  } catch { /* not a valid marker */ }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [selectedOtherId, setSelectedOtherId] = useState<string | null>(null);
  const [selectedOtherName, setSelectedOtherName] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setSelectedOtherId(recipientId);
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
    setSelectedOtherId(conv.otherId);
    setSelectedOtherName(conv.otherName || t('messenger.userFallback'));
    await fetchMessages(conv.id);
  };

  const { transfers, sendFile, rehydrate, maxFileBytes } = useP2PFileTransfer(currentUserId);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedConvId || !selectedOtherId) return;
    setFileError(null);
    if (file.size > maxFileBytes) {
      setFileError(t('messenger.fileTooLarge', { max: formatBytes(maxFileBytes) }));
      return;
    }
    const { id } = await sendFile(selectedOtherId, file);
    if (!id) return;
    try {
      const marker = FILE_MARKER + JSON.stringify({ id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' } as FileMarkerMeta);
      const res = await axios.post<Message>(
        `${API_URL}/api/messenger/conversations/${selectedConvId}/messages`,
        { content: marker },
        { withCredentials: true },
      );
      setMessages(prev => [...prev, res.data]);
      await fetchConversations();
    } catch { /* the P2P transfer still proceeds even if the history marker fails to save */ }
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
                  <span className="mp-conv-preview">
                    {parseFileMarker(conv.lastMessage) ? `📎 ${parseFileMarker(conv.lastMessage)!.name}` : conv.lastMessage}
                  </span>
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
              {messages.map(msg => {
                const fileMeta = parseFileMarker(msg.content);
                return (
                  <div
                    key={msg.id}
                    className={`mp-message${msg.senderId === currentUserId ? ' mp-message-own' : ''}`}
                  >
                    {fileMeta ? (
                      <FileBubble meta={fileMeta} live={transfers[fileMeta.id]} rehydrate={rehydrate} />
                    ) : (
                      <span className="mp-message-content">{msg.content}</span>
                    )}
                    <span className="mp-message-time">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {fileError && <p className="mp-file-error">{fileError}</p>}
            <div className="mp-input-row">
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                onChange={handleFileSelected}
              />
              <button
                type="button"
                className="mp-attach-btn"
                onClick={handlePickFile}
                aria-label={t('messenger.attachFile')}
                title={t('messenger.attachFile')}
              >
                📎
              </button>
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

interface FileBubbleProps {
  meta: FileMarkerMeta;
  live?: FileTransfer;
  rehydrate: (id: string) => Promise<FileTransfer | null>;
}

const FileBubble: React.FC<FileBubbleProps> = ({ meta, live, rehydrate }) => {
  const { t } = useTranslation();
  const [stored, setStored] = useState<FileTransfer | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (live) return;
    let cancelled = false;
    rehydrate(meta.id).then((rec) => {
      if (!cancelled) { setStored(rec); setChecked(true); }
    });
    return () => { cancelled = true; };
  }, [live, meta.id, rehydrate]);

  const t2 = live || stored;
  const isImage = meta.mime.startsWith('image/');

  if (t2?.blobUrl) {
    return isImage ? (
      <a href={t2.blobUrl} target="_blank" rel="noreferrer" className="mp-file-image-link">
        <img src={t2.blobUrl} alt={meta.name} className="mp-file-image" />
      </a>
    ) : (
      <a href={t2.blobUrl} download={meta.name} className="mp-file-doc">
        📄 <span className="mp-file-doc-name">{meta.name}</span>
        <span className="mp-file-doc-size">{formatBytes(meta.size)}</span>
      </a>
    );
  }

  if (t2 && t2.status !== 'done') {
    const label = t2.status === 'queued' || t2.status === 'failed'
      ? t('messenger.fileQueued')
      : `${Math.round((t2.progress || 0) * 100)}%`;
    return (
      <div className="mp-file-progress">
        📎 {meta.name}
        <div className="mp-file-progress-bar">
          <div className="mp-file-progress-fill" style={{ width: `${Math.round((t2.progress || 0) * 100)}%` }} />
        </div>
        <span className="mp-file-progress-label">{label}</span>
      </div>
    );
  }

  if (checked && !t2) {
    return <div className="mp-file-unavailable">📎 {meta.name} — {t('messenger.fileUnavailable')}</div>;
  }

  return <div className="mp-file-progress">📎 {meta.name}</div>;
};

export default MessengerPanel;
