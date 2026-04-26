// Typed client for the MaraAI hybrid-platform layer.

import type {
  ActivityRow,
  ConsentPatch,
  ConsentView,
  TransparencyStatus,
} from './types';

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status}: ${text || res.statusText}`), {
      status: res.status,
      body: text,
    });
  }
  return (await res.json()) as T;
}

export async function getConsent(): Promise<ConsentView> {
  const { consent } = await jsonFetch<{ consent: ConsentView }>('/api/consent');
  return consent;
}

export async function updateConsent(patch: ConsentPatch): Promise<ConsentView> {
  const { consent } = await jsonFetch<{ consent: ConsentView }>('/api/consent', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
  return consent;
}

export async function setMode(mode: ConsentView['mode']): Promise<ConsentView> {
  const { consent } = await jsonFetch<{ consent: ConsentView }>('/api/mode', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  return consent;
}

export function getTransparencyStatus(): Promise<TransparencyStatus> {
  return jsonFetch<TransparencyStatus>('/api/transparency/status');
}

export async function getActivityFeed(limit = 100): Promise<ActivityRow[]> {
  const { activity } = await jsonFetch<{ activity: ActivityRow[] }>(
    `/api/transparency/activity?limit=${encodeURIComponent(limit)}`,
  );
  return activity;
}

export async function activateKillSwitch(): Promise<ConsentView> {
  const { consent } = await jsonFetch<{ consent: ConsentView }>('/api/p2p/kill-switch', {
    method: 'POST',
  });
  return consent;
}

export async function requestEmailOtp(email: string, purpose: 'register' | 'login' | 'reset' = 'register') {
  return jsonFetch<{ delivered: boolean; expiresAtMs: number }>(
    '/api/auth/otp/request',
    { method: 'POST', body: JSON.stringify({ email, purpose }) },
  );
}

export async function verifyEmailOtp(email: string, code: string) {
  return jsonFetch<{ ok: boolean; email?: string; purpose?: string; reason?: string }>(
    '/api/auth/otp/verify',
    { method: 'POST', body: JSON.stringify({ email, code }) },
  );
}

export type AiRouteResult = {
  response: string;
  detectedMood: string;
  route: 'local' | 'central' | 'p2p';
  reason: string;
  latencyMs: number;
  fallback: boolean;
};

export async function callAiRouter(message: string, opts: { module?: string; language?: string } = {}) {
  return jsonFetch<AiRouteResult>('/api/maraai/ai', {
    method: 'POST',
    body: JSON.stringify({ message, ...opts }),
  });
}
