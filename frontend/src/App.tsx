import { lazy, Suspense } from 'react';
import { Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

// Importuri Componente corecte
import Nav from './Nav';
import { MaraChatWidget } from './components/MaraChatWidget';

// Heavy route modules are lazy-loaded to reduce initial bundle size.
const TradingAcademy = lazy(() => import('./Trading').then((m) => ({ default: m.Trading })));
const VIP = lazy(() => import('./VIP').then((m) => ({ default: m.VIP })));
const Creators = lazy(() => import('./creator').then((m) => ({ default: m.Creator })));
const Reels = lazy(() => import('./reels'));
const WritersHub = lazy(() => import('./WritersHub').then((m) => ({ default: m.WritersHub })));
import You from './you';
import ResetPassword from './ResetPassword';
import ResetPasswordConfirmation from './ResetPasswordConfirmation';
import HomePage from './HomePage';
import AdminBrain from './AdminBrain';
import { OnboardingFlow } from './maraai/OnboardingFlow';
import { TransparencyDashboard } from './maraai/TransparencyDashboard';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <ErrorBoundary level="page">
      <AuthProvider>
        <div className="App">
          {!isHomePage && <Nav />}
          <ErrorBoundary level="section">
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/trading-academy" element={<TradingAcademy onClose={() => navigate('/')} />} />
                <Route path="/membership" element={<VIP onClose={() => navigate('/')} />} />
                <Route path="/creator-panel" element={<Creators onClose={() => navigate('/')} />} />
                <Route path="/you" element={<You />} />
                <Route path="/reels" element={<Reels />} />
                <Route path="/writers-hub" element={<WritersHub onClose={() => navigate('/')} />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/reset-password/confirmation" element={<ResetPasswordConfirmation />} />
                <Route path="/admin/brain" element={<AdminBrain />} />
                <Route
                  path="/onboarding"
                  element={<OnboardingFlow onClose={() => navigate('/')} />}
                />
                <Route path="/transparency" element={<TransparencyDashboard />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          {/* Mara Chat Widget - appears on all pages */}
          <ErrorBoundary level="component">
            <MaraChatWidget />
          </ErrorBoundary>
        </div>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;