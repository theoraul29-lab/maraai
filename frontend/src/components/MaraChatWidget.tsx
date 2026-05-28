import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { AuthModal } from './AuthModal';
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
    .replace(/(?:^|\n)[•\-] (.+)/g, '\n<li>$1</li>')
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
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentMood, setCurrentMood] = useState('neutral');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history on component mount
  useEffect(() => {
    if (isOpen && user && messages.length === 0) {
      loadChatHistory();
    }
  }, [isOpen, user]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

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

        const maraMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'mara',
          content: data.aiResponse?.content || data.response || t('chat.issueMsg'),
          timestamp: new Date().toISOString(),
          mood: detectedMood,
          moodColor: MOOD_TO_COLOR[detectedMood],
        };

        setMessages((prev) => [...prev, maraMessage]);
      } else {
        console.error('Chat API error:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
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
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: MOOD_TO_COLOR[currentMood],
          boxShadow: `0 0 20px ${MOOD_TO_COLOR[currentMood]}80`,
        }}
        title={t('chat.title')}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Chat Modal */}
      {isOpen && !user && (
        <div className="mara-chat-modal">
          <div className="mara-chat-header">
            <div className="mara-chat-title">
              <span className="mara-mood-emoji">💬</span>
              <h3>Mara AI</h3>
            </div>
            <button className="mara-close-btn" onClick={() => setIsOpen(false)}>✕</button>
          </div>
          <div className="mara-chat-messages">
            <div className="mara-welcome">
              <p className="mara-greeting">
                {t('chat.loginRequired', 'Sign in to chat with Mara. Your history stays on your account.')}
              </p>
              <div className="mara-quick-actions">
                <button
                  onClick={() => {
                    setIsOpen(false);
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

      {isOpen && user && (
        <div className="mara-chat-modal">
          <div className="mara-chat-header" style={{borderColor: MOOD_TO_COLOR[currentMood]}}>
            <div className="mara-chat-title">
              <span className="mara-mood-emoji">{getMoodEmoji(currentMood)}</span>
              <h3>Mara AI</h3>
            </div>
            <div className="mara-header-actions">
              {messages.length > 0 && (
                <button className="mara-clear-btn" onClick={clearConversation} title="Clear conversation">
                  🗑️
                </button>
              )}
              <button className="mara-close-btn" onClick={() => setIsOpen(false)}>✕</button>
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
                className={`mara-message ${msg.sender}`}
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
                <span className="mara-msg-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

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
