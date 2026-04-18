import React, { useState } from 'react';
import axios from 'axios';

// Definim URL-ul API-ului. În producție va fi domeniul tău, local e localhost:5000
const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

type Language = 'RO' | 'EN' | 'RU' | 'UA' | 'ES';

interface ChatBoxProps {
  lang: Language;
  setLang: (lang: Language) => void;
}

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [prompt, setPrompt] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<{ role: string; parts: { text: string }[] }[]>([]);
  const [visible, setVisible] = useState(true);

  const translations = {
    RO: { langTitle: "LIMBA", placeholder: "Scrie un mesaj...", system: "MARA" },
    EN: { langTitle: "LANGUAGE", placeholder: "Type a message...", system: "MARA" },
    RU: { langTitle: "ЯЗЫК", placeholder: "Напишите...", system: "MARA" },
    UA: { langTitle: "МОВА", placeholder: "Напишіть...", system: "MARA" },
    ES: { langTitle: "IDIOMA", placeholder: "Escribe...", system: "MARA" }
  };

  const askMara = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
        const res = await axios.post(`${API_URL}/api/chat`, {
          message: prompt,
          history,
        });
        setResponse(res.data.reply);
        // Update local history with the new exchange
        if (res.data.history) {
          setHistory(res.data.history);
        }
    } catch (err: any) {
      console.error("Eroare Chat:", err);
      const errorMsg = err.response?.data?.error || "Serverul Mara este offline sau inaccesibil.";
      setResponse(`⚠️ Eroare: ${errorMsg}`);
    }
    finally { setLoading(false); }
  };

  const t = translations[lang];

  if (!visible) {
    return (
      <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 200 }}>
        <button onClick={() => setVisible(true)} style={{ background: '#00ff7f', color: '#111', border: 'none', borderRadius: 20, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>Deschide Chat</button>
      </div>
    );
  }
  return (
    <div className="ui-fixed-bottom">
      <style>{`
        .ui-fixed-bottom { position: fixed; bottom: 30px; right: 30px; width: 280px; z-index: 200; }
        .lang-selector-btn { float: right; font-size: 0.7rem; font-weight: 900; color: #00ff7f; cursor: pointer; background: rgba(0,0,0,0.8); border: 1px solid rgba(0,255,127,0.3); padding: 6px 15px; border-radius: 20px; margin-bottom: 10px; backdrop-filter: blur(10px); transition: 0.3s; }
        .lang-dropdown { position: absolute; bottom: 50px; right: 0; background: rgba(10, 10, 10, 0.98); border: 1px solid #333; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; width: 120px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 300; }
        .lang-option { font-size: 0.65rem; color: white; cursor: pointer; opacity: 0.6; padding: 4px; transition: 0.2s; }
        .lang-option:hover, .lang-option.active { opacity: 1; color: #00ff7f; }
        .chat-box, .chat-box * { user-select: text; }
        .chat-box { clear: both; background: rgba(0,0,0,0.95); border: 1px solid; border-radius: 20px; padding: 15px; animation: glowPulse 4s infinite ease-in-out; }
        .close-btn { position: absolute; top: 10px; right: 10px; background: none; border: none; color: #00ff7f; font-size: 1.2rem; cursor: pointer; z-index: 400; }
      `}</style>

      <button className="close-btn" onClick={() => setVisible(false)} title="Închide chat">×</button>

      <div className="lang-selector-btn" onClick={() => setShowLangMenu(!showLangMenu)}>
        {t.langTitle} {showLangMenu ? '▲' : '▼'}
      </div>

      {showLangMenu && (
        <div className="lang-dropdown">
          {(['RO', 'EN', 'RU', 'UA', 'ES'] as Language[]).map(l => (
            <div key={l} className={`lang-option ${lang === l ? 'active' : ''}`} onClick={() => { setLang(l); setShowLangMenu(false); }}>
              {l} - {translations[l].langTitle}
            </div>
          ))}
        </div>
      )}

      <div className="chat-box">
        <div style={{ height: '70px', overflowY: 'auto', fontSize: '0.8rem', color: '#888', marginBottom: '10px' }}>
           {loading ? "MARA procesează..." : response || `Sistem pregătit în ${lang}.`}
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '6px' }}>
          <input 
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.75rem' }}
            placeholder={t.placeholder}
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