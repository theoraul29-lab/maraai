import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Chrome + Edge fire `beforeinstallprompt` when the page meets the A2HS
 * (add-to-home-screen) criteria. Safari does NOT fire this event — users have
 * to use Share → "Add to Home Screen" manually. We show a non-intrusive
 * banner on browsers that support the event, and a one-time iOS hint
 * detected by UA + `standalone` check.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'mara_pwa_install_dismissed_v1';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari exposes a non-standard `navigator.standalone` flag.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  return iosStandalone || mqStandalone;
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  // iPadOS 13+ lies and reports as Mac; catch both.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
}

export function InstallPromptBanner(): ReactElement | null {
  const { t } = useTranslation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);

  // Listen for the install prompt event.
  useEffect(() => {
    if (isStandalone()) return; // already installed
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const ts = Number(dismissed);
      // Re-prompt after 14 days so we don't nag but also don't disappear forever.
      if (Number.isFinite(ts) && Date.now() - ts < 14 * 24 * 60 * 60 * 1000) return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS has no event — show the banner after 15s of engagement so it
    // doesn't blink over the landing hero.
    let iosTimer: number | undefined;
    if (isIOS() && !isStandalone()) {
      iosTimer = window.setTimeout(() => setShowIOSHint(true), 15_000);
    }

    const installedHandler = () => {
      setInstallEvent(null);
      setShowIOSHint(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      if (iosTimer !== undefined) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setInstallEvent(null);
    setShowIOSHint(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch (err) {
      console.warn('[pwa] install prompt failed:', err);
    } finally {
      setInstallEvent(null);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  };

  if (installEvent) {
    return (
      <div className="mara-pwa-banner" role="dialog" aria-labelledby="mara-pwa-title">
        <div className="mara-pwa-text">
          <strong id="mara-pwa-title">{t('pwa.installTitle')}</strong>
          <span>{t('pwa.installBody')}</span>
        </div>
        <div className="mara-pwa-actions">
          <button type="button" className="mara-pwa-primary" onClick={install}>
            {t('pwa.installCta')}
          </button>
          <button
            type="button"
            className="mara-pwa-ghost"
            onClick={dismiss}
            aria-label={t('pwa.installDismissAria')}
          >
            {t('pwa.installDismiss')}
          </button>
        </div>
      </div>
    );
  }

  if (showIOSHint) {
    return (
      <div className="mara-pwa-banner" role="dialog" aria-labelledby="mara-pwa-title-ios">
        <div className="mara-pwa-text">
          <strong id="mara-pwa-title-ios">{t('pwa.iosHintTitle')}</strong>
          <span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              style={{ verticalAlign: 'middle', margin: '0 2px' }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12" />
              <path d="M8 7l4-4 4 4" />
              <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>{' '}
            {t('pwa.iosHintBody')}
          </span>
        </div>
        <div className="mara-pwa-actions">
          <button type="button" className="mara-pwa-ghost" onClick={dismiss}>
            {t('pwa.iosHintDismiss')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
