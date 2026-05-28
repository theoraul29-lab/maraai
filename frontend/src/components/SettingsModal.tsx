import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
      setPwError(t('settings.changePassword.mismatch'));
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError(t('settings.changePassword.tooShort'));
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
        setPwError(d.message || t('settings.changePassword.error'));
      } else {
        setPwSuccess(true);
        setPwForm({ current: '', next: '', confirm: '' });
      }
    } catch {
      setPwError(t('settings.changePassword.networkError'));
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/profile/me', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      await logout();
      onClose();
      window.location.href = '/';
    } catch {
      setDeleteError(t('settings.dangerZone.error'));
    } finally {
      setDeleting(false);
    }
  };

  const sections: { key: typeof activeSection; label: string; icon: string }[] = [
    { key: 'cont', label: t('settings.sections.account'), icon: '👤' },
    { key: 'maraai', label: t('settings.sections.maraai'), icon: '🧠' },
    { key: 'notificari', label: t('settings.sections.notifications'), icon: '🔔' },
    { key: 'preferinte', label: t('settings.sections.preferences'), icon: '🎨' },
  ];

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="settings-header">
          <span className="settings-title">⚙️ {t('settings.title')}</span>
          <button className="settings-close" onClick={onClose} aria-label={t('settings.close')}>✕</button>
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

                <h3 className="settings-section-title">{t('settings.changePassword.title')}</h3>
                {pwSuccess ? (
                  <div className="settings-success">{t('settings.changePassword.success')}</div>
                ) : (
                  <form onSubmit={handleChangePassword} className="settings-form">
                    <label className="settings-label">
                      {t('settings.changePassword.current')}
                      <input
                        type="password"
                        value={pwForm.current}
                        onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    <label className="settings-label">
                      {t('settings.changePassword.new')}
                      <input
                        type="password"
                        value={pwForm.next}
                        onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    <label className="settings-label">
                      {t('settings.changePassword.confirm')}
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
                      {pwSaving ? t('settings.saving') : t('settings.changePassword.submit')}
                    </button>
                  </form>
                )}

                <button className="settings-btn-danger" onClick={handleLogout}>
                  {t('settings.logout')}
                </button>

                <div className="settings-divider" />

                <h3 className="settings-section-title">{t('settings.dangerZone.title')}</h3>
                <p className="settings-danger-desc">
                  {t('settings.dangerZone.description', { defaultValue: 'Deleting your account is irreversible. All your data (posts, reels, missions, XP, messages) will be permanently deleted.' })}
                </p>
                {deleteError && <div className="settings-error">{deleteError}</div>}
                {deleteConfirm ? (
                  <div className="settings-delete-confirm">
                    <p className="settings-delete-warn">{t('settings.dangerZone.confirmMsg')}</p>
                    <div className="settings-delete-actions">
                      <button
                        className="settings-btn-danger"
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                      >
                        {deleting ? t('settings.saving') : t('settings.dangerZone.confirmDelete')}
                      </button>
                      <button
                        className="settings-btn-ghost"
                        onClick={() => { setDeleteConfirm(false); setDeleteError(''); }}
                        disabled={deleting}
                      >
                        {t('settings.dangerZone.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="settings-btn-delete" onClick={handleDeleteAccount}>
                    {t('settings.dangerZone.delete')}
                  </button>
                )}

                <Link to="/privacy" className="settings-privacy-link" onClick={onClose}>
                  {t('settings.privacyLink')}
                </Link>
              </div>
            )}

            {/* ── MARAAI & PRIVACY ─────────────────────────────── */}
            {activeSection === 'maraai' && (
              <div className="settings-section">
                {loadingConsent ? (
                  <div className="settings-loading">{t('settings.loading')}</div>
                ) : consent ? (
                  <>
                    <h3 className="settings-section-title">{t('settings.maraMode.title')}</h3>
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
                              {m === 'centralized' && t('settings.maraMode.centralizedLabel')}
                              {m === 'hybrid' && t('settings.maraMode.hybridLabel')}
                              {m === 'advanced' && t('settings.maraMode.advancedLabel')}
                            </div>
                            <div className="settings-radio-desc">
                              {m === 'centralized' && t('settings.maraMode.centralizedDesc')}
                              {m === 'hybrid' && t('settings.maraMode.hybridDesc')}
                              {m === 'advanced' && t('settings.maraMode.advancedDesc')}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <h3 className="settings-section-title">{t('settings.p2p.title')}</h3>
                    <ToggleRow
                      label={t('settings.p2p.participation')}
                      desc={t('settings.p2p.participationDesc')}
                      checked={consent.p2pEnabled}
                      disabled={consent.mode === 'centralized'}
                      onChange={v => saveConsent({ p2pEnabled: v })}
                    />
                    <ToggleRow
                      label={t('settings.p2p.backgroundNode')}
                      desc={t('settings.p2p.backgroundNodeDesc')}
                      checked={consent.backgroundNode}
                      disabled={consent.mode === 'centralized'}
                      onChange={v => saveConsent({ backgroundNode: v })}
                    />
                    <ToggleRow
                      label={t('settings.p2p.advancedRouting')}
                      desc={t('settings.p2p.advancedRoutingDesc')}
                      checked={consent.advancedAiRouting}
                      onChange={v => saveConsent({ advancedAiRouting: v })}
                    />

                    {consent.backgroundNode && (
                      <>
                        <h3 className="settings-section-title">{t('settings.p2p.bandwidth')}</h3>
                        <div className="settings-slider-row">
                          <span>{consent.bandwidthShareGbMonth} {t('settings.p2p.gbPerMonth')}</span>
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

                    {savingConsent && <div className="settings-saving">{t('settings.saving')}</div>}
                  </>
                ) : (
                  <div className="settings-error">{t('settings.privacyLoadError')}</div>
                )}
              </div>
            )}

            {/* ── NOTIFICĂRI ───────────────────────────────────── */}
            {activeSection === 'notificari' && (
              <div className="settings-section">
                {loadingConsent ? (
                  <div className="settings-loading">{t('settings.loading')}</div>
                ) : consent ? (
                  <>
                    <h3 className="settings-section-title">{t('settings.notifications.title')}</h3>
                    <ToggleRow
                      label={t('settings.notifications.label')}
                      desc={t('settings.notifications.desc')}
                      checked={consent.notificationsEnabled}
                      onChange={v => saveConsent({ notificationsEnabled: v })}
                    />
                    {savingConsent && <div className="settings-saving">{t('settings.saving')}</div>}
                  </>
                ) : (
                  <div className="settings-error">{t('settings.loadError')}</div>
                )}
              </div>
            )}

            {/* ── PREFERINȚE ───────────────────────────────────── */}
            {activeSection === 'preferinte' && (
              <div className="settings-section">
                <h3 className="settings-section-title">{t('settings.theme.title')}</h3>
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

                <h3 className="settings-section-title" style={{ marginTop: '20px' }}>{t('settings.language.title')}</h3>
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
