import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from '@phosphor-icons/react';
import '../styles/CookieBanner.css';

const STORAGE_KEY = 'mara_cookie_ok';

export default function CookieBanner() {
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
    <div className="cookie-banner" role="dialog" aria-label="Informare cookie-uri">
      <Cookie size={20} weight="fill" className="cookie-icon" />
      <p className="cookie-text">
        Folosim exclusiv cookie-uri esențiale pentru sesiunea ta.
        Niciun tracking, niciun marketing.{' '}
        <Link to="/privacy" className="cookie-link">Află mai multe</Link>
      </p>
      <button className="cookie-btn" onClick={dismiss}>
        Am înțeles
      </button>
      <button className="cookie-close" onClick={dismiss} aria-label="Închide">
        <X size={15} />
      </button>
    </div>
  );
}
