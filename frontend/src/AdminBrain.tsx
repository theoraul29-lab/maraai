// Admin-only dashboard for the Mara Brain scheduler (PR C).
// Visible at /admin/brain. Backend gates every endpoint via `ADMIN_USER_IDS`.
// Users without admin rights see a 403 message.

import { useEffect, useState, useCallback } from 'react';

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
  research: unknown;
  productIdeas: unknown;
  devTasks: unknown;
  growthIdeas: unknown;
};

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

function renderListOrText(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return val.length ? val.join('\n• ') : '—';
  if (typeof val === 'string') return val || '—';
  try { return JSON.stringify(val, null, 2); } catch { return String(val); }
}

export default function AdminBrain() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [logs, setLogs] = useState<BrainLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

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

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 10_000);
    return () => clearInterval(poll);
  }, [load]);

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
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Mara Brain · Admin</h1>
        <button
          onClick={() => void load()}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </header>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#c00' }}>Error: {error}</p>}

      {status && (
        <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>Status</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div><strong>Enabled:</strong> {status.enabled ? '✅ yes' : '❌ no'}</div>
            <div><strong>Running now:</strong> {status.running ? '🟢 yes' : '⚪ idle'}</div>
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
      )}

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
                {renderListOrText(log.research)}
              </pre>
            </details>
            <details>
              <summary>Product ideas</summary>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                {renderListOrText(log.productIdeas)}
              </pre>
            </details>
            <details>
              <summary>Dev tasks</summary>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                {renderListOrText(log.devTasks)}
              </pre>
            </details>
            <details>
              <summary>Growth ideas</summary>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>
                {renderListOrText(log.growthIdeas)}
              </pre>
            </details>
          </div>
        ))}
      </section>
    </div>
  );
}
