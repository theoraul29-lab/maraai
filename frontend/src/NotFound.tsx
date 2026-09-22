import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    if (seconds <= 0) {
      navigate('/', { replace: true });
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#05020f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#F0F0F0',
    }}>
      <h1 style={{ fontSize: '80px', margin: 0, color: '#a855f7', lineHeight: 1 }}>404</h1>
      <p style={{ fontSize: '18px', margin: 0, opacity: 0.7 }}>{t('notFound.title', 'Page not found')}</p>
      <p style={{ fontSize: '14px', margin: 0, opacity: 0.4 }}>
        {t('notFound.redirecting', 'Redirecting to home in {{seconds}}s…', { seconds })}
      </p>
      <button
        onClick={() => navigate('/', { replace: true })}
        style={{
          marginTop: '8px',
          padding: '10px 28px',
          background: '#a855f7',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {t('notFound.goHome', 'Go home')}
      </button>
    </div>
  );
}
