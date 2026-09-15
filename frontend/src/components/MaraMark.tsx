/** Mara's mark: a geometric M built from circuit-board traces, with a glowing neon core at its center vertex. */
export function MaraMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mcc-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="maraMarkM" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a6f4ff" />
          <stop offset="45%" stopColor="#4fd7e8" />
          <stop offset="100%" stopColor="#2d7dff" />
        </linearGradient>
        <radialGradient id="maraMarkCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#c9fbff" />
          <stop offset="100%" stopColor="#4fd7e8" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* circuit stub traces */}
      <g stroke="#2f7d8c" strokeWidth={0.9} fill="none" opacity={0.6}>
        <path d="M25 74 H14 V64" />
        <path d="M75 74 H86 V64" />
        <path d="M25 26 H14 V36" />
        <path d="M75 26 H86 V36" />
        <path d="M50 58 H62" />
        <path d="M50 58 H38" />
      </g>
      <g fill="#0a0f12" stroke="#3f9aa8" strokeWidth={0.9}>
        <rect x={12} y={61} width={4} height={4} />
        <rect x={84} y={61} width={4} height={4} />
        <rect x={12} y={33} width={4} height={4} />
        <rect x={84} y={33} width={4} height={4} />
        <circle cx={63.5} cy={58} r={1.7} />
        <circle cx={36.5} cy={58} r={1.7} />
      </g>

      {/* the M, chamfered circuit-trace style */}
      <path
        d="M25,75 V29 L34,20 H36 L50,44 L64,20 H66 L75,29 V75"
        fill="none" stroke="url(#maraMarkM)" strokeWidth={4.4} strokeLinejoin="round" strokeLinecap="round"
      />

      {/* via nodes at structural vertices */}
      <g fill="#081014" stroke="url(#maraMarkM)" strokeWidth={1.5}>
        <circle cx={25} cy={75} r={2.8} />
        <circle cx={25} cy={29} r={2.8} />
        <circle cx={75} cy={29} r={2.8} />
        <circle cx={75} cy={75} r={2.8} />
      </g>

      {/* glowing central core */}
      <circle cx={50} cy={58} r={6.4} fill="url(#maraMarkCore)" />
      <circle cx={50} cy={58} r={2.6} fill="#ffffff" />
    </svg>
  );
}
