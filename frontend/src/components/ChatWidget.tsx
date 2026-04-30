import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './ChatWidget.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

function ChatWidget() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize welcome message with current language
  useEffect(() => {
    setMessages([{
      id: '0',
      role: 'assistant',
      text: t('chat.welcomeGuest'),
      timestamp: Date.now(),
    }]);
  }, [i18n.language]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: inputValue,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Call Mara AI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          language: i18n.language,
          history: messages.map((msg) => ({
            role: msg.role,
            text: msg.text,
          })),
        }),
      });

      if (!response.ok) throw new Error('API error');

      const data = await response.json();

      // Backend returns { message: { content, ... }, aiResponse: { content, ... }, detectedMood }
      // (see server POST /api/chat). Older/other providers may return { reply } or { text }.
      // Always coerce to string — rendering a raw object throws in React and unmounts the tree.
      const pickText = (v: unknown): string | null => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && 'content' in v && typeof (v as { content: unknown }).content === 'string') {
          return (v as { content: string }).content;
        }
        return null;
      };

      const replyText =
        pickText(data?.aiResponse) ||
        pickText(data?.reply) ||
        pickText(data?.message) ||
        pickText(data?.text) ||
        t('chat.chatError');

      // Add assistant message
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-resp`,
        role: 'assistant',
        text: replyText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        text: t('chat.chatError'),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Chat Widget */}
      <div className={`chat-widget ${isOpen ? 'open' : 'closed'}`}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-title-section">
            <h3 className="chat-title">💬 {t('chat.title')}</h3>
          </div>

          {/* Controls */}
          <div className="chat-controls">
            {/* Close button */}
            <button
              className="chat-close"
              onClick={() => setIsOpen(false)}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className="message-content">
                {msg.role === 'assistant' && <span className="message-avatar">🤖</span>}
                <div className="message-text">{msg.text}</div>
                {msg.role === 'user' && <span className="message-avatar">👤</span>}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message message-assistant">
              <div className="message-content">
                <span className="message-avatar">🤖</span>
                <div className="message-text typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={t('chat.placeholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            className="chat-send"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            title={t('chat.send')}
          >
            📤
          </button>
        </div>
      </div>

      {/* Toggle button */}
      {!isOpen && (
        <button
          className="chat-toggle"
          onClick={() => setIsOpen(true)}
          title={t('chat.title')}
        >
          💬
        </button>
      )}
    </>
  );
}

export default ChatWidget;
