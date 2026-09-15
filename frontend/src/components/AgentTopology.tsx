import type { AgentCatalogEntry } from '../types/control';

const RISK_ICON: Record<string, string> = {
  READ_ONLY: '◎',
  LOW_RISK: '○',
  MODERATE_RISK: '◐',
  HIGH_RISK: '◑',
  CRITICAL: '●',
};

/** Live hub-and-spoke view of the real agent catalog: Mara as orchestrator, each agent as a satellite node. */
export function AgentTopology({ agents }: { agents: AgentCatalogEntry[] }) {
  if (!agents.length) return null;
  const cx = 50;
  const cy = 50;
  const r = 38;

  return (
    <div className="mcc-topology">
      <svg className="mcc-topology-links" viewBox="0 0 100 100" preserveAspectRatio="none">
        {agents.map((agent, i) => {
          const angle = (Math.PI * 2 * i) / agents.length - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const active = agent.risk === 'HIGH_RISK' || agent.risk === 'CRITICAL';
          return (
            <line
              key={agent.id}
              x1={cx} y1={cy} x2={x} y2={y}
              className={`mcc-topology-link${active ? ' mcc-topology-link--active' : ''}`}
            />
          );
        })}
      </svg>
      <div className="mcc-topology-node mcc-topology-node--center" style={{ left: `${cx}%`, top: `${cy}%` }}>
        <div className="mcc-topology-ring">{'◈'}</div>
        <div className="mcc-topology-lbl">MARA</div>
        <div className="mcc-topology-risk">orchestrator</div>
      </div>
      {agents.map((agent, i) => {
        const angle = (Math.PI * 2 * i) / agents.length - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return (
          <div className="mcc-topology-node" key={agent.id} style={{ left: `${x}%`, top: `${y}%` }} title={agent.role}>
            <div className="mcc-topology-ring">{RISK_ICON[agent.risk] ?? '○'}</div>
            <div className="mcc-topology-lbl">{agent.label}</div>
            <div className={`mcc-topology-risk mcc-topology-risk--${agent.risk.toLowerCase()}`}>{agent.risk.replace('_', ' ').toLowerCase()}</div>
          </div>
        );
      })}
    </div>
  );
}
