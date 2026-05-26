// Admin-only dashboard for the Mara Brain scheduler (PR C).
// Visible at /admin/brain. Backend gates every endpoint via `ADMIN_USER_IDS`.
// Users without admin rights see a 403 message.

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import './AdminBrain.css';

type BrainStatus = {
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastKnowledgeLearned: number | null;
  nextRunAt: string | null;
  cycleIntervalMs: number;
  selfPostIntervalMs: number;
  manualTriggerCooldownMs: number;
  manualTriggerAvailableAt: string | null;
};

type BrainLog = {
  id: number;
  createdAt: string | number | null;
  research: string;
  productIdeas: string;
  devTasks: string;
  growthIdeas: string;
  researchItems?: string[];
  productIdeasItems?: string[];
  devTasksItems?: string[];
  growthIdeasItems?: string[];
};

type Insight = {
  id: number;
  module: string;
  insightType: string;
  title: string;
  description: string;
  priority: string;
  estimatedImpact: string;
  source: string;
  status: string;
  createdAt: string | number | null;
};

type QueueItem = {
  id: number;
  topic: string;
  reason: string;
  priority: string;
  status: string;
  source: string;
  createdAt: string | number | null;
};

type LearningStats = {
  rateLimiter: {
    callsLast24h: number;
    maxPerDay: number;
    remaining: number;
    circuitOpen: boolean;
    circuitOpenUntil: string | null;
  };
  byModule: Record<string, { proposed: number; approved: number; rejected: number; completed: number }>;
  queuePending: number;
  knowledge: { total?: number; byCategory?: Record<string, number> };
};

type ExecutiveStatus = {
  state: {
    lastUpdated: number;
    funnelSummary: string | null;
    activeExperiments: string[];
    recentOutcomes: string[];
    topUserTopics: string[];
    currentPriority: string;
    focusModules: string[];
  };
  signalCount: number;
};

const MODULES = ['you', 'reels', 'missions', 'writers', 'creators', 'vip'];

