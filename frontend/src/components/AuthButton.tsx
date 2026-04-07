import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAccessible, useAccessibleDropdown } from '../hooks/useAccessible';
import { useTouchGesture } from '../hooks/useTouchGesture';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { AuthModal } from './AuthModal';
import './AuthButton.css';

export const AuthButton: React.FC = () => {
  const { user, isAuthenticated, isTrialActive, trialTimeRemaining, logout } = useAuth();
  const { handleError } = useErrorHandler();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [displayTime, setDisplayTime] = useState(trialTimeRemaining);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Touch gesture support for dropdown toggle
  const { handleTouchStart, handleTouchEnd } = useTouchGesture({
    onLongPress: (_point) => {
      // Haptic feedback for long press (if available)
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    },
  });

  useEffect(() => {
    setDisplayTime(trialTimeRemaining);
  }, [trialTimeRemaining]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  const formatTime = (minutes: number): string => {
    try {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    } catch (error) {
      handleError(error as Error, { context: 'formatTime' });
      return '0m';
    }
  };

  const getTierColor = (): string => {
    if (!user?.tier) return '#888888';
    
    const tierColors: Record<string, string> = {
      trial: '#f59e0b', // amber
      premium: '#10b981', // emerald
      vip: '#8b5cf6', // violet
    };
    
    return tierColors[user.tier] || '#888888';
  };

  const handleDropdownToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsDropdownOpen(false);
    } catch (error) {
      handleError(error as Error, { context: 'logout' });
    }
  };

  const handleNavigate = (url: string) => {
    try {
      window.location.href = url;
    } catch (error) {
      handleError(error as Error, { context: 'navigate', url });
    }
  };

  if (!isAuthenticated) {
    const loginAccessibility = useAccessible({
      label: 'Login or sign up',
      role: 'button',
      initialFocused: false,
    });

    return (
      <>
        <button
          className="auth-button-login"
          onClick={() => setIsModalOpen(true)}
          {...loginAccessibility}
          aria-expanded={isModalOpen}
        >
          <span className="auth-button-icon" aria-hidden="true">
            🔓
          </span>
          <span className="auth-button-text">Login</span>
        </button>
        <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  // Safe user data access with fallbacks
  const userName = user?.name ?? 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const userEarnings = user?.earnings ?? 0;
  const userTier = user?.tier ?? 'free';

  const dropdownAccessibility = useAccessibleDropdown(isDropdownOpen, 'auth-dropdown-menu');

  return (
    <>
      <div className="auth-button-profile" ref={dropdownRef}>
        <button
          className="auth-button-info"
          onClick={handleDropdownToggle}
          onTouchStart={(e) => handleTouchStart(e as any)}
          onTouchEnd={() => handleTouchEnd()}
          {...dropdownAccessibility.button}
          type="button"
          aria-label={`Profile menu for ${userName}`}
        >
          <div
            className="auth-button-avatar"
            style={{ borderColor: getTierColor() }}
            aria-hidden="true"
          >
            {userInitial}
          </div>
          <div className="auth-button-details">
            <div className="auth-button-name">{userName}</div>
            <div className="auth-button-status">
              {isTrialActive ? (
                <span className="auth-trial-badge" role="status">
                  ⏱️ {formatTime(displayTime)}
                </span>
              ) : (
                <span className={`auth-tier-badge ${userTier}`} role="status">
                  {userTier.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div
            className={`auth-button-dropdown-icon ${isDropdownOpen ? 'open' : ''}`}
            aria-hidden="true"
          >
            ▼
          </div>
        </button>

        {isDropdownOpen && (
          <div
            className="auth-button-dropdown"
            id="auth-dropdown-menu"
            role="menu"
            {...dropdownAccessibility.menu}
          >
            {/* Earnings Display */}
            <div className="auth-dropdown-item disabled" role="menuitem" tabIndex={-1}>
              <span>Earnings</span>
              <span className="earnings-value">${userEarnings.toFixed(2)}</span>
            </div>

            <div className="auth-dropdown-divider" role="separator" aria-hidden="true" />

            {/* Upgrade Button */}
            <button
              className="auth-dropdown-item"
              onClick={() => handleNavigate('/membership')}
              role="menuitem"
              aria-label="Upgrade to Premium membership"
            >
              <span>Upgrade to Premium</span>
              <span aria-hidden="true">→</span>
            </button>

            {/* Creator Panel Button */}
            <button
              className="auth-dropdown-item"
              onClick={() => handleNavigate('/creator-panel')}
              role="menuitem"
              aria-label="Open creator panel"
            >
              <span>Creator Panel</span>
              <span aria-hidden="true">→</span>
            </button>

            <div className="auth-dropdown-divider" role="separator" aria-hidden="true" />

            {/* Logout Button */}
            <button
              className="auth-dropdown-item logout"
              onClick={handleLogout}
              role="menuitem"
              aria-label="Logout from account"
            >
              <span>Logout</span>
              <span aria-hidden="true">🚪</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};
