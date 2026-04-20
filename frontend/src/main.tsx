
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import './pwa/InstallPromptBanner.css';
import { BrowserRouter } from 'react-router-dom';
import { InstallPromptBanner } from './pwa/InstallPromptBanner';
import { registerPWA } from './pwa/registerPWA';

// Service worker — no-op in dev (devOptions.enabled=false in vite.config).
registerPWA();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <InstallPromptBanner />
    </BrowserRouter>
  </React.StrictMode>,
);
