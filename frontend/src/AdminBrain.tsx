// Admin-only dashboard for the Mara Brain scheduler (PR C).
// Visible at /admin/brain. Backend gates every endpoint via `ADMIN_USER_IDS`.
// Users without admin rights see a 403 message.

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';

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

const MODULES = ['you', 'reels', 'trading', 'writers', 'creators', 'vip'];

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

function priorityColor(p: string): string {
  if (p === 'P0') return '#c00';
  if (p === 'P1') return '#d97706';
  if (p === 'P2') return '#2563eb';
  return '#555';
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
  const [tab, setTab] = useState<'cycles' | 'learning'>('cycles');

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
      if (statsRes.ok) {
        setLearningStats(await statsRes.json());
      }
    } catch (err) {
      console.error('[AdminBrain] loadLearning failed:', err);
    }
  }, [moduleFilter, statusFilter]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 10_000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (tab === 'learning') void loadLearning();
  }, [tab, loadLearning]);

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
    if (!topic) {
      setQueueMsg('Topic is required');
      return;
    }
    setQueueMsg(null);
    try {
      const res = await fetch('/api/admin/learning/queue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, reason: newReason, priority: 'medium' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQueueMsg(`Failed: ${payload?.error || res.status}`);
        return;
      }
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
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Admin · Mara Brain</h1>
        <p style={{ color: '#c00' }}>
          You must be signed in to access this page.{' '}
          <a href="/" style={{ color: '#00c' }}>Go to home</a>
        </p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Admin · Mara Brain</h1>
        <p style={{ color: '#c00' }}>
          403 — admin access required. Set your session user id in
          <code> ADMIN_USER_IDS</code> env var on the server.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Mara Brain · Admin</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/admin/experiments"
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', textDecoration: 'none', color: '#333' }}
          >
            Growth experiments →
          </a>
          <button
            onClick={() => void (tab === 'learning' ? loadLearning() : load())}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #ddd' }}>
        {(['cycles', 'learning'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #000' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#c00' }}>Error: {error}</p>}

      {tab === 'cycles' && status && (
        <>
          <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Status</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div><strong>Enabled:</strong> {status.enabled ? 'yes' : 'no'}</div>
              <div><strong>Running now:</strong> {status.running ? 'yes' : 'idle'}</div>
              <div><strong>Last run:</strong> {formatDate(status.lastRunAt)}</div>
              <div><strong>Last duration:</strong> {formatDuration(status.lastDurationMs)}</div>
              <div><strong>Last knowledge learned:</strong> {status.lastKnowledgeLearned ?? '—'}</div>
              <div><strong>Next run:</strong> {formatDate(status.nextRunAt)}</div>
              <div><strong>Cycle interval:</strong> {formatDuration(status.cycleIntervalMs)}</div>
              <div><strong>Self-post interval:</strong> {formatDuration(status.selfPostIntervalMs)}</div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Last error:</strong> {status.lastError ? <code style={{ color: '#c00' }}>{status.lastError}</code> : '—'}
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => void trigger()}
                disabled={triggering || !status.enabled || status.running}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #333',
                  background: triggering ? '#aaa' : '#000', color: '#fff',
                  cursor: triggering ? 'not-allowed' : 'pointer',
                }}
              >
                {triggering ? 'Triggering…' : 'Run cycle now'}
              </button>
              {triggerMsg && <span style={{ color: '#333' }}>{triggerMsg}</span>}
            </div>
          </section>

          <section>
            <h2>Recent cycles ({logs.length})</h2>
            {logs.length === 0 && <p>No brain logs yet. The first cycle runs ~30s after server boot.</p>}
            {logs.map((log) => (
              <div key={log.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Cycle #{log.id} · {formatDate(log.createdAt)}
                </div>
                <details>
                  <summary>Research</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                    {renderSection(log.research, log.researchItems)}
                  </pre>
                </details>
                <details>
                  <summary>Product ideas</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                    {renderSection(log.productIdeas, log.productIdeasItems)}
                  </pre>
                </details>
                <details>
                  <summary>Dev tasks</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                    {renderSection(log.devTasks, log.devTasksItems)}
                  </pre>
                </details>
                <details>
                  <summary>Growth ideas</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                    {renderSection(log.growthIdeas, log.growthIdeasItems)}
                  </pre>
                </details>
              </div>
            ))}
          </section>
        </>
      )}

      {tab === 'learning' && (
        <>
          {learningStats && (
            <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <h2 style={{ marginTop: 0 }}>Learning overview</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <strong>LLM calls (24h):</strong>{' '}
                  {learningStats.rateLimiter.callsLast24h} / {learningStats.rateLimiter.maxPerDay}
                </div>
                <div><strong>Remaining today:</strong> {learningStats.rateLimiter.remaining}</div>
                <div>
                  <strong>Circuit:</strong>{' '}
                  {learningStats.rateLimiter.circuitOpen ? (
                    <span style={{ color: '#c00' }}>open (paused)</span>
                  ) : (
                    <span>closed</span>
                  )}
                </div>
                <div><strong>Queue pending:</strong> {learningStats.queuePending}</div>
              </div>
              <div>
                <strong>Per-module proposals:</strong>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                  <thead>
                    <tr style={{ background: '#f7f7f7' }}>
                      <th style={{ textAlign: 'left', padding: 6 }}>Module</th>
                      <th style={{ padding: 6 }}>Proposed</th>
                      <th style={{ padding: 6 }}>Approved</th>
                      <th style={{ padding: 6 }}>Rejected</th>
                      <th style={{ padding: 6 }}>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => {
                      const b = learningStats.byModule[m] || { proposed: 0, approved: 0, rejected: 0, completed: 0 };
                      return (
                        <tr key={m} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: 6, textTransform: 'capitalize' }}>{m}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{b.proposed}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{b.approved}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{b.rejected}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{b.completed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Growth proposals</h2>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label>
                Module:{' '}
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                  <option value="">All</option>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
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

            {insights.length === 0 && <p>No proposals match the current filters.</p>}
            {insights.map((ins) => (
              <div key={ins.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      <span style={{ color: priorityColor(ins.priority), marginRight: 6 }}>{ins.priority}</span>
                      [{ins.module}] {ins.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
                      impact: {ins.estimatedImpact} · {ins.insightType} · source: {ins.source} · status:{' '}
                      <strong>{ins.status}</strong> · {formatDate(ins.createdAt)}
                    </div>
                    <p style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{ins.description}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
                    <button
                      disabled={ins.status === 'approved'}
                      onClick={() => void updateInsight(ins.id, 'approved')}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #0a7', background: '#fff', cursor: 'pointer' }}
                    >
                      Approve
                    </button>
                    <button
                      disabled={ins.status === 'rejected'}
                      onClick={() => void updateInsight(ins.id, 'rejected')}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #c00', background: '#fff', cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                    <button
                      disabled={ins.status === 'completed'}
                      onClick={() => void updateInsight(ins.id, 'completed')}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #999', background: '#fff', cursor: 'pointer' }}
                    >
                      Mark done
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Reading / research queue ({queue.length} pending)</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Topic (e.g. 'Hormozi $100M Offers')"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                style={{ flex: 1, minWidth: 240, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}
              />
              <input
                type="text"
                placeholder="Why Mara should learn this"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                style={{ flex: 2, minWidth: 240, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}
              />
              <button
                onClick={() => void addToQueue()}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #333', background: '#000', color: '#fff', cursor: 'pointer' }}
              >
                Add to queue
              </button>
            </div>
            {queueMsg && <p style={{ color: '#555', fontSize: 13 }}>{queueMsg}</p>}

            {queue.length === 0 && <p>Queue is empty.</p>}
            {queue.map((item) => (
              <div key={item.id} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
                <div style={{ fontWeight: 600 }}>{item.topic}</div>
                <div style={{ fontSize: 13, color: '#555' }}>
                  priority: {item.priority} · source: {item.source} · {formatDate(item.createdAt)}
                </div>
                {item.reason && <div style={{ fontSize: 13, marginTop: 4 }}>{item.reason}</div>}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
