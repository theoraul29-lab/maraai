/**
 * Only reached from registerPWA()'s dynamic import when import.meta.env.DEV
 * is false — see the comment in registerPWA.ts for why this is a separate
 * file. A real (non-@vite-ignore) static specifier here is required for
 * Rollup to resolve and inline vite-plugin-pwa's generated module during
 * the production build; @vite-ignore would ship this as a literal, never-
 * resolved runtime import() call instead (confirmed: the browser then tries
 * to fetch the string "virtual:pwa-register" as a URL and CSP rejects it,
 * silently breaking service worker registration on every production load).
 */
import type { PWAEvent } from './registerPWA';

type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
  onRegisterError?: (error: unknown) => void;
};
type RegisterSW = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

export async function registerServiceWorker(emit: (e: PWAEvent) => void): Promise<void> {
  try {
    const { registerSW } = await import('virtual:pwa-register') as { registerSW: RegisterSW };
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
  } catch (err) {
    console.warn('[pwa] virtual:pwa-register unavailable:', err);
  }
}
