import { useEffect, useRef } from 'react';
import type { AgentCatalogEntry } from '../types/control';
import { useMaraCore } from '../hooks/useMaraCore';

const RISK_ICON: Record<string, string> = {
  READ_ONLY: '◎',
  LOW_RISK: '○',
  MODERATE_RISK: '◐',
  HIGH_RISK: '◑',
  CRITICAL: '●',
};

/**
 * The Nexus Core centerpiece: Mara's living presence, with every registered
 * agent orbiting her as a connected satellite (the real catalog — same data
 * as the old standalone Agents topology panel, now the focal point instead
 * of one tile among several), and her chat + voice directly underneath.
 */
export function MaraCore({ agents }: { agents: AgentCatalogEntry[] }) {
  const { messages, sending, listening, speaking, voiceSupported, recognitionBlocked, statusNote, sendMessage, toggleListening } = useMaraCore();
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = inputRef.current?.value.trim();
    if (!value) return;
    void sendMessage(value);
    if (inputRef.current) inputRef.current.value = '';
  }

  const cx = 50;
  const cy = 42;
  const r = 34;

  return (
    <div className="mcc-nexus">
      <div className="mcc-nexus-topology">
        <svg className="mcc-topology-links" viewBox="0 0 100 100" preserveAspectRatio="none">
          {agents.map((agent, i) => {
            const angle = (Math.PI * 2 * i) / agents.length - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            const active = agent.risk === 'HIGH_RISK' || agent.risk === 'CRITICAL';
            return <line key={agent.id} x1={cx} y1={cy} x2={x} y2={y} className={`mcc-topology-link${active ? ' mcc-topology-link--active' : ''}`} />;
          })}
        </svg>

        <button
          type="button"
          className={`mcc-nexus-core-node${listening ? ' mcc-nexus-core-node--listening' : ''}${speaking ? ' mcc-nexus-core-node--speaking' : ''}`}
          style={{ left: `${cx}%`, top: `${cy}%` }}
          onClick={toggleListening}
          disabled={!voiceSupported}
          title={voiceSupported ? (listening ? 'Oprește ascultarea' : 'Vorbește cu Mara') : 'Recunoașterea vocală nu e disponibilă'}
        >
          <span className="mcc-nexus-core-ring" />
          <span className="mcc-nexus-core-label">MARA</span>
        </button>

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

      <div className="mcc-nexus-chat">
        <div className="mcc-nexus-log" ref={logRef}>
          {!messages.length && <p className="mcc-muted">Scrie-i sau vorbește-i Marei — răspunde live, cu vocea, aici.</p>}
          {messages.map((m) => (
            <div className={`mcc-nexus-msg mcc-nexus-msg--${m.role}`} key={m.ts}>
              <span className="mcc-nexus-msg-role">{m.role === 'user' ? 'TU' : 'MARA'}</span>
              <p>{m.content}</p>
            </div>
          ))}
          {sending && <div className="mcc-nexus-msg mcc-nexus-msg--mara mcc-nexus-msg--pending"><span className="mcc-nexus-msg-role">MARA</span><p>…</p></div>}
        </div>
        {statusNote && <p className="mcc-plan-risk">{statusNote}</p>}
        <form className="mcc-nexus-input-row" onSubmit={handleSubmit}>
          <input ref={inputRef} type="text" placeholder="Scrie-i Marei..." disabled={sending} autoComplete="off" />
          <button type="button" className={`mcc-nexus-mic${listening ? ' mcc-nexus-mic--active' : ''}`} onClick={toggleListening} disabled={!voiceSupported} title="Ascultă">
            {listening ? '■' : '●'}
          </button>
          <button type="submit" disabled={sending}>Trimite</button>
        </form>
        <div className="mcc-nexus-status">{speaking ? 'Mara vorbește…' : listening ? 'Ascult…' : recognitionBlocked ? 'Ascultare indisponibilă aici' : 'Idle'}</div>
      </div>
    </div>
  );
}
