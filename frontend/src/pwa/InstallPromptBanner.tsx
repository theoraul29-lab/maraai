import { useEffect, useState, type ReactElement } from 'react';
import { subscribePWA, type PWAEvent } from './registerPWA';

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
const UPDATE_DISMISS_KEY = 'mara_pwa_update_dismissed_v1';

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
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<null | (() => Promise<void>)>(null);

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

  // Listen for SW update events.
  useEffect(() => {
    const unsub = subscribePWA((e: PWAEvent) => {
      if (e.type === 'update-available') {
        const dismissed = sessionStorage.getItem(UPDATE_DISMISS_KEY);
        if (dismissed) return;
        setUpdateAvailable(() => e.updateNow);
      }
    });
    return unsub;
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

  const dismissUpdate = () => {
    sessionStorage.setItem(UPDATE_DISMISS_KEY, '1');
    setUpdateAvailable(null);
  };

  const applyUpdate = async () => {
    if (!updateAvailable) return;
    await updateAvailable();
    // `updateNow` triggers a reload internally, but some browsers race — force
    // a reload here as a belt-and-braces fallback so the new SW takes over.
    window.location.reload();
  };

  if (updateAvailable) {
    return (
      <div className="mara-pwa-banner mara-pwa-update" role="status" aria-live="polite">
        <div className="mara-pwa-text">
          <strong>Update ready</strong>
          <span>A newer version of Mara is available.</span>
        </div>
        <div className="mara-pwa-actions">
          <button type="button" className="mara-pwa-primary" onClick={applyUpdate}>
            Refresh
          </button>
          <button type="button" className="mara-pwa-ghost" onClick={dismissUpdate} aria-label="Dismiss update">
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (installEvent) {
    return (
      <div className="mara-pwa-banner" role="dialog" aria-labelledby="mara-pwa-title">
        <div className="mara-pwa-text">
          <strong id="mara-pwa-title">Install Mara</strong>
          <span>Add hellomara.net to your home screen for a full-screen app experience.</span>
        </div>
        <div className="mara-pwa-actions">
          <button type="button" className="mara-pwa-primary" onClick={install}>
            Install
          </button>
          <button type="button" className="mara-pwa-ghost" onClick={dismiss} aria-label="Dismiss install prompt">
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (showIOSHint) {
    return (
      <div className="mara-pwa-banner" role="dialog" aria-labelledby="mara-pwa-title-ios">
        <div className="mara-pwa-text">
          <strong id="mara-pwa-title-ios">Install Mara</strong>
          <span>
            Tap <span aria-hidden="true">⎋</span> Share, then "Add to Home Screen" to install the app.
          </span>
        </div>
        <div className="mara-pwa-actions">
          <button type="button" className="mara-pwa-ghost" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    );
  }

  return null;
}
