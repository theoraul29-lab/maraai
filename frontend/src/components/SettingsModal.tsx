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

interface BlockedUser {
  id: string;
  displayName: string | null;
  firstName: string | null;
  profileImageUrl: string | null;
}

interface BillingInfo {
  planId: string;
  tier: 'free' | 'vip';
  subscription: {
    status: string;
    periodEnd: string | null;
  } | null;
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
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteScheduledFor, setDeleteScheduledFor] = useState<number | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[] | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState(false);
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
    fetch('/api/profile/blocked', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setBlockedUsers(Array.isArray(data.items) ? data.items : []))
      .catch(() => setBlockedUsers([]));
  }, []);

  useEffect(() => {
    fetch('/api/billing/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setBilling(data))
      .catch(() => setBilling(null))
      .finally(() => setLoadingBilling(false));
  }, []);

  const handleCancelSubscription = async () => {
    if (!cancelConfirm) { setCancelConfirm(true); return; }
    setCancelling(true);
    setCancelError('');
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(d.message || t('settings.subscriptionCancelError'));
        return;
      }
      setBilling(b => b ? { ...b, subscription: { status: 'cancelled', periodEnd: d.periodEnd } } : b);
      setCancelSuccess(true);
      setCancelConfirm(false);
    } catch {
      setCancelError(t('settings.subscriptionCancelError'));
    } finally {
      setCancelling(false);
    }
  };

  const handleUnblock = async (id: string) => {
    setUnblockingId(id);
    try {
      const res = await fetch(`/api/profile/${id}/block`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setBlockedUsers(list => (list ? list.filter(u => u.id !== id) : list));
      }
    } catch {
      // non-fatal — the row simply stays until retried
    } finally {
      setUnblockingId(null);
    }
  };

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
      setPwError(t('settings.pwConfirmError'));
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError(t('settings.pwMinLengthError'));
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
        setPwError(d.message || t('settings.pwNetworkError'));
      } else {
        setPwSuccess(true);
        setPwForm({ current: '', next: '', confirm: '' });
      }
    } catch {
      setPwError(t('settings.pwNetworkError'));
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(d.message || t('settings.deleteError'));
        return;
      }
      // Account is scheduled for deletion, not wiped immediately — the user
      // still has a 7-day window to cancel by logging back in. Clear local
      // session state now (server already destroyed the session) but show
      // the grace-period message instead of redirecting straight away.
      await logout();
      setDeleteScheduledFor(d.scheduledFor ?? Date.now());
    } catch {
      setDeleteError(t('settings.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  const sections: { key: typeof activeSection; label: string; icon: string }[] = [
    { key: 'cont', label: t('settings.sectionAccount'), icon: '👤' },
    { key: 'maraai', label: t('settings.sectionMaraAI'), icon: '🧠' },
    { key: 'notificari', label: t('settings.sectionNotifications'), icon: '🔔' },
    { key: 'preferinte', label: t('settings.sectionPreferences'), icon: '🎨' },
  ];

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="settings-header">
          <span className="settings-title">{t('settings.title')}</span>
          <button className="settings-close" onClick={onClose} aria-label={t('settings.closeAria')}>✕</button>
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

                <h3 className="settings-section-title">{t('settings.subscriptionTitle')}</h3>
                {loadingBilling ? (
                  <div className="settings-loading">{t('common.loading')}</div>
                ) : !billing ? (
                  <div className="settings-error">{t('settings.subscriptionLoadError')}</div>
                ) : billing.tier === 'vip' && billing.subscription ? (
                  <div className="settings-subscription">
                    <div className="settings-subscription-plan">{t('settings.subscriptionPlanVip')}</div>
                    {billing.subscription.status === 'active' ? (
                      <div className="settings-subscription-status">
                        {t('settings.subscriptionStatusActive')}
                        {billing.subscription.periodEnd && (
                          <> · {t('settings.subscriptionRenewsOn', { date: new Date(billing.subscription.periodEnd).toLocaleDateString() })}</>
                        )}
                      </div>
                    ) : (
                      <div className="settings-subscription-status">
                        {billing.subscription.periodEnd
                          ? t('settings.subscriptionCancelledUntil', { date: new Date(billing.subscription.periodEnd).toLocaleDateString() })
                          : t('settings.subscriptionCancelledUntil', { date: '' })}
                      </div>
                    )}

                    {cancelSuccess ? (
                      <div className="settings-success">
                        {t('settings.subscriptionCancelSuccess', {
                          date: billing.subscription.periodEnd ? new Date(billing.subscription.periodEnd).toLocaleDateString() : '',
                        })}
                      </div>
                    ) : billing.subscription.status === 'active' ? (
                      <>
                        {cancelError && <div className="settings-error">{cancelError}</div>}
                        {cancelConfirm ? (
                          <div className="settings-delete-confirm">
                            <p className="settings-delete-warn">
                              {t('settings.subscriptionCancelConfirmQuestion', {
                                date: billing.subscription.periodEnd ? new Date(billing.subscription.periodEnd).toLocaleDateString() : '',
                              })}
                            </p>
                            <div className="settings-delete-actions">
                              <button
                                className="settings-btn-danger"
                                onClick={handleCancelSubscription}
                                disabled={cancelling}
                              >
                                {cancelling ? t('settings.subscriptionCancelling') : t('settings.subscriptionCancelConfirmBtn')}
                              </button>
                              <button
                                className="settings-btn-ghost"
                                onClick={() => { setCancelConfirm(false); setCancelError(''); }}
                                disabled={cancelling}
                              >
                                {t('settings.cancelBtn')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button className="settings-btn-delete" onClick={handleCancelSubscription}>
                            {t('settings.subscriptionCancelBtn')}
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="settings-subscription">
                    <div className="settings-subscription-plan">{t('settings.subscriptionPlanFree')}</div>
                    <p className="settings-danger-desc">
                      {t('settings.subscriptionUpgradeCta')}{' '}
                      <Link to="/pricing" className="settings-privacy-link" onClick={onClose}>
                        {t('settings.subscriptionUpgradeLink')}
                      </Link>
                    </p>
                  </div>
                )}

                <div className="settings-divider" />

                <h3 className="settings-section-title">{t('settings.changePassword')}</h3>
                {pwSuccess ? (
                  <div className="settings-success">{t('settings.passwordChanged')}</div>
                ) : (
                  <form onSubmit={handleChangePassword} className="settings-form">
                    <label className="settings-label">
                      {t('settings.currentPassword')}
                      <input
                        type="password"
                        value={pwForm.current}
                        onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    <label className="settings-label">
                      {t('settings.newPassword')}
                      <input
                        type="password"
                        value={pwForm.next}
                        onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                        className="settings-input"
                        required
                      />
                    </label>
                    <label className="settings-label">
                      {t('settings.confirmNewPassword')}
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
                      {pwSaving ? t('settings.pwSaving') : t('settings.changePwBtn')}
                    </button>
                  </form>
                )}

                <button className="settings-btn-danger" onClick={handleLogout}>
                  {t('settings.logout')}
                </button>

                <div className="settings-divider" />

                <h3 className="settings-section-title">{t('settings.blockedUsersTitle')}</h3>
                <p className="settings-danger-desc">{t('settings.blockedUsersDesc')}</p>
                {blockedUsers === null ? (
                  <div className="settings-loading">{t('common.loading')}</div>
                ) : blockedUsers.length === 0 ? (
                  <div className="settings-blocked-empty">{t('settings.blockedUsersEmpty')}</div>
                ) : (
                  <ul className="settings-blocked-list">
                    {blockedUsers.map(u => (
                      <li key={u.id} className="settings-blocked-row">
                        <div className="settings-blocked-avatar">
                          {u.profileImageUrl ? (
                            <img src={u.profileImageUrl} alt="" />
                          ) : (
                            (u.displayName || u.firstName || '?')[0]?.toUpperCase()
                          )}
                        </div>
                        <span className="settings-blocked-name">{u.displayName || u.firstName || t('you.unknownUser')}</span>
                        <button
                          className="settings-btn-ghost"
                          onClick={() => handleUnblock(u.id)}
                          disabled={unblockingId === u.id}
                        >
                          {t('settings.unblockBtn')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="settings-divider" />

                <h3 className="settings-section-title">{t('settings.dangerZone')}</h3>
                {deleteScheduledFor ? (
                  <div className="settings-success">
                    {t('settings.deleteScheduled', {
                      date: new Date(deleteScheduledFor).toLocaleDateString(),
                    })}
                  </div>
                ) : (
                  <>
                    <p className="settings-danger-desc">
                      {t('settings.deleteAccountWarningSafe')}
                    </p>
                    {deleteError && <div className="settings-error">{deleteError}</div>}
                    {deleteConfirm ? (
                      <div className="settings-delete-confirm">
                        <p className="settings-delete-warn">{t('settings.deleteConfirmQuestion')}</p>
                        {user?.hasPassword !== false && (
                          <label className="settings-label">
                            {t('settings.deletePasswordLabel')}
                            <input
                              type="password"
                              value={deletePassword}
                              onChange={e => setDeletePassword(e.target.value)}
                              className="settings-input"
                              autoFocus
                            />
                          </label>
                        )}
                        <div className="settings-delete-actions">
                          <button
                            className="settings-btn-danger"
                            onClick={handleDeleteAccount}
                            disabled={deleting}
                          >
                            {deleting ? t('settings.deleting') : t('settings.deleteConfirmBtn')}
                          </button>
                          <button
                            className="settings-btn-ghost"
                            onClick={() => { setDeleteConfirm(false); setDeleteError(''); setDeletePassword(''); }}
                            disabled={deleting}
                          >
                            {t('settings.cancelBtn')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="settings-btn-delete" onClick={handleDeleteAccount}>
                        {t('settings.deleteAccountBtn')}
                      </button>
                    )}
                  </>
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
                  <div className="settings-loading">{t('common.loading')}</div>
                ) : consent ? (
                  <>
                    <h3 className="settings-section-title">{t('settings.modeTitle')}</h3>
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
                              {m === 'centralized' && t('settings.modeCentralized')}
                              {m === 'hybrid' && t('settings.modeHybrid')}
                              {m === 'advanced' && t('settings.modeAdvanced')}
                            </div>
                            <div className="settings-radio-desc">
                              {m === 'centralized' && t('settings.modeDescCentralized')}
                              {m === 'hybrid' && t('settings.modeDescHybrid')}
                              {m === 'advanced' && t('settings.modeDescAdvanced')}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <h3 className="settings-section-title">{t('settings.p2pNetwork')}</h3>
                    <ToggleRow
                      label={t('settings.p2pParticipation')}
                      desc={t('settings.p2pParticipationDesc')}
                      checked={consent.p2pEnabled}
                      disabled={consent.mode === 'centralized'}
                      onChange={v => saveConsent({ p2pEnabled: v })}
                    />
                    <ToggleRow
                      label={t('settings.backgroundNode')}
                      desc={t('settings.backgroundNodeDesc')}
                      checked={consent.backgroundNode}
                      disabled={consent.mode === 'centralized'}
                      onChange={v => saveConsent({ backgroundNode: v })}
                    />
                    <ToggleRow
                      label={t('settings.advancedAiRouting')}
                      desc={t('settings.advancedAiRoutingDesc')}
                      checked={consent.advancedAiRouting}
                      onChange={v => saveConsent({ advancedAiRouting: v })}
                    />

                    {consent.backgroundNode && (
                      <>
                        <h3 className="settings-section-title">{t('settings.bandwidthShared')}</h3>
                        <div className="settings-slider-row">
                          <span>{t('settings.bandwidthPerMonth', { gb: consent.bandwidthShareGbMonth })}</span>
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
                  <div className="settings-error">{t('settings.loadError')}</div>
                )}
              </div>
            )}

            {/* ── NOTIFICĂRI ───────────────────────────────────── */}
            {activeSection === 'notificari' && (
              <div className="settings-section">
                {loadingConsent ? (
                  <div className="settings-loading">{t('common.loading')}</div>
                ) : consent ? (
                  <>
                    <h3 className="settings-section-title">{t('settings.notificationsTitle')}</h3>
                    <ToggleRow
                      label={t('settings.notificationsEnabled')}
                      desc={t('settings.notificationsDesc')}
                      checked={consent.notificationsEnabled}
                      onChange={v => saveConsent({ notificationsEnabled: v })}
                    />
                    {savingConsent && <div className="settings-saving">{t('settings.saving')}</div>}
                  </>
                ) : (
                  <div className="settings-error">{t('settings.notifLoadError')}</div>
                )}
              </div>
            )}

            {/* ── PREFERINȚE ───────────────────────────────────── */}
            {activeSection === 'preferinte' && (
              <div className="settings-section">
                <h3 className="settings-section-title">{t('settings.themeTitle')}</h3>
                <div className="settings-theme-toggle">
                  <button
                    className={`settings-theme-btn ${theme === 'dark' ? 'is-active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    {t('settings.themeDark')}
                  </button>
                  <button
                    className={`settings-theme-btn ${theme === 'light' ? 'is-active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    {t('settings.themeLight')}
                  </button>
                </div>

                <h3 className="settings-section-title" style={{ marginTop: '20px' }}>{t('settings.languageTitle')}</h3>
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
