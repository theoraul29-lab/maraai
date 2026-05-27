import { useNavigate } from 'react-router-dom';
import './styles/Pricing.css';

const PLATFORM_FEATURES = [
  {
    icon: '🤖',
    name: 'Mara AI',
    desc: 'Asistentul tău personal de creștere — disponibil 24/7 pentru conversații, sfaturi și suport emoțional.',
    access: 'free' as const,
  },
  {
    icon: '🎬',
    name: 'Reels',
    desc: 'Video-uri scurte inspiraționale și educative create de comunitate și AI, curate zilnic.',
    access: 'free' as const,
  },
  {
    icon: '🌐',
    name: 'Comunitate',
    desc: 'Conectează-te cu oameni pe același drum. Postează, comentează, inspiră și fii inspirat.',
    access: 'free' as const,
  },
  {
    icon: '✍️',
    name: 'Writers Hub',
    desc: 'Scrie-ți cartea pas cu pas cu ajutorul AI. Structură, capitole, feedback instantaneu.',
    access: 'free' as const,
  },
  {
    icon: '✨',
    name: 'Creator Panel',
    desc: 'Creează și publică conținut pe platformă — reels, articole, misiuni pentru comunitate.',
    access: 'free' as const,
  },
  {
    icon: '🎯',
    name: 'Misiuni zilnice AI',
    desc: 'Provocări personalizate generate de Mara în fiecare zi, adaptate obiectivului tău.',
    access: 'program' as const,
  },
  {
    icon: '📊',
    name: 'Streak & XP',
    desc: 'Urmărește-ți progresul zilnic, câștigă XP și badge-uri pe măsură ce avansezi.',
    access: 'program' as const,
  },
  {
    icon: '📚',
    name: 'Carte digitală',
    desc: 'La finalul unui program, Mara generează cartea ta de viață — jurnalul tău transformat.',
    access: 'program' as const,
  },
];

