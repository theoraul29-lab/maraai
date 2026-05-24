import { lazy, Suspense, useEffect, useRef } from 'react';
import { Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

// Importuri Componente corecte
import Nav from './Nav';
import { MaraChatWidget } from './components/MaraChatWidget';

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
const AdminBrain = lazy(() => import('./AdminBrain'));
const AdminExperiments = lazy(() => import('./AdminExperiments'));
const AdminWaitlist = lazy(() => import('./AdminWaitlist'));
const AdminMaraChat = lazy(() => import('./AdminMaraChat'));
import { OnboardingFlow } from './maraai/OnboardingFlow';
import { TransparencyDashboard } from './maraai/TransparencyDashboard';
import NotFound from './NotFound';

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

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <ErrorBoundary level="page">
      <AuthProvider>
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
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/reset-password/confirmation" element={<ResetPasswordConfirmation />} />
                <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
                <Route path="/admin/brain" element={<AdminGuard><AdminBrain /></AdminGuard>} />
                <Route path="/admin/experiments" element={<AdminGuard><AdminExperiments /></AdminGuard>} />
                <Route path="/admin/waitlist" element={<AdminGuard><AdminWaitlist /></AdminGuard>} />
                <Route path="/admin/mara" element={<AdminGuard><AdminMaraChat /></AdminGuard>} />
                <Route
                  path="/onboarding"
                  element={<OnboardingFlow onClose={() => navigate('/')} />}
                />
                <Route path="/transparency" element={<TransparencyDashboard />} />
                <Route path="*" element={<NotFound />} />
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