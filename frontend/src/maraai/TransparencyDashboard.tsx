// Transparency dashboard.
//
// Renders the entire MaraAI runtime state in one place: consent record,
// process CPU, memory, route mix, P2P node list, kafka backend, latest
// activity log, and the kill switch.
//
// Spec requirement: "real-time CPU usage display, real-time bandwidth
// tracking, user-controlled limits, kill switch, visible background
// activity logs". The page polls /api/transparency/status every 5s.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  activateKillSwitch,
  getActivityFeed,
  getTransparencyStatus,
  setMode,
  updateConsent,
} from './api';
import type { ActivityRow, MaraMode, TransparencyStatus } from './types';
import { localStorageEstimate } from './localStore';
import './TransparencyDashboard.css';

const POLL_MS = 5000;

export function TransparencyDashboard() {
  const [status, setStatus] = useState<TransparencyStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [storage, setStorage] = useState<{ usageMb: number | null; quotaMb: number | null }>({
    usageMb: null,
    quotaMb: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [s, a, store] = await Promise.all([
        getTransparencyStatus(),
        getActivityFeed(50),
        localStorageEstimate(),
      ]);
      if (stopped.current) return;
      setStatus(s);
      setActivity(a);
      setStorage(store);
      setError(null);
    } catch (err) {
      if (stopped.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    stopped.current = false;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      stopped.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  async function handleModeChange(mode: MaraMode) {
    setBusy(true);
    try {
      await setMode(mode);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleConsentField(field: 'p2pEnabled' | 'backgroundNode' | 'advancedAiRouting' | 'notificationsEnabled') {
    if (!status) return;
    setBusy(true);
    try {
      await updateConsent({ [field]: !status.consent[field] } as any);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleKillSwitch() {
    setBusy(true);
    try {
      await activateKillSwitch();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const total24h = useMemo(() => {
    if (!status) return 0;
    return Object.values(status.routeMix24h).reduce((a, b) => a + b, 0);
  }, [status]);

  return (
    <div className="maraai-transparency">
      <header className="maraai-transparency-header">
        <h1>Transparency dashboard</h1>
        <p>Live view of every MaraAI subsystem. Updated every {POLL_MS / 1000}s.</p>
      </header>

      {error ? <div className="maraai-transparency-error">{error}</div> : null}

      {!status ? (
        <p className="maraai-transparency-loading">Loading…</p>
      ) : (
        <>
          {status.warnings.length > 0 ? (
            <ul className="maraai-transparency-warnings">
              {status.warnings.map((w) => (
                <li key={w}>{warningCopy(w)}</li>
              ))}
            </ul>
          ) : null}

          <section className="maraai-transparency-grid">
            <Card title="Consent">
              <Row label="Mode">
                <select
                  value={status.consent.mode}
                  onChange={(e) => handleModeChange(e.target.value as MaraMode)}
                  disabled={busy || status.consent.killSwitch}
                >
                  <option value="centralized">Centralized</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="advanced">Advanced</option>
                </select>
              </Row>
              <Row label="P2P enabled">
                <Toggle
                  value={status.consent.p2pEnabled}
                  onChange={() => toggleConsentField('p2pEnabled')}
                  disabled={busy || status.consent.killSwitch || status.consent.mode === 'centralized'}
                />
              </Row>
              <Row label="Background node">
                <Toggle
                  value={status.consent.backgroundNode}
                  onChange={() => toggleConsentField('backgroundNode')}
                  disabled={busy || status.consent.killSwitch || status.consent.mode === 'centralized'}
                />
              </Row>
              <Row label="Advanced AI routing">
                <Toggle
                  value={status.consent.advancedAiRouting}
                  onChange={() => toggleConsentField('advancedAiRouting')}
                  disabled={busy || status.consent.killSwitch}
                />
              </Row>
              <Row label="Notifications">
                <Toggle
                  value={status.consent.notificationsEnabled}
                  onChange={() => toggleConsentField('notificationsEnabled')}
                  disabled={busy}
                />
              </Row>
              <Row label="Bandwidth share">
                <strong>{status.consent.bandwidthShareGbMonth} GB/month</strong>
              </Row>
              <Row label="Kill switch">
                <button
                  className="maraai-transparency-kill"
                  onClick={handleKillSwitch}
                  disabled={busy || status.consent.killSwitch}
                >
                  {status.consent.killSwitch ? 'Active' : 'Activate kill switch'}
                </button>
              </Row>
            </Card>

            <Card title="Process">
              <Row label="CPU">
                <strong>{status.process.cpuPercent.toFixed(1)}%</strong>
              </Row>
              <Row label="Memory (RSS)">
                <strong>{status.process.rssMb.toFixed(1)} MB</strong>
              </Row>
              <Row label="Uptime">
                <strong>{formatDuration(status.process.uptimeSec)}</strong>
              </Row>
              <Row label="Local storage">
                <strong>
                  {storage.usageMb != null
                    ? `${storage.usageMb} MB${storage.quotaMb ? ` / ${storage.quotaMb} MB` : ''}`
                    : 'unavailable'}
                </strong>
              </Row>
            </Card>

            <Card title="Event bus (Kafka)">
              <Row label="Backend">
                <strong>{status.eventBus.backend}</strong>
              </Row>
              <Row label="Topics tracked">
                <strong>{status.eventBus.topics}</strong>
              </Row>
              <Row label="Connected">
                <strong>{status.eventBus.connected ? 'yes' : 'no'}</strong>
              </Row>
            </Card>

            <Card title="AI route mix (24h)">
              <Row label="Local">
                <strong>{status.routeMix24h.local}</strong>
              </Row>
              <Row label="Central">
                <strong>{status.routeMix24h.central}</strong>
              </Row>
              <Row label="P2P">
                <strong>{status.routeMix24h.p2p}</strong>
              </Row>
              <Row label="Total">
                <strong>{total24h}</strong>
              </Row>
            </Card>

            <Card title="P2P nodes">
              {status.nodes.length === 0 ? (
                <p className="maraai-transparency-muted">
                  No nodes registered. Enable P2P consent to register a device.
                </p>
              ) : (
                <table className="maraai-transparency-table">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>In</th>
                      <th>Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.nodes.map((n) => (
                      <tr key={n.nodeId}>
                        <td>{n.deviceLabel || n.nodeId.slice(0, 12)}</td>
                        <td>{n.status}</td>
                        <td>{n.score}</td>
                        <td>{formatBytes(n.bytesIn)}</td>
                        <td>{formatBytes(n.bytesOut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          <Card title="Activity log">
            {activity.length === 0 ? (
              <p className="maraai-transparency-muted">No activity yet.</p>
            ) : (
              <ul className="maraai-transparency-activity">
                {activity.map((row) => (
                  <li key={row.id}>
                    <span className="maraai-transparency-activity-kind">{row.kind}</span>
                    <span className="maraai-transparency-activity-time">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                    <code>{JSON.stringify(row.meta)}</code>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="maraai-transparency-card">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="maraai-transparency-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`maraai-transparency-toggle${value ? ' is-on' : ''}`}
      onClick={onChange}
      disabled={disabled}
    >
      {value ? 'On' : 'Off'}
    </button>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function warningCopy(code: string): string {
  switch (code) {
    case 'kill_switch_active':
      return 'Kill switch is currently active — every P2P/background flag is forcibly disabled.';
    case 'onboarding_incomplete':
      return 'Onboarding has not been completed yet. Visit /onboarding to finish setup.';
    case 'central_llm_not_configured':
      return 'Central LLM is not configured (ANTHROPIC_API_KEY unset). The router will degrade to local responses.';
    default:
      return code;
  }
}

export default TransparencyDashboard;
