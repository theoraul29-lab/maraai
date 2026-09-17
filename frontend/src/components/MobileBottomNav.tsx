import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ORBIT_MODULES, ORBIT_STRIP_PATHS } from '../lib/orbitModules';
import '../styles/MobileBottomNav.css';

// Phase 2 of the mobile design overhaul: primary navigation within actual
// thumb reach on a phone, instead of only a top-anchored hamburger menu (the
// audit found no bottom-nav pattern anywhere in the app — everything was
// top-anchored). Shows the same 6 modules as OrbNavStrip, same colors/icons,
// same routes; the two never show together (OrbNavStrip hides itself below
// 768px in its own CSS) so there's exactly one place these 6 links live at
// any given screen size, not two.
//
// Rendered globally from App.tsx (same spot Nav.tsx is), gated to the same
// pages OrbNavStrip appears on — a page with no orb strip has no bottom nav
// either, same reasoning as why Nav.tsx's own link row only hides there too.
const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  if (!(ORBIT_STRIP_PATHS as readonly string[]).includes(location.pathname)) return null;
  // /pricing is the one page in this set that isn't RequireAuth-gated at
  // the router level — OrbNavStrip already only shows there when signed in
  // (it would otherwise point a logged-out visitor at 5 auth-walled
  // modules); matching that here rather than showing links this bar alone
  // would send somewhere they'd just bounce off.
  if (location.pathname === '/pricing' && !isAuthenticated) return null;

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Module shortcuts">
      {ORBIT_MODULES.map((m) => (
        <NavLink
          key={m.id}
          to={m.to}
          className={({ isActive }) => `mobile-bottom-nav-item${isActive ? ' is-current' : ''}`}
          data-module={m.id}
        >
          <span className="mobile-bottom-nav-orb">{m.icon}</span>
          <span className="mobile-bottom-nav-label">{m.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileBottomNav;
