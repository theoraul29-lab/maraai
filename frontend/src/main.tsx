
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { langReady } from './i18n';
// Side-effect: install fetch + axios CSRF wrappers before any component
// fires its first POST/PATCH. Production (`hellomara.net`) rejects every
// state-changing request without an `X-CSRF-Token` header.
import './csrf';
// Side-effect: initialise Sentry error tracking when VITE_SENTRY_DSN is set.
import './observability';
import './pwa/InstallPromptBanner.css';
import { BrowserRouter } from 'react-router-dom';
import { InstallPromptBanner } from './pwa/InstallPromptBanner';

// Service worker registration is now handled by vite-plugin-pwa's own
// build-injected script (injectRegister: 'script' in vite.config.ts) — no
// app-code call needed, and no-op in dev either way (devOptions.enabled=false).

// Wait for the active language bundle to load before first render so the
// user never sees a flash of English when a lazy language (fr, de, …) was
// previously saved to localStorage.
langReady.then(() => {
  // A successful mount means we're running current code — clear the
  // stale-chunk auto-reload guard (see ErrorBoundary.tsx) so a *later*
  // deploy in this same tab session can still trigger one automatic
  // recovery reload instead of only ever getting one per tab lifetime.
  try { sessionStorage.removeItem('mara_chunk_reload_attempted'); } catch { /* ignore */ }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
        <InstallPromptBanner />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
