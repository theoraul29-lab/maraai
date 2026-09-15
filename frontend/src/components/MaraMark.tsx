/** Mara's mark: a central orchestrator node with six satellite agents around it. */
export function MaraMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mcc-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="maraMarkCore" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#bff3fb" />
          <stop offset="55%" stopColor="#4fd7e8" />
          <stop offset="100%" stopColor="#1c7f8c" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="#3a5a60" strokeWidth={1}>
        <line x1={50} y1={50} x2={50} y2={12} />
        <line x1={50} y1={50} x2={83} y2={30} />
        <line x1={50} y1={50} x2={83} y2={70} />
        <line x1={50} y1={50} x2={50} y2={88} />
        <line x1={50} y1={50} x2={17} y2={70} />
        <line x1={50} y1={50} x2={17} y2={30} />
      </g>
      <g fill="#0d1418" stroke="#4fd7e8" strokeWidth={1.5}>
        <circle cx={50} cy={12} r={7} />
        <circle cx={83} cy={30} r={7} />
        <circle cx={83} cy={70} r={7} />
        <circle cx={50} cy={88} r={7} />
        <circle cx={17} cy={70} r={7} />
        <circle cx={17} cy={30} r={7} />
      </g>
      <circle cx={50} cy={50} r={17} fill="url(#maraMarkCore)" />
    </svg>
  );
}
