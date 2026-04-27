import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/useLanguage';

interface LanguageSelectorProps {
  compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false }) => {
  const { language, available, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLang = available.find(l => l.code === language) || available[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSelect = async (code: string) => {
    // setLanguage handles localStorage + server sync (when authenticated).
    await setLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="language-selector-wrapper" ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '8px',
          padding: compact ? '4px 8px' : '6px 12px',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: compact ? '13px' : '14px',
          minHeight: '36px',
          transition: 'background 0.2s',
        }}
      >
        <span>{currentLang.flag}</span>
        {!compact && <span>{currentLang.name}</span>}
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            background: '#1a1a2e',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '10px',
            padding: '4px',
            zIndex: 500,
            maxHeight: '320px',
            overflowY: 'auto',
            minWidth: '180px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          {available.map(lang => (
            <button
              key={lang.code}
              role="option"
              aria-selected={lang.code === language}
              onClick={() => handleSelect(lang.code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                background: lang.code === language ? 'rgba(168,85,247,0.2)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: lang.code === language ? '#a855f7' : '#ccc',
                cursor: 'pointer',
                fontSize: '13px',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                if (lang.code !== language) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={e => {
                if (lang.code !== language) (e.target as HTMLElement).style.background = 'transparent';
              }}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
