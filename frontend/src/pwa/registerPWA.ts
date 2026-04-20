/**
 * PWA registration + update lifecycle.
 *
 * `vite-plugin-pwa` generates a virtual `virtual:pwa-register` module that
 * handles the underlying `navigator.serviceWorker.register()` call and exposes
 * a lightweight callback API. We wrap that callback API in a small event bus
 * so the React install-prompt component can react to update events without
 * having to import the Vite virtual module directly (which TS doesn't love).
 *
 * The service worker is only registered on https:// origins or localhost —
 * browsers reject SW registration over plain http except for localhost.
 */

// `virtual:pwa-register` is a plugin-generated virtual module. Vite's dev
// dependency scanner runs before plugins resolve virtual ids, so a static
// `import` at the top of this file trips the scanner and (in our Express
// middleware setup) stalls the server long enough to fail CI's /api/health
// smoke check. A lazy `import()` is only walked by the normal module graph,
// where VitePWA has already registered the virtual module, so the scanner
// leaves it alone.
type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
  onRegisterError?: (error: unknown) => void;
};
type RegisterSW = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

export type PWAEvent =
  | { type: 'ready' }
  | { type: 'offline-ready' }
  | { type: 'update-available'; updateNow: () => Promise<void> };

type Listener = (e: PWAEvent) => void;

const listeners = new Set<Listener>();

function emit(e: PWAEvent): void {
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
 * supported (e.g. very old browsers, some in-app webviews).
 */
export function registerPWA(): void {
  if (registered) return;
  registered = true;

  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // Lazy-load the Vite virtual module so the dev dep-scanner doesn't try to
  // resolve it from disk (see note at the top of this file).
  void import(/* @vite-ignore */ 'virtual:pwa-register')
    .then((mod: { registerSW: RegisterSW }) => {
      const { registerSW } = mod;
      // `updateSW` returns a function that triggers skipWaiting + reload when
      // called. We expose that through the `update-available` event.
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          emit({
            type: 'update-available',
            updateNow: async () => {
              await updateSW(true);
            },
          });
        },
        onOfflineReady() {
          emit({ type: 'offline-ready' });
        },
        onRegisteredSW(swUrl) {
          console.info('[pwa] service worker registered:', swUrl);
          emit({ type: 'ready' });
        },
        onRegisterError(error) {
          console.error('[pwa] service worker registration failed:', error);
        },
      });
    })
    .catch((err: unknown) => {
      console.warn('[pwa] virtual:pwa-register unavailable:', err);
    });
}
