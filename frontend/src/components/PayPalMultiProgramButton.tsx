import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePayPalSDK } from '../hooks/usePayPalSDK';
import '../styles/PayPalButtons.css';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

interface Props {
  programIds: string[];
  totalCents: number;
  onSuccess: (programIds: string[]) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

/**
 * One PayPal checkout for an arbitrary user-picked set of programs — the
 * "choose your own" card on the Pricing page. Mirrors PayPalProgramButton's
 * structure (same SDK hook, same createOrder/onApprove/fallback shape) but
 * posts `{ items: string[] }` to /api/billing/program/purchase instead of a
 * single `{ item }`, matching the backend's multi-item support.
 */
export default function PayPalMultiProgramButton({ programIds, totalCents, onSuccess, onError, disabled }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'ready' | 'paying' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const { state: sdkState, sdk } = usePayPalSDK(PAYPAL_CLIENT_ID);
  const rendered = useRef(false);
  // Buttons render once; createOrder/onApprove below read the *latest*
  // selection through this ref so re-rendering the whole SDK button on every
  // checkbox toggle isn't necessary.
  const idsRef = useRef(programIds);
  idsRef.current = programIds;

  // See PayPalProgramButton.tsx for why this check exists — same gap,
  // same fix, mirrored here since this component duplicates that one's
  // structure rather than wrapping it.
  const [paymentsActive, setPaymentsActive] = useState(true);
  useEffect(() => {
    fetch('/api/config/features')
      .then((r) => r.json())
      .then((data) => setPaymentsActive(!!data.paymentsActive))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!paymentsActive || sdkState !== 'ready' || !sdk?.Buttons || !containerRef.current || rendered.current) return;
    rendered.current = true;
    setStatus('rendering');

    sdk.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay', height: 44 },

      createOrder: async () => {
        setStatus('paying');
        const res = await fetch(`${API}/api/billing/program/purchase`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: idsRef.current }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'unknown' }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const { orderId } = await res.json() as { orderId: string };
        return orderId;
      },

      onApprove: async (data) => {
        const res = await fetch(`${API}/api/billing/program/capture?token=${data.orderID}`, {
          credentials: 'include',
          redirect: 'manual',
        });
        if (res.ok || res.status === 0 || res.type === 'opaqueredirect') {
          onSuccess(idsRef.current);
        } else {
          const msg = t('paypal.captureFailed', 'Payment capture failed. Please contact support.');
          setErrMsg(msg);
          setStatus('error');
          onError?.(msg);
        }
      },

      onError: (err) => {
        const msg = String(err) || t('paypal.error', 'PayPal error');
        setErrMsg(msg);
        setStatus('error');
        onError?.(msg);
      },

      onCancel: () => setStatus('idle'),
    }).render(containerRef.current!).then(() => {
      if (status !== 'error') setStatus('ready');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkState, paymentsActive]);

  if (!paymentsActive) {
    return <p className="paypal-btn-coming-soon">{t('paypal.comingSoon', 'Payments activate soon — check back shortly.')}</p>;
  }

  if (!PAYPAL_CLIENT_ID || sdkState === 'error') {
    return (
      <FallbackButton
        programIds={programIds}
        totalCents={totalCents}
        disabled={disabled}
        onError={onError}
      />
    );
  }

  return (
    <div className="paypal-btn-wrap">
      {sdkState === 'loading' && (
        <div className="paypal-btn-loading">⏳ {t('common.loading')}</div>
      )}
      {status === 'error' && (
        <p className="paypal-btn-error">{errMsg}</p>
      )}
      <div
        ref={containerRef}
        id="paypal-btn-program-picker"
        style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
      />
    </div>
  );
}

function FallbackButton({ programIds, totalCents, disabled, onError }: Omit<Props, 'onSuccess'>) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/billing/program/purchase`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: programIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { approvalUrl } = await res.json() as { approvalUrl: string };
      window.location.href = approvalUrl;
    } catch (err) {
      onError?.(String(err));
      setLoading(false);
    }
  };

  return (
    <button
      className="paypal-fallback-btn"
      onClick={handleClick}
      disabled={disabled || loading || programIds.length === 0}
    >
      {loading
        ? t('paypal.redirecting', '⏳ Redirecting…')
        : t('paypal.payWith', '💳 Pay {{amount}} EUR with PayPal', { amount: (totalCents / 100).toFixed(2) })}
    </button>
  );
}
