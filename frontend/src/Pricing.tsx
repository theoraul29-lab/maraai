import { useState } from 'react';
import './styles/Pricing.css';

const PLANS = [
  {
    tier: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    color: '#c084fc',
    badge: null as string | null,
    features: [
      '3 misiuni pe lună',
      'Chat cu Mara (20 mesaje/zi)',
      'Profil de bază',
      'Feed Reels',
      'Comunitate HelloMara',
    ],
    cta: 'Începe Gratuit',
    ctaLink: '/auth?signup=true',
  },
  {
    tier: 'pro',
    name: 'Pro',
    monthlyPrice: 7.99,
    yearlyPrice: 59.99,
    color: '#a855f7',
    badge: 'Popular' as string | null,
    features: [
      'Misiuni nelimitate',
      'Chat Mara nelimitat',
      'Misiuni personalizate AI',
      'Statistici XP avansate',
      'Badge-uri exclusive Pro',
      'Fără limitări',
    ],
    cta: 'Începe Pro',
    ctaLink: '/auth?signup=true&plan=pro',
  },
  {
    tier: 'vip',
    name: 'VIP',
    monthlyPrice: 11.99,
    yearlyPrice: 89.99,
    color: '#f472b6',
    badge: 'Best Value' as string | null,
    features: [
      'Tot din Pro',
      'Misiuni generate de Mara pentru tine',
      'Acces anticipat funcții noi',
      'Suport prioritar 24/7',
      'Badge VIP în profil',
      'Comunitate VIP exclusivă',
    ],
    cta: 'Devino VIP',
    ctaLink: '/auth?signup=true&plan=vip',
  },
  {
    tier: 'creator',
    name: 'Creator',
    monthlyPrice: 16.99,
    yearlyPrice: 129.99,
    color: '#f97316',
    badge: null as string | null,
    features: [
      'Tot din VIP',
      'Publică articole plătite',
      'Revenue share 70/30',
      'Creator analytics',
      'Link @username personal',
      'Promovare în feed',
    ],
    cta: 'Devino Creator',
    ctaLink: '/auth?signup=true&plan=creator',
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="pricing-root">
      <div className="pricing-header">
        <div className="pricing-logo" onClick={() => window.location.href = '/'}>
          HelloMara
        </div>
      </div>

      <div className="pricing-hero">
        <h1 className="pricing-title">
          Alege planul tău de transformare
        </h1>
        <p className="pricing-subtitle">
          70% mai accesibil față de competitori. Anulezi oricând.
        </p>

        <div className="pricing-toggle">
          <span className={!yearly ? 'active' : ''}>Lunar</span>
          <button
            className={`pricing-toggle-btn ${yearly ? 'yearly' : ''}`}
            onClick={() => setYearly(!yearly)}
            aria-label="Comută între lunar și anual"
          >
            <span className="pricing-toggle-thumb" />
          </button>
          <span className={yearly ? 'active' : ''}>
            Anual
            <span className="pricing-save-badge">-37%</span>
          </span>
        </div>
      </div>

      <div className="pricing-grid">
        {PLANS.map(plan => (
          <div
            key={plan.tier}
            className={`pricing-card ${plan.badge === 'Popular' ? 'featured' : ''}`}
            style={{ '--plan-color': plan.color } as React.CSSProperties}
          >
            {plan.badge && (
              <div className="pricing-badge" style={{ background: plan.color }}>
                {plan.badge}
              </div>
            )}

            <div className="pricing-card-header">
              <div className="pricing-plan-name" style={{ color: plan.color }}>
                {plan.name}
              </div>
              <div className="pricing-price">
                {plan.monthlyPrice === 0 ? (
                  <span className="pricing-price-value">Gratuit</span>
                ) : (
                  <>
                    <span className="pricing-price-currency">€</span>
                    <span className="pricing-price-value">
                      {yearly
                        ? (plan.yearlyPrice / 12).toFixed(2)
                        : plan.monthlyPrice.toFixed(2)}
                    </span>
                    <span className="pricing-price-period">/lună</span>
                  </>
                )}
              </div>
              {yearly && plan.yearlyPrice > 0 && (
                <div className="pricing-yearly-total">
                  {plan.yearlyPrice.toFixed(2)} EUR/an
                </div>
              )}
            </div>

            <ul className="pricing-features">
              {plan.features.map((f, i) => (
                <li key={i}>
                  <span style={{ color: plan.color }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <a
              href={plan.ctaLink}
              className="pricing-cta"
              style={{
                background: plan.tier === 'free' ? 'transparent' : plan.color,
                border: `1px solid ${plan.color}`,
                color: plan.tier === 'free' ? plan.color : '#fff',
              }}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <h2>Întrebări frecvente</h2>
        <div className="pricing-faq-grid">
          {[
            {
              q: 'Pot anula oricând?',
              a: 'Da, fără penalități. Anulezi din cont în 2 click-uri.',
            },
            {
              q: 'Ce este HelloMara?',
              a: 'O platformă de transformare personală ghidată de AI. Mara îți dă misiuni reale, te urmărește și crește cu tine.',
            },
            {
              q: 'Există trial gratuit?',
              a: 'Da! Planul Free e gratuit pentru totdeauna. Pro și VIP au 7 zile trial gratuit.',
            },
            {
              q: 'Ce metode de plată acceptați?',
              a: 'Card (Visa, Mastercard), PayPal și transfer bancar.',
            },
          ].map((item, i) => (
            <div key={i} className="pricing-faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pricing-footer">
        <a href="/">← Înapoi la HelloMara</a>
        <span>© 2026 HelloMara. Toate drepturile rezervate.</span>
      </div>
    </div>
  );
}