function formatDate(iso: string | number | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function renderSection(raw: string | undefined, items: string[] | undefined): string {
  if (items && items.length) return items.map((s) => `• ${s}`).join('\n');
  if (typeof raw === 'string' && raw.length) return raw;
  return '—';
}

export default function AdminBrain() {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [logs, setLogs] = useState<BrainLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [tab, setTab] = useState<'cycles' | 'learning' | 'executive'>('cycles');
  const [executive, setExecutive] = useState<ExecutiveStatus | null>(null);

  // Learning tab state
  const [insights, setInsights] = useState<Insight[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('proposed');
  const [newTopic, setNewTopic] = useState('');
  const [newReason, setNewReason] = useState('');
  const [queueMsg, setQueueMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch('/api/admin/brain/status', { credentials: 'include' }),
        fetch('/api/admin/brain/logs?limit=25', { credentials: 'include' }),
      ]);
      if (statusRes.status === 401 || statusRes.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (!statusRes.ok) throw new Error(`status ${statusRes.status}`);
      if (!logsRes.ok) throw new Error(`logs ${logsRes.status}`);
      setStatus(await statusRes.json());
      const logsPayload = await logsRes.json();
      setLogs(Array.isArray(logsPayload?.logs) ? logsPayload.logs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLearning = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (moduleFilter) params.set('module', moduleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const [insightsRes, queueRes, statsRes] = await Promise.all([
        fetch(`/api/admin/learning/insights?${params.toString()}`, { credentials: 'include' }),
        fetch('/api/admin/learning/queue', { credentials: 'include' }),
        fetch('/api/admin/learning/stats', { credentials: 'include' }),
      ]);
      if (insightsRes.status === 401 || insightsRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (insightsRes.ok) {
        const payload = await insightsRes.json();
        setInsights(Array.isArray(payload?.insights) ? payload.insights : []);
      }
      if (queueRes.ok) {
        const payload = await queueRes.json();
        setQueue(Array.isArray(payload?.queue) ? payload.queue : []);
      }
      if (statsRes.ok) setLearningStats(await statsRes.json());
    } catch (err) {
      console.error('[AdminBrain] loadLearning failed:', err);
    }
  }, [moduleFilter, statusFilter]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 10_000);
    return () => clearInterval(poll);
  }, [load]);

  const loadExecutive = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mara/executive', { credentials: 'include' });
      if (res.ok) setExecutive(await res.json());
    } catch (err) {
      console.error('[AdminBrain] loadExecutive failed:', err);
    }
  }, []);

  useEffect(() => {
    if (tab === 'learning') void loadLearning();
    if (tab === 'executive') void loadExecutive();
  }, [tab, loadLearning, loadExecutive]);

  const trigger = useCallback(async () => {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await fetch('/api/admin/brain/trigger', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 202) setTriggerMsg('Cycle started.');
      else if (res.status === 409) setTriggerMsg('A cycle is already running.');
      else if (res.status === 429) setTriggerMsg(`Cooldown active (${Math.ceil((payload.retryAfterMs ?? 0) / 1000)}s left).`);
      else if (res.status === 503) setTriggerMsg('Brain scheduler is disabled.');
      else setTriggerMsg(payload?.message || `Unexpected response ${res.status}`);
      await load();
    } catch (err) {
      setTriggerMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(false);
    }
  }, [load]);

  const updateInsight = useCallback(async (id: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/learning/insights/${id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        alert(`Update failed: ${payload?.error || res.status}`);
      }
      await loadLearning();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadLearning]);

  const addToQueue = useCallback(async () => {
    const topic = newTopic.trim();
    if (!topic) { setQueueMsg('Topic is required'); return; }
    setQueueMsg(null);
    try {
      const res = await fetch('/api/admin/learning/queue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, reason: newReason, priority: 'medium' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setQueueMsg(`Failed: ${payload?.error || res.status}`); return; }
      setQueueMsg(`Added: ${topic}`);
      setNewTopic('');
      setNewReason('');
      await loadLearning();
    } catch (err) {
      setQueueMsg(err instanceof Error ? err.message : String(err));
    }
  }, [newTopic, newReason, loadLearning]);

  if (!isAuthenticated) {
    return (
      <div className="ab-root">
        <h1>Admin · Mara Brain</h1>
        <p className="ab-error">You must be signed in. <a href="/">Go to home</a></p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="ab-root">
        <h1>Admin · Mara Brain</h1>
        <p className="ab-error">
          403 — admin access required. Set your session user id in{' '}
          <code>ADMIN_USER_IDS</code> env var on the server.
        </p>
      </div>
    );
  }

  return (
    <div className="ab-root">
      <header className="ab-header">
        <h1>Mara Brain · Admin</h1>
        <div className="ab-header-actions">
          <a href="/admin/experiments" className="ab-btn">Growth experiments →</a>
          <button
            className="ab-btn"
            onClick={() => void (tab === 'learning' ? loadLearning() : load())}
          >
            Refresh
          </button>
        </div>
      </header>

      <nav className="ab-nav">
        {(['cycles', 'learning', 'executive'] as const).map((t) => (
          <button key={t} className={`ab-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {loading && <p className="ab-msg">Loading…</p>}
      {error && <p className="ab-msg ab-error">Error: {error}</p>}

      {/* ── CYCLES TAB ──────────────────────────────────────────────── */}
      {tab === 'cycles' && status && (
        <>
          <section className="ab-card">
            <h2>Status</h2>
            <div className="ab-status-grid">
              <div className="ab-status-item"><strong>Enabled:</strong> {status.enabled ? 'yes' : 'no'}</div>
              <div className="ab-status-item"><strong>Running now:</strong> {status.running ? 'yes' : 'idle'}</div>
              <div className="ab-status-item"><strong>Last run:</strong> {formatDate(status.lastRunAt)}</div>
              <div className="ab-status-item"><strong>Last duration:</strong> {formatDuration(status.lastDurationMs)}</div>
              <div className="ab-status-item"><strong>Knowledge learned:</strong> {status.lastKnowledgeLearned ?? '—'}</div>
              <div className="ab-status-item"><strong>Next run:</strong> {formatDate(status.nextRunAt)}</div>
              <div className="ab-status-item"><strong>Cycle interval:</strong> {formatDuration(status.cycleIntervalMs)}</div>
              <div className="ab-status-item"><strong>Self-post interval:</strong> {formatDuration(status.selfPostIntervalMs)}</div>
              <div className="ab-status-item" style={{ gridColumn: '1 / -1' }}>
                <strong>Last error:</strong>{' '}
                {status.lastError ? <code className="ab-error">{status.lastError}</code> : '—'}
              </div>
            </div>
            <div className="ab-trigger-row">
              <button
                className="ab-btn ab-btn-primary"
                onClick={() => void trigger()}
                disabled={triggering || !status.enabled || status.running}
              >
                {triggering ? 'Triggering…' : 'Run cycle now'}
              </button>
              {triggerMsg && <span className="ab-trigger-msg">{triggerMsg}</span>}
            </div>
          </section>

          <section className="ab-card">
            <h2>Recent cycles ({logs.length})</h2>
            {logs.length === 0 && <p className="ab-msg">No brain logs yet. The first cycle runs ~30s after server boot.</p>}
            {logs.map((log) => (
              <div key={log.id} className="ab-log-card">
                <div className="ab-log-title">Cycle #{log.id} · {formatDate(log.createdAt)}</div>
                {(['Research', 'Product ideas', 'Dev tasks', 'Growth ideas'] as const).map((label, i) => {
                  const keys = [
                    [log.research, log.researchItems],
                    [log.productIdeas, log.productIdeasItems],
                    [log.devTasks, log.devTasksItems],
                    [log.growthIdeas, log.growthIdeasItems],
                  ][i] as [string, string[] | undefined];
                  return (
                    <details key={label} className="ab-log-details">
                      <summary>{label}</summary>
                      <pre className="ab-log-pre">{renderSection(keys[0], keys[1])}</pre>
                    </details>
                  );
                })}
              </div>
            ))}
          </section>
        </>
      )}

      {/* ── EXECUTIVE TAB ───────────────────────────────────────────── */}
      {tab === 'executive' && (
        <section className="ab-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>ExecutiveReasoning — CognitiveState</h2>
            <button className="ab-btn" onClick={() => void loadExecutive()}>Refresh</button>
          </div>
          {!executive && <p className="ab-msg">Loading…</p>}
          {executive && (
            <>
              <div className="ab-exec-grid">
                <div><strong>Last updated:</strong> {executive.state.lastUpdated ? formatDate(executive.state.lastUpdated) : '—'}</div>
                <div><strong>Signal ring size:</strong> {executive.signalCount} / 50</div>
                <div><strong>Priority:</strong> {executive.state.currentPriority || '—'}</div>
                <div><strong>Focus modules:</strong> {executive.state.focusModules.length ? executive.state.focusModules.join(', ') : '—'}</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <strong>Funnel summary:</strong>
                <div className="ab-exec-funnel">{executive.state.funnelSummary || '— not yet computed —'}</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <strong>Top user topics (signal ring):</strong>
                <div className="ab-exec-chips">
                  {executive.state.topUserTopics.length === 0 && <span className="ab-msg">none yet</span>}
                  {executive.state.topUserTopics.map((t) => <span key={t} className="ab-exec-chip">{t}</span>)}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <strong>Active experiments ({executive.state.activeExperiments.length}):</strong>
                {executive.state.activeExperiments.length === 0 && <p className="ab-msg">none</p>}
                <ul style={{ marginTop: 6, paddingLeft: 20 }}>
                  {executive.state.activeExperiments.map((e, i) => <li key={i} style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>{e}</li>)}
                </ul>
              </div>

              <div>
                <strong>Recent outcomes ({executive.state.recentOutcomes.length}):</strong>
                {executive.state.recentOutcomes.length === 0 && <p className="ab-msg">none</p>}
                {executive.state.recentOutcomes.map((o, i) => (
                  <div key={i} className="ab-exec-outcome">{o}</div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── LEARNING TAB ────────────────────────────────────────────── */}
      {tab === 'learning' && (
        <>
          {learningStats && (
            <section className="ab-card">
              <h2>Learning overview</h2>
              <div className="ab-stats-grid">
                <div className="ab-stat"><strong>LLM calls (24h):</strong> {learningStats.rateLimiter.callsLast24h} / {learningStats.rateLimiter.maxPerDay}</div>
                <div className="ab-stat"><strong>Remaining today:</strong> {learningStats.rateLimiter.remaining}</div>
                <div className="ab-stat">
                  <strong>Circuit:</strong>{' '}
                  {learningStats.rateLimiter.circuitOpen
                    ? <span className="ab-circuit-open">open (paused)</span>
                    : <span className="ab-circuit-closed">closed</span>}
                </div>
                <div className="ab-stat"><strong>Queue pending:</strong> {learningStats.queuePending}</div>
              </div>
              <div>
                <strong>Per-module proposals:</strong>
                <table className="ab-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Proposed</th>
                      <th>Approved</th>
                      <th>Rejected</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => {
                      const b = learningStats.byModule[m] || { proposed: 0, approved: 0, rejected: 0, completed: 0 };
                      return (
                        <tr key={m}>
                          <td style={{ textTransform: 'capitalize', color: '#e0e0e0' }}>{m}</td>
                          <td>{b.proposed}</td>
                          <td>{b.approved}</td>
                          <td>{b.rejected}</td>
                          <td>{b.completed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="ab-card">
            <h2>Growth proposals</h2>
            <div className="ab-filters">
              <label>
                Module:{' '}
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                  <option value="">All</option>
                  {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>
                Status:{' '}
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="proposed">proposed</option>
                  <option value="approved">approved</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                  <option value="rejected">rejected</option>
                  <option value="">all</option>
                </select>
              </label>
            </div>

            {insights.length === 0 && <p className="ab-msg">No proposals match the current filters.</p>}
            {insights.map((ins) => (
              <div key={ins.id} className="ab-insight-card">
                <div className="ab-insight-body">
                  <div className="ab-insight-title">
                    <span className={`ab-priority ab-priority-${ins.priority}`}>{ins.priority}</span>
                    [{ins.module}] {ins.title}
                  </div>
                  <div className="ab-insight-meta">
                    impact: {ins.estimatedImpact} · {ins.insightType} · source: {ins.source} · status: <strong>{ins.status}</strong> · {formatDate(ins.createdAt)}
                  </div>
                  <p className="ab-insight-desc">{ins.description}</p>
                </div>
                <div className="ab-insight-actions">
                  <button disabled={ins.status === 'approved'} onClick={() => void updateInsight(ins.id, 'approved')} className="ab-btn ab-btn-approve">Approve</button>
                  <button disabled={ins.status === 'rejected'} onClick={() => void updateInsight(ins.id, 'rejected')} className="ab-btn ab-btn-reject">Reject</button>
                  <button disabled={ins.status === 'completed'} onClick={() => void updateInsight(ins.id, 'completed')} className="ab-btn ab-btn-done">Mark done</button>
                </div>
              </div>
            ))}
          </section>

          <section className="ab-card">
            <h2>Reading / research queue ({queue.length} pending)</h2>
            <div className="ab-queue-row">
              <input
                className="ab-input"
                type="text"
                placeholder="Topic (e.g. 'Hormozi $100M Offers')"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
              />
              <input
                className="ab-input"
                type="text"
                placeholder="Why Mara should learn this"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
              <button onClick={() => void addToQueue()} className="ab-btn ab-btn-primary">Add to queue</button>
            </div>
            {queueMsg && <p className="ab-msg">{queueMsg}</p>}

            {queue.length === 0 && <p className="ab-msg">Queue is empty.</p>}
            {queue.map((item) => (
              <div key={item.id} className="ab-queue-item">
                <div className="ab-queue-item-title">{item.topic}</div>
                <div className="ab-queue-item-meta">priority: {item.priority} · source: {item.source} · {formatDate(item.createdAt)}</div>
                {item.reason && <div className="ab-queue-item-reason">{item.reason}</div>}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
