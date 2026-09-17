// Shared module list for every "echo of the homepage orbs" navigation
// surface — OrbNavStrip (desktop/tablet, under each module's header) and
// MobileBottomNav (phone, replaces it at thumb height). One list so both
// stay in sync automatically; ids/colors match OrbitalStyles.css exactly.
export const ORBIT_MODULES = [
  { id: 'you', to: '/you', icon: '👤', label: 'You' },
  { id: 'reels', to: '/reels', icon: '🎬', label: 'Sparks' },
  { id: 'missions', to: '/missions', icon: '🎯', label: 'Missions' },
  { id: 'writers', to: '/writers-hub', icon: '✍️', label: 'Writers' },
  { id: 'creators', to: '/creator-panel', icon: '✨', label: 'Creators' },
  { id: 'programs', to: '/pricing', icon: '💎', label: 'VIP' },
] as const;

export type OrbitModuleId = (typeof ORBIT_MODULES)[number]['id'];

// Same set OrbNavStrip/MobileBottomNav appear on — Missions, You, Sparks,
// Writers Hub, Creator Panel, Pricing. Kept here so Nav.tsx and any future
// consumer read one definition instead of re-typing the path list.
export const ORBIT_STRIP_PATHS = ['/missions', '/you', '/reels', '/writers-hub', '/creator-panel', '/pricing'] as const;
