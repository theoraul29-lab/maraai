// Mobile-only vertical orb selector for the home screen.
//
// Behaviour spec:
//   - Full-screen, black bg with subtle purple glow particles.
//   - Vertical chain of glowing orbs, the centred one is selected.
//   - Native scroll-snap drives all motion — no custom velocity/inertia
//     math. The browser's own compositor handles momentum and snapping,
//     which is what makes this immune to the "trembling" a hand-rolled
//     requestAnimationFrame physics loop is exposed to under any main-
//     thread pressure (GC pause, background tab, slower phone).
//   - Finite list (You -> Creators), not an infinite loop: scroll-snap
//     doesn't have a native wrap-around primitive, and reintroducing one
//     manually would bring back exactly the kind of per-frame JS this
//     rewrite removes. Six items is a short enough chain that reaching
//     either end is one quick swipe away.
//   - Mobile-only: parent gates on width <= 768px; component is also
//     hidden by CSS at min-width: 769px as defence in depth.
//
// Implementation notes:
//   - `activeIndex` (which orb is centred) is derived from an
//     IntersectionObserver watching a thin band at the exact vertical
//     centre of the scroll viewport (rootMargin: -49% top/bottom) —
//     the browser tells us when an orb crosses that band; we never poll.
//   - The centre/near/far visual treatment (scale, opacity, blur) is 3
//     discrete states transitioned by CSS, not a continuous per-pixel
//     function. It's a deliberate trade-off: slightly less fluid-looking
//     than a perfectly continuous curve, but entirely GPU-composited and
//     therefore immune to main-thread jank.

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthButton } from '../components/AuthButton';
import { LanguageSelector } from '../components/LanguageSelector';
import { AuthModal } from '../components/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { SubsystemSettings } from './SubsystemSettings';
import './MobileOrbHome.css';

type OrbId = 'you' | 'reels' | 'missions' | 'writers' | 'programs' | 'creators';

type OrbItem = {
  id: OrbId;
  label: string;
  to: string;
  icon: ReactNode;
};

// Matches the API_URL convention used across the rest of the frontend
// (e.g. creator.tsx): same-origin in production, explicit backend host in
// dev where Vite (5173) and the backend (5000 by default) run separately.
const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const ICONS: Record<OrbId, ReactNode> = {
  you: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4 0-7.5 2.2-7.5 5v2h15v-2c0-2.8-3.5-5-7.5-5Z"
      />
    </svg>
  ),
  reels: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h16v3H4V4Zm0 13h16v3H4v-3Zm0-6.5h16v3H4v-3Zm6 4.5 5-3-5-3v6Z"
      />
    </svg>
  ),
  missions: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
      />
      <circle fill="currentColor" cx="12" cy="12" r="3" />
    </svg>
  ),
  writers: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0 0 4h12V2H7a4 4 0 0 0-4 4v16h2V4Z"
      />
    </svg>
  ),
  programs: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M3 17h2v-7H3v7zm4 0h2V7H7v10zm4 0h2v-4h-2v4zm4 0h2V3h-2v14zm4 0h2v-10h-2v10z"
      />
    </svg>
  ),
  creators: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 14.4 8.6 21 9.3l-5 4.4 1.6 6.6L12 16.9 6.4 20.3 8 13.7 3 9.3l6.6-.7L12 2Zm0 4.7-1 2.7-2.9.3 2.2 1.9-.7 2.8 2.4-1.5 2.4 1.5-.7-2.8 2.2-1.9-2.9-.3-1-2.7Z"
      />
    </svg>
  ),
};

const ITEMS: OrbItem[] = [
  { id: 'you', label: 'You', to: '/you', icon: ICONS.you },
  { id: 'reels', label: 'Sparks', to: '/reels', icon: ICONS.reels },
  { id: 'missions', label: 'Missions', to: '/missions', icon: ICONS.missions },
  { id: 'programs', label: 'Programs', to: '/pricing', icon: ICONS.programs },
  { id: 'writers', label: 'Writers', to: '/writers-hub', icon: ICONS.writers },
  { id: 'creators', label: 'Creators', to: '/creator-panel', icon: ICONS.creators },
];

export type MobileOrbHomeProps = {
  /** Override item list (mainly for tests / Storybook). */
  items?: OrbItem[];
};

