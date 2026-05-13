import { useState, useEffect, useRef } from 'react';
import './AdminMaraChat.css';

interface BrainStatus {
  enabled: boolean;
  running: boolean;
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  cycleCount: number;
  errorCount: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface Experiment {
  id: number;
  title: string;
  description: string;
  status: string;
  module: string;
  createdAt: string;
}

type Tab = 'chat' | 'status' | 'experiments' | 'knowledge';

export default function AdminMaraChat() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Status state
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Experiments state
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [expsLoading, setExpsLoading] = useState(false);

  // Knowledge state
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [knowledgeResults, setKnowledgeResults] = useState<string[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'status') fetchStatus();
    if (activeTab === 'experiments') fetchExperiments();
  }, [activeTab]);

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/admin/brain/status', { credentials: 'include' });
      if (res.ok) setStatus(await res.json());
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchExperiments = async () => {
    setExpsLoading(true);
    try {
      const res = await fetch('/api/admin/mara/experiments?status=proposed', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setExperiments(json.experiments ?? []);
      }
    } finally {
      setExpsLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text, ts: Date.now() }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/admin/mara/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply ?? '…', ts: Date.now() }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error contacting Mara.', ts: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const triggerBrainCycle = async () => {
    try {
      await fetch('/api/admin/brain/trigger', { method: 'POST', credentials: 'include' });
      setTimeout(fetchStatus, 1500);
    } catch {}
  };

  const approveExperiment = async (id: number) => {
    await fetch(`/api/admin/mara/experiments/${id}/approve`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchExperiments();
  };

  const rejectExperiment = async (id: number) => {
    await fetch(`/api/admin/mara/experiments/${id}/reject`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchExperiments();
  };

  const searchKnowledge = async () => {
    const q = knowledgeQuery.trim();
    if (!q) return;
    setKnowledgeLoading(true);
    try {
      const res = await fetch(`/api/admin/mara/code/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setKnowledgeResults(json.files ?? []);
      }
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'chat', label: '💬 Chat' },
    { id: 'status', label: '📊 Status' },
    { id: 'experiments', label: '🧪 Experiments' },
    { id: 'knowledge', label: '🔍 Knowledge' },
  ];

  return (
    <div className="amc-container">
      <header className="amc-header">
        <h1>🧠 Mara Command Center</h1>
        <p className="amc-header-sub">Admin interface for the autonomous Mara brain</p>
      </header>

      <nav className="amc-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`amc-tab${activeTab === t.id ? ' amc-tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="amc-body">
        {/* ── CHAT ── */}
        {activeTab === 'chat' && (
          <div className="amc-chat">
            <div className="amc-messages">
              {messages.length === 0 && (
                <div className="amc-empty">Ask Mara anything about the platform's growth strategy, experiments, or learning cycles.</div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`amc-msg amc-msg--${m.role}`}>
                  <div className="amc-msg__bubble">{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="amc-msg amc-msg--assistant">
                  <div className="amc-msg__bubble amc-msg__bubble--loading">Mara is thinking…</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="amc-input-row">
              <input
                className="amc-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask Mara…"
                disabled={chatLoading}
              />
              <button className="amc-send" onClick={sendMessage} disabled={chatLoading || !input.trim()}>
                Send
              </button>
            </div>
          </div>
        )}

        {/* ── STATUS ── */}
        {activeTab === 'status' && (
          <div className="amc-status">
            {statusLoading && <p className="amc-loading">Loading…</p>}
            {status && (
              <>
                <div className="amc-status-grid">
                  <div className="amc-stat">
                    <div className="amc-stat__label">Enabled</div>
                    <div className={`amc-stat__value ${status.enabled ? 'amc-green' : 'amc-red'}`}>{status.enabled ? 'Yes' : 'No'}</div>
                  </div>
                  <div className="amc-stat">
                    <div className="amc-stat__label">Running</div>
                    <div className={`amc-stat__value ${status.running ? 'amc-green' : 'amc-muted'}`}>{status.running ? 'Active' : 'Idle'}</div>
                  </div>
                  <div className="amc-stat">
                    <div className="amc-stat__label">Cycles</div>
                    <div className="amc-stat__value">{status.cycleCount}</div>
                  </div>
                  <div className="amc-stat">
                    <div className="amc-stat__label">Errors</div>
                    <div className={`amc-stat__value ${status.errorCount > 0 ? 'amc-red' : 'amc-green'}`}>{status.errorCount}</div>
                  </div>
                </div>
                <div className="amc-status-times">
                  <p><span>Last cycle:</span> {status.lastCycleAt ?? 'Never'}</p>
                  <p><span>Next cycle:</span> {status.nextCycleAt ?? 'Unknown'}</p>
                </div>
                <button className="amc-btn amc-btn--primary" onClick={triggerBrainCycle}>
                  ⚡ Trigger Brain Cycle
                </button>
              </>
            )}
            <button className="amc-btn amc-btn--ghost" onClick={fetchStatus}>Refresh</button>
          </div>
        )}

        {/* ── EXPERIMENTS ── */}
        {activeTab === 'experiments' && (
          <div className="amc-experiments">
            {expsLoading && <p className="amc-loading">Loading…</p>}
            {!expsLoading && experiments.length === 0 && (
              <div className="amc-empty">No pending experiments.</div>
            )}
            {experiments.map((exp) => (
              <div key={exp.id} className="amc-exp-card">
                <div className="amc-exp-card__header">
                  <span className="amc-exp-card__module">{exp.module}</span>
                  <span className="amc-exp-card__status">{exp.status}</span>
                </div>
                <div className="amc-exp-card__title">{exp.title}</div>
                <div className="amc-exp-card__desc">{exp.description}</div>
                <div className="amc-exp-card__actions">
                  <button className="amc-btn amc-btn--approve" onClick={() => approveExperiment(exp.id)}>Approve</button>
                  <button className="amc-btn amc-btn--reject" onClick={() => rejectExperiment(exp.id)}>Reject</button>
                </div>
              </div>
            ))}
            <button className="amc-btn amc-btn--ghost" onClick={fetchExperiments}>Refresh</button>
          </div>
        )}

        {/* ── KNOWLEDGE ── */}
        {activeTab === 'knowledge' && (
          <div className="amc-knowledge">
            <div className="amc-knowledge-search">
              <input
                className="amc-input"
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchKnowledge()}
                placeholder="Search codebase knowledge…"
              />
              <button className="amc-btn amc-btn--primary" onClick={searchKnowledge} disabled={knowledgeLoading}>
                Search
              </button>
            </div>
            {knowledgeLoading && <p className="amc-loading">Searching…</p>}
            {!knowledgeLoading && knowledgeResults.length === 0 && knowledgeQuery && (
              <div className="amc-empty">No results.</div>
            )}
            <ul className="amc-knowledge-results">
              {knowledgeResults.map((f, i) => (
                <li key={i} className="amc-knowledge-result">{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
