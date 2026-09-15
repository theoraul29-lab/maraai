/**
 * PWA registration + update lifecycle.
 *
 * The actual `virtual:pwa-register` import (vite-plugin-pwa's generated
 * module) lives in `./registerServiceWorker.ts`, a separate file, and is
 * reached only through a dynamic import inside the `if (import.meta.env.DEV)
 * return` guard below. That split matters: Vite's dev server transforms a
 * module the moment the browser requests it, regardless of runtime
 * conditionals inside it — so when this function's body (including the
 * `virtual:pwa-register` import) lived directly in this file, and
 * InstallPromptBanner.tsx imported this file unconditionally (for
 * subscribePWA), Vite tried to transform it on every dev page load and
 * failed ("Failed to resolve import virtual:pwa-register" — that module
 * only exists when vite-plugin-pwa's devOptions.enabled is true, which it
 * isn't here). Keeping the virtual-module reference in a file that's only
 * ever dynamically imported, and only when DEV is false, means Vite's dev
 * server never has a reason to fetch or transform that file at all.
 *
 * The service worker is only registered on https:// origins or localhost —
 * browsers reject SW registration over plain http except for localhost.
 */

export type PWAEvent =
  | { type: 'ready' }
  | { type: 'offline-ready' }
  | { type: 'update-available'; updateNow: () => Promise<void> };

type Listener = (e: PWAEvent) => void;

const listeners = new Set<Listener>();

export function emitPWAEvent(e: PWAEvent): void {
  listeners.forEach((l) => {
    try {
      l(e);
    } catch (err) {
      console.error('[pwa] listener threw:', err);
    }
  });
}

export function subscribePWA(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let registered = false;

/**
 * Register the service worker. Safe to call multiple times — the actual
 * registration happens only once. Returns early in contexts where SW is not
 * supported (e.g. very old browsers, some in-app webviews) or in dev, where
 * service workers are intentionally disabled (see file header).
 */
export function registerPWA(): void {
  if (registered) return;
  registered = true;

  if (typeof window === 'undefined') return;
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  void import('./registerServiceWorker').then(({ registerServiceWorker }) => {
    registerServiceWorker(emitPWAEvent);
  });
}
