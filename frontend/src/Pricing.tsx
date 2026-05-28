import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './styles/Pricing.css';

export default function Pricing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const TIERS = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      color: '#888',
      badge: null as string | null,
      tagline: t('pricing.tiers.free.tagline'),
      features: [
        t('pricing.tiers.free.feature0'),
        t('pricing.tiers.free.feature1'),
        t('pricing.tiers.free.feature2'),
        t('pricing.tiers.free.feature3'),
      ],
      cta: t('pricing.tiers.free.cta'),
      ctaPath: '/register',
    },
    {
      id: 'pro_monthly',
      name: 'Pro',
      price: 16,
      color: '#60a5fa',
      badge: null as string | null,
      tagline: t('pricing.tiers.pro_monthly.tagline'),
      features: [
        t('pricing.tiers.pro_monthly.feature0'),
        t('pricing.tiers.pro_monthly.feature1'),
        t('pricing.tiers.pro_monthly.feature2'),
        t('pricing.tiers.pro_monthly.feature3'),
        t('pricing.tiers.pro_monthly.feature4'),
      ],
      cta: t('pricing.tiers.pro_monthly.cta'),
      ctaPath: '/billing?plan=pro_monthly',
    },
    {
      id: 'vip_monthly',
      name: 'VIP',
      price: 20,
      color: '#a855f7',
      badge: t('pricing.mostPopular') as string | null,
      tagline: t('pricing.tiers.vip_monthly.tagline'),
      features: [
        t('pricing.tiers.vip_monthly.feature0'),
        t('pricing.tiers.vip_monthly.feature1'),
        t('pricing.tiers.vip_monthly.feature2'),
        t('pricing.tiers.vip_monthly.feature3'),
        t('pricing.tiers.vip_monthly.feature4'),
        t('pricing.tiers.vip_monthly.feature5'),
      ],
      cta: t('pricing.tiers.vip_monthly.cta'),
      ctaPath: '/billing?plan=vip_monthly',
    },
    {
      id: 'creator_monthly',
      name: 'Creator',
      price: 25,
      color: '#f59e0b',
      badge: null as string | null,
      tagline: t('pricing.tiers.creator_monthly.tagline'),
      features: [
        t('pricing.tiers.creator_monthly.feature0'),
        t('pricing.tiers.creator_monthly.feature1'),
        t('pricing.tiers.creator_monthly.feature2'),
        t('pricing.tiers.creator_monthly.feature3'),
        t('pricing.tiers.creator_monthly.feature4'),
        t('pricing.tiers.creator_monthly.feature5'),
      ],
      cta: t('pricing.tiers.creator_monthly.cta'),
      ctaPath: '/billing?plan=creator_monthly',
    },
  ];

  const PROGRAMS = [
    { icon: '🧠', name: 'New Mindset',  days: 1,    desc: t('pricing.programs.newMindsetDesc') },
    { icon: '🔁', name: 'New Habit',    days: 21,   desc: t('pricing.programs.newHabitDesc') },
    { icon: '⚡', name: 'New Skills',   days: 90,   desc: t('pricing.programs.newSkillsDesc') },
    { icon: '💪', name: 'New Body',     days: 180,  desc: t('pricing.programs.newBodyDesc') },
    { icon: '🌅', name: 'New Life',     days: 365,  desc: t('pricing.programs.newLifeDesc') },
    { icon: '✨', name: 'New You',      days: 1095, desc: t('pricing.programs.newYouDesc') },
  ];

  return (
    <div className="pricing-root">
      <div className="pricing-hero">
        <h1 className="pricing-title">{t('pricing.hero.title')}</h1>
        <p className="pricing-subtitle">{t('pricing.hero.subtitle')}</p>
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
                <span className="pricing-free">{t('pricing.freeBadge')}</span>
              ) : (
                <>
                  <span className="pricing-amount">€{tier.price % 1 === 0 ? tier.price : tier.price.toFixed(2)}</span>
                  <span className="pricing-once">{t('pricing.perMonth')}</span>
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
        <h2 className="pricing-section-title">{t('pricing.vipIncludesTitle')}</h2>
        <p className="pricing-section-sub">{t('pricing.vipIncludesSub')}</p>
      </div>

      <div className="pricing-programs-grid">
        {PROGRAMS.map((p) => (
          <div key={p.name} className="pricing-program-item">
            <span className="pricing-program-icon">{p.icon}</span>
            <div>
              <div className="pricing-program-name">{p.name}</div>
              <div className="pricing-program-days">{p.days} {t('pricing.programs.days')}</div>
              <div className="pricing-program-desc">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <h2>{t('pricing.faqTitle')}</h2>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq.q1')}</strong>
          <p>{t('pricing.faq.a1')}</p>
        </div>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq.q2')}</strong>
          <p>{t('pricing.faq.a2')}</p>
        </div>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq.q3')}</strong>
          <p>{t('pricing.faq.a3')}</p>
        </div>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq.q4')}</strong>
          <p>{t('pricing.faq.a4')}</p>
        </div>
      </div>
    </div>
  );
}
