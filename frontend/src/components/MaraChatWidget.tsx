import { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMaraChat } from '../contexts/MaraChatContext';
import { useMaraMood } from '../hooks/useMaraMood';
import { useTranslation } from 'react-i18next';
import { AuthModal } from './AuthModal';
// stripMarkdown and copyToClipboard now live in lib/clipboard.ts, shared
// with Missions.tsx and MaraCore.tsx's own copy-message buttons instead of
// each surface duplicating the same logic.
import { copyToClipboard, stripMarkdown } from '../lib/clipboard';
import './MaraChatWidget.css';
import i18n from '../i18n';

// Converts Mara's plain-text/markdown responses to sanitized HTML.
// Build the raw HTML first, then run it through DOMPurify so even
// pathological model output can't inject scripts or event handlers.
function renderMarkdown(text: string): string {
  const raw = text
    // Code blocks (```) before inline code to avoid double-processing
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre class="mara-code-block"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    // Inline code
    .replace(/`([^`\n]+)`/g, (_, code) =>
      `<code class="mara-code-inline">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Numbered lists
    .replace(/(?:^|\n)\d+\. (.+)/g, '\n<li>$1</li>')
    // Unordered lists
    .replace(/(?:^|\n)[•-] (.+)/g, '\n<li>$1</li>')
    // Wrap consecutive <li> blocks in <ul>
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    // Double newline → paragraph break
    .replace(/\n\n+/g, '</p><p>')
    // Single newline → <br>
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');

  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'pre', 'code'],
    ALLOWED_ATTR: ['class'],
  });
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'mara';
  content: string;
  timestamp: string;
  mood?: string;
  moodColor?: string;
  // Set when the reply ended with the [[SUGGEST_MISSION]] sentinel
  // (server/mara-brain/memory.ts) — renders the confirm/decline buttons.
  // Cleared once the user picks one, so the buttons only ever show once.
  suggestsMission?: boolean;
}

// The sentinel Mara's system prompt is instructed to emit, alone on its own
// line, when a reply identifies a concrete new goal worth turning into a
// Mission. Stripped from the displayed text; never shown to the user.
const MISSION_SENTINEL_RE = /\n?\[\[SUGGEST_MISSION\]\]\s*$/;

const MOOD_TO_COLOR: Record<string, string> = {
  happy: '#00ff7f',
  excited: '#ff6b00',
  sad: '#6b8cff',
  angry: '#ff2222',
  calm: '#00e5ff',
  curious: '#c77dff',
  neutral: '#ffffff',
};

