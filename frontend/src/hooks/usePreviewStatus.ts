import { useEffect, useState } from 'react';

export interface PreviewStatus {
  /** Still resolving /api/preview/status — callers should render nothing. */
  loading: boolean;
  /** True while the anonymous read-only preview window is still open. */
  active: boolean;
  /** Milliseconds left in the preview window (0 when closed). */
  remainingMs: number;
}

/**
 * Fetch the current session's preview-window status from the backend.
 *
 * `enabled` should be false for authenticated users (who never need a
 * preview) so we don't fire the request or flip into a preview state for
 * them. When disabled the hook resolves immediately to an inactive status.
 */
export function usePreviewStatus(enabled: boolean): PreviewStatus {
  const [state, setState] = useState<PreviewStatus>({
    loading: true,
    active: false,
    remainingMs: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, active: false, remainingMs: 0 });
      return;
    }
    let cancelled = false;
    fetch('/api/preview/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setState({
          loading: false,
          active: !!d?.active,
          remainingMs: typeof d?.remainingMs === 'number' ? d.remainingMs : 0,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, active: false, remainingMs: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
