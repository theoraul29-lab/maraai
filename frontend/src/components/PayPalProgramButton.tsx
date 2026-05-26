import { useEffect, useRef, useState } from 'react';
import { usePayPalSDK } from '../hooks/usePayPalSDK';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

interface Props {
  programId: string;
  programName: string;
  priceCents: number;
  onSuccess: (programId: string) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export default function PayPalProgramButton({ programId, programName: _programName, priceCents, onSuccess, onError, disabled }: Props) {
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
        const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? '';
        const res = await fetch(`${API}/api/billing/program/purchase`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ programId }),
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
        // Backend redirects — treat any 2xx or 3xx as success
        if (res.ok || res.status === 0 || res.type === 'opaqueredirect') {
          onSuccess(programId);
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

  // Fallback: SDK not loaded → plain redirect button
  if (!PAYPAL_CLIENT_ID || sdkState === 'error') {
    return (
      <FallbackButton
        programId={programId}
        priceCents={priceCents}
        disabled={disabled}
        onError={onError}
      />
    );
  }

  return (
    <div className="paypal-btn-wrap">
      {sdkState === 'loading' && (
        <div className="paypal-btn-loading">⏳ Se încarcă PayPal…</div>
      )}
      {status === 'error' && (
        <p className="paypal-btn-error">{errMsg}</p>
      )}
      <div
        ref={containerRef}
        id={`paypal-btn-${programId}`}
        style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
      />
    </div>
  );
}

function FallbackButton({ programId, priceCents, disabled, onError }: Omit<Props, 'programName' | 'onSuccess'>) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? '';
      const res = await fetch(`${API}/api/billing/program/purchase`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ programId }),
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