const PROGRAMS = [
  {
    id: 'new_mindset',
    name: 'New Mindset',
    tagline: 'O zi. O schimbare de perspectivă.',
    days: 1,
    price: 0,
    freeDays: 1,
    icon: '🧠',
    color: '#a78bfa',
    badge: null as string | null,
    features: [
      '1 misiune personalizată de Mara',
      'Jurnal AI generat',
      'XP + badge New Mindset',
      'Complet gratuit, fără card',
    ],
  },
  {
    id: 'new_habit',
    name: 'New Habit',
    tagline: '21 de zile. Un obicei pentru viață.',
    days: 21,
    price: 6,
    freeDays: 10,
    icon: '🔁',
    color: '#60a5fa',
    badge: 'Cel mai popular' as string | null,
    features: [
      'Primele 10 zile gratuite',
      '21 misiuni zilnice personalizate',
      'Tracking streak + jurnal',
      'Carte digitală la final',
      'XP + badge New Habit',
    ],
  },
  {
    id: 'new_skills',
    name: 'New Skills',
    tagline: '90 de zile. O abilitate nouă.',
    days: 90,
    price: 60,
    freeDays: 0,
    icon: '⚡',
    color: '#34d399',
    badge: null,
    features: [
      '90 misiuni zilnice AI',
      'Progres pe abilitate specifică',
      'Jurnal complet + carte',
      'Statistici detaliate XP',
      'Badge New Skills',
    ],
  },
  {
    id: 'new_body',
    name: 'New Body',
    tagline: '180 de zile. Un corp și o minte noi.',
    days: 180,
    price: 160,
    freeDays: 0,
    icon: '💪',
    color: '#f59e0b',
    badge: null,
    features: [
      '180 misiuni personalizate',
      'Focus: corp, minte, energie',
      'Jurnal + carte completă',
      'Milestone badges la 30/60/90/180',
      'Suport comunitate',
    ],
  },
  {
    id: 'new_life',
    name: 'New Life',
    tagline: '365 de zile. O viață nouă.',
    days: 365,
    price: 360,
    freeDays: 0,
    icon: '🌅',
    color: '#f472b6',
    badge: 'Transformare completă' as string | null,
    features: [
      '365 misiuni zilnice AI',
      'Carieră, relații, sănătate, scop',
      'Carte anuală de viață',
      'Check-in lunar cu Mara',
      'Toate badge-urile anterioare',
    ],
  },
  {
    id: 'new_you',
    name: 'New You',
    tagline: '1095 de zile. Un om nou.',
    days: 1095,
    price: 620,
    freeDays: 0,
    icon: '✨',
    color: '#c77dff',
    badge: '3 ani · Calea completă' as string | null,
    features: [
      '1095 misiuni zilnice',
      'Cel mai profund program disponibil',
      '3 cărți de viață anuale',
      'Acces la toate programele',
      'Prioritate la funcții noi',
    ],
  },
];

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <div className="pricing-root">
      <div className="pricing-hero">
        <h1 className="pricing-title">Calea ta de transformare</h1>
        <p className="pricing-subtitle">
          Fiecare zi contează. Alege cât de departe vrei să mergi.
        </p>
      </div>

      <div className="pricing-platform">
        <h2 className="pricing-platform-title">Ce primești cu MaraAI</h2>
        <p className="pricing-platform-subtitle">
          Unele funcții sunt gratuite pentru toți. Altele se deblochează cu un program.
        </p>
        <div className="pricing-platform-grid">
          {PLATFORM_FEATURES.map((f) => (
            <div key={f.name} className={`pricing-platform-card pricing-platform-card--${f.access}`}>
              <div className="pricing-platform-icon">{f.icon}</div>
              <div className="pricing-platform-body">
                <div className="pricing-platform-name">
                  {f.name}
                  <span className={`pricing-platform-badge pricing-platform-badge--${f.access}`}>
                    {f.access === 'free' ? 'Gratuit' : 'Cu program'}
                  </span>
                </div>
                <p className="pricing-platform-desc">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pricing-section-divider">
        <h2 className="pricing-section-title">Alege-ți programul de transformare</h2>
        <p className="pricing-section-sub">O singură plată. Acces permanent. Nicio surpriză.</p>
      </div>

      <div className="pricing-grid">
        {PROGRAMS.map((p) => (
          <div
            key={p.id}
            className={`pricing-card ${p.badge ? 'pricing-card--featured' : ''}`}
            style={{ '--accent': p.color } as React.CSSProperties}
          >
            {p.badge && <div className="pricing-badge">{p.badge}</div>}
            <div className="pricing-card-icon">{p.icon}</div>
            <h2 className="pricing-card-name">{p.name}</h2>
            <p className="pricing-card-tagline">{p.tagline}</p>
            <div className="pricing-card-days">{p.days} {p.days === 1 ? 'zi' : 'zile'}</div>

            <div className="pricing-card-price">
              {p.price === 0 ? (
                <span className="pricing-free">Gratuit</span>
              ) : (
                <>
                  <span className="pricing-amount">€{p.price}</span>
                  <span className="pricing-once">o singură dată</span>
                </>
              )}
            </div>

            {p.freeDays > 0 && p.price > 0 && (
              <div className="pricing-free-trial">
                ✓ Primele {p.freeDays} zile gratuite
              </div>
            )}

            <ul className="pricing-features">
              {p.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>

            <button
              className="pricing-cta"
              onClick={() => navigate('/missions?tab=programs')}
            >
              {p.price === 0 ? 'Începe gratuit' : `Deblochează ${p.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <h2>Întrebări frecvente</h2>
        <div className="pricing-faq-item">
          <strong>Plata e recurentă?</strong>
          <p>Nu. Plătești o singură dată și ai accesul permanent la program.</p>
        </div>
        <div className="pricing-faq-item">
          <strong>Pot să fac mai multe programe simultan?</strong>
          <p>Da, poți cumpăra și rula orice combinație de programe în același timp.</p>
        </div>
        <div className="pricing-faq-item">
          <strong>Ce se întâmplă dacă sar o zi?</strong>
          <p>Nimic rău — Mara îți păstrează progresul. Streakul se resetează dar programul continuă.</p>
        </div>
        <div className="pricing-faq-item">
          <strong>Cum plătesc?</strong>
          <p>PayPal — card sau cont PayPal. Tranzacție securizată.</p>
        </div>
      </div>
    </div>
  );
}
