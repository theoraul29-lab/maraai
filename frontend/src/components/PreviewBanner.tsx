import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Slim top banner shown to anonymous visitors during the read-only preview
 * window. Counts down from `initialRemainingMs`; when it reaches zero the
 * visitor is sent back to the landing page, where the sign-up / login modal
 * lives. A CTA lets them create an account before the timer runs out.
 */
export function PreviewBanner({ initialRemainingMs }: { initialRemainingMs: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemainingMs(initialRemainingMs);
  }, [initialRemainingMs]);

  useEffect(() => {
    const deadline = Date.now() + remainingMs;
    const id = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) {
        clearInterval(id);
        if (!expiredRef.current) {
          expiredRef.current = true;
          navigate('/', { replace: true });
        }
        setRemainingMs(0);
      } else {
        setRemainingMs(left);
      }
    }, 1000);
    return () => clearInterval(id);
    // Restart the ticker only when a fresh window length arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRemainingMs, navigate]);

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 16px',
        background: 'linear-gradient(90deg, #6b21a8, #a855f7)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        textAlign: 'center',
      }}
    >
      <span>
        {t('preview.banner', 'Preview mode — explore MaraAI for free.')}{' '}
        {t('preview.remaining', 'Time left')}: <strong>{formatMs(remainingMs)}</strong>
      </span>
      <button
        type="button"
        onClick={() => navigate('/', { replace: true })}
        style={{
          background: '#fff',
          color: '#6b21a8',
          border: 'none',
          borderRadius: 999,
          padding: '4px 14px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {t('preview.cta', 'Create free account')}
      </button>
    </div>
  );
}
