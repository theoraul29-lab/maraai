/**
 * Frontend error tracking (Sentry).
 *
 * Initialised only when `VITE_SENTRY_DSN` is set at build time, so dev builds
 * and any deployment without the env var are completely untouched. Imported
 * for its side effect from main.tsx before the app renders.
 */
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Capture a small fraction of transactions for performance context.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0'),
  });
}
