// Mobile-only "infinite vertical orb" home selector for MaraAI.
//
// Behaviour spec:
//   - Full-screen, black bg with subtle purple glow particles.
//   - Vertical chain of glowing orbs, the centred one is selected.
//   - Touch drag + inertia + snap-to-centre. iOS-feeling deceleration.
//   - Infinite loop via modulo recycling — render a fixed window of
//     visible slots, never a growing DOM.
//   - Mobile-only: parent gates on width ≤ 768px; component is also
//     hidden by CSS at min-width: 769px as defence in depth.
//
// Implementation notes:
//   - All physics state lives in refs and is mutated inside a single
//     RAF loop. React state is updated only when the active item index
//     changes (tap target / a11y label) — no per-frame setState.
//   - Item position is encoded by a continuous "offset" measured in
//     items, not pixels. Distance from centre = |offset - itemIndex|.
//   - For each visible slot k ∈ [-VIS, VIS], we render the item at
//     index `(round(offset) + k) mod count`, positioned at
//     `(k - frac) * SPACING_PX` where frac = offset - round(offset).
//     This keeps DOM size constant regardless of item count.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthButton } from '../components/AuthButton';
import { LanguageSelector } from '../components/LanguageSelector';
import { AuthModal } from '../components/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { SubsystemSettings } from './SubsystemSettings';
import './MobileOrbHome.css';

type OrbId = 'you' | 'reels' | 'trading' | 'writers' | 'vip' | 'creators';

type OrbItem = {
  id: OrbId;
  label: string;
  to: string;
  icon: ReactNode;
};

const SPACING_PX = 130; // distance between consecutive orb centres
const VISIBLE_SLOTS = 4; // -4..+4 ⇒ 9 rendered orbs at any time
const FRICTION_PER_FRAME = 0.94; // velocity decay each ~16ms tick (iOS-ish)
const MIN_VELOCITY = 0.0008; // items/ms; below this, snap & stop
const SNAP_DURATION_MS = 320;
const TAP_THRESHOLD_PX = 8;
const TAP_THRESHOLD_MS = 240;
const MAX_FLICK_VELOCITY = 0.012; // items/ms (≈ 1.5 items per 125ms)

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
  trading: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M3 18h18v2H3v-2Zm2-2V8h2v8H5Zm4 0V5h2v11H9Zm4 0v-7h2v7h-2Zm4 0v-3h2v3h-2Z"
      />
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
  vip: (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="m12 2 2.9 6.4 7 .7-5.2 4.7 1.5 6.9L12 17.7 5.8 20.7l1.5-6.9L2.1 9.1l7-.7L12 2Z"
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
  { id: 'reels', label: 'Reels', to: '/reels', icon: ICONS.reels },
  { id: 'trading', label: 'Trading Akademie', to: '/trading-academy', icon: ICONS.trading },
  { id: 'writers', label: 'Writers', to: '/writers-hub', icon: ICONS.writers },
  { id: 'vip', label: 'VIP', to: '/membership', icon: ICONS.vip },
  { id: 'creators', label: 'Creators', to: '/creator-panel', icon: ICONS.creators },
];

const PARTICLE_COUNT = 14;

type DragState = {
  pointerId: number;
  startY: number;
  lastY: number;
  startTime: number;
  lastTime: number;
  startedAtOffset: number;
  // Recent (y, t) samples used to compute release velocity. Buffer is
  // small and ring-style — we only ever look at the last ~80ms.
  samples: Array<{ y: number; t: number }>;
  moved: boolean;
};

type SnapState = {
  from: number;
  to: number;
  startedAt: number;
} | null;

export type MobileOrbHomeProps = {
  /** Override item list (mainly for tests / Storybook). */
  items?: OrbItem[];
};

