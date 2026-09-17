import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

/**
 * Fires once, right after a login that cancelled a pending 7-day
 * account-deletion schedule (see AuthContext.login() / deleteAccount in
 * server/modules/profile.ts). Auto-dismisses so it never lingers as a
 * persistent banner across the session.
 */
export function ReactivationBanner() {
  const { t } = useTranslation();
  const { reactivatedNotice, clearReactivatedNotice } = useAuth();

  useEffect(() => {
    if (!reactivatedNotice) return;
    const id = setTimeout(clearReactivatedNotice, 8000);
    return () => clearTimeout(id);
  }, [reactivatedNotice, clearReactivatedNotice]);

  if (!reactivatedNotice) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        borderRadius: 12,
        background: 'linear-gradient(90deg, #16a34a, #22c55e)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      <span>{t('auth.reactivatedNotice', 'Welcome back — your account deletion was cancelled.')}</span>
      <button
        type="button"
        onClick={clearReactivatedNotice}
        aria-label={t('common.close', 'Close')}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          opacity: 0.85,
        }}
      >
        ✕
      </button>
    </div>
  );
}
