import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const ChatBox: React.FC = () => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<{ role: string; parts: { text: string }[] }[]>([]);
  const [visible, setVisible] = useState(true);

  const askMara = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        message: prompt,
        history,
      });
      setResponse(res.data.reply);
      if (res.data.history) {
        setHistory(res.data.history);
      }
    } catch (err: any) {
      console.error('Eroare Chat:', err);
      const errorMsg = err.response?.data?.error || t('chatbox.offline');
      setResponse(`⚠️ ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) {
    return (
      <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 200 }}>
        <button
          onClick={() => setVisible(true)}
          style={{ background: '#00ff7f', color: '#111', border: 'none', borderRadius: 20, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
        >
          {t('chatbox.open')}
        </button>
      </div>
    );
  }

  return (
    <div className="ui-fixed-bottom">
      <style>{`
        .ui-fixed-bottom { position: fixed; bottom: 30px; right: 30px; width: 280px; z-index: 200; }
        .chat-box, .chat-box * { user-select: text; }
        .chat-box { clear: both; background: rgba(0,0,0,0.95); border: 1px solid; border-radius: 20px; padding: 15px; animation: glowPulse 4s infinite ease-in-out; }
        .close-btn { position: absolute; top: 10px; right: 10px; background: none; border: none; color: #00ff7f; font-size: 1.2rem; cursor: pointer; z-index: 400; }
      `}</style>

      <button className="close-btn" onClick={() => setVisible(false)} title={t('chatbox.close')}>×</button>

      <div className="chat-box">
        <div style={{ height: '70px', overflowY: 'auto', fontSize: '0.8rem', color: '#888', marginBottom: '10px' }}>
          {loading ? t('chatbox.processing') : response || ''}
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '6px' }}>
          <input
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.75rem' }}
            placeholder={t('chatbox.placeholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askMara()}
          />
          <button onClick={askMara} style={{ background: 'none', border: 'none', color: '#00ff7f', cursor: 'pointer' }}>➤</button>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;
