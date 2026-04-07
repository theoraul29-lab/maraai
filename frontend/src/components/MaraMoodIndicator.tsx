/**
 * Mara Mood Indicator Component
 * Displays current AI mood with emoji, message, and visual feedback
 * Mobile-friendly: Touch-optimized, accessible interactions
 */

import React, { useEffect, useState } from 'react';
import type { MaraMood } from '../hooks/useMaraMood';
import './MaraMoodIndicator.css';

interface MaraMoodIndicatorProps {
  mood: MaraMood;
  showMessage?: boolean;
  position?: 'floating' | 'fixed' | 'inline';
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
}

/**
 * Mara Mood Indicator Component
 */
export const MaraMoodIndicator: React.FC<MaraMoodIndicatorProps> = ({
  mood,
  showMessage = true,
  position = 'floating',
  size = 'medium',
  onClick,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation on mount
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const sizeClasses = {
    small: 'mood-indicator-small',
    medium: 'mood-indicator-medium',
    large: 'mood-indicator-large',
  };

  const positionClasses = {
    floating: 'mood-indicator-floating',
    fixed: 'mood-indicator-fixed',
    inline: 'mood-indicator-inline',
  };

  return (
    <div
      className={`
        mara-mood-indicator
        ${sizeClasses[size]}
        ${positionClasses[position]}
        ${isVisible ? 'visible' : ''}
        ${className}
      `}
      role="status"
      aria-label={`Mara mood: ${mood.type}`}
      aria-live="polite"
      onClick={onClick}
      style={{
        '--mood-color': mood.color,
        '--mood-energy': mood.energy,
      } as React.CSSProperties}
    >
      {/* Mood emoji with glow effect */}
      <div className="mood-emoji" aria-hidden="true">
        <span className="emoji-inner">{mood.emoji}</span>
        <span className="emoji-glow" style={{ backgroundColor: mood.color }} />
      </div>

      {/* Mood message - only show if requested */}
      {showMessage && (
        <div className="mood-message" role="status">
          <p className="mood-text">{mood.message}</p>
          <div className="mood-confidence-indicator">
            <div
              className="confidence-bar"
              style={{
                width: `${mood.confidence * 100}%`,
                backgroundColor: mood.color,
              }}
            />
          </div>
        </div>
      )}

      {/* Energy indicator - visual feedback ring */}
      <div className="mood-energy-ring" style={{ opacity: mood.energy }} />

      {/* Mood type label - accessible text */}
      <span className="mood-type-label sr-only">{mood.type} mood</span>
    </div>
  );
};

/**
 * Compact mood indicator for corner/navbar placement
 */
export const MaraMoodBadge: React.FC<Omit<MaraMoodIndicatorProps, 'showMessage'>> = ({
  mood,
  onClick,
  className = '',
}) => {
  return (
    <button
      className={`
        mara-mood-badge
        ${className}
      `}
      onClick={onClick}
      title={`${mood.type}: ${mood.message}`}
      aria-label={`Mara is feeling ${mood.type}`}
      type="button"
      style={{
        '--mood-color': mood.color,
      } as React.CSSProperties}
    >
      <span className="badge-emoji">{mood.emoji}</span>
      <span className="badge-pulse" style={{ backgroundColor: mood.color }} />
    </button>
  );
};

/**
 * Full-screen mood reaction (for celebrations/special moments)
 */
export const MaraMoodReaction: React.FC<{
  mood: MaraMood;
  duration?: number;
  onComplete?: () => void;
}> = ({ mood, duration = 2000, onComplete }) => {
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsActive(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!isActive) return null;

  return (
    <div
      className="mara-mood-reaction"
      role="status"
      aria-live="assertive"
      aria-label={`Celebration: ${mood.message}`}
      style={{
        '--mood-color': mood.color,
      } as React.CSSProperties}
    >
      {/* Animated emoji burst */}
      <div className="reaction-emoji-burst">
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className={`burst-emoji burst-${i}`}>
            {mood.emoji}
          </span>
        ))}
      </div>

      {/* Message display */}
      <div className="reaction-message">
        <h2 className="reaction-title">{mood.message}</h2>
        <p className="reaction-subtitle">Keep pushing boundaries!</p>
      </div>

      {/* Confetti-like particles */}
      <div className="reaction-particles">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`particle particle-${i}`}
            style={{
              backgroundColor: mood.color,
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
};
