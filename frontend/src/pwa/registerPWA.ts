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
 *
 * NOTE: @vite-ignore below is intentional and load-bearing, not just for
 * this file's own dev-mode transform but for Vite's dependency PRE-BUNDLING
 * SCANNER (a separate esbuild-based pass, distinct from the module
 * transform) — it walks the static module graph from every Vite dev server
 * instance's entry points, including this app's own smoke-test scripts that
 * boot a fresh dev server, and fails hard ("Failed to run dependency scan")
 * on any real or lazily-nested reference to this plugin-only virtual id,
 * regardless of runtime conditionals around it. This was tried without
 * @vite-ignore (both inline and split into a separate file reached only via
 * a DEV-gated dynamic import) and broke CI's smoke tests both times. The
 * cost is that the production bundle ships an unresolved runtime
 * import("virtual:pwa-register") call that the browser can't fetch (CSP
 * correctly rejects it as a URL) — service worker registration is
 * currently a no-op in production. Fixing that without reintroducing the
 * dev/CI breakage needs vite-plugin-pwa's injectRegister: 'script' mode
 * (a real generated file, no app-code virtual-module import at all) rather
 * than another variation on this same import.
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
  // The Express development server uses the root Vite config, which does not
  // install vite-plugin-pwa. Service workers are intentionally disabled in
  // development, so avoid adding the virtual module to Vite's dev graph.
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  // Lazy-load the Vite virtual module so the dev dep-scanner doesn't try to
  // resolve it from disk (see note at the top of this file).
    const pwaRegisterModule = 'virtual:' + 'pwa-register';
    void import(/* @vite-ignore */ pwaRegisterModule)
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
