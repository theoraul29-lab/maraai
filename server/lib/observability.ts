/**
 * Error tracking (Sentry).
 *
 * Sentry is initialised only when `SENTRY_DSN` is set, so local dev and any
 * deployment without the env var keep running untouched (every export here is
 * a no-op in that case). The point of this module is that the platform stops
 * "running blind": until now the only signal for a production failure was a
 * `console.error` nobody reads.
 *
 * Usage:
 *   - `initSentry()` is called once, as early as possible, in the server
 *     bootstrap (see server/index.ts).
 *   - `captureException()` is called from the central Express error handler
 *     and from the bootstrap `.catch`, alongside the existing `logError`.
 */
import * as Sentry from '@sentry/node';

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn('[observability] SENTRY_DSN not set — error tracking disabled');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
    // Keep performance tracing cheap by default; can be tuned via env.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
  });
  enabled = true;
  console.log('[observability] Sentry error tracking enabled');
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
