// Subsystem settings panel — exposes the consent/mode toggles that
// were previously only available in the onboarding flow. This lets a
// user enable/disable P2P, advanced AI routing, background node, etc.
// at any time after install.
//
// Backend:
//   GET  /api/consent             → { consent: { ... } }
//   POST /api/consent  (strict)   → patch any subset of the schema
//
// The strict schema accepts:
//   { mode, p2pEnabled, bandwidthShareGbMonth, backgroundNode,
//     advancedAiRouting, advancedContributorMode, killSwitch,
//     acceptTerms }
//
// We surface mode + the four bool toggles + bandwidth slider + a kill
// switch button. Everything is auth-gated; the panel shows a sign-in
// CTA for guests instead of pretending to save settings locally.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import './SubsystemSettings.css';

type Mode = 'centralized' | 'hybrid' | 'advanced';

interface ConsentRecord {
  mode: Mode;
  p2pEnabled: boolean;
  bandwidthShareGbMonth: number;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  advancedContributorMode?: boolean;
  killSwitch?: boolean;
}

const MODES: { id: Mode; tag: string }[] = [
  { id: 'centralized', tag: 'settings.modeCentral' },
  { id: 'hybrid', tag: 'settings.modeHybrid' },
  { id: 'advanced', tag: 'settings.modeAdvanced' },
];

interface Props {
  onClose: () => void;
  onRequestLogin?: () => void;
}

export function SubsystemSettings({ onClose, onRequestLogin }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/consent', { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setConsent(json.consent ?? null);
      } catch {
        if (!cancelled) setError('load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ESC closes the panel — matches the rest of the modal-style UI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = async (partial: Partial<ConsentRecord>) => {
    if (!consent) return;
    const next = { ...consent, ...partial };
    setConsent(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (json.consent) setConsent(json.consent as ConsentRecord);
    } catch {
      setError('save_failed');
      // Roll back optimistic update on failure.
      setConsent(consent);
    } finally {
      setSaving(false);
    }
  };

  const handleKillSwitch = async () => {
    // Kill switch flips P2P off + background node off + sets mode to
    // centralized so the system falls back to the safe default.
    await patch({
      killSwitch: true,
      p2pEnabled: false,
      backgroundNode: false,
      advancedAiRouting: false,
      mode: 'centralized',
    });
  };

  return (
    <div className="mara-settings-overlay" onClick={onClose}>
      <section
        className="mara-settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('settings.title', 'Subsystem settings')}
      >
        <header className="mara-settings-header">
          <h2>{t('settings.title', 'Subsystem settings')}</h2>
          <button
            type="button"
            className="mara-settings-close"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
          >
            ✕
          </button>
        </header>

        {!user && (
          <div className="mara-settings-empty">
            <p>{t('settings.signInRequired', 'Sign in to manage your subsystem settings.')}</p>
            <button
              type="button"
              className="mara-settings-cta"
              onClick={() => {
                onClose();
                onRequestLogin?.();
              }}
            >
              {t('settings.signInCta', 'Sign in / Create account')}
            </button>
          </div>
        )}

        {user && loading && (
          <div className="mara-settings-empty">{t('settings.loading', 'Loading…')}</div>
        )}

        {user && !loading && error === 'load_failed' && (
          <div className="mara-settings-empty">
            {t('settings.loadFailed', 'Could not load settings. Try again later.')}
          </div>
        )}

        {user && !loading && consent && (
          <>
            <section className="mara-settings-section">
              <h3>{t('settings.modeTitle', 'Mode')}</h3>
              <div className="mara-settings-modes">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mara-settings-mode${consent.mode === m.id ? ' active' : ''}`}
                    onClick={() => patch({ mode: m.id })}
                    disabled={saving}
                  >
                    {t(m.tag, m.id)}
                  </button>
                ))}
              </div>
            </section>

            <section className="mara-settings-section">
              <h3>{t('settings.networkTitle', 'Network participation')}</h3>

              <label className="mara-settings-row">
                <span>{t('settings.p2p', 'P2P participation')}</span>
                <input
                  type="checkbox"
                  checked={consent.p2pEnabled}
                  onChange={(e) => patch({ p2pEnabled: e.target.checked })}
                  disabled={saving}
                />
              </label>

              <label className="mara-settings-row">
                <span>{t('settings.background', 'Background node')}</span>
                <input
                  type="checkbox"
                  checked={consent.backgroundNode}
                  onChange={(e) => patch({ backgroundNode: e.target.checked })}
                  disabled={saving || !consent.p2pEnabled}
                />
              </label>

              <label className="mara-settings-row">
                <span>{t('settings.advancedAi', 'Advanced AI routing')}</span>
                <input
                  type="checkbox"
                  checked={consent.advancedAiRouting}
                  onChange={(e) => patch({ advancedAiRouting: e.target.checked })}
                  disabled={saving}
                />
              </label>

              <label className="mara-settings-row">
                <span>
                  {t('settings.bandwidth', 'Bandwidth share')}: {consent.bandwidthShareGbMonth} GB / month
                </span>
                <input
                  type="range"
                  min={0}
                  max={1024}
                  step={1}
                  value={consent.bandwidthShareGbMonth}
                  onChange={(e) =>
                    setConsent({
                      ...consent,
                      bandwidthShareGbMonth: Number(e.target.value),
                    })
                  }
                  onPointerUp={() =>
                    patch({ bandwidthShareGbMonth: consent.bandwidthShareGbMonth })
                  }
                  disabled={saving || !consent.p2pEnabled}
                />
              </label>
            </section>

            <section className="mara-settings-section">
              <h3>{t('settings.killTitle', 'Kill switch')}</h3>
              <p className="mara-settings-help">
                {t(
                  'settings.killHelp',
                  'Disable P2P, background node and advanced routing instantly. Reverts to centralized mode.',
                )}
              </p>
              <button
                type="button"
                className="mara-settings-kill"
                onClick={handleKillSwitch}
                disabled={saving}
              >
                {t('settings.killCta', 'Disable everything now')}
              </button>
            </section>

            {error === 'save_failed' && (
              <p className="mara-settings-error" role="alert">
                {t('settings.saveFailed', 'Could not save change. Try again.')}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
