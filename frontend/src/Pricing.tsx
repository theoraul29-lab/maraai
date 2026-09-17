import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';
import ProgramPicker from './components/ProgramPicker';
import OrbNavStrip from './components/OrbNavStrip';
import './styles/Pricing.css';

export default function Pricing() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingTier, setPendingTier] = useState<'free' | 'vip_monthly' | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [vipNotice, setVipNotice] = useState<string | null>(null);

  const TIERS = [
    {
      id: 'free' as const,
      name: t('pricing.tierExplorerName'),
      price: 0 as number | null,
      color: '#6b7280',
      badge: null as string | null,
      tagline: t('pricing.tierExplorerTagline'),
      features: [
        t('pricing.tierExplorerPrograms'),
        t('pricing.tierExplorerChat'),
        t('pricing.tierExplorerReels'),
        t('pricing.tierExplorerArticles'),
        t('pricing.tierExplorerCommunity'),
      ],
      cta: t('pricing.tierExplorerCta'),
    },
    {
      id: 'vip_monthly' as const,
      name: 'VIP',
      price: 21,
      color: '#a855f7',
      badge: t('pricing.tierVipBadge') as string | null,
      tagline: t('pricing.tierVipTagline'),
      features: [
        t('pricing.tierVipAll'),
        t('pricing.tierVipHD'),
        t('pricing.tierVipReadVip'),
        t('pricing.tierVipPublishVip'),
      ],
      cta: t('pricing.tierVipCta'),
    },
  ];

  // Both /register and /billing?plan=... used to be dead ends here — neither
  // route exists in App.tsx, so every CTA click 404'd (confirmed live).
  // Free just needs an account (real signup flow, via the same AuthModal
  // used everywhere else); VIP calls the real (now-registered)
  // /api/billing/subscribe, which gracefully answers "not enabled yet"
  // until PAYMENTS_ENABLED + provider keys are configured, instead of
  // silently doing nothing.
  async function startSubscribe() {
    setSubscribing(true);
    setVipNotice(null);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'vip_monthly', provider: 'paypal' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setVipNotice(
        data.error === 'payments_disabled' || res.status === 503
          ? t('pricing.vipComingSoon', 'VIP se activează în curând — revino în câteva zile.')
          : t('pricing.vipError', 'Nu am putut porni abonarea. Încearcă din nou.'),
      );
    } catch {
      setVipNotice(t('pricing.vipError', 'Nu am putut porni abonarea. Încearcă din nou.'));
    } finally {
      setSubscribing(false);
    }
  }

  function handleCta(tierId: 'free' | 'vip_monthly') {
    if (!isAuthenticated) {
      setPendingTier(tierId);
      setAuthModalOpen(true);
      return;
    }
    if (tierId === 'free') {
      navigate('/missions');
    } else {
      void startSubscribe();
    }
  }

  // Once the modal closes after a successful signup, isAuthenticated flips —
  // finish whichever CTA the user originally clicked instead of making them
  // click twice.
  useEffect(() => {
    if (!isAuthenticated || !pendingTier) return;
    const tier = pendingTier;
    setPendingTier(null);
    if (tier === 'free') navigate('/missions');
    else void startSubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, pendingTier]);

  const FREE_PROGRAMS = [
    { icon: '🧠', name: 'New Mindset', days: 1,  desc: t('pricing.mindsetDesc') },
    { icon: '🔁', name: 'New Habit',   days: 21, desc: t('pricing.habitDesc') },
  ];

  return (
    <div className="pricing-root">
      <div className="pricing-hero">
        <h1 className="pricing-title">{t('pricing.heroTitle')}</h1>
        <p className="pricing-subtitle">{t('pricing.heroSubtitle')}</p>
      </div>

      {isAuthenticated && <OrbNavStrip current="programs" />}

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
                <span className="pricing-free">{t('pricing.noCardNeeded')}</span>
              ) : (
                <>
                  <span className="pricing-amount">€{tier.price}</span>
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
              onClick={() => handleCta(tier.id)}
              disabled={subscribing && tier.id === 'vip_monthly'}
            >
              {subscribing && tier.id === 'vip_monthly' ? t('common.loading') : tier.cta}
            </button>
            {tier.id === 'vip_monthly' && vipNotice && (
              <p className="pricing-vip-notice">{vipNotice}</p>
            )}
          </div>
        ))}
      </div>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      <div className="pricing-section-divider">
        <h2 className="pricing-section-title">{t('pricing.programsTitle')}</h2>
        <p className="pricing-section-sub">{t('pricing.programsSubtitle')}</p>
      </div>

      <div className="pricing-platform">
        <div className="pricing-platform-grid">
          {FREE_PROGRAMS.map((p) => (
            <div key={p.name} className="pricing-platform-card">
              <span className="pricing-platform-icon">{p.icon}</span>
              <div className="pricing-platform-body">
                <div className="pricing-platform-name">
                  {p.name}
                  <span className="pricing-platform-badge pricing-platform-badge--free">{t('pricing.freeBadge')}</span>
                </div>
                <p className="pricing-platform-desc">
                  {p.days} {p.days === 1 ? t('pricing.day') : t('pricing.days')} · {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ProgramPicker />

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
