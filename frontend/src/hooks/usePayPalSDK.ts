import { useEffect, useState } from 'react';

declare global {
  interface Window {
    PayPal?: {
      start: (opts: { clientId: string; currency?: string }) => Promise<PayPalSDK>;
    };
    paypal?: {
      Buttons: (opts: PayPalButtonsOptions) => { render: (el: string | HTMLElement) => Promise<void>; isEligible: () => boolean };
      FUNDING: Record<string, string>;
    };
  }
}

interface PayPalSDK {
  Buttons?: (opts: PayPalButtonsOptions) => { render: (el: string | HTMLElement) => Promise<void> };
}

interface PayPalButtonsOptions {
  style?: Record<string, unknown>;
  createOrder?: () => Promise<string>;
  onApprove?: (data: { orderID: string }) => Promise<void> | void;
  onError?: (err: unknown) => void;
  onCancel?: () => void;
}

type SDKState = 'idle' | 'loading' | 'ready' | 'error';

const SDK_URL = 'https://www.paypal.com/web-sdk/v6/core';
let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  // Reset cached promise on error so the next mount can retry
  if (scriptLoadPromise) return scriptLoadPromise;
  const existing = document.querySelector(`script[src="${SDK_URL}"]`);
  if (existing && !existing.getAttribute('data-error')) {
    scriptLoadPromise = Promise.resolve();
    return scriptLoadPromise;
  }
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.setAttribute('data-error', '1');
      scriptLoadPromise = null; // allow retry on next mount
      reject(new Error('PayPal SDK v6 failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export function usePayPalSDK(clientId: string | undefined) {
  const [state, setState] = useState<SDKState>('idle');
  const [sdk, setSdk] = useState<PayPalSDK | null>(null);

  useEffect(() => {
    if (!clientId) return;
    setState('loading');
    loadScript()
      .then(async () => {
        if (window.PayPal?.start) {
          const instance = await window.PayPal.start({ clientId, currency: 'EUR' });
          setSdk(instance);
          setState('ready');
        } else if (window.paypal) {
          // Fallback: classic JS SDK also loaded on same page
          setSdk({ Buttons: window.paypal.Buttons.bind(window.paypal) } as PayPalSDK);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, [clientId]);

  return { state, sdk };
}
