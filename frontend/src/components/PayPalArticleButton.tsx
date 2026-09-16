import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePayPalSDK } from '../hooks/usePayPalSDK';
import '../styles/PayPalButtons.css';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

interface Props {
  articleId: number;
  priceCents: number;
  onSuccess: () => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

/**
 * Buys a single paid Writers Hub article/book. Same structure as
 * PayPalProgramButton/PayPalMultiProgramButton (SDK-rendered button with a
 * plain-redirect fallback) — posts to /api/writers/:id/purchase and lets
 * PayPal redirect through /api/writers/purchase/capture, which is where the
 * 90/10 split + automatic payout to the author actually happen.
 */
export default function PayPalArticleButton({ articleId, priceCents, onSuccess, onError, disabled }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'ready' | 'paying' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const { state: sdkState, sdk } = usePayPalSDK(PAYPAL_CLIENT_ID);
  const rendered = useRef(false);

  useEffect(() => {
    if (sdkState !== 'ready' || !sdk?.Buttons || !containerRef.current || rendered.current) return;
    rendered.current = true;
    setStatus('rendering');

    sdk.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay', height: 44 },

      createOrder: async () => {
        setStatus('paying');
        const res = await fetch(`${API}/api/writers/${articleId}/purchase`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'unknown' }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const { orderId } = await res.json() as { orderId: string };
        return orderId;
      },

      onApprove: async (data) => {
        const res = await fetch(`${API}/api/writers/purchase/capture?token=${data.orderID}`, {
          credentials: 'include',
          redirect: 'manual',
        });
        if (res.ok || res.status === 0 || res.type === 'opaqueredirect') {
          onSuccess();
        } else {
          const msg = 'Capturare eșuată. Contactează suportul.';
          setErrMsg(msg);
          setStatus('error');
          onError?.(msg);
        }
      },

      onError: (err) => {
        const msg = String(err) || 'Eroare PayPal';
        setErrMsg(msg);
        setStatus('error');
        onError?.(msg);
      },

      onCancel: () => setStatus('idle'),
    }).render(containerRef.current!).then(() => {
      if (status !== 'error') setStatus('ready');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkState]);

  if (!PAYPAL_CLIENT_ID || sdkState === 'error') {
    return (
      <FallbackButton articleId={articleId} priceCents={priceCents} disabled={disabled} onError={onError} />
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
        id={`paypal-btn-article-${articleId}`}
        style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
      />
    </div>
  );
}

function FallbackButton({ articleId, priceCents, disabled, onError }: Omit<Props, 'onSuccess'>) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/writers/${articleId}/purchase`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
      disabled={disabled || loading}
    >
      {loading ? '⏳ Redirecționare…' : `💳 Plătește ${(priceCents / 100).toFixed(2)} EUR cu PayPal`}
    </button>
  );
}
