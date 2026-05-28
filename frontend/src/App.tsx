import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

// Importuri Componente corecte
import Nav from './Nav';
import { MaraChatWidget } from './components/MaraChatWidget';
import P2PContributingBadge from './components/P2PContributingBadge';

// Heavy route modules are lazy-loaded to reduce initial bundle size.
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const Missions = lazy(() => import('./Missions'));
const Pricing = lazy(() => import('./Pricing'));
const VIP = lazy(() => import('./VIP').then((m) => ({ default: m.VIP })));
const Creators = lazy(() => import('./creator').then((m) => ({ default: m.Creator })));
const Reels = lazy(() => import('./reels'));
const WritersHub = lazy(() => import('./WritersHub').then((m) => ({ default: m.WritersHub })));
import You from './you';
import ResetPassword from './ResetPassword';
import ResetPasswordConfirmation from './ResetPasswordConfirmation';
import HomePage from './HomePage';
// Admin pages are gated behind AdminGuard and never reached by 99% of
// visitors. Loading them eagerly bloated the initial bundle by ~110 kB; lazy
// chunks isolate that cost to the admins who actually visit /admin/*.
const Community = lazy(() => import('./Community'));
const AdminBrain = lazy(() => import('./AdminBrain'));
const AdminGrowthDashboard = lazy(() => import('./AdminGrowthDashboard'));
const AdminExperiments = lazy(() => import('./AdminExperiments'));
const AdminWaitlist = lazy(() => import('./AdminWaitlist'));
const AdminMaraChat = lazy(() => import('./AdminMaraChat'));
import { OnboardingFlow } from './maraai/OnboardingFlow';
import { TransparencyDashboard } from './maraai/TransparencyDashboard';
import { ThemeProvider } from './contexts/ThemeContext';
import NotFound from './NotFound';
import PrivacyPolicy from './PrivacyPolicy';
import CookieBanner from './components/CookieBanner';

/**
 * Redirectează userii noi la /onboarding dacă nu au completat flow-ul.
 * Se verifică o singură dată după autentificare (nu la fiecare navigare).
 * Admin-ii și userii care sunt deja pe /onboarding sunt exceptați.
 */
function OnboardingGuard() {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const checked = useRef(false);

  useEffect(() => {
    if (loading || !isAuthenticated || checked.current) return;
    if (user?.isAdmin) return;
    if (location.pathname === '/onboarding') return;

    checked.current = true;
    fetch('/api/user/onboarding-status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (!data.done) navigate('/onboarding', { replace: true }); })
      .catch(() => {});
  }, [isAuthenticated, loading, user, navigate, location.pathname]);

  return null;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, loading } = useAuth();

  // Dacă încă se încarcă — nu face nimic
  if (loading) return null;

  // Dacă nu e autentificat
  if (!isAuthenticated) return <Navigate to="/" replace />;

  // Dacă user nu e încă hidratat
  if (user === null) return null;

  // Dacă nu e admin
  if (!user?.isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function AuthedP2PBadge() {
  const { isAuthenticated, loading } = useAuth();
  const [backgroundNodeEnabled, setBackgroundNodeEnabled] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/consent', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setBackgroundNodeEnabled(!!d?.consent?.backgroundNode))
      .catch(() => {});
  }, [isAuthenticated]);

  if (loading || !isAuthenticated) return null;
  return <P2PContributingBadge backgroundNodeEnabled={backgroundNodeEnabled} />;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <ErrorBoundary level="page">
      <AuthProvider>
        <ThemeProvider>
        <div className="App">
          {!isHomePage && <Nav />}
          <OnboardingGuard />
          <ErrorBoundary level="section">
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/missions" element={<Missions />} />
                <Route path="/membership" element={<VIP onClose={() => navigate('/')} />} />
                <Route path="/creator-panel" element={<Creators onClose={() => navigate('/')} />} />
                <Route path="/you" element={<You />} />
                <Route path="/reels" element={<Reels />} />
                <Route path="/writers-hub" element={<WritersHub onClose={() => navigate('/')} />} />
                <Route path="/community" element={<Community />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/reset-password/confirmation" element={<ResetPasswordConfirmation />} />
                <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
                <Route path="/admin/brain" element={<AdminGuard><AdminBrain /></AdminGuard>} />
                <Route path="/admin/experiments" element={<AdminGuard><AdminExperiments /></AdminGuard>} />
                <Route path="/admin/waitlist" element={<AdminGuard><AdminWaitlist /></AdminGuard>} />
                <Route path="/admin/mara" element={<AdminGuard><AdminMaraChat /></AdminGuard>} />
                <Route path="/admin/growth" element={<AdminGuard><AdminGrowthDashboard /></AdminGuard>} />
                <Route
                  path="/onboarding"
                  element={<OnboardingFlow onClose={() => navigate('/')} />}
                />
                <Route path="/transparency" element={<TransparencyDashboard />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          {/* Mara Chat Widget - appears on all pages */}
          <ErrorBoundary level="component">
            <MaraChatWidget />
          </ErrorBoundary>
          {/* P2P background compute badge — visible only when actively contributing */}
          <ErrorBoundary level="component">
            <AuthedP2PBadge />
          </ErrorBoundary>
          <CookieBanner />
        </div>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;