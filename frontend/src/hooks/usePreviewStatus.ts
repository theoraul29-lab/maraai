import { useEffect, useState } from 'react';

export interface PreviewStatus {
  /** Still resolving /api/preview/status — callers should render nothing. */
  loading: boolean;
  /** True while the anonymous read-only preview window is still open. */
  active: boolean;
  /** Milliseconds left in the preview window (0 when closed). */
  remainingMs: number;
}

interface PreviewData {
  active: boolean;
  remainingMs: number;
}

/**
 * Fetch the current session's preview-window status from the backend.
 *
 * `enabled` should be false for authenticated users (who never need a
 * preview) so we don't fire the request or flip into a preview state for
 * them.
 *
 * `loading` is derived as `enabled && data === null`, so it stays true from
 * the moment `enabled` flips true until the fetch resolves — even across the
 * render that enables it. That prevents callers from acting on a not-yet-known
 * status (e.g. redirecting an anonymous visitor away before we've confirmed
 * the preview window is still open).
 */
export function usePreviewStatus(enabled: boolean): PreviewStatus {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let cancelled = false;
    // Reset to the "loading" state whenever we (re)enable a fetch.
    setData(null);
    fetch('/api/preview/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData({
          active: !!d?.active,
          remainingMs: typeof d?.remainingMs === 'number' ? d.remainingMs : 0,
        });
      })
      .catch(() => {
        if (!cancelled) setData({ active: false, remainingMs: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    loading: enabled && data === null,
    active: data?.active ?? false,
    remainingMs: data?.remainingMs ?? 0,
  };
}
