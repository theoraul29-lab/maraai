import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { AuthModal } from './AuthModal';
import './MaraChatWidget.css';

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
            <button
              className="mara-close-btn"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
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
                  <p>{msg.content}</p>
                </div>
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
