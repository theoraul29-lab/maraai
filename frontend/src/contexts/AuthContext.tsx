import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type UserTier = 'free' | 'trial' | 'premium' | 'vip';

export interface User {
  id: string;
  email: string;
  name: string;
  tier: UserTier;
  trialStartTime: number | null;
  trialEndsAt: number | null;
  createdAt: number;
  earnings: number;
  badges: string[];
  avatar?: string;
  banner?: string;
  bio?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  userTier: UserTier;
  isTrialActive: boolean;
  trialTimeRemaining: number; // minutes
  /** Last OAuth error code pulled from the `?oauth_error=` query param. */
  oauthError: string | null;
  clearOAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithOAuth: (provider: 'google' | 'facebook') => Promise<void>;
  logout: () => Promise<void>;
  upgradeTier: (newTier: UserTier) => Promise<void>;
  /**
   * Re-fetch /api/auth/me and update local user state. Used by flows that
   * authenticate the user out-of-band (e.g. email-OTP verification, which
   * establishes a session server-side without ever calling login/signup).
   */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const clearOAuthError = () => setOAuthError(null);

  // Mount: restore from localStorage, consume any ?oauth/?oauth_error query
  // params, then refresh against the server session.
  //
  // The server session is the source of truth: Google/Facebook OAuth redirects
  // land back on `/` with a freshly-authenticated cookie, at which point the
  // server-side `req.session.userId` is the ONLY place that knows who the
  // logged-in user is. Without this fetch, a successful OAuth login would
  // never reach the React tree.
  //
  // `?oauth=<provider>` is our signal that the user JUST completed an OAuth
  // round-trip (vs. a plain refresh of an already-authenticated tab). We use
  // it to apply the same trial-window affordance that email/password login &
  // signup set client-side, so OAuth users don't land on `free` while their
  // email-signed-up peers get `trial`.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('oauth_error');
    const freshOAuth = params.get('oauth');
    if (err || freshOAuth) {
      if (err) setOAuthError(err);
      params.delete('oauth_error');
      params.delete('oauth');
      const query = params.toString();
      const next = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
      window.history.replaceState({}, '', next);
    }

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch {
        /* ignore corrupt localStorage */
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled || !payload?.user) return;
        const trialFields = freshOAuth
          ? {
              trialStartTime: Date.now(),
              trialEndsAt: Date.now() + 60 * 60 * 1000,
              tier: 'trial' as UserTier,
            }
          : {
              trialStartTime: payload.user.trialStartTime ?? null,
              trialEndsAt: payload.user.trialEndsAt ?? null,
              tier: payload.user.tier || 'free',
            };
        const sessionUser: User = {
          ...payload.user,
          ...trialFields,
          earnings: payload.user.earnings ?? 0,
          badges: payload.user.badges ?? [],
        };
        localStorage.setItem('user', JSON.stringify(sessionUser));
        setUser(sessionUser);
        setIsAuthenticated(true);
      } catch {
        /* keep localStorage state */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const calculateTrialStatus = (user: User): { isActive: boolean; remaining: number } => {
    if (user.tier !== 'trial' || !user.trialEndsAt) {
      return { isActive: false, remaining: 0 };
    }
    const now = Date.now();
    const remaining = Math.max(0, user.trialEndsAt - now);
    return { isActive: remaining > 0, remaining: Math.floor(remaining / 60000) }; // minutes
  };

  const login = async (email: string, password: string): Promise<void> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const err = new Error(payload?.message || 'Login failed') as Error & { code?: string; statusCode?: number };
        err.code = payload?.code || 'unknown';
        err.statusCode = response.status;
        throw err;
      }

      const userData = await response.json();
      const newUser: User = {
        ...userData,
        trialStartTime: Date.now(),
        trialEndsAt: Date.now() + 60 * 60 * 1000, // 1 hour trial
        tier: 'trial',
      };

      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const signup = async (email: string, password: string, name: string): Promise<void> => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const err = new Error(payload?.message || 'Signup failed') as Error & { code?: string; statusCode?: number };
        err.code = payload?.code || 'unknown';
        err.statusCode = response.status;
        throw err;
      }

      const userData = await response.json();
      const newUser: User = {
        ...userData,
        trialStartTime: Date.now(),
        trialEndsAt: Date.now() + 60 * 60 * 1000, // 1 hour trial
        tier: 'trial',
      };

      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const loginWithOAuth = async (provider: 'google' | 'facebook'): Promise<void> => {
    // Both providers use the full authorization-code redirect flow. The user
    // leaves the SPA entirely — the callback comes back with an authenticated
    // cookie and the mount-time /api/auth/me fetch picks it up. We
    // intentionally don't return a resolved Promise; navigation supersedes
    // it. If a provider isn't configured on the server (missing client
    // credentials), the start handler redirects back to `/?oauth_error=
    // oauth_not_configured` and the mount-time effect surfaces it.
    if (provider === 'google' || provider === 'facebook') {
      window.location.href = `/api/auth/${provider}`;
      return new Promise<void>(() => { /* never resolves — page unloads */ });
    }

    // Defensive catch-all: unknown provider. Keeps the compile-time union
    // exhaustive and turns a typo into a visible error in the UI.
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  };

  const logout = async () => {
    // Clear the server session FIRST. The new mount-time /api/auth/me fetch
    // would otherwise find the still-valid cookie on the next page refresh
    // and silently re-authenticate the user. Client state is cleared
    // regardless of server response so a network error can't strand the UI.
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore — we still clear client state below */
    }
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
    setOAuthError(null);
  };

  const upgradeTier = async (newTier: UserTier): Promise<void> => {
    if (!user) throw new Error('No user logged in');

    try {
      const response = await fetch('/api/user/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id, newTier }),
      });

      if (!response.ok) throw new Error('Upgrade failed');

      const updatedUser = { ...user, tier: newTier };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.error('Upgrade error:', error);
      throw error;
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const payload = await res.json();
      if (!payload?.user) return;
      const sessionUser: User = {
        ...payload.user,
        trialStartTime: payload.user.trialStartTime ?? null,
        trialEndsAt: payload.user.trialEndsAt ?? null,
        tier: payload.user.tier || 'free',
        earnings: payload.user.earnings ?? 0,
        badges: payload.user.badges ?? [],
      };
      localStorage.setItem('user', JSON.stringify(sessionUser));
      setUser(sessionUser);
      setIsAuthenticated(true);
    } catch {
      /* ignore */
    }
  };

  const userTier = user?.tier || 'free';
  const { isActive: isTrialActive, remaining: trialTimeRemaining } = user
    ? calculateTrialStatus(user)
    : { isActive: false, remaining: 0 };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        userTier,
        isTrialActive,
        trialTimeRemaining,
        oauthError,
        clearOAuthError,
        login,
        signup,
        loginWithOAuth,
        logout,
        upgradeTier,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
