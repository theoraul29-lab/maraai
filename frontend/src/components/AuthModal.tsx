import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useAccessibleModal, useAccessibleInput, useAccessibleLoading } from '../hooks/useAccessible';
import { useErrorHandler } from '../hooks/useErrorHandler';
import './AuthModal.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormValidation {
  email: string[];
  password: string[];
  name: string[];
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, signup, loginWithOAuth } = useAuth();
  const { handleError } = useErrorHandler();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<FormValidation>({
    email: [],
    password: [],
    name: [],
  });

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const modalAccessibility = useAccessibleModal(isOpen, 'auth-modal-title');

  // Focus management - focus close button when modal opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard handling - close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, onClose]);

  /**
   * Validate form fields
   */
  const validateForm = (): boolean => {
    const newValidation: FormValidation = { email: [], password: [], name: [] };
    let isValid = true;

    // Email validation
    if (!email) {
      newValidation.email.push(t('auth.emailRequired'));
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newValidation.email.push(t('auth.emailInvalid'));
      isValid = false;
    }

    // Password validation
    if (!password) {
      newValidation.password.push(t('auth.passwordRequired'));
      isValid = false;
    } else if (password.length < 8) {
      newValidation.password.push(t('auth.passwordMinLength'));
      isValid = false;
    }

    // Name validation (signup only)
    if (mode === 'signup') {
      if (!name.trim()) {
        newValidation.name.push(t('auth.nameRequired'));
        isValid = false;
      } else if (name.trim().length < 2) {
        newValidation.name.push(t('auth.nameMinLength'));
        isValid = false;
      }
    }

    setValidation(newValidation);
    return isValid;
  };

  /**
   * Handle form submission with error handling
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password, name);
      }
      onClose();
    } catch (err) {
      const errorResult = handleError(err as Error, {
        context: mode === 'login' ? 'login' : 'signup',
        email,
      });
      const code = (err as { code?: string })?.code;
      setError(code ? t(`auth.errors.${code}`, errorResult.message) : errorResult.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle OAuth with error handling
   */
  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setError('');
    setLoading(true);

    try {
      await loginWithOAuth(provider);
      onClose();
    } catch (err) {
      const errorResult = handleError(err as Error, {
        context: 'oauth',
        provider,
      });
      const code = (err as { code?: string })?.code;
      setError(code ? t(`auth.errors.${code}`, errorResult.message) : errorResult.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle mode switch
   */
  const handleModeSwitch = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setError('');
    setValidation({ email: [], password: [], name: [] });
    // Focus email field for accessibility
    setTimeout(() => emailInputRef.current?.focus(), 0);
  };

  if (!isOpen) return null;

  const loadingState = useAccessibleLoading(loading, `${loading ? (mode === 'login' ? t('auth.signingIn') : t('auth.creatingAccount')) : ''}`);

  const emailErrors = validation.email;
  const passwordErrors = validation.password;
  const nameErrors = validation.name;

  const emailAccessibility = useAccessibleInput({
    label: 'Email address',
    isRequired: true,
    isInvalid: emailErrors.length > 0,
    errorId: emailErrors.length > 0 ? 'email-error' : undefined,
  });

  const passwordAccessibility = useAccessibleInput({
    label: 'Password',
    isRequired: true,
    isInvalid: passwordErrors.length > 0,
    errorId: passwordErrors.length > 0 ? 'password-error' : undefined,
  });

  const nameAccessibility = useAccessibleInput({
    label: 'Full name',
    isRequired: mode === 'signup',
    isInvalid: nameErrors.length > 0,
    errorId: nameErrors.length > 0 ? 'name-error' : undefined,
  });

  return (
    <div
      className="auth-modal-overlay"
      onClick={onClose}
      role="presentation"
      aria-hidden={!isOpen}
    >
      <div
        ref={modalRef}
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        {...modalAccessibility}
      >
        <button
          ref={closeButtonRef}
          className="auth-modal-close"
          onClick={onClose}
          aria-label={t('auth.closeModal')}
          type="button"
          title={t('auth.closeEsc')}
        >
          ×
        </button>

        <div className="auth-modal-header">
          <h2 id="auth-modal-title">
            {mode === 'login' ? t('auth.welcomeBack') : t('auth.joinMaraAI')}
          </h2>
          <p>{t('auth.trialInfo')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Name field (signup only) */}
          {mode === 'signup' && (
            <div className="auth-form-group">
              <input
                type="text"
                placeholder={t('auth.yourName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                {...nameAccessibility}
                className={nameErrors.length > 0 ? 'error' : ''}
              />
              {nameErrors.length > 0 && (
                <span id="name-error" className="auth-error-message" role="alert">
                  {nameErrors[0]}
                </span>
              )}
            </div>
          )}

          {/* Email field */}
          <div className="auth-form-group">
            <input
              ref={emailInputRef}
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              {...emailAccessibility}
              className={emailErrors.length > 0 ? 'error' : ''}
            />
            {emailErrors.length > 0 && (
              <span id="email-error" className="auth-error-message" role="alert">
                {emailErrors[0]}
              </span>
            )}
          </div>

          {/* Password field */}
          <div className="auth-form-group">
            <input
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              {...passwordAccessibility}
              className={passwordErrors.length > 0 ? 'error' : ''}
            />
            {passwordErrors.length > 0 && (
              <span id="password-error" className="auth-error-message" role="alert">
                {passwordErrors[0]}
              </span>
            )}
            {mode === 'signup' && password && (
              <small className="auth-password-hint">
                {t('auth.passwordHint')}
              </small>
            )}
          </div>

          {/* General error message */}
          {error && (
            <div className="auth-error-alert" role="alert">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
            {...loadingState}
          >
            {loading
              ? `${mode === 'login' ? t('auth.signingIn') : t('auth.creatingAccount')}`
              : mode === 'login'
              ? t('auth.login')
              : t('auth.createAccount')}
          </button>
        </form>

        <div className="auth-divider" aria-hidden="true">
          {t('auth.or')}
        </div>

        {/* OAuth buttons */}
        <div className="auth-oauth" role="group" aria-label={t('auth.socialLogin')}>
          <button
            type="button"
            className="auth-oauth-btn google"
            onClick={() => handleOAuth('google')}
            disabled={loading}
            aria-label={t('auth.signInWith', { provider: 'Google' })}
          >
            Google
          </button>
          <button
            type="button"
            className="auth-oauth-btn facebook"
            onClick={() => handleOAuth('facebook')}
            disabled={loading}
            aria-label={t('auth.signInWith', { provider: 'Facebook' })}
          >
            Facebook
          </button>
        </div>

        {/* Mode toggle footer */}
        <div className="auth-footer">
          {mode === 'login' ? (
            <>
              {t('auth.noAccount')}{' '}
              <button
                type="button"
                className="auth-toggle"
                onClick={() => handleModeSwitch('signup')}
                aria-label={t('auth.switchToSignup')}
              >
                {t('auth.signUp')}
              </button>
            </>
          ) : (
            <>
              {t('auth.hasAccount')}{' '}
              <button
                type="button"
                className="auth-toggle"
                onClick={() => handleModeSwitch('login')}
                aria-label={t('auth.switchToLogin')}
              >
                {t('auth.logIn')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
