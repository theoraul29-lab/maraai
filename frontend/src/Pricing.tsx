import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './styles/Pricing.css';

export default function Pricing() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const TIERS = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      color: '#888',
      badge: null as string | null,
      tagline: t('pricing.tierFreeTagline'),
      features: [
        t('pricing.tierFreeChat'),
        t('pricing.tierFreeReels'),
        t('pricing.tierFreeArticles'),
        t('pricing.tierFreeCommunity'),
      ],
      cta: t('pricing.tierFreeCta'),
      ctaPath: '/register',
    },
    {
      id: 'pro_monthly',
      name: 'Pro',
      price: 16,
      color: '#60a5fa',
      badge: null as string | null,
      tagline: t('pricing.tierProTagline'),
      features: [
        t('pricing.tierProChat'),
        t('pricing.tierProReels'),
        t('pricing.tierProArticles'),
        t('pricing.tierProProfile'),
        t('pricing.tierProAll'),
      ],
      cta: t('pricing.tierProCta'),
      ctaPath: '/billing?plan=pro_monthly',
    },
    {
      id: 'vip_monthly',
      name: 'VIP',
      price: 20,
      color: '#a855f7',
      badge: t('pricing.tierVipBadge') as string | null,
      tagline: t('pricing.tierVipTagline'),
      features: [
        t('pricing.tierVipAll'),
        t('pricing.tierVipReadVip'),
        t('pricing.tierVipPublishVip'),
        t('pricing.tierVipAI'),
        t('pricing.tierVipHD'),
        t('pricing.tierVipPrograms'),
      ],
      cta: t('pricing.tierVipCta'),
      ctaPath: '/billing?plan=vip_monthly',
    },
    {
      id: 'creator_monthly',
      name: 'Creator',
      price: 25,
      color: '#f59e0b',
      badge: null as string | null,
      tagline: t('pricing.tierCreatorTagline'),
      features: [
        t('pricing.tierCreatorAll'),
        t('pricing.tierCreatorRevenue'),
        t('pricing.tierCreatorWithdraw'),
        t('pricing.tierCreatorAnalytics'),
        t('pricing.tierCreatorPaid'),
        t('pricing.tierCreatorMonetize'),
      ],
      cta: t('pricing.tierCreatorCta'),
      ctaPath: '/billing?plan=creator_monthly',
    },
  ];

  const PROGRAMS = [
    { icon: '🧠', name: 'New Mindset',  days: 1,    desc: t('pricing.mindsetDesc') },
    { icon: '🔁', name: 'New Habit',    days: 21,   desc: t('pricing.habitDesc') },
    { icon: '⚡', name: 'New Skills',   days: 90,   desc: t('pricing.skillsDesc') },
    { icon: '💪', name: 'New Body',     days: 180,  desc: t('pricing.bodyDesc') },
    { icon: '🌅', name: 'New Life',     days: 365,  desc: t('pricing.lifeDesc') },
    { icon: '✨', name: 'New You',      days: 1095, desc: t('pricing.youDesc') },
  ];

  return (
    <div className="pricing-root">
      <div className="pricing-hero">
        <h1 className="pricing-title">{t('pricing.heroTitle')}</h1>
        <p className="pricing-subtitle">
          {t('pricing.heroSubtitle')}
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
                <span className="pricing-free">{t('pricing.free')}</span>
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
        <h2 className="pricing-section-title">{t('pricing.programsTitle')}</h2>
        <p className="pricing-section-sub">
          {t('pricing.programsSubtitle')}
        </p>
      </div>

      <div className="pricing-programs-grid">
        {PROGRAMS.map((p) => (
          <div key={p.name} className="pricing-program-item">
            <span className="pricing-program-icon">{p.icon}</span>
            <div>
              <div className="pricing-program-name">{p.name}</div>
              <div className="pricing-program-days">{p.days} {p.days === 1 ? t('pricing.day') : t('pricing.days')}</div>
              <div className="pricing-program-desc">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <h2>{t('pricing.faqTitle')}</h2>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq1Q')}</strong>
          <p>{t('pricing.faq1A')}</p>
        </div>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq2Q')}</strong>
          <p>{t('pricing.faq2A')}</p>
        </div>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq3Q')}</strong>
          <p>{t('pricing.faq3A')}</p>
        </div>
        <div className="pricing-faq-item">
          <strong>{t('pricing.faq4Q')}</strong>
          <p>{t('pricing.faq4A')}</p>
        </div>
      </div>
    </div>
  );
}