export function MobileOrbHome({ items = ITEMS }: MobileOrbHomeProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [showProgramsLock, setShowProgramsLock] = useState(false);
  const [creatorLockMessage, setCreatorLockMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const PROGRAMS_LAUNCH = new Date('2026-07-01T00:00:00Z');
  const isProgramsLocked = () => Date.now() < PROGRAMS_LAUNCH.getTime();

  // Real follower count + creator-status, used only to decide whether
  // tapping the Creators orb needs a heads-up before entering — the page
  // itself (server/modules/creators.ts#getGrowthPath) is deliberately open
  // to everyone with an account regardless of this value; monetisation
  // features inside it are what actually require 1000 followers.
  const creatorGrowthRef = useRef<{ followers: number; isCreator: boolean } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch(`${API_URL}/api/creator/growth-path`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          creatorGrowthRef.current = { followers: data.followers, isCreator: data.isCreator };
        }
      })
      .catch(() => {
        /* Non-critical — tapping Creators just skips the heads-up on failure. */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Which orb is centred is derived entirely from the browser telling us
  // an element crossed a thin band at the exact vertical middle of the
  // scroll viewport — no scroll-position math, no per-frame sampling.
  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx)) setActiveIndex(idx);
        }
      },
      { root, rootMargin: '-49% 0px -49% 0px', threshold: 0 },
    );
    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  const handleOrbClick = useCallback(
    (index: number) => {
      const item = items[index];
      // Bring the tapped orb to centre for a clear visual confirmation
      // (mirrors the old "snap then navigate" feel) before navigating —
      // native smooth-scroll, same GPU-composited path as the rest.
      itemRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (item.to === '/pricing' && isProgramsLocked()) {
        setShowProgramsLock(true);
        setTimeout(() => setShowProgramsLock(false), 3500);
        return;
      }
      if (item.to === '/creator-panel') {
        const growth = creatorGrowthRef.current;
        if (growth && !growth.isCreator) {
          const remaining = Math.max(0, 1000 - growth.followers);
          setCreatorLockMessage(
            `🔒 Monetizarea se deblochează la 1000 followeri. Ai ${growth.followers} — mai ai ${remaining}. Intri oricum să-ți vezi traseul de creștere →`,
          );
          setTimeout(() => setCreatorLockMessage(null), 3500);
          // Still navigates — the growth-path page itself is deliberately
          // open below 1000 followers (see server/modules/creators.ts), this
          // is only a heads-up about which features stay locked once inside.
          window.setTimeout(() => navigate(item.to), 1600);
          return;
        }
      }
      window.setTimeout(() => navigate(item.to), 150);
    },
    [items, navigate],
  );

  return (
    <main
      className="mara-orb-home"
      role="application"
      aria-label={t('home.mobileAriaLabel')}
    >
      <div className="mara-orb-home__bg-glow" aria-hidden />

      {/* Background particles intentionally removed: the rising/fading
          dots read as a flicker on real phones (14× independent 10s
          opacity cycles). The only ambient motion on mobile is the
          slow 90s hue drift on .mara-orb-home__bg-glow. */}

      <header className="mara-orb-home__brand" aria-hidden>
        <span className="mara-orb-home__brand-name">Mara AI</span>
        <span className="mara-orb-home__brand-tag">Hybrid</span>
      </header>

      {/* Top action bar — login/register, language, settings.
          Sits above the orb chain (z-index 5) and uses
          `pointer-events: auto` so the scroll viewport doesn't
          swallow taps on these controls. */}
      <div className="mara-orb-home__actions">
        <div className="mara-orb-home__actions-left">
          <AuthButton />
          {!user && (
            <button
              type="button"
              className="mara-orb-home__register-btn"
              onClick={() => setAuthModalOpen(true)}
            >
              {t('home.createAccount')}
            </button>
          )}
        </div>
        <div className="mara-orb-home__actions-right">
          <LanguageSelector compact />
          <button
            type="button"
            className="mara-orb-home__settings-btn"
            aria-label={t('home.subsystemSettings')}
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="currentColor"
                d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.07 7.07 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.62-.94l2.39.96c.25.1.54 0 .68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
              />
            </svg>
          </button>
        </div>
      </div>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      {settingsOpen && (
        <SubsystemSettings
          onClose={() => setSettingsOpen(false)}
          onRequestLogin={() => setAuthModalOpen(true)}
        />
      )}

      <div className="mara-orb-home__viewport" ref={viewportRef}>
        <div className="mara-orb-home__rail">
          {items.map((item, index) => {
            const dist = Math.abs(index - activeIndex);
            const stateClass =
              dist === 0 ? 'mara-orb--center' : dist === 1 ? 'mara-orb--near' : 'mara-orb--far';
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                data-index={index}
                type="button"
                className={`mara-orb ${stateClass}`}
                aria-label={index === activeIndex ? `${item.label} (selected)` : item.label}
                onClick={() => handleOrbClick(index)}
              >
                <span className="mara-orb__icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="mara-orb__label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mara-orb-home__hint" aria-hidden>
        swipe · tap to enter
      </p>

      {/* Live region announcing the currently centred item for screen
          readers. */}
      <span className="visually-hidden" aria-live="polite">
        {items[activeIndex].label} selected
      </span>

      {showProgramsLock && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(14,10,26,0.97)', border: '1px solid rgba(236,72,153,0.4)',
          borderRadius: 14, padding: '12px 20px', color: '#fce7f3',
          fontSize: 13, fontWeight: 600, zIndex: 9999, textAlign: 'center',
          boxShadow: '0 8px 32px rgba(236,72,153,0.25)',
          width: 'calc(100vw - 48px)', maxWidth: 340,
        }}>
          🔒 Programs — disponibil din <strong>1 iulie 2026</strong>
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 4 }}>
            Explorează celelalte module până atunci.
          </div>
        </div>
      )}

      {creatorLockMessage && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(14,10,26,0.97)', border: '1px solid rgba(236,72,153,0.4)',
          borderRadius: 14, padding: '12px 20px', color: '#fce7f3',
          fontSize: 13, fontWeight: 600, zIndex: 9999, textAlign: 'center',
          boxShadow: '0 8px 32px rgba(236,72,153,0.25)',
          width: 'calc(100vw - 48px)', maxWidth: 340,
        }}>
          {creatorLockMessage}
        </div>
      )}
    </main>
  );
}
