import { useEffect, useState } from 'react';

// The one shared "is this a phone" answer for the whole app. Previously this
// lived only inside HomePage.tsx (private, used to choose between the
// desktop orbital layout and MobileOrbHome) while every other screen decided
// "mobile or not" independently via its own CSS @media queries — at exactly
// 768px width, HomePage's strict `< 768` said desktop while most CSS's
// `max-width: 768px` (inclusive) said mobile, a real, confirmed disagreement
// band. `<=` here removes that specific gap. This does not attempt to unify
// every CSS file's own breakpoint value (many are legitimately different for
// their own content's needs) — just the one JS decision point that used to
// disagree with the CSS most other screens already converge on.
export const MOBILE_BREAKPOINT_PX = 768;

function computeIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth <= MOBILE_BREAKPOINT_PX ||
    /mobile|android|iphone|ipad|phone/i.test(navigator.userAgent)
  );
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(computeIsMobile());
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}
