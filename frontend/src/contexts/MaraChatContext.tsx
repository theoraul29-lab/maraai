// Shared open/interaction state for the Mara chat experience. Previously
// `MaraChatWidget` owned `isOpen` as local state, so nothing else could open
// it — the home page's central orb needs to trigger the exact same chat
// surface (not a second one), which is the only reason this exists.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type MaraOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface MaraChatContextValue {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  orbState: MaraOrbState;
  setOrbState: (state: MaraOrbState) => void;
  moodColor: string;
  setMoodColor: (color: string) => void;
  // Set right before closing the chat to open AuthModal for a sign-up/login
  // that started from a Mara conversation (guest limit CTA, "sign in to
  // chat" CTA). OnboardingGuard (App.tsx) checks this once auth succeeds:
  // if true, it skips the generic onboarding redirect and reopens the chat
  // instead, so the user lands back in their conversation rather than a
  // profile-setup wizard. A signup/login that did NOT go through one of
  // those CTAs never sets this, so onboarding behaves exactly as before.
  pendingMaraReturn: boolean;
  setPendingMaraReturn: (value: boolean) => void;
}

const DEFAULT_MOOD_COLOR = '#8b5cf6';

const MaraChatContext = createContext<MaraChatContextValue | null>(null);

export function MaraChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [orbState, setOrbState] = useState<MaraOrbState>('idle');
  const [moodColor, setMoodColor] = useState(DEFAULT_MOOD_COLOR);
  const [pendingMaraReturn, setPendingMaraReturn] = useState(false);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const toggleChat = useCallback(() => setIsOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({
      isOpen, openChat, closeChat, toggleChat, orbState, setOrbState, moodColor, setMoodColor,
      pendingMaraReturn, setPendingMaraReturn,
    }),
    [isOpen, openChat, closeChat, toggleChat, orbState, moodColor, pendingMaraReturn],
  );

  return <MaraChatContext.Provider value={value}>{children}</MaraChatContext.Provider>;
}

export function useMaraChat(): MaraChatContextValue {
  const ctx = useContext(MaraChatContext);
  if (!ctx) throw new Error('useMaraChat must be used within a MaraChatProvider');
  return ctx;
}
