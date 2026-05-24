import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../i18n/useLanguage';
import '../styles/SettingsModal.css';

interface ConsentState {
  p2pEnabled: boolean;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  mode: 'centralized' | 'hybrid' | 'advanced';
  bandwidthShareGbMonth: number;
  notificationsEnabled: boolean;
}

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, available, setLanguage } = useLanguage();
  const [activeSection, setActiveSection] = useState<'cont' | 'maraai' | 'notificari' | 'preferinte'>('cont');
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [loadingConsent, setLoadingConsent] = useState(true);
  const [savingConsent, setSavingConsent] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/consent', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.consent) setConsent(data.consent);
      })
      .catch(() => {})
      .finally(() => setLoadingConsent(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveConsent = async (patch: Partial<ConsentState>) => {
    if (!consent) return;
    const updated = { ...consent, ...patch };
    setConsent(updated);
    setSavingConsent(true);
    try {
      await fetch('/api/consent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      // non-fatal
    } finally {
      setSavingConsent(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.next !== pwForm.confirm) {
      setPwError('Parolele noi nu se potrivesc.');
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError('Parola trebuie să aibă cel puțin 8 caractere.');
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setPwError(d.message || 'Eroare la schimbarea parolei.');
      } else {
        setPwSuccess(true);
        setPwForm({ current: '', next: '', confirm: '' });
      }
    } catch {
      setPwError('Eroare de rețea.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const sections: { key: typeof activeSection; label: string; icon: string }[] = [
    { key: 'cont', label: 'Cont', icon: '👤' },
    { key: 'maraai', label: 'MaraAI & Privacy', icon: '🧠' },
    { key: 'notificari', label: 'Notificări', icon: '🔔' },
    { key: 'preferinte', label: 'Preferințe', icon: '🎨' },
  ];

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Setări">
        <div className="settings-header">
          <span className="settings-title">⚙️ Setări</span>
          <button className="settings-close" onClick={onClose} aria-label="Închide">✕</button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            {sections.map(s => (
              <button
                key={s.key}
                className={`settings-nav-btn ${activeSection === s.key ? 'is-active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {/* ── CONT ─────────────────────────────────────────── */}
            {activeSection === 'cont' && (
              <div className="settings-section">
                <div className="settings-user-info">
                  <div className="settings-avatar">{user?.name?.[0]?.toUpperCase() || '?'}</div>
                  <div>
                    <div className="settings-user-name">{user?.name}</div>
                    <div className="settings-user-email">{user?.email}</div>
                    <div className="settings-user-tier">{user?.tier?.toUpperCase()}</div>
                  </div>
                </div>

                <h3 className="settings-section-title">Schimbă parola</h3>
                {pwSuccess ? (
                  <div className="settings-success">Parola a fost schimbată cu succes!</div>
                ) : (
                  <form onSubmit={handleChangePassword} className="settings-form">
                    <label className="settings-label">
                      Parola curentă
                      <input
                        type="password"
                        value={pwForm.current}
                        onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    <label className="settings-label">
                      Parolă nouă
                      <input
                        type="password"
                        value={pwForm.next}
                        onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    <label className="settings-label">
                      Confirmă parola nouă
                      <input
                        type="password"
                        value={pwForm.confirm}
                        onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    {pwError && <div className="settings-error">{pwError}</div>}
                    <button type="submit" className="settings-btn-primary" disabled={pwSaving}>
                      {pwSaving ? 'Se salvează…' : 'Schimbă parola'}
                    </button>
                  </form>
                )}

                <button className="settings-btn-danger" onClick={handleLogout}>
                  Deconectare
                </button>
              </div>
            )}

            {/* ── MARAAI & PRIVACY ─────────────────────────────── */}
            {activeSection === 'maraai' && (
              <div className="settings-section">
                {loadingConsent ? (
                  <div className="settings-loading">Se încarcă…</div>
                ) : consent ? (
                  <>
                    <h3 className="settings-section-title">Mod MaraAI</h3>
                    <div className="settings-radio-group">
                      {(['centralized', 'hybrid', 'advanced'] as const).map(m => (
                        <label key={m} className={`settings-radio ${consent.mode === m ? 'is-selected' : ''}`}>
                          <input
                            type="radio"
                            name="mode"
                            value={m}
                            checked={consent.mode === m}
                            onChange={() => saveConsent({ mode: m })}
                          />
                          <div>
                            <div className="settings-radio-title">
                              {m === 'centralized' && '🏢 Centralizat'}
                              {m === 'hybrid' && '⚡ Hybrid'}
                              {m === 'advanced' && '🌐 Avansat'}
                            </div>
                            <div className="settings-radio-desc">
                              {m === 'centralized' && 'Toate procesările prin serverele Mara. Simplu și sigur.'}
                              {m === 'hybrid' && 'Combină serverele Mara cu rețeaua P2P. Recomandat.'}
                              {m === 'advanced' && 'Prioritizează P2P și routing avansat. Contribuie maxim.'}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <h3 className="settings-section-title">Rețea P2P</h3>
                    <ToggleRow
                      label="Participare P2P"
                      desc="Ajuți rețeaua Mara procesând cereri de la alți utilizatori."
                      checked={consent.p2pEnabled}
                      disabled={consent.mode === 'centralized'}
                      onChange={v => saveConsent({ p2pEnabled: v })}
                    />
                    <ToggleRow
                      label="Nod de fundal"
                      desc="Mara rulează în fundal chiar și când nu ești activ."
                      checked={consent.backgroundNode}
                      disabled={consent.mode === 'centralized'}
                      onChange={v => saveConsent({ backgroundNode: v })}
                    />
                    <ToggleRow
                      label="Routing AI avansat"
                      desc="Mara alege automat cel mai bun model AI pentru fiecare cerere."
                      checked={consent.advancedAiRouting}
                      onChange={v => saveConsent({ advancedAiRouting: v })}
                    />

                    {consent.backgroundNode && (
                      <>
                        <h3 className="settings-section-title">Bandwidth partajat</h3>
                        <div className="settings-slider-row">
                          <span>{consent.bandwidthShareGbMonth} GB/lună</span>
                          <input
                            type="range"
                            min={0}
                            max={50}
                            step={0.5}
                            value={consent.bandwidthShareGbMonth}
                            onChange={e => setConsent(c => c ? { ...c, bandwidthShareGbMonth: +e.target.value } : c)}
                            onMouseUp={() => saveConsent({ bandwidthShareGbMonth: consent.bandwidthShareGbMonth })}
                            onTouchEnd={() => saveConsent({ bandwidthShareGbMonth: consent.bandwidthShareGbMonth })}
                            className="settings-slider"
                          />
                          <span className="settings-slider-hint">0 – 50 GB</span>
                        </div>
                      </>
                    )}

                    {savingConsent && <div className="settings-saving">Se salvează…</div>}
                  </>
                ) : (
                  <div className="settings-error">Nu s-au putut încărca setările de confidențialitate.</div>
                )}
              </div>
            )}

            {/* ── NOTIFICĂRI ───────────────────────────────────── */}
            {activeSection === 'notificari' && (
              <div className="settings-section">
                {loadingConsent ? (
                  <div className="settings-loading">Se încarcă…</div>
                ) : consent ? (
                  <>
                    <h3 className="settings-section-title">Notificări în aplicație</h3>
                    <ToggleRow
                      label="Notificări activate"
                      desc="Primești notificări despre misiuni, update-uri și activitate."
                      checked={consent.notificationsEnabled}
                      onChange={v => saveConsent({ notificationsEnabled: v })}
                    />
                    {savingConsent && <div className="settings-saving">Se salvează…</div>}
                  </>
                ) : (
                  <div className="settings-error">Nu s-au putut încărca setările.</div>
                )}
              </div>
            )}

            {/* ── PREFERINȚE ───────────────────────────────────── */}
            {activeSection === 'preferinte' && (
              <div className="settings-section">
                <h3 className="settings-section-title">Temă</h3>
                <div className="settings-theme-toggle">
                  <button
                    className={`settings-theme-btn ${theme === 'dark' ? 'is-active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    🌙 Dark
                  </button>
                  <button
                    className={`settings-theme-btn ${theme === 'light' ? 'is-active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    ☀️ Light
                  </button>
                </div>

                <h3 className="settings-section-title" style={{ marginTop: '20px' }}>Limbă</h3>
                <div className="settings-lang-grid">
                  {available.map(lang => (
                    <button
                      key={lang.code}
                      className={`settings-lang-btn ${language === lang.code ? 'is-active' : ''}`}
                      onClick={() => setLanguage(lang.code)}
                    >
                      <span>{lang.flag}</span> {lang.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ToggleRowProps {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, desc, checked, disabled, onChange }) => (
  <label className={`settings-toggle ${disabled ? 'is-disabled' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
    />
    <div className="settings-toggle-text">
      <div className="settings-toggle-label">{label}</div>
      <div className="settings-toggle-desc">{desc}</div>
    </div>
  </label>
);
