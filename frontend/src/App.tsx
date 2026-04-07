// import React from 'react';
import { Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import './App.css';

// Importuri Componente corecte
import Nav from './Nav';
import { MaraChatWidget } from './components/MaraChatWidget';

import { Trading as TradingAcademy } from './Trading';
import { VIP } from './VIP';
import { Creator as Creators } from './creator';
import Reels from './reels';
import { WritersHub } from './WritersHub';
import You from './you';
import ResetPassword from './ResetPassword';
import ResetPasswordConfirmation from './ResetPasswordConfirmation';
import HomePage from './HomePage';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <AuthProvider>
      <div className="App">
        {!isHomePage && <Nav />}
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
        </Routes>
        {/* Mara Chat Widget - appears on all pages */}
        <MaraChatWidget />
      </div>
    </AuthProvider>
  );
}

export default App;