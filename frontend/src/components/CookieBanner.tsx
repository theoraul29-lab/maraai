import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cookie, X } from '@phosphor-icons/react';
import '../styles/CookieBanner.css';

const STORAGE_KEY = 'mara_cookie_ok';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label={t('cookie.ariaLabel')}>
      <Cookie size={20} weight="fill" className="cookie-icon" />
      <p className="cookie-text">
        {t('cookie.text')}{' '}
        <Link to="/privacy" className="cookie-link">{t('cookie.learnMore')}</Link>
      </p>
      <button className="cookie-btn" onClick={dismiss}>
        {t('cookie.accept')}
      </button>
      <button className="cookie-close" onClick={dismiss} aria-label={t('cookie.close')}>
        <X size={15} />
      </button>
    </div>
  );
}
