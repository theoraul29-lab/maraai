import React from 'react';
import { Link } from 'react-router-dom';
import { ORBIT_MODULES, type OrbitModuleId } from '../lib/orbitModules';
import '../styles/OrbNavStrip.css';

// Idea 3 from the design-unification discussion: a small echo of the
// homepage's orbital module picker, placed on every module page so any
// other module is one click away — same real routes Nav.tsx and the
// homepage orbs already use, same ids/colors as OrbitalStyles.css.
//
// Hidden on phone widths (see OrbNavStrip.css) — MobileBottomNav shows the
// same 6 destinations at thumb height there instead. Showing both at once
// would reproduce the exact "old bar + new bar" duplication already
// reported and fixed once for Nav.tsx's own link row.
interface Props {
  current: OrbitModuleId;
}

const OrbNavStrip: React.FC<Props> = ({ current }) => (
  <div className="orbit-nav-strip" role="navigation" aria-label="Module shortcuts">
    {ORBIT_MODULES.map((m) => (
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
