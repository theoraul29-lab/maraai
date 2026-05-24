import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', setTheme: () => {} });

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('mara_theme', t);
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('mara_theme') as Theme) || 'dark';
  });

  // Apply on mount and whenever theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sync from server when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/user/theme', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.theme && data.theme !== theme) {
          setThemeState(data.theme as Theme);
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    if (isAuthenticated) {
      fetch('/api/user/theme', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
