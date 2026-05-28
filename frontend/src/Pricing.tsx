import { useNavigate } from 'react-router-dom';
import './styles/Pricing.css';

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    color: '#888',
    badge: null as string | null,
    tagline: 'Începe fără card.',
    features: [
      'Chat de bază cu Mara AI',
      'Vizionare reels comunitate',
      'Citire articole publice',
      'Acces comunitate',
    ],
    cta: 'Începe gratuit',
    ctaPath: '/register',
  },
  {
    id: 'pro_monthly',
    name: 'Pro',
    price: 16,
    color: '#60a5fa',
    badge: null as string | null,
    tagline: 'Tot ce ai nevoie pentru a crea și crește.',
    features: [
      'Chat nelimitat cu Mara AI',
      'Upload reels',
      'Publicare articole publice',
      'Profil public',
      'Acces la toate funcțiile Free',
    ],
    cta: 'Alege Pro',
    ctaPath: '/billing?plan=pro_monthly',
  },
  {
    id: 'vip_monthly',
    name: 'VIP',
    price: 20,
    color: '#a855f7',
    badge: 'Cel mai popular' as string | null,
    tagline: 'Programe de transformare incluse.',
    features: [
      'Tot ce include Pro',
      'Citire articole VIP',
      'Publicare articole VIP',
      'Personalitate AI custom',
      'Upload HD',
      '✦ Toate programele incluse — New Mindset, New Habit, New Skills, New Body, New Life, New You',
    ],
    cta: 'Alege VIP',
    ctaPath: '/billing?plan=vip_monthly',
  },
  {
    id: 'creator_monthly',
    name: 'Creator',
    price: 16.99,
    color: '#f59e0b',
    badge: null as string | null,
    tagline: 'Monetizează-ți conținutul.',
    features: [
      'Tot ce include VIP',
      'Revenue share 70%',
      'Retragere câștiguri',
      'Analytics detaliate',
      'Publicare articole plătite',
      'Monetizare reels',
    ],
    cta: 'Alege Creator',
    ctaPath: '/billing?plan=creator_monthly',
  },
];

const PROGRAMS = [
  { icon: '🧠', name: 'New Mindset',  days: 1,    desc: 'O zi. O schimbare de perspectivă.' },
  { icon: '🔁', name: 'New Habit',    days: 21,   desc: '21 de zile. Un obicei pentru viață.' },
  { icon: '⚡', name: 'New Skills',   days: 90,   desc: '90 de zile. O abilitate nouă.' },
  { icon: '💪', name: 'New Body',     days: 180,  desc: '180 de zile. Un corp și o minte noi.' },
  { icon: '🌅', name: 'New Life',     days: 365,  desc: '365 de zile. O viață nouă.' },
  { icon: '✨', name: 'New You',      days: 1095, desc: '1095 de zile. Un om nou.' },
];

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <div className="pricing-root">
      <div className="pricing-hero">
        <h1 className="pricing-title">Calea ta de transformare</h1>
        <p className="pricing-subtitle">
          Simplu. Lunar. Fără surprize.
        </p>
      </div>

      <div className="pricing-grid">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`pricing-card ${tier.badge ? 'pricing-card--featured' : ''}`}
            style={{ '--accent': tier.color } as React.CSSProperties}
          >
            {tier.badge && <div className="pricing-badge">{tier.badge}</div>}
            <h2 className="pricing-card-name">{tier.name}</h2>
            <p className="pricing-card-tagline">{tier.tagline}</p>

            <div className="pricing-card-price">
              {tier.price === 0 ? (
                <span className="pricing-free">Gratuit</span>
              ) : (
                <>
                  <span className="pricing-amount">€{tier.price % 1 === 0 ? tier.price : tier.price.toFixed(2)}</span>
                  <span className="pricing-once">/lună</span>
                </>
              )}
            </div>

            <ul className="pricing-features">
              {tier.features.map((f) => (
                <li key={f}>{f.startsWith('✦') ? f : `✓ ${f}`}</li>
              ))}
            </ul>

            <button
              className="pricing-cta"
              onClick={() => navigate(tier.ctaPath)}
            >
              {tier.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="pricing-section-divider">
        <h2 className="pricing-section-title">Programele incluse în VIP</h2>
        <p className="pricing-section-sub">
          Toate cele 6 programe de transformare sunt incluse în abonamentul VIP. Nicio plată extra.
        </p>
      </div>

      <div className="pricing-programs-grid">
        {PROGRAMS.map((p) => (
          <div key={p.name} className="pricing-program-item">
            <span className="pricing-program-icon">{p.icon}</span>
            <div>
              <div className="pricing-program-name">{p.name}</div>
              <div className="pricing-program-days">{p.days} {p.days === 1 ? 'zi' : 'zile'}</div>
              <div className="pricing-program-desc">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <h2>Întrebări frecvente</h2>
        <div className="pricing-faq-item">
          <strong>Pot anula oricând?</strong>
          <p>Da. Anulezi oricând din setări, fără penalități. Accesul continuă până la sfârșitul lunii plătite.</p>
        </div>
        <div className="pricing-faq-item">
          <strong>Cum funcționează programele în VIP?</strong>
          <p>Cu VIP activ ai acces complet la toate cele 6 programe — de la New Mindset (1 zi) până la New You (3 ani). Le poți rula simultan sau succesiv.</p>
        </div>
        <div className="pricing-faq-item">
          <strong>Ce se întâmplă dacă sar o zi din program?</strong>
          <p>Nimic rău — Mara îți păstrează progresul. Streakul se resetează dar programul continuă.</p>
        </div>
        <div className="pricing-faq-item">
          <strong>Cum plătesc?</strong>
          <p>Stripe (card) sau PayPal. Tranzacție securizată, factură automată.</p>
        </div>
      </div>
    </div>
  );
}
