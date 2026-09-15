import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentCatalogEntry } from '../types/control';
import { useMaraCore } from '../hooks/useMaraCore';

const RISK_ICON: Record<string, string> = {
  READ_ONLY: '◎',
  LOW_RISK: '○',
  MODERATE_RISK: '◐',
  HIGH_RISK: '◑',
  CRITICAL: '●',
};

const RISK_LABEL: Record<string, string> = {
  READ_ONLY: 'doar citește',
  LOW_RISK: 'risc scăzut',
  MODERATE_RISK: 'risc moderat',
  HIGH_RISK: 'risc ridicat',
  CRITICAL: 'critic',
};

const CHAT_IDLE_COLLAPSE_MS = 6000;

/**
 * The Nexus Core centerpiece: Mara's living presence, with every registered
 * agent orbiting her as a connected satellite (the real catalog — same data
 * as the old standalone Agents topology panel, now the focal point instead
 * of one tile among several), and her chat + voice directly underneath.
 *
 * The center orb is a dedicated voice-to-voice control (click to speak,
 * click again to send what was heard — Mara answers back out loud). The
 * chat log below is for typed text only and retracts itself when idle so
 * it doesn't compete with the orb for attention.
 */
export function MaraCore({ agents }: { agents: AgentCatalogEntry[] }) {
  const {
    messages, sending, listening, transcribing, speaking,
    voiceSupported, recognitionBlocked, statusNote, sendMessage, toggleListening,
  } = useMaraCore();
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleIdleCollapse = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (document.activeElement === inputRef.current) {
        scheduleIdleCollapse();
        return;
      }
      setChatOpen(false);
    }, CHAT_IDLE_COLLAPSE_MS);
  }, []);

  useEffect(() => {
    scheduleIdleCollapse();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [scheduleIdleCollapse]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    if (messages.length) {
      setChatOpen(true);
      scheduleIdleCollapse();
    }
  }, [messages, sending, scheduleIdleCollapse]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = inputRef.current?.value.trim();
    if (!value) return;
    void sendMessage(value);
    if (inputRef.current) inputRef.current.value = '';
  }

  function toggleChat() {
    setChatOpen((open) => {
      const next = !open;
      if (next) scheduleIdleCollapse();
      else if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return next;
    });
  }

  const cx = 50;
  const cy = 42;
  const r = 34;

  const orbState = transcribing ? 'transcribing' : listening ? 'listening' : speaking ? 'speaking' : 'idle';
  const orbLabel = !voiceSupported
    ? 'Recunoașterea vocală nu e disponibilă'
    : transcribing
      ? 'Mara transcrie ce ai spus…'
      : listening
        ? 'Ascult — apasă din nou ca să opresc'
        : 'Apasă și vorbește cu Mara';

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
          className={`mcc-nexus-core-node${orbState !== 'idle' ? ` mcc-nexus-core-node--${orbState}` : ''}`}
          style={{ left: `${cx}%`, top: `${cy}%` }}
          onClick={toggleListening}
          disabled={!voiceSupported || transcribing}
          title={orbLabel}
        >
          <span className="mcc-nexus-core-ring" />
          <span className="mcc-nexus-core-label">MARA</span>
        </button>

        {agents.map((agent, i) => {
          const angle = (Math.PI * 2 * i) / agents.length - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const isHovered = hoveredAgent === agent.id;
          return (
            <div
              className="mcc-topology-node"
              key={agent.id}
              style={{ left: `${x}%`, top: `${y}%` }}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent((current) => (current === agent.id ? null : current))}
            >
              <div className="mcc-topology-ring">{RISK_ICON[agent.risk] ?? '○'}</div>
              <div className="mcc-topology-lbl">{agent.label}</div>
              <div className={`mcc-topology-risk mcc-topology-risk--${agent.risk.toLowerCase()}`}>{agent.risk.replace('_', ' ').toLowerCase()}</div>
              {isHovered && (
                <div className={`mcc-agent-tooltip${x > 55 ? ' mcc-agent-tooltip--left' : ''}`}>
                  <div className="mcc-agent-tooltip-title">{agent.label}</div>
                  <p className="mcc-agent-tooltip-role">{agent.role}</p>
                  {agent.capabilities.length > 0 && (
                    <ul className="mcc-agent-tooltip-caps">
                      {agent.capabilities.slice(0, 4).map((cap) => <li key={cap}>{cap}</li>)}
                    </ul>
                  )}
                  <div className="mcc-agent-tooltip-meta">
                    <span className={`mcc-topology-risk mcc-topology-risk--${agent.risk.toLowerCase()}`}>{RISK_LABEL[agent.risk] ?? agent.risk}</span>
                    <span className="mcc-agent-tooltip-exec">{agent.execution}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`mcc-nexus-chat${chatOpen ? '' : ' mcc-nexus-chat--collapsed'}`}>
        <button type="button" className="mcc-nexus-chat-toggle" onClick={toggleChat} title={chatOpen ? 'Ascunde chat-ul scris' : 'Arată chat-ul scris'}>
          <span className={`mcc-nexus-chat-arrow${chatOpen ? ' mcc-nexus-chat-arrow--down' : ' mcc-nexus-chat-arrow--up'}`}>▲</span>
          <span>Chat scris</span>
        </button>
        <div className="mcc-nexus-chat-body">
          <div className="mcc-nexus-log" ref={logRef}>
            {!messages.length && <p className="mcc-muted">Scrie-i Marei aici — pentru voce, folosește orbul de mai sus.</p>}
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
            <input
              ref={inputRef}
              type="text"
              placeholder="Scrie-i Marei..."
              disabled={sending}
              autoComplete="off"
              onFocus={scheduleIdleCollapse}
              onChange={scheduleIdleCollapse}
            />
            <button type="submit" disabled={sending}>Trimite</button>
          </form>
          <div className="mcc-nexus-status">
            {transcribing ? 'Mara transcrie…' : speaking ? 'Mara vorbește…' : listening ? 'Ascult…' : recognitionBlocked ? 'Ascultare indisponibilă aici' : 'Idle'}
          </div>
        </div>
      </div>
    </div>
  );
}
