import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import PayPalMultiProgramButton from './PayPalMultiProgramButton';
import '../styles/ProgramPicker.css';

interface ProgramOption {
  id: string;
  name: string;
  icon: string;
  days: number;
}

// All 4 paid programs are the same flat €7 (see server/billing/plans.ts —
// price isn't scaled by length, New You's 1095 days costs the same as New
// Skills' 90). Kept as a constant here rather than fetched, since it only
// changes if the catalogue itself changes, at which point this file needs
// updating anyway.
const PROGRAM_PRICE_CENTS = 700;
// server/billing/plans.ts's TRANSFORMATION_BOOK.priceCents — the book only
// unlocks after finishing New You (day 1095), so it's not one of the
// picker's own checkboxes, but the running-total scale below still shows
// where it lands: 4 programs (€28) + book (€50) = €78 for the full journey.
const BOOK_PRICE_CENTS = 5000;

const PAID_PROGRAMS: ProgramOption[] = [
  { id: 'new_skills', name: 'New Skills', icon: '⚡', days: 90 },
  { id: 'new_body', name: 'New Body', icon: '💪', days: 180 },
  { id: 'new_life', name: 'New Life', icon: '🌅', days: 365 },
  { id: 'new_you', name: 'New You', icon: '✨', days: 1095 },
];

/**
 * "Pick your own programs" card for the Pricing page. New Mindset + New
 * Habit are free for everyone (shown elsewhere on the page); this card is
 * specifically for the 4 paid programs, which cost the same flat €7 whether
 * bought one at a time or all together — so instead of a fixed all-or-
 * nothing bundle, the user just checks whichever ones they actually want
 * and pays once for exactly that set (server/billing/programs-api.ts's
 * multi-item purchase support).
 */
export default function ProgramPicker() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccessIds, setPurchaseSuccessIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoadingAccess(false);
      return;
    }
    let cancelled = false;
    fetch('/api/billing/program/access', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { purchased?: string[] } | null) => {
        if (!cancelled && data?.purchased) setOwned(new Set(data.purchased));
      })
      .catch(() => { /* best-effort — the card still works, just can't grey out owned items */ })
      .finally(() => { if (!cancelled) setLoadingAccess(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const toggle = (id: string) => {
    if (owned.has(id)) return;
    setPurchaseError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = PAID_PROGRAMS.filter((p) => selected.has(p.id) && !owned.has(p.id)).map((p) => p.id);
  const totalCents = selectedIds.length * PROGRAM_PRICE_CENTS;
  const remainingUnowned = PAID_PROGRAMS.filter((p) => !owned.has(p.id)).length;

  const handlePurchaseSuccess = (ids: string[]) => {
    setOwned((prev) => new Set([...prev, ...ids]));
    setSelected(new Set());
    setPurchaseSuccessIds(ids);
    setPurchaseError(null);
  };

  return (
    <div className="program-picker-card">
      <h3 className="program-picker-title">{t('pricing.pickerTitle')}</h3>
      <p className="program-picker-sub">{t('pricing.pickerSubtitle')}</p>

      <div className="program-picker-scale" aria-hidden="true">
        {PAID_PROGRAMS.map((_, i) => (
          <span key={i} className="program-picker-scale-item">
            <span className="program-picker-scale-arrow">→</span>
            <span className="program-picker-scale-step">
              {i + 1} <strong>€{((i + 1) * PROGRAM_PRICE_CENTS / 100).toFixed(0)}</strong>
            </span>
          </span>
        ))}
        <span className="program-picker-scale-item">
          <span className="program-picker-scale-arrow">→</span>
          <span className="program-picker-scale-step program-picker-scale-step--book">
            {t('pricing.pickerScaleBook')} <strong>€{((PAID_PROGRAMS.length * PROGRAM_PRICE_CENTS + BOOK_PRICE_CENTS) / 100).toFixed(0)}</strong>
          </span>
        </span>
      </div>

      <div className="program-picker-grid">
        {PAID_PROGRAMS.map((p) => {
          const isOwned = owned.has(p.id);
          const isSelected = selected.has(p.id) && !isOwned;
          return (
            <button
              key={p.id}
              type="button"
              className={`program-picker-item${isSelected ? ' selected' : ''}${isOwned ? ' owned' : ''}`}
              onClick={() => toggle(p.id)}
              disabled={isOwned || loadingAccess}
              aria-pressed={isSelected}
            >
              <span className="program-picker-check" aria-hidden="true">
                {isOwned ? '✓' : isSelected ? '✓' : ''}
              </span>
              <span className="program-picker-icon">{p.icon}</span>
              <span className="program-picker-body">
                <span className="program-picker-name">{p.name}</span>
                <span className="program-picker-days">{p.days} {t('pricing.days')}</span>
              </span>
              <span className="program-picker-price">
                {isOwned ? t('pricing.pickerUnlocked') : `€${(PROGRAM_PRICE_CENTS / 100).toFixed(0)}`}
              </span>
            </button>
          );
        })}
      </div>

      {purchaseSuccessIds && (
        <p className="program-picker-success">{t('pricing.pickerSuccess', { count: purchaseSuccessIds.length })}</p>
      )}
      {purchaseError && <p className="program-picker-error">{purchaseError}</p>}

      {remainingUnowned === 0 ? (
        <p className="program-picker-all-owned">{t('pricing.pickerAllOwned')}</p>
      ) : (
        <div className="program-picker-footer">
          <div className="program-picker-total">
            {t('pricing.pickerTotal')} <strong>€{(totalCents / 100).toFixed(2)}</strong>
          </div>
          {!isAuthenticated ? (
            <button className="pricing-cta" onClick={() => setAuthModalOpen(true)}>
              {t('pricing.pickerLoginCta')}
            </button>
          ) : selectedIds.length === 0 ? (
            <button className="pricing-cta" disabled>{t('pricing.pickerChooseOne')}</button>
          ) : (
            <PayPalMultiProgramButton
              programIds={selectedIds}
              totalCents={totalCents}
              onSuccess={handlePurchaseSuccess}
              onError={(msg) => setPurchaseError(msg)}
            />
          )}
        </div>
      )}

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