export function MobileOrbHome({ items = ITEMS }: MobileOrbHomeProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const count = items.length;

  // Header overlay state — settings panel + auth modal for the
  // mobile-only "Create account" CTA.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Continuous offset in "items". Integer values mean an item is exactly
  // centred. We allow negative + unbounded; we mod-it-back when picking
  // which item to render in each slot.
  const offsetRef = useRef(0);
  // items / ms
  const velocityRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const snapRef = useRef<SnapState>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tappedSlotRef = useRef<number | null>(null);

  // The only piece of physics state we mirror to React. Everything else
  // stays in refs to keep the RAF loop allocation-free.
  const [activeIndex, setActiveIndex] = useState(0);

  // Build the slot array once. Slots are stable React keys; the actual
  // item shown in each slot is computed every frame via modulo.
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let k = -VISIBLE_SLOTS; k <= VISIBLE_SLOTS; k++) out.push(k);
    return out;
  }, []);

  const mod = useCallback(
    (n: number) => ((n % count) + count) % count,
    [count],
  );

  const applyTransforms = useCallback(() => {
    const offset = offsetRef.current;
    const rounded = Math.round(offset);
    const frac = offset - rounded;

    for (let i = 0; i < slots.length; i++) {
      const k = slots[i];
      const el = slotRefs.current[i];
      if (!el) continue;
      const slotOffset = k - frac;
      const dist = Math.abs(slotOffset);
      const y = slotOffset * SPACING_PX;
      const scale = clamp(1 - 0.18 * dist, 0.55, 1);
      const opacity = clamp(1 - 0.27 * dist, 0.04, 1);
      const blurPx = clamp(dist * 0.6, 0, 6);
      el.style.transform = `translate3d(-50%, calc(-50% + ${y.toFixed(2)}px), 0) scale(${scale.toFixed(3)})`;
      el.style.opacity = String(opacity);
      el.style.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : 'none';
      el.style.zIndex = String(100 - Math.round(dist * 10));
      el.classList.toggle('mara-orb--center', dist < 0.5);
    }

    // Item content for each slot is derived from `activeIndex` in JSX,
    // so we only need to push state when the centred index actually
    // changes. Doing it this way means React re-renders just once per
    // crossed boundary, not every frame.
    const newActive = mod(rounded);
    if (newActive !== activeIndex) {
      setActiveIndex(newActive);
    }
  }, [activeIndex, mod, slots]);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
  }, []);

  const startSnap = useCallback((target?: number) => {
    const from = offsetRef.current;
    const to = target ?? Math.round(from);
    snapRef.current = { from, to, startedAt: performance.now() };
    velocityRef.current = 0;
  }, []);

  const tickPhysics = useCallback(
    (now: number) => {
      const last = lastFrameRef.current;
      const dt = last == null ? 16 : Math.min(now - last, 50);
      lastFrameRef.current = now;

      const snap = snapRef.current;
      if (snap) {
        const t = clamp((now - snap.startedAt) / SNAP_DURATION_MS, 0, 1);
        const eased = easeOutCubic(t);
        offsetRef.current = snap.from + (snap.to - snap.from) * eased;
        if (t >= 1) {
          offsetRef.current = snap.to;
          snapRef.current = null;
        }
      } else {
        // Inertia phase
        offsetRef.current += velocityRef.current * dt;
        velocityRef.current *= Math.pow(FRICTION_PER_FRAME, dt / 16);
        if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
          velocityRef.current = 0;
          // Snap to nearest after coast finishes.
          startSnap();
        }
      }

      applyTransforms();

      const stillMoving =
        snapRef.current != null || Math.abs(velocityRef.current) >= MIN_VELOCITY;
      if (stillMoving) {
        rafRef.current = requestAnimationFrame(tickPhysics);
      } else {
        rafRef.current = null;
        lastFrameRef.current = null;
      }
    },
    [applyTransforms, startSnap],
  );

  const ensureRunning = useCallback(() => {
    if (rafRef.current == null) {
      lastFrameRef.current = null;
      rafRef.current = requestAnimationFrame(tickPhysics);
    }
  }, [tickPhysics]);

  // Initial layout pass (before any input).
  useEffect(() => {
    applyTransforms();
  }, [applyTransforms]);

  // --- Pointer / touch handlers ---------------------------------------------

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      // Only primary-button drags count; ignore right click / multi-touch
      // beyond the first contact.
      if (dragRef.current) return;
      target.setPointerCapture(e.pointerId);

      // Halt any ongoing motion.
      stopRaf();
      snapRef.current = null;
      const now = performance.now();
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        lastY: e.clientY,
        startTime: now,
        lastTime: now,
        startedAtOffset: offsetRef.current,
        samples: [{ y: e.clientY, t: now }],
        moved: false,
      };
      velocityRef.current = 0;
    },
    [stopRaf],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dy) > TAP_THRESHOLD_PX) drag.moved = true;
      // Drag down (+dy) should move the chain DOWN — meaning earlier items
      // come into the centre, i.e. offset DECREASES.
      offsetRef.current = drag.startedAtOffset - dy / SPACING_PX;
      drag.lastY = e.clientY;
      drag.lastTime = performance.now();
      drag.samples.push({ y: drag.lastY, t: drag.lastTime });
      // Keep ~120ms of samples — enough for a stable velocity estimate.
      const horizon = drag.lastTime - 120;
      while (drag.samples.length > 2 && drag.samples[0].t < horizon) {
        drag.samples.shift();
      }
      applyTransforms();
    },
    [applyTransforms],
  );

  const finishDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      dragRef.current = null;

      const now = performance.now();
      const elapsed = now - drag.startTime;

      // Always consume any pending tap target. If we don't reset here, a
      // drag that moved past the tap threshold would leave the ref dirty
      // and the next bare-background pointerup would mis-trigger snap or
      // navigation against a stale slot.
      const slot = tappedSlotRef.current;
      tappedSlotRef.current = null;

      // Tap detection: tiny, fast, and ended on an orb → navigate.
      if (!drag.moved && elapsed < TAP_THRESHOLD_MS) {
        if (slot != null) {
          const itemIndex = mod(Math.round(offsetRef.current) + slot);
          const item = items[itemIndex];
          // For non-centre taps, just snap the tapped orb to centre. For
          // centre taps, navigate. This matches the user expectation of
          // a slot-machine selector.
          if (slot === 0) {
            startSnap(Math.round(offsetRef.current));
            ensureRunning();
            // brief tap feedback
            const el = slotRefs.current[VISIBLE_SLOTS]; // centre slot index
            if (el) {
              el.classList.add('mara-orb--tap');
              setTimeout(() => el?.classList.remove('mara-orb--tap'), 180);
            }
            window.setTimeout(() => navigate(item.to), 160);
          } else {
            startSnap(Math.round(offsetRef.current) + slot);
            ensureRunning();
          }
          return;
        }
      }

      // Velocity from the last-120ms samples. Pixels/ms → items/ms.
      let velocityPxPerMs = 0;
      const samples = drag.samples;
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = Math.max(1, last.t - first.t);
        velocityPxPerMs = (last.y - first.y) / dt;
      }
      // Convert: drag down (+dy) ⇒ offset goes down (−)
      let velocityItemsPerMs = -velocityPxPerMs / SPACING_PX;
      velocityItemsPerMs = clamp(velocityItemsPerMs, -MAX_FLICK_VELOCITY, MAX_FLICK_VELOCITY);
      velocityRef.current = velocityItemsPerMs;

      // If the user barely moved at the end, just snap.
      if (Math.abs(velocityItemsPerMs) < MIN_VELOCITY) {
        velocityRef.current = 0;
        startSnap();
      }
      ensureRunning();
    },
    [ensureRunning, items, mod, navigate, startSnap],
  );

  const onPointerCancel = finishDrag;
  const onPointerUp = finishDrag;

  // Slot-level tap so we know WHICH slot the user lifted on. We bind on
  // pointerdown to record, but only act on pointerup (handled in
  // finishDrag).
  const handleSlotPointerDown = useCallback(
    (slotKey: number) => {
      tappedSlotRef.current = slotKey;
    },
    [],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // --- Render ---------------------------------------------------------------

  return (
    <main
      className="mara-orb-home"
      role="application"
      aria-label="Mara AI mobile home selector"
    >
      <div className="mara-orb-home__bg-glow" aria-hidden />

      {/* CSS-only background particles. */}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <span
          key={i}
          className="mara-orb-home__particle"
          aria-hidden
          style={particleStyle(i)}
        />
      ))}

      <header className="mara-orb-home__brand" aria-hidden>
        <span className="mara-orb-home__brand-name">Mara AI</span>
        <span className="mara-orb-home__brand-tag">Hybrid</span>
      </header>

      {/* Top action bar — login/register, language, settings.
          Sits above the orb chain (z-index 5) and uses
          `pointer-events: auto` so the orb viewport's drag handler
          doesn't swallow taps on these controls. */}
      <div className="mara-orb-home__actions">
        <div className="mara-orb-home__actions-left">
          <AuthButton />
          {!user && (
            <button
              type="button"
              className="mara-orb-home__register-btn"
              onClick={() => setAuthModalOpen(true)}
            >
              Create account
            </button>
          )}
        </div>
        <div className="mara-orb-home__actions-right">
          <LanguageSelector compact />
          <button
            type="button"
            className="mara-orb-home__settings-btn"
            aria-label="Subsystem settings"
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

      <div
        className="mara-orb-home__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="mara-orb-home__rail">
          {slots.map((k, slotIdx) => {
            const itemIndex = mod(activeIndex + k);
            const item = items[itemIndex];
            return (
              <button
                key={k}
                ref={(el) => {
                  slotRefs.current[slotIdx] = el;
                }}
                type="button"
                className={`mara-orb${k === 0 ? ' mara-orb--center' : ''}`}
                aria-label={k === 0 ? `${item.label} (selected)` : item.label}
                onPointerDown={() => handleSlotPointerDown(k)}
                style={{ touchAction: 'none' }}
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
    </main>
  );
}

// --- helpers -----------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function particleStyle(seed: number): CSSProperties {
  // Stable pseudo-random placement so SSR/CSR match if this ever runs
  // server-side. Pure deterministic from `seed`.
  const rand = (n: number) => {
    const x = Math.sin(seed * 9.1 + n * 31.7) * 10000;
    return x - Math.floor(x);
  };
  const left = `${(rand(1) * 100).toFixed(2)}%`;
  const delay = `${(rand(2) * 10).toFixed(2)}s`;
  const duration = `${(8 + rand(3) * 6).toFixed(2)}s`;
  const size = `${(2 + rand(4) * 3).toFixed(2)}px`;
  return {
    left,
    width: size,
    height: size,
    animationDelay: delay,
    animationDuration: duration,
  };
}
