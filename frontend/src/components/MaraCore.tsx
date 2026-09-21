import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentCatalogEntry } from '../types/control';
import { useMaraCore } from '../hooks/useMaraCore';
import { copyToClipboard, stripMarkdown } from '../lib/clipboard';

const RISK_ICON: Record<string, string> = {
  READ_ONLY: '◎',
  LOW_RISK: '○',
  MODERATE_RISK: '◐',
  HIGH_RISK: '◑',
  CRITICAL: '●',
};

const RISK_LABEL_KEY: Record<string, string> = {
  READ_ONLY: 'mara.risk.readOnly',
  LOW_RISK: 'mara.risk.low',
  MODERATE_RISK: 'mara.risk.moderate',
  HIGH_RISK: 'mara.risk.high',
  CRITICAL: 'mara.risk.critical',
};

const CHAT_IDLE_COLLAPSE_MS = 6000;

/**
 * The Nexus Core centerpiece: Mara's living presence, with every registered
 * agent orbiting her as a connected satellite (the real catalog — same data
 * as the old standalone Agents topology panel, now the focal point instead
 * of one tile among several), and her chat + voice directly underneath.
 *
 * The center orb is a dedicated voice-to-voice control: one click starts a
 * hands-free conversation — Mara auto-detects when the admin stops talking
 * (voice-activity detection, no second click needed), replies out loud, and
 * automatically starts listening again for the next turn, back and forth,
 * until the admin clicks again to end it. The chat log below is for typed
 * text only and retracts itself when idle so it doesn't compete with the
 * orb for attention.
 */
export function MaraCore({ agents }: { agents: AgentCatalogEntry[] }) {
  const { t } = useTranslation();
  const {
    messages, sending, listening, transcribing, speaking,
    voiceSupported, recognitionBlocked, statusNote, sendMessage, toggleConversation, conversationActive,
    ttsSupported, voiceStyle, setVoiceStyle,
  } = useMaraCore();
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedTs, setCopiedTs] = useState<number | null>(null);

  const handleCopyMessage = useCallback(async (content: string, ts: number) => {
    const ok = await copyToClipboard(stripMarkdown(content));
    if (ok) {
      setCopiedTs(ts);
      setTimeout(() => setCopiedTs((cur) => (cur === ts ? null : cur)), 2000);
    }
  }, []);

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
    ? t('mara.orb.voiceUnavailable', 'Voice recognition is not available')
    : conversationActive
      ? (transcribing
          ? t('mara.orb.transcribing', 'Mara is transcribing what you said…')
          : listening
            ? t('mara.orb.listening', "I'm listening — speak freely, I'll stop on my own")
            : speaking
              ? t('mara.orb.speaking', 'Mara is speaking — click to stop her')
              : t('mara.orb.activeConversation', 'Active conversation — click to end'))
      : t('mara.orb.pressToTalk', 'Press and talk to Mara — continuous conversation, no extra clicks');

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
          className={`mcc-nexus-core-node${orbState !== 'idle' ? ` mcc-nexus-core-node--${orbState}` : conversationActive ? ' mcc-nexus-core-node--conversation' : ''}`}
          style={{ left: `${cx}%`, top: `${cy}%` }}
          onClick={toggleConversation}
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
                    <span className={`mcc-topology-risk mcc-topology-risk--${agent.risk.toLowerCase()}`}>{RISK_LABEL_KEY[agent.risk] ? t(RISK_LABEL_KEY[agent.risk]) : agent.risk}</span>
                    <span className="mcc-agent-tooltip-exec">{agent.execution}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`mcc-nexus-chat${chatOpen ? '' : ' mcc-nexus-chat--collapsed'}`}>
        <button type="button" className="mcc-nexus-chat-toggle" onClick={toggleChat} title={chatOpen ? t('mara.chat.hide', 'Hide the text chat') : t('mara.chat.show', 'Show the text chat')}>
          <span className={`mcc-nexus-chat-arrow${chatOpen ? ' mcc-nexus-chat-arrow--down' : ' mcc-nexus-chat-arrow--up'}`}>▲</span>
          <span>{t('mara.chat.title', 'Text chat')}</span>
        </button>
        <div className="mcc-nexus-chat-body">
          <div className="mcc-nexus-log" ref={logRef}>
            {!messages.length && <p className="mcc-muted">{t('mara.chat.emptyState', 'Write to Mara here — for voice, use the orb above.')}</p>}
            {messages.map((m) => (
              <div className={`mcc-nexus-msg mcc-nexus-msg--${m.role}`} key={m.ts}>
                <span className="mcc-nexus-msg-role">{m.role === 'user' ? t('mara.chat.you', 'YOU') : 'MARA'}</span>
                <p>{m.content}</p>
                <button
                  type="button"
                  className={`mcc-nexus-msg-copy${copiedTs === m.ts ? ' mcc-nexus-msg-copy--done' : ''}`}
                  onClick={() => handleCopyMessage(m.content, m.ts)}
                  title={copiedTs === m.ts ? t('mara.chat.copied', 'Copied!') : t('mara.chat.copyMessage', 'Copy message')}
                  aria-label={t('mara.chat.copyMessage', 'Copy message')}
                >
                  {copiedTs === m.ts ? '✓' : '📋'}
                </button>
              </div>
            ))}
            {sending && <div className="mcc-nexus-msg mcc-nexus-msg--mara mcc-nexus-msg--pending"><span className="mcc-nexus-msg-role">MARA</span><p>…</p></div>}
          </div>
          {statusNote && <p className="mcc-plan-risk">{statusNote}</p>}
          <form className="mcc-nexus-input-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('mara.chat.placeholder', 'Write to Mara...')}
              disabled={sending}
              autoComplete="off"
              onFocus={scheduleIdleCollapse}
              onChange={scheduleIdleCollapse}
            />
            <button type="submit" disabled={sending}>{t('mara.chat.send', 'Send')}</button>
          </form>
          <div className="mcc-nexus-footer-row">
            {ttsSupported && (
              <div className="mcc-voice-picker" title={t('mara.voice.title', "Mara's voice")}>
                <button
                  type="button"
                  className={`mcc-voice-picker-btn${voiceStyle === 'male' ? ' mcc-voice-picker-btn--active' : ''}`}
                  onClick={() => setVoiceStyle('male')}
                >
                  {t('mara.voice.male', 'Male')}
                </button>
                <button
                  type="button"
                  className={`mcc-voice-picker-btn${voiceStyle === 'female' ? ' mcc-voice-picker-btn--active' : ''}`}
                  onClick={() => setVoiceStyle('female')}
                >
                  {t('mara.voice.female', 'Female')}
                </button>
              </div>
            )}
            <div className="mcc-nexus-status">
              {transcribing
                ? t('mara.status.transcribing', 'Mara is transcribing…')
                : speaking
                  ? t('mara.status.speaking', 'Mara is speaking…')
                  : listening
                    ? t('mara.status.listening', 'Listening…')
                    : conversationActive
                      ? t('mara.status.activeConversation', 'Active conversation…')
                      : recognitionBlocked
                        ? t('mara.status.listeningUnavailable', 'Listening unavailable here')
                        : t('mara.status.idle', 'Idle')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
