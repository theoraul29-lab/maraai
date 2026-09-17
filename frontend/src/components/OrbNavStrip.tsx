import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/OrbNavStrip.css';

// Idea 3 from the design-unification discussion: a small echo of the
// homepage's orbital module picker, placed on every module page so any
// other module is one click away — same real routes Nav.tsx and the
// homepage orbs already use, same ids/colors as OrbitalStyles.css.
const MODULES = [
  { id: 'you', to: '/you', icon: '👤', label: 'You' },
  { id: 'reels', to: '/reels', icon: '🎬', label: 'Sparks' },
  { id: 'missions', to: '/missions', icon: '🎯', label: 'Missions' },
  { id: 'writers', to: '/writers-hub', icon: '✍️', label: 'Writers' },
  { id: 'creators', to: '/creator-panel', icon: '✨', label: 'Creators' },
  { id: 'programs', to: '/pricing', icon: '💎', label: 'VIP' },
] as const;

interface Props {
  current: (typeof MODULES)[number]['id'];
}

const OrbNavStrip: React.FC<Props> = ({ current }) => (
  <div className="orbit-nav-strip" role="navigation" aria-label="Module shortcuts">
    {MODULES.map((m) => (
      <Link
        key={m.id}
        to={m.to}
        className={`orbit-nav-chip${m.id === current ? ' is-current' : ''}`}
        data-module={m.id}
        aria-current={m.id === current ? 'page' : undefined}
      >
        <span className="orbit-nav-orb">{m.icon}</span>
        <span className="orbit-nav-label">{m.label}</span>
      </Link>
    ))}
  </div>
);

export default OrbNavStrip;