export function MaraChatWidget() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOpen, closeChat, toggleChat, setOrbState, setMoodColor } = useMaraChat();
  const [missionActionBusy, setMissionActionBusy] = useState(false);
  const [missionActionMsg, setMissionActionMsg] = useState<string | null>(null);

  // Guest (anonymous, pre-signup) chat — only reachable when the backend
  // flag GUEST_CHAT_ENABLED is on; a 404 from the first check means it's
  // off, and the component falls back to the plain "sign in" CTA below.
  // null = not checked yet, false = disabled/unavailable, true = active.
  const [guestChatAvailable, setGuestChatAvailable] = useState<boolean | null>(null);
  const [guestMessages, setGuestMessages] = useState<ChatMessage[]>([]);
  const [guestInput, setGuestInput] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
  const [guestLimit, setGuestLimit] = useState<number | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [showSparkCta, setShowSparkCta] = useState(false);
  // Renamed to avoid colliding with the widget's own, pre-existing
  // `currentMood` string state (the last mood the server detected in a
  // chat reply) — this is a separate, unrelated mood system (see the
  // Mara-first plan's note on three independent mood vocabularies).
  const { currentMood: orbMood, recordInteraction } = useMaraMood();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentMood, setCurrentMood] = useState('neutral');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Copy state: id-ul mesajului copiat (reset după 2s) sau 'all' pentru tot
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyMessage = useCallback(async (msg: ChatMessage) => {
    const plain = stripMarkdown(msg.content);
    const ok = await copyToClipboard(plain);
    if (ok) {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const handleCopyAll = useCallback(async () => {
    if (messages.length === 0) return;
    const text = messages
      .map(m => `${m.sender === 'mara' ? 'Mara' : 'Tu'}: ${stripMarkdown(m.content)}`)
      .join('\n\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId('all');
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, [messages]);

  // Load chat history on component mount
  useEffect(() => {
    if (isOpen && user && messages.length === 0) {
      loadChatHistory();
    }
  }, [isOpen, user]);

  // Check guest-chat availability + restore any prior guest turns (the
  // session cookie persists 30 days, so a reload shouldn't lose a
  // half-finished guest conversation) the first time a logged-out visitor
  // opens the panel.
  useEffect(() => {
    if (!isOpen || user || guestChatAvailable !== null) return;
    (async () => {
      try {
        const res = await fetch('/api/chat/guest', { credentials: 'include' });
        if (res.status === 404) {
          setGuestChatAvailable(false);
          return;
        }
        if (!res.ok) {
          setGuestChatAvailable(false);
          return;
        }
        const data = await res.json();
        setGuestChatAvailable(true);
        setGuestRemaining(data.remaining ?? null);
        setGuestLimit(data.limit ?? null);
        setGuestMessages(
          (data.messages ?? []).map((msg: any) => ({
            id: String(msg.id),
            sender: msg.sender === 'user' ? 'user' : 'mara',
            content: msg.content,
            timestamp: msg.createdAt || new Date().toISOString(),
          })),
        );
      } catch {
        setGuestChatAvailable(false);
      }
    })();
  }, [isOpen, user, guestChatAvailable]);

  const sendGuestMessage = useCallback(async (text: string) => {
    if (!text.trim() || guestLoading) return;
    if (guestRemaining !== null && guestRemaining <= 0) return;

    const userMsg: ChatMessage = {
      id: `guest-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setGuestMessages((prev) => [...prev, userMsg]);
    setGuestInput('');
    setGuestLoading(true);
    setGuestError(null);
    setOrbState('thinking');

    try {
      const res = await fetch('/api/chat/guest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, language: i18n.language }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setGuestRemaining(0);
        setGuestError(data.message || t('chat.guestLimitReached', "You've used your free preview messages."));
        return;
      }
      if (!res.ok) {
        setGuestError(t('chat.errorMsg'));
        return;
      }
      setOrbState('speaking');
      setTimeout(() => setOrbState('idle'), 2500);
      setGuestRemaining(data.remaining ?? 0);
      setGuestLimit(data.limit ?? guestLimit);
      const maraMsg: ChatMessage = {
        id: String(data.aiResponse?.id ?? `guest-mara-${Date.now()}`),
        sender: 'mara',
        content: data.aiResponse?.content || t('chat.issueMsg'),
        timestamp: new Date().toISOString(),
        mood: data.detectedMood,
        moodColor: MOOD_TO_COLOR[data.detectedMood || 'neutral'],
      };
      setGuestMessages((prev) => [...prev, maraMsg]);
    } catch {
      setOrbState('idle');
      setGuestError(t('chat.errorMsg'));
    } finally {
      setGuestLoading(false);
    }
  }, [guestLoading, guestRemaining, guestLimit, setOrbState, t]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeChat(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, closeChat]);

  // Mirrors the mood color onto the shared context so the home-page orb
  // (which never mounts its own useMaraMood instance) can tint its glow
  // the same color as the chat widget's current mood.
  useEffect(() => {
    setMoodColor(orbMood.color);
  }, [orbMood.color, setMoodColor]);

  // Reset to idle whenever the panel closes — avoids the orb getting stuck
  // mid "thinking"/"speaking" if a request is still in flight on close.
  useEffect(() => {
    if (!isOpen) setOrbState('idle');
  }, [isOpen, setOrbState]);

  const loadChatHistory = async () => {
    try {
      const response = await fetch('/api/chat', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const history = await response.json();
        setMessages(
          history.map((msg: any) => ({
            id: msg.id,
            sender: msg.sender === 'user' ? 'user' : 'mara',
            content: msg.content,
            timestamp: msg.timestamp || new Date().toISOString(),
            mood: msg.metadata?.mood || 'neutral',
            moodColor: MOOD_TO_COLOR[msg.metadata?.mood || 'neutral'],
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user) return;

    const messageText = inputValue;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
      moodColor: MOOD_TO_COLOR['neutral'],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setOrbState('thinking');
    recordInteraction({ type: 'type', intensity: 0.6, duration: 0 }, 'chat');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          language: i18n.language,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const detectedMood = data.mood || 'neutral';
        setCurrentMood(detectedMood);
        setOrbState('speaking');
        setTimeout(() => setOrbState('idle'), 2500);

        const rawContent: string = data.aiResponse?.content || data.response || t('chat.issueMsg');
        const suggestsMission = MISSION_SENTINEL_RE.test(rawContent);

        const maraMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'mara',
          content: suggestsMission ? rawContent.replace(MISSION_SENTINEL_RE, '').trim() : rawContent,
          timestamp: new Date().toISOString(),
          mood: detectedMood,
          moodColor: MOOD_TO_COLOR[detectedMood],
          suggestsMission,
        };

        setMessages((prev) => [...prev, maraMessage]);
      } else {
        console.error('Chat API error:', response.statusText);
        setOrbState('idle');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setOrbState('idle');
      // Show error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        sender: 'mara',
        content: t('chat.errorMsg'),
        timestamp: new Date().toISOString(),
        mood: 'sad',
        moodColor: MOOD_TO_COLOR['sad'],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setCurrentMood('neutral');
  };

  // Explicit confirmation only — reuses the existing Missions API exactly
  // as-is (GET /api/missions/suggest then POST /api/missions/:id/start,
  // server/missions/engine.ts). Never called automatically from the
  // sentinel alone; only this click creates anything.
  const acceptMissionSuggestion = useCallback(async (messageId: string) => {
    setMissionActionBusy(true);
    setMissionActionMsg(null);
    try {
      const suggestRes = await fetch('/api/missions/suggest', { credentials: 'include' });
      const suggestData = suggestRes.ok ? await suggestRes.json() : null;
      const mission = suggestData?.mission;
      if (!mission) {
        setMissionActionMsg(t('chat.missionNoneLeft', "I couldn't find a new mission to suggest right now."));
        return;
      }
      const startRes = await fetch(`/api/missions/${mission.id}/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const startData = startRes.ok ? await startRes.json() : null;
      if (startData?.success) {
        setMissionActionMsg(t('chat.missionStarted', 'Mission started: "{{title}}" 🎯', { title: mission.title }));
        setTimeout(() => navigate('/missions'), 1200);
      } else {
        setMissionActionMsg(startData?.message || t('chat.missionStartFailed', 'Could not start that mission.'));
      }
    } catch {
      setMissionActionMsg(t('chat.missionStartFailed', 'Could not start that mission.'));
    } finally {
      setMissionActionBusy(false);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, suggestsMission: false } : m)));
    }
  }, [navigate, t]);

  const declineMissionSuggestion = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, suggestsMission: false } : m)));
  }, []);

  const getMoodEmoji = (mood: string) => {
    const emojis: Record<string, string> = {
      happy: '😊',
      excited: '🤩',
      sad: '😢',
      angry: '😠',
      calm: '😌',
      curious: '🤔',
      neutral: '😐',
    };
    return emojis[mood] || '😐';
  };

  // Always render — a logged-out user sees the FAB and gets a "login to
  // chat" CTA inside the modal. This is the only chat surface on the
  // mobile home, so hiding it would leave guests with no entry point.

  return (
    <>
      {/* Chat Button */}
      <button
        className="mara-chat-button"
        onClick={() => toggleChat()}
        style={{
          backgroundColor: MOOD_TO_COLOR[currentMood],
          boxShadow: `0 0 20px ${MOOD_TO_COLOR[currentMood]}80`,
        }}
        title={t('chat.title')}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Chat Modal — logged-out visitor, guest chat unavailable/disabled */}
      {isOpen && !user && guestChatAvailable !== true && (
        <div className="mara-chat-modal">
          <div className="mara-chat-header">
            <div className="mara-chat-title">
              <span className="mara-mood-emoji">💬</span>
              <h3>Mara AI</h3>
            </div>
            <button className="mara-close-btn" onClick={() => closeChat()}>✕</button>
          </div>
          <div className="mara-chat-messages">
            <div className="mara-welcome">
              <p className="mara-greeting">
                {t('chat.loginRequired', 'Sign in to chat with Mara. Your history stays on your account.')}
              </p>
              <div className="mara-quick-actions">
                <button
                  onClick={() => {
                    closeChat();
                    setAuthModalOpen(true);
                  }}
                >
                  {t('chat.loginCta', 'Sign in / Create account')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Modal — logged-out visitor, guest chat active */}
      {isOpen && !user && guestChatAvailable === true && (
        <div className="mara-chat-modal">
          <div className="mara-chat-header">
            <div className="mara-chat-title">
              <span className="mara-mood-emoji">👋</span>
              <h3>Mara AI</h3>
            </div>
            <button className="mara-close-btn" onClick={() => closeChat()}>✕</button>
          </div>

          <div className="mara-chat-messages">
            {guestMessages.length === 0 && (
              <div className="mara-welcome">
                <p className="mara-greeting">
                  {t('chat.guestGreeting', "Hey. I'm Mara. 👋 You don't have to figure everything out yet. Just tell me what brought you here.")}
                </p>
                <div className="mara-quick-actions">
                  <button onClick={() => sendGuestMessage(t('chat.guestChipGoal', 'I have a goal I want to work on.'))}>
                    {t('chat.guestChipGoalLabel', '🎯 I have a goal')}
                  </button>
                  <button onClick={() => sendGuestMessage(t('chat.guestChipTalk', "I just want to talk."))}>
                    {t('chat.guestChipTalkLabel', '💬 I just want to talk')}
                  </button>
                  <button onClick={() => setShowSparkCta(true)}>
                    {t('chat.guestChipSparkLabel', '✨ Show me what Mara can do')}
                  </button>
                  <button onClick={() => sendGuestMessage(t('chat.guestChipChange', 'I need a change in my life.'))}>
                    {t('chat.guestChipChangeLabel', '🚀 I need a change')}
                  </button>
                </div>
              </div>
            )}

            {guestMessages.map((msg) => (
              <div
                key={msg.id}
                className={`mara-message ${msg.sender}`}
                style={{ borderLeftColor: msg.sender === 'mara' ? (msg.moodColor || MOOD_TO_COLOR.neutral) : MOOD_TO_COLOR.neutral }}
              >
                <div className="mara-message-content">
                  {msg.sender === 'mara' ? (
                    <div className="mara-message-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {guestLoading && (
              <div className="mara-message mara">
                <div className="mara-typing"><span></span><span></span><span></span></div>
              </div>
            )}

            {showSparkCta && (
              <div className="mara-message mara">
                <div className="mara-message-content">
                  <p>{t('chat.guestSparkOffer', 'I have something you might like. Want to see a Spark?')}</p>
                </div>
                <div className="mara-quick-actions">
                  <button onClick={() => { closeChat(); navigate('/reels'); }}>
                    {t('chat.guestSparkShow', 'Show me')}
                  </button>
                  <button onClick={() => setShowSparkCta(false)}>{t('chat.notYet', 'Not yet')}</button>
                </div>
              </div>
            )}

            {guestError && <p className="mara-greeting" style={{ color: '#f87171' }}>{guestError}</p>}

            {guestRemaining !== null && guestRemaining <= 0 ? (
              <div className="mara-welcome">
                <p className="mara-greeting">
                  {t('chat.guestLimitCta', "I can keep going with you. Create your free account and I'll remember where we left off.")}
                </p>
                <div className="mara-quick-actions">
                  <button onClick={() => { closeChat(); setAuthModalOpen(true); }}>
                    {t('chat.loginCta', 'Sign in / Create account')}
                  </button>
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          {(guestRemaining === null || guestRemaining > 0) && (
            <form
              onSubmit={(e) => { e.preventDefault(); sendGuestMessage(guestInput); }}
              className="mara-chat-input"
            >
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onFocus={() => setOrbState('listening')}
                onBlur={() => setOrbState('idle')}
                placeholder={t('chat.placeholder')}
                disabled={guestLoading}
              />
              <button type="submit" disabled={guestLoading || !guestInput.trim()}>
                {guestLoading ? '...' : '→'}
              </button>
            </form>
          )}
          {guestRemaining !== null && guestRemaining > 0 && (
            <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.6, margin: '4px 0' }}>
              {t('chat.guestRemaining', '{{remaining}} of {{limit}} free messages left', { remaining: guestRemaining, limit: guestLimit })}
            </p>
          )}
        </div>
      )}

      {isOpen && user && (
        <div className="mara-chat-modal">
          <div className="mara-chat-header" style={{borderColor: MOOD_TO_COLOR[currentMood]}}>
            <div className="mara-chat-title">
              <span className="mara-mood-emoji">{getMoodEmoji(currentMood)}</span>
              <h3>Mara AI</h3>
            </div>
            <div className="mara-header-actions">
              {messages.length > 0 && (
                <>
                  <button
                    className="mara-copy-all-btn"
                    onClick={handleCopyAll}
                    title={copiedId === 'all' ? t('common.copied', 'Copied!') : t('maraChat.copyConversation', 'Copy conversation')}
                    aria-label={t('maraChat.copyAllConversation', 'Copy entire conversation')}
                  >
                    {copiedId === 'all' ? '✓' : '📋'}
                  </button>
                  <button className="mara-clear-btn" onClick={clearConversation} title={t('maraChat.clearConversation', 'Clear conversation')}>
                    🗑️
                  </button>
                </>
              )}
              <button className="mara-close-btn" onClick={() => closeChat()}>✕</button>
            </div>
          </div>

          <div className="mara-chat-messages">
            {messages.length === 0 && (
              <div className="mara-welcome">
                <p className="mara-greeting">{t('chat.welcome', { name: user.name || 'there' })}</p>
                <div className="mara-quick-actions">
                  <button
                    onClick={() => {
                      setInputValue(t('chat.quickModules'));
                      handleSendMessage({ preventDefault: () => {} } as any);
                    }}
                  >
                    {t('chat.modules')}
                  </button>
                  <button
                    onClick={() => {
                      setInputValue(t('chat.quickRecommend'));
                      handleSendMessage({ preventDefault: () => {} } as any);
                    }}
                  >
                    {t('chat.recommendations')}
                  </button>
                  <button
                    onClick={() => {
                      setInputValue(t('chat.quickHow'));
                      handleSendMessage({ preventDefault: () => {} } as any);
                    }}
                  >
                    {t('chat.help')}
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mara-message ${msg.sender} mara-message--copyable`}
                style={{
                  borderLeftColor:
                    msg.sender === 'mara' ? msg.moodColor : MOOD_TO_COLOR['neutral'],
                }}
              >
                <div className="mara-message-content">
                  {msg.sender === 'mara' && (
                    <span className="mara-emoji">{getMoodEmoji(msg.mood || 'neutral')}</span>
                  )}
                  {msg.sender === 'mara' ? (
                    <div
                      className="mara-message-body"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                {msg.suggestsMission && (
                  <div className="mara-quick-actions">
                    <button disabled={missionActionBusy} onClick={() => acceptMissionSuggestion(msg.id)}>
                      {t('chat.createMission', '🎯 Create my Mission')}
                    </button>
                    <button disabled={missionActionBusy} onClick={() => declineMissionSuggestion(msg.id)}>
                      {t('chat.notYet', 'Not yet')}
                    </button>
                  </div>
                )}
                <div className="mara-message-meta">
                  <span className="mara-msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    className={`mara-copy-btn ${copiedId === msg.id ? 'mara-copy-btn--done' : ''}`}
                    onClick={() => handleCopyMessage(msg)}
                    title={copiedId === msg.id ? t('common.copied', 'Copied!') : t('maraChat.copyMessage', 'Copy message')}
                    aria-label={t('maraChat.copyMessage', 'Copy message')}
                  >
                    {copiedId === msg.id ? '✓' : '📋'}
                  </button>
                </div>
              </div>
            ))}

            {missionActionMsg && (
              <div className="mara-message mara">
                <div className="mara-message-content"><p>{missionActionMsg}</p></div>
              </div>
            )}

            {isLoading && (
              <div className="mara-message mara">
                <div className="mara-typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="mara-chat-input">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setOrbState('listening')}
              onBlur={() => setOrbState('idle')}
              placeholder={t('chat.placeholder')}
              disabled={isLoading}
              style={{
                borderColor: MOOD_TO_COLOR[currentMood],
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              style={{
                backgroundColor: MOOD_TO_COLOR[currentMood],
              }}
            >
              {isLoading ? '...' : '→'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
