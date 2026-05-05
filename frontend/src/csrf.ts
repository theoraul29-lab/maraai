/**
 * CSRF helper.
 *
 * Production (`hellomara.net`) enforces CSRF on every state-changing
 * request — see `server/auth.ts` `csrfProtection()`. The token lives in
 * the user's session and is exposed by `GET /api/auth/csrf`. Until this
 * file existed, the SPA never sent the `X-CSRF-Token` header so every
 * signup / login / profile-update / post / upload was blocked with a
 * 403 in production while local dev (where CSRF is skipped) worked fine.
 *
 * What we do here:
 *   - Cache the token in module scope.
 *   - Fetch it lazily from `/api/auth/csrf` the first time we need it.
 *   - Auto-attach the `X-CSRF-Token` header to every mutating request
 *     made via `window.fetch` or `axios`.
 *   - Retry once on a 403 "CSRF validation failed" — covers the
 *     post-login session rotation in `setSessionUser()`.
 *   - Expose `clearCsrfToken()` so AuthContext can drop the cached
 *     anonymous-session token after signup / login / logout, forcing a
 *     re-fetch tied to the new session id.
 */

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let cachedToken: string | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchCsrfTokenFromServer(): Promise<string | null> {
  try {
    const res = await origFetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const tok = data && typeof data.csrfToken === 'string' ? data.csrfToken : null;
    return tok;
  } catch {
    return null;
  }
}

export async function getCsrfToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!inflight) {
    inflight = fetchCsrfTokenFromServer().then((tok) => {
      cachedToken = tok;
      inflight = null;
      return tok;
    });
  }
  return inflight;
}

export function clearCsrfToken(): void {
  cachedToken = null;
  inflight = null;
}

export function setCsrfToken(tok: string | null): void {
  cachedToken = tok;
}

// ---------------------------------------------------------------------------
// Wire up `window.fetch` so every existing call site (AuthContext + any
// hand-rolled fetch) automatically gets the CSRF header without needing
// to be touched.
// ---------------------------------------------------------------------------

const origFetch: typeof window.fetch = window.fetch.bind(window);

function isCsrfFailure(status: number, body: string): boolean {
  if (status !== 403) return false;
  return /csrf/i.test(body);
}

async function fetchWithCsrf(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const reqMethod = (init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  const isMutating = MUTATING_METHODS.has(reqMethod);

  if (!isMutating) {
    return origFetch(input, init);
  }

  const buildInit = async (): Promise<RequestInit> => {
    const tok = await getCsrfToken();
    const headers = new Headers(
      init.headers ||
        (input instanceof Request ? input.headers : undefined),
    );
    if (tok && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', tok);
    }
    const next: RequestInit = { ...init, headers };
    if (next.credentials === undefined) next.credentials = 'include';
    return next;
  };

  let response = await origFetch(input, await buildInit());
  if (response.status === 403) {
    // Read body once, but keep it for the caller via `.clone()` so the
    // application code still sees it on a non-CSRF 403.
    const cloned = response.clone();
    const text = await cloned.text().catch(() => '');
    if (isCsrfFailure(response.status, text)) {
      clearCsrfToken();
      response = await origFetch(input, await buildInit());
    }
  }
  return response;
}

window.fetch = fetchWithCsrf as typeof window.fetch;

// ---------------------------------------------------------------------------
// Axios — request interceptor + response interceptor for retry.
// ---------------------------------------------------------------------------

axios.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method || 'get').toUpperCase();
  if (!MUTATING_METHODS.has(method)) return config;
  const tok = await getCsrfToken();
  if (tok) {
    if (config.headers instanceof AxiosHeaders) {
      if (!config.headers.has('X-CSRF-Token')) config.headers.set('X-CSRF-Token', tok);
    } else {
      const h = (config.headers as Record<string, string>) || {};
      if (!h['X-CSRF-Token']) h['X-CSRF-Token'] = tok;
      config.headers = h as InternalAxiosRequestConfig['headers'];
    }
  }
  if (config.withCredentials === undefined) config.withCredentials = true;
  return config;
});

axios.interceptors.response.use(undefined, async (error: AxiosError) => {
  const status = error.response?.status;
  const data = error.response?.data;
  const message =
    (data && typeof data === 'object' && 'message' in data && typeof (data as Record<string, unknown>).message === 'string'
      ? ((data as Record<string, unknown>).message as string)
      : '') || '';
  const config = error.config as (InternalAxiosRequestConfig & { _csrfRetried?: boolean }) | undefined;
  if (
    status === 403 &&
    /csrf/i.test(message) &&
    config &&
    !config._csrfRetried
  ) {
    clearCsrfToken();
    config._csrfRetried = true;
    return axios.request(config);
  }
  return Promise.reject(error);
});

// Pre-warm the cache on app load so the first signup/login click has a
// token ready without paying a round-trip.
void getCsrfToken();
