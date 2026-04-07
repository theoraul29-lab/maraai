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
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithOAuth: (provider: 'google' | 'facebook') => Promise<void>;
  logout: () => void;
  upgradeTier: (newTier: UserTier) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setIsAuthenticated(true);
    }
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
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error('Login failed');

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
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) throw new Error('Signup failed');

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
    try {
      const response = await fetch(`/api/auth/oauth/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`OAuth login failed for ${provider}`);

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
      console.error('OAuth error:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
  };

  const upgradeTier = async (newTier: UserTier): Promise<void> => {
    if (!user) throw new Error('No user logged in');

    try {
      const response = await fetch('/api/user/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        login,
        signup,
        loginWithOAuth,
        logout,
        upgradeTier,
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
