
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useErrorHandler } from './hooks/useErrorHandler';
import { useTouchGesture } from './hooks/useTouchGesture';
import { useAccessible } from './hooks/useAccessible';
import './OrbitalStyles.css';
import ChatWidget from './components/ChatWidget';
import { AuthButton } from './components/AuthButton';
import { LanguageSelector } from './components/LanguageSelector';
import { MobileOrbHome } from './maraai/MobileOrbHome';

const moduleKeys = [
  { id: 'you', titleKey: 'home.you', to: '/you', icon: '👤', color: '#a855f7' },
  { id: 'reels', titleKey: 'home.reels', to: '/reels', icon: '🎬', color: '#06b6d4' },
  { id: 'trading', titleKey: 'home.trading', to: '/trading-academy', icon: '📈', color: '#22c55e' },
  { id: 'vip', titleKey: 'home.vip', to: '/membership', icon: '👑', color: '#ec4899' },
  { id: 'creators', titleKey: 'home.creators', to: '/creator-panel', icon: '✨', color: '#f59e0b' },
  { id: 'writers', titleKey: 'home.writers', to: '/writers-hub', icon: '✍️', color: '#8b5cf6' },
];

interface TremorState {
  active: boolean;
  intensity: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/**
 * Mobile detection hook
 */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        typeof window !== 'undefined' &&
        (window.innerWidth < 768 ||
          /mobile|android|iphone|ipad|phone/i.test(navigator.userAgent))
      );
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { handleError } = useErrorHandler();

  // State management
  const [tremor, setTremor] = useState<TremorState>({ active: false, intensity: 0 });
  const [rotationAngle, setRotationAngle] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [glowIntensity, setGlowIntensity] = useState(1);

  // Refs for animation and gesture tracking
  const containerRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(0);
  const particleIdRef = useRef(0);
  const animationIdRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef(Date.now());

  /**
   * Mobile animation loop - handles rotation, particles, and physics
   */
  useEffect(() => {
    if (!isMobile) return;

    lastTimeRef.current = Date.now();

    const animate = () => {
      try {
        const now = Date.now();
        const delta = Math.min(now - lastTimeRef.current, 50); // Cap delta to 50ms for stability
        lastTimeRef.current = now;

        // Update rotation with friction decay
        setRotationAngle((prev) => (prev + velocityRef.current * delta) % 360);

        // Apply friction (4 seconds to stop completely)
        velocityRef.current *= Math.pow(0.99, delta / 16);

        if (Math.abs(velocityRef.current) < 0.001) {
          velocityRef.current = 0;
        }

        // Update particles (life decay + physics)
        setParticles((prev) =>
          prev
            .map((p) => ({
              ...p,
              x: p.x + p.vx * delta * 0.1,
              y: p.y + p.vy * delta * 0.1,
              life: p.life - delta,
              vy: p.vy + 0.3 * delta * 0.1, // gravity
            }))
            .filter((p) => p.life > 0)
        );

        // Update glow based on velocity
        setGlowIntensity(1 + Math.abs(velocityRef.current) * 0.5);

        animationIdRef.current = requestAnimationFrame(animate);
      } catch (error) {
        handleError(error as Error, { context: 'animation_loop_mobile' });
      }
    };

    animationIdRef.current = requestAnimationFrame(animate);

    // Cleanup: Cancel animation on unmount
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isMobile, handleError]);

  /**
   * Create particle burst with random colors
   */
  const createParticleBurst = useCallback(
    (centerX: number, centerY: number, intensity: number) => {
      try {
        const burstParticles: Particle[] = [];
        const particleCount = 12;
        const colors = ['#a855f7', '#ef4444', '#22c55e', '#06b6d4', '#ec4899', '#f59e0b'];

        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2;
          const speed = (intensity / 100) * 2 + 0.5;

          burstParticles.push({
            id: particleIdRef.current++,
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1000, // ms
            color: colors[i % colors.length],
          });
        }

        setParticles((prev) => [...prev, ...burstParticles]);
      } catch (error) {
        handleError(error as Error, { context: 'particle_burst' });
      }
    },
    [handleError]
  );

  /**
   * Touch gesture handlers
   */
  const { handleTouchStart, handleTouchEnd } = useTouchGesture({
    onSwipe: (direction, velocity) => {
      try {
        if (direction === 'up' || direction === 'down') {
          // Vertical swipe controls rotation
          velocityRef.current = direction === 'down' ? -velocity * 2 : velocity * 2;

          // Haptic feedback
          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }

          // Particle burst at center
          createParticleBurst(
            window.innerWidth / 2,
            window.innerHeight / 2,
            Math.min(velocity * 50, 100)
          );
        }
      } catch (error) {
        handleError(error as Error, { context: 'swipe_gesture' });
      }
    },
    onDrag: (_point, velocity) => {
      try {
        if (Math.abs(velocity.y) > 0.1) {
          velocityRef.current = velocity.y * 2;
          setGlowIntensity(1.5 + Math.abs(velocity.y) * 0.5);
        }
      } catch (error) {
        handleError(error as Error, { context: 'drag_gesture' });
      }
    },
    minSwipeDistance: 20,
    minSwipeVelocity: 0.3,
  });

  /**
   * Get position for mobile circular layout (vertical)
   */
  const getMobileOrbPosition = useCallback((index: number) => {
    try {
      const radius = Math.min(window.innerHeight * 0.25, 180);
      const totalAngles = 7;
      const angleStep = (2 * Math.PI) / totalAngles;

      // Skip MARA at center (index 3)
      let circleIndex = index;
      if (index >= 3) circleIndex = index + 1;

      const angle = angleStep * circleIndex + rotationAngle * (Math.PI / 180);

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      return { x, y };
    } catch (error) {
      handleError(error as Error, { context: 'mobile_orb_position' });
      return { x: 0, y: 0 };
    }
  }, [rotationAngle, handleError]);

  /**
   * Get tremor offset for desktop animation
   */
  const getTremorOffset = useCallback(() => {
    if (!tremor.active) return 0;
    return (Math.random() - 0.5) * tremor.intensity;
  }, [tremor.active, tremor.intensity]);

  /**
   * Desktop tremor animation
   */
  useEffect(() => {
    if (!tremor.active || isMobile) return;

    const startTime = Date.now();
    const duration = 400; // ms
    let tremorAnimationId: number;

    const animate = () => {
      try {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const intensity = tremor.intensity * (1 - progress);

        if (progress < 1) {
          setTremor((prev) => ({ ...prev, intensity }));
          tremorAnimationId = requestAnimationFrame(animate);
        } else {
          setTremor({ active: false, intensity: 0 });
        }
      } catch (error) {
        handleError(error as Error, { context: 'tremor_animation' });
        setTremor({ active: false, intensity: 0 });
      }
    };

    tremorAnimationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(tremorAnimationId);
  }, [tremor.active, isMobile, handleError]);

  /**
   * Handle desktop mouse down
   */
  const handleMouseDown = useCallback(() => {
    try {
      if (isMobile) return;
      setTremor({ active: true, intensity: 8 });
    } catch (error) {
      handleError(error as Error, { context: 'mouse_down' });
    }
  }, [isMobile, handleError]);

  /**
   * Navigate to module with animation feedback
   */
  const handleOrbClick = useCallback(
    (path: string) => {
      try {
        if (!isMobile) {
          setTremor({ active: true, intensity: 10 });
        }
        setTimeout(() => navigate(path), 200);
      } catch (error) {
        handleError(error as Error, { context: 'orb_click', path });
      }
    },
    [isMobile, navigate, handleError]
  );

  /**
   * Desktop positioning
   */
  const getOrbPosition = useCallback((index: number) => {
    try {
      const leftAngles = [150, 180, 210];
      const rightAngles = [30, 0, 330];
      const radius = 380;

      const angles = index < 3 ? leftAngles : rightAngles;
      const angleIndex = index < 3 ? index : index - 3;
      const angle = (angles[angleIndex] * Math.PI) / 180;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { x, y };
    } catch (error) {
      handleError(error as Error, { context: 'desktop_orb_position' });
      return { x: 0, y: 0 };
    }
  }, [handleError]);

  const orbAccessibility = useAccessible({
    role: 'button',
    label: t('home.navigateToModule'),
  });

  // Mobile gets the new infinite-orb selector. The legacy orbital layout
  // below stays in place for desktop / tablet, untouched.
  if (isMobile) {
    return <MobileOrbHome />;
  }

  return (
    <main
      className={`page-home orbital-page ${isMobile ? 'mobile-orbital' : ''}`}
      role="main"
      aria-label={t('home.orbitalNav')}
    >
      <div
        ref={containerRef}
        className={`orbital-container ${isMobile ? 'mobile-orbital-container' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={(e) => handleTouchStart(e as any)}
        onTouchMove={() => {}}
        onTouchEnd={() => {
          handleTouchEnd();
        }}
        style={
          isMobile
            ? {
                filter: `drop-shadow(0 0 ${30 * glowIntensity}px rgba(147, 51, 234, 0.3))`,
              }
            : {
                transform: `translate(${getTremorOffset()}px, ${getTremorOffset()}px)`,
                transition: tremor.active ? 'none' : 'transform 0.05s ease-out',
              }
        }
      >
        {/* Matrix background effect */}
        <div className="matrix-background" aria-hidden="true" />

        {/* Center Mara AI orb */}
        <div className={`orbital-center ${isMobile ? 'mobile-orbital-center' : ''}`}>
          <div className="mara-orb" role="img" aria-label={t('home.maraCenter')}>
            <div className="mara-inner">
              <span className="mara-text">{t('home.mara')}</span>
            </div>
          </div>
        </div>

        {/* 6 Module orbs */}
        {moduleKeys.map((module, index) => {
          const pos = isMobile ? getMobileOrbPosition(index) : getOrbPosition(index);
          const title = t(module.titleKey);
          return (
            <button
              key={module.id}
              className={`orb ${isMobile ? 'mobile-orb' : ''}`}
              data-module={module.id}
              onClick={() => handleOrbClick(module.to)}
              title={t('home.navigateTo', { module: title })}
              aria-label={t('home.moduleLabel', { module: title })}
              {...orbAccessibility}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                borderColor: module.color,
                color: module.color,
              }}
            >
              <span className="orb-icon" aria-hidden="true">
                {module.icon}
              </span>
              <span className="orb-label">{title}</span>
            </button>
          );
        })}

        {/* Particle burst system - mobile only */}
        {isMobile &&
          particles.map((particle) => (
            <div
              key={particle.id}
              className="particle"
              style={{
                position: 'absolute',
                left: `calc(50% + ${particle.x}px)`,
                top: `calc(50% + ${particle.y}px)`,
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: particle.color,
                opacity: particle.life / 1000,
                pointerEvents: 'none',
                boxShadow: `0 0 10px ${particle.color}`,
              }}
              aria-hidden="true"
            />
          ))}
      </div>

      {/* Auth + Language - Top Left */}
      <div className="top-left-controls">
        <AuthButton />
        <LanguageSelector compact />
      </div>

      {/* Chat Widget - Bottom Right */}
      <ChatWidget />
    </main>
  );
}

export default HomePage;
