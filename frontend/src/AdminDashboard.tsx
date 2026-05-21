import { useState, useEffect, useRef } from 'react';
import './styles/AdminDashboard.css';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

interface SectionHeaderProps {
  icon: string;
  title: string;
  action?: React.ReactNode;
}

interface DashboardStats {
  users: { total: number; newToday: number; active7d: number };
  languages: { language: string; cnt: number }[];
  revenue: { total: number; thisMonth: number; pendingOrders: number };
  notifications: { total: number; today: number };
  pwa: { installs: number };
  missions: { completed: number; totalXP: number };
  aiRoutes: { route: string; cnt: number; avg_latency: number; successes: number }[];
  system: { uptimeSeconds: number; memoryMB: number; totalMemoryMB: number; nodeVersion: string };
  brain: { lastLog: { message: string; level: string; created_at: number } | null; logsToday: number };
}

interface KnowledgeEntry {
  id: number;
  category: string;
  topic: string;
  content: string;
  source: string;
  confidence: number;
  access_count: number;
  created_at: number;
  updated_at: number;
}

interface Reflection {
  id: number;
  content: string;
  created_at: number;
}

interface Experiment {
  id: number;
  name: string;
  description: string;
  hypothesis: string;
  ice_score: number;
  status: string;
  funnel_stage: string;
  created_at: number;
  decided_at: number | null;
  implemented_at: number | null;
  implementation_notes?: string | null;
}

interface GrowthExperiment {
  id: number;
  drop_off_stage: string;
  hypothesis: string;
  framework: string;
  ice_score: number;
  expected_impact_pct: number;
  status: string;
  created_at: number;
  decided_at: number | null;
  implemented_at: number | null;
  actual_impact_pct: number | null;
  succeeded: number | null;
  learnings: string | null;
  implementation_notes: string | null;
  outcome_metrics: string | null;
  ab_users: number;
  treatment_users: number;
  total_conversions: number;
}

interface GrowthStats {
  total: number;
  proposed: number;
  implemented: number;
  measured: number;
  successRate: number;
}

interface ABResults {
  control: { users: number; conversions: number; rate: number };
  treatment: { users: number; conversions: number; rate: number };
  winner: 'control' | 'treatment' | 'inconclusive';
  confidence: number;
  improvement: number;
  totalUsers: number;
}

interface LibraryBook {
  id: number;
  category: string;
  topic: string;
  content: string;
  source: string;
  created_at: number;
}

interface BrainLog {
  id: number;
  phase: string;
  message: string;
  level: string;
  created_at: number;
}

interface AiRouteLog {
  route: string;
  module: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  success: number;
  error: string | null;
  created_at: number;
}

interface ChatMessage {
  id: number;
  content: string;
  sender: 'user' | 'assistant';
  created_at: number;
}

interface CircuitBreakerStatus {
  provider: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureAt: number | null;
  openUntil: number | null;
}

interface MaraAlert {
  id: number;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metadata: string;
  read: number;
  created_at: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: StatCardProps) {
  return (
    <div className="adb-stat-card" style={color ? { borderTop: `3px solid ${color}` } : {}}>
      <div className="adb-stat-icon">{icon}</div>
      <div className="adb-stat-body">
        <div className="adb-stat-value">{value}</div>
        <div className="adb-stat-label">{label}</div>
        {sub && <div className="adb-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, action }: SectionHeaderProps) {
  return (
    <div className="adb-section-header">
      <span className="adb-section-icon">{icon}</span>
      <span className="adb-section-title">{title}</span>
      {action && <div className="adb-section-action">{action}</div>}
    </div>
  );
}

function timeAgo(ts: any): string {
  if (ts === null || ts === undefined || ts === '') return '—';
  let date: Date;
  if (typeof ts === 'string') {
    date = new Date(ts);
  } else if (typeof ts === 'number') {
    date = new Date(ts < 1e10 ? ts * 1000 : ts);
  } else {
    return '—';
  }
  if (isNaN(date.getTime())) return '—';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 0) return 'acum';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}z`;
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function CircuitBreakersPanel() {
  const [breakers, setBreakers] = useState<CircuitBreakerStatus[]>([]);

  useEffect(() => {
    fetch('/api/admin/dashboard/circuit-breakers', { credentials: 'include' })
      .then(r => r.json()).then(d => setBreakers(d.breakers ?? [])).catch(() => {});
  }, []);

  const stateColor = (s: string) =>
    s === 'closed' ? '#4ade80' : s === 'open' ? '#f87171' : '#f59e0b';

  return (
    <div className="adb-card">
      <SectionHeader icon="⚡" title="Circuit Breakers AI" />
      {breakers.length === 0
        ? <p className="adb-empty">Niciun provider monitorizat</p>
        : (
          <table className="adb-table">
            <thead>
              <tr><th>Provider</th><th>Stare</th><th>Failures</th><th>Open până la</th></tr>
            </thead>
            <tbody>
              {breakers.map(b => (
                <tr key={b.provider}>
                  <td>{b.provider}</td>
                  <td style={{ color: stateColor(b.state), fontWeight: 700 }}>{b.state}</td>
                  <td>{b.failures}</td>
                  <td>{b.openUntil ? timeAgo(b.openUntil) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

function OverviewTab({ stats }: { stats: DashboardStats | null }) {
  if (!stats) return <div className="adb-loading">Se încarcă statisticile...</div>;
  return (
    <div className="adb-overview">
      <div className="adb-stat-grid">
        <StatCard icon="👥" label="Utilizatori totali" value={stats.users.total} sub={`+${stats.users.newToday} azi`} color="#6c63ff" />
        <StatCard icon="🟢" label="Activi (7 zile)" value={stats.users.active7d} color="#4ade80" />
        <StatCard icon="💰" label="Revenue total" value={`$${stats.revenue.total}`} sub={`$${stats.revenue.thisMonth} luna aceasta`} color="#f59e0b" />
        <StatCard icon="⏳" label="Comenzi în așteptare" value={stats.revenue.pendingOrders} color="#f87171" />
        <StatCard icon="🔔" label="Notificări azi" value={stats.notifications.today} sub={`${stats.notifications.total} total`} color="#38bdf8" />
        <StatCard icon="📱" label="PWA Installs" value={stats.pwa.installs} color="#a78bfa" />
        <StatCard icon="🎯" label="Misiuni completate" value={stats.missions.completed} sub={`${stats.missions.totalXP} XP total`} color="#34d399" />
        <StatCard icon="🧠" label="Brain logs azi" value={stats.brain.logsToday} color="#fb923c" />
      </div>

      <div className="adb-row">
        <div className="adb-card">
          <SectionHeader icon="🌍" title="Distribuție limbi" />
          <table className="adb-table">
            <thead><tr><th>Limbă</th><th>Utilizatori</th></tr></thead>
            <tbody>
              {stats.languages.map(l => (
                <tr key={l.language}><td>{l.language || '(nesetat)'}</td><td>{l.cnt}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="adb-card">
          <SectionHeader icon="⚡" title="AI Routes (24h)" />
          {stats.aiRoutes.length === 0
            ? <p className="adb-empty">Nicio rută logată</p>
            : (
              <table className="adb-table">
                <thead><tr><th>Rută</th><th>Req</th><th>Latență avg</th><th>Succese</th></tr></thead>
                <tbody>
                  {stats.aiRoutes.map(r => (
                    <tr key={r.route}>
                      <td>{r.route}</td>
                      <td>{r.cnt}</td>
                      <td>{r.avg_latency ? `${Math.round(r.avg_latency)}ms` : '—'}</td>
                      <td>{r.successes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <div className="adb-card">
        <SectionHeader icon="🖥️" title="Sistem" />
        <div className="adb-stat-grid adb-stat-grid--sm">
          <StatCard icon="⏱️" label="Uptime" value={fmtUptime(stats.system.uptimeSeconds)} />
          <StatCard icon="💾" label="Memorie folosită" value={`${stats.system.memoryMB} MB`} sub={`din ${stats.system.totalMemoryMB} MB`} />
          <StatCard icon="🟩" label="Node.js" value={stats.system.nodeVersion} />
          <StatCard icon="📝" label="Ultimul log brain" value={stats.brain.lastLog?.message?.slice(0, 40) ?? '—'} sub={stats.brain.lastLog ? timeAgo(stats.brain.lastLog.created_at) : ''} />
        </div>
      </div>

      <CircuitBreakersPanel />
    </div>
  );
}

// ─── Tab: Brain ───────────────────────────────────────────────────────────────

function BrainTab() {
  const [logs, setLogs] = useState<BrainLog[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [trigMsg, setTrigMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/dashboard/brain-logs', { credentials: 'include' })
      .then(r => r.json()).then(d => setLogs(d.logs ?? [])).catch(() => {});
    fetch('/api/admin/dashboard/reflections', { credentials: 'include' })
      .then(r => r.json()).then(d => setReflections(d.reflections ?? [])).catch(() => {});
  }, []);

  const triggerBrain = async () => {
    setTriggering(true);
    setTrigMsg('');
    try {
      const r = await fetch('/api/admin/brain/trigger', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      setTrigMsg(d.message ?? 'Ciclu pornit!');
    } catch {
      setTrigMsg('Eroare la trigger.');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="adb-brain">
      <div className="adb-row">
        <div className="adb-card adb-card--wide">
          <SectionHeader
            icon="🧠"
            title="Brain Logs (ultimele 50)"
            action={
              <button className="adb-btn adb-btn--primary" onClick={triggerBrain} disabled={triggering}>
                {triggering ? 'Se rulează...' : '▶ Trigger Brain Cycle'}
              </button>
            }
          />
          {trigMsg && <p className="adb-trigger-msg">{trigMsg}</p>}
          <div className="adb-log-list">
            {logs.length === 0
              ? <p className="adb-empty">Niciun log disponibil</p>
              : logs.map(l => (
                <div key={l.id} className={`adb-log-item adb-log--${l.level ?? 'info'}`}>
                  <span className="adb-log-time">{timeAgo(l.created_at)}</span>
                  <span className="adb-log-phase">[{l.phase ?? '—'}]</span>
                  <span className="adb-log-msg">{l.message}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="adb-card">
        <SectionHeader icon="💭" title="Reflecții Mara (ultimele 10)" />
        {reflections.length === 0
          ? <p className="adb-empty">Nicio reflecție disponibilă</p>
          : reflections.map(r => (
            <div key={r.id} className="adb-reflection">
              <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text', cursor: 'text' }}>
                {r.content}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span className="adb-reflection-time">{timeAgo(r.created_at)}</span>
                <button
                  className="adb-copy-btn"
                  onClick={(ev) => {
                    navigator.clipboard.writeText(r.content);
                    const btn = ev.currentTarget as HTMLButtonElement;
                    btn.textContent = '✅ Copiat!';
                    setTimeout(() => { btn.textContent = '📋 Copiază'; }, 2000);
                  }}
                >
                  📋 Copiază
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Tab: Knowledge ───────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState('');

  const loadEntries = () => {
    fetch('/api/admin/dashboard/knowledge', { credentials: 'include' })
      .then(r => r.json()).then(d => setEntries(d.entries ?? [])).catch(() => {});
  };

  useEffect(() => { loadEntries(); }, []);

  const runCleanup = async () => {
    setCleaning(true);
    setCleanMsg('');
    try {
      const r = await fetch('/api/admin/dashboard/kb-cleanup', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      setCleanMsg(`Cleanup complet: ${d.deleted ?? 0} intrări șterse.`);
      loadEntries();
    } catch {
      setCleanMsg('Eroare la cleanup.');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="adb-knowledge">
      <div className="adb-card">
        <SectionHeader
          icon="📚"
          title="Ce a învățat Mara (ultimele 20)"
          action={
            <button className="adb-btn adb-btn--danger" onClick={runCleanup} disabled={cleaning}>
              {cleaning ? 'Se curăță...' : '🗑 Cleanup KB'}
            </button>
          }
        />
        {cleanMsg && <p className="adb-feedback">{cleanMsg}</p>}
        {entries.length === 0
          ? <p className="adb-empty">Nicio intrare în knowledge base</p>
          : (
            <div className="adb-knowledge-list">
              {entries.map(k => (
                <div key={k.id} className="adb-knowledge-entry">
                  <div className="adb-knowledge-meta">
                    <span className="adb-knowledge-category">{k.category}</span>
                    <span className="adb-knowledge-topic">{k.topic}</span>
                    <span className="adb-knowledge-source">{k.source}</span>
                    <span className="adb-knowledge-stats">
                      conf: {k.confidence ?? '—'} · {k.access_count}x · {timeAgo(k.updated_at)}
                    </span>
                  </div>
                  <div
                    className="adb-knowledge-content"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      cursor: 'text',
                      userSelect: 'text',
                    }}
                  >
                    {k.content}
                  </div>
                  <button
                    className="adb-copy-btn"
                    onClick={(ev) => {
                      navigator.clipboard.writeText(`${k.topic}\n\n${k.content}`);
                      const btn = ev.currentTarget as HTMLButtonElement;
                      btn.textContent = '✅ Copiat!';
                      setTimeout(() => { btn.textContent = '📋 Copiază'; }, 2000);
                    }}
                  >
                    📋 Copiază
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── A/B Results Display ──────────────────────────────────────────────────────

function ABResultsDisplay({ experimentId, succeeded, actualImpact, learnings }: {
  experimentId: number;
  succeeded: number | null;
  actualImpact: number | null;
  learnings: string | null;
}) {
  const [abData, setAbData] = useState<ABResults | null>(null);

  useEffect(() => {
    fetch(`/api/admin/experiments/${experimentId}/ab-results`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.hasData) setAbData(d.results); })
      .catch(() => {});
  }, [experimentId]);

  return (
    <div className="adb-ab-display">
      <div className="adb-ab-header">
        <span>A/B Test Results</span>
        {succeeded !== null && (
          <span className={succeeded ? 'adb-ab-win' : 'adb-ab-lose'}>
            {succeeded ? '✅ Treatment wins' : '❌ No improvement'}
          </span>
        )}
        {abData && <span className="adb-ab-confidence">{abData.confidence}% confidence</span>}
      </div>
      {abData ? (
        <>
          <div className="adb-ab-bars">
            <div className="adb-ab-variant">
              <span>Control</span>
              <div className="adb-ab-bar">
                <div className="adb-ab-fill adb-ab-fill--control" style={{ width: `${Math.max(abData.control.rate, 2)}%` }} />
              </div>
              <span>{abData.control.rate}%</span>
              <span className="adb-ab-users">({abData.control.users} useri)</span>
            </div>
            <div className="adb-ab-variant">
              <span>Treatment</span>
              <div className="adb-ab-bar">
                <div className="adb-ab-fill adb-ab-fill--treatment" style={{ width: `${Math.max(abData.treatment.rate, 2)}%` }} />
              </div>
              <span>{abData.treatment.rate}%</span>
              <span className="adb-ab-users">({abData.treatment.users} useri)</span>
            </div>
          </div>
          <div className="adb-ab-impact">
            Impact real: <strong>{(actualImpact ?? 0) > 0 ? '+' : ''}{((actualImpact ?? 0) * 100).toFixed(1)}%</strong>
            {abData.improvement !== 0 && (
              <> · Conversii: <strong style={{ color: abData.improvement > 0 ? '#4ade80' : '#f87171' }}>
                {abData.improvement > 0 ? '+' : ''}{abData.improvement}%
              </strong></>
            )}
          </div>
        </>
      ) : (
        <p className="adb-ab-no-data">Niciun utilizator asignat în A/B test încă</p>
      )}
      {learnings && (
        <div className="adb-ab-learnings">
          <strong>Learnings Mara:</strong>
          <p>{learnings}</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Growth ──────────────────────────────────────────────────────────────

function GrowthTab() {
  const [experiments, setExperiments] = useState<GrowthExperiment[]>([]);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    fetch('/api/admin/growth/overview', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setExperiments(d.experiments ?? []);
        setStats(d.stats ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleDecision = async (id: number, action: 'approve' | 'reject') => {
    const endpoint = action === 'approve'
      ? `/api/admin/mara/experiments/${id}/approve`
      : `/api/admin/mara/experiments/${id}/reject`;
    try {
      await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decidedBy: 'admin', note: '' }),
      });
      loadData();
    } catch { /* silent */ }
  };

  const handleExecute = async (id: number) => {
    setExecuting(id);
    try {
      await fetch(`/api/admin/experiments/${id}/execute`, {
        method: 'POST',
        credentials: 'include',
      });
      loadData();
    } catch { /* silent */ }
    finally { setExecuting(null); }
  };

  if (loading) return <div className="adb-loading">Se încarcă datele de growth...</div>;

  return (
    <div className="adb-growth">
      {stats && (
        <div className="adb-stat-grid" style={{ marginBottom: '24px' }}>
          <StatCard icon="🧪" label="Total experimente" value={stats.total} color="#a855f7" />
          <StatCard icon="⏳" label="Propuse" value={stats.proposed} color="#fbbf24" />
          <StatCard icon="🚀" label="Implementate" value={stats.implemented} color="#60a5fa" />
          <StatCard icon="✅" label="Rată succes" value={`${stats.successRate}%`} color="#4ade80" />
        </div>
      )}

      <SectionHeader icon="📈" title="Experimente Growth" action={
        <button className="adb-btn adb-btn--primary" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={loadData}>
          ↻ Refresh
        </button>
      } />

      {experiments.length === 0 ? (
        <p className="adb-empty">Niciun experiment disponibil — Mara va propune unul la următorul ciclu</p>
      ) : (
        <div className="adb-growth-list">
          {experiments.map(exp => (
            <div key={exp.id} className={`adb-exp-card adb-exp-card--${exp.status}`}>
              <div className="adb-exp-header">
                <span className="adb-exp-stage">{exp.drop_off_stage}</span>
                <span className={`adb-exp-badge adb-exp-badge--${exp.status}`}>{exp.status}</span>
                <span className="adb-exp-ice">ICE: {exp.ice_score?.toFixed(1)}</span>
                {exp.ab_users > 0 && (
                  <span className="adb-exp-ab-users">👥 {exp.ab_users} în A/B</span>
                )}
              </div>

              <p className="adb-exp-hypothesis">{exp.hypothesis}</p>

              {exp.expected_impact_pct > 0 && (
                <p className="adb-exp-expected">
                  🎯 Impact așteptat: <strong>{(exp.expected_impact_pct * 100).toFixed(0)}%</strong>
                  {exp.framework && <> · Framework: <strong>{exp.framework}</strong></>}
                </p>
              )}

              {/* A/B Results if measured */}
              {exp.status === 'measured' && (
                <ABResultsDisplay
                  experimentId={exp.id}
                  succeeded={exp.succeeded}
                  actualImpact={exp.actual_impact_pct}
                  learnings={exp.learnings}
                />
              )}

              {/* Implementation notes if available */}
              {exp.implementation_notes && (() => {
                try {
                  const notes = JSON.parse(exp.implementation_notes);
                  return (
                    <div className="adb-exp-impl">
                      <div className="adb-exp-impl-title">🤖 Implementat de Mara:</div>
                      {notes.actionsPerformed?.map((action: string, i: number) => (
                        <div key={i} className="adb-exp-impl-action">{action}</div>
                      ))}
                      {notes.needsClaudeCode && (
                        <div className="adb-exp-needs-code">⚡ Necesită Claude Code</div>
                      )}
                    </div>
                  );
                } catch { return null; }
              })()}

              {/* Actions */}
              <div className="adb-exp-actions">
                {exp.status === 'proposed' && (
                  <>
                    <button className="adb-btn adb-btn--success" onClick={() => handleDecision(exp.id, 'approve')}>
                      ✅ Aprobă — Mara implementează
                    </button>
                    <button className="adb-btn adb-btn--danger" onClick={() => handleDecision(exp.id, 'reject')}>
                      ❌ Respinge
                    </button>
                  </>
                )}
                {exp.status === 'approved' && (
                  <button
                    className="adb-btn adb-btn--primary"
                    onClick={() => handleExecute(exp.id)}
                    disabled={executing === exp.id}
                  >
                    {executing === exp.id ? '⏳ Se implementează...' : '🚀 Mara implementează'}
                  </button>
                )}
                <span className="adb-exp-meta-time">Creat: {timeAgo(exp.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Experiments ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#4ade80',
  rejected: '#f87171',
  implemented: '#6c63ff',
};

function ExperimentsTab() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard/experiments', { credentials: 'include' })
      .then(r => r.json()).then(d => setExperiments(d.experiments ?? [])).catch(() => {});
  }, []);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      await fetch(`/api/admin/dashboard/experiments/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setExperiments(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    } catch {
      // silent
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="adb-experiments">
      <div className="adb-card">
        <SectionHeader icon="🧪" title="Growth Experiments" />
        {experiments.length === 0
          ? <p className="adb-empty">Niciun experiment disponibil</p>
          : experiments.map(exp => (
            <div key={exp.id} className="adb-exp-item">
              <div className="adb-exp-header">
                <span className="adb-exp-name">{exp.name}</span>
                <span className="adb-exp-badge" style={{ background: STATUS_COLORS[exp.status] ?? '#888' }}>
                  {exp.status}
                </span>
                {exp.ice_score && <span className="adb-exp-ice">ICE: {exp.ice_score}</span>}
              </div>
              {exp.description && <p className="adb-exp-desc">{exp.description}</p>}
              {exp.hypothesis && <p className="adb-exp-hyp"><em>Ipoteză:</em> {exp.hypothesis}</p>}
              <div className="adb-exp-meta">
                <span>{exp.funnel_stage}</span>
                <span>Creat: {timeAgo(exp.created_at)}</span>
              </div>
              {exp.status === 'pending' && (
                <div className="adb-exp-actions">
                  <button
                    className="adb-btn adb-btn--success"
                    onClick={() => updateStatus(exp.id, 'approved')}
                    disabled={updating === exp.id}
                  >
                    ✓ Aprobă
                  </button>
                  <button
                    className="adb-btn adb-btn--danger"
                    onClick={() => updateStatus(exp.id, 'rejected')}
                    disabled={updating === exp.id}
                  >
                    ✗ Respinge
                  </button>
                </div>
              )}
              {exp.status === 'approved' && (
                <div className="adb-exp-actions">
                  <button
                    className="adb-btn adb-btn--primary"
                    onClick={() => updateStatus(exp.id, 'implemented')}
                    disabled={updating === exp.id}
                  >
                    ✓ Marchează implementat
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Tab: Library ─────────────────────────────────────────────────────────────

function LibraryTab() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [bookTitle, setBookTitle] = useState('');
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBooks = () => {
    fetch('/api/admin/dashboard/library', { credentials: 'include' })
      .then(r => r.json()).then(d => setBooks(d.books ?? [])).catch(() => {});
  };

  useEffect(() => { loadBooks(); }, []);

  const uploadBook = async () => {
    if (!bookFile || !bookTitle.trim()) {
      setUploadMsg('Completează titlul și selectează un fișier.');
      return;
    }
    setUploading(true);
    setUploadMsg('');
    try {
      const content = await bookFile.text();
      const r = await fetch('/api/admin/mara/library/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: bookTitle.trim(), content, category: 'general' }),
      });
      const d = await r.json();
      if (r.ok) {
        setUploadMsg('Carte încărcată cu succes!');
        setBookTitle('');
        setBookFile(null);
        if (fileRef.current) fileRef.current.value = '';
        loadBooks();
      } else {
        setUploadMsg(d.message ?? 'Eroare la upload.');
      }
    } catch {
      setUploadMsg('Eroare la upload.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="adb-library">
      <div className="adb-card">
        <SectionHeader icon="📖" title="Upload carte / document" />
        <div className="adb-upload-form">
          <input
            type="text"
            className="adb-input"
            placeholder="Titlu document"
            value={bookTitle}
            onChange={e => setBookTitle(e.target.value)}
          />
          <input
            type="file"
            accept=".txt,.md,.pdf"
            ref={fileRef}
            className="adb-file-input"
            onChange={e => setBookFile(e.target.files?.[0] ?? null)}
          />
          <button className="adb-btn adb-btn--primary" onClick={uploadBook} disabled={uploading}>
            {uploading ? 'Se încarcă...' : '⬆ Upload'}
          </button>
        </div>
        {uploadMsg && <p className="adb-upload-msg">{uploadMsg}</p>}
      </div>

      <div className="adb-card">
        <SectionHeader icon="📚" title="Biblioteca Mara" />
        {books.length === 0
          ? <p className="adb-empty">Nicio carte în bibliotecă</p>
          : (
            <table className="adb-table adb-table--full">
              <thead>
                <tr><th>ID</th><th>Categorie</th><th>Topic</th><th>Adăugat</th></tr>
              </thead>
              <tbody>
                {books.map(b => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.category}</td>
                    <td title={b.content?.slice(0, 200)}>{b.topic}</td>
                    <td>{timeAgo(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ─── Tab: Chat ────────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard/messages', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const tempUser: ChatMessage = { id: Date.now(), content: text, sender: 'user', created_at: Date.now() / 1000 };
    setMessages(prev => [...prev, tempUser]);
    try {
      const r = await fetch('/api/admin/mara/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const d = await r.json();
      const reply = d.reply ?? 'Mara nu a răspuns.';
      const tempAssistant: ChatMessage = { id: Date.now() + 1, content: reply, sender: 'assistant', created_at: Date.now() / 1000 };
      setMessages(prev => [...prev, tempAssistant]);
    } catch {
      const tempErr: ChatMessage = { id: Date.now() + 1, content: 'Eroare de conexiune.', sender: 'assistant', created_at: Date.now() / 1000 };
      setMessages(prev => [...prev, tempErr]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="adb-chat">
      <div className="adb-chat-messages">
        {messages.length === 0 && <p className="adb-empty">Niciun mesaj. Scrie ceva!</p>}
        {messages.map(m => (
          <div key={m.id} className={`adb-chat-msg adb-chat-msg--${m.sender}`}>
            <div className="adb-chat-bubble">{m.content}</div>
            <div className="adb-chat-time">{timeAgo(m.created_at)}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="adb-chat-input-row">
        <input
          className="adb-input"
          type="text"
          placeholder="Scrie un mesaj pentru Mara..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          disabled={sending}
        />
        <button className="adb-btn adb-btn--primary" onClick={sendMessage} disabled={sending || !input.trim()}>
          {sending ? '...' : 'Trimite'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: AI Logs ─────────────────────────────────────────────────────────────

function AiLogsTab() {
  const [routes, setRoutes] = useState<AiRouteLog[]>([]);

  useEffect(() => {
    fetch('/api/admin/dashboard/ai-routes', { credentials: 'include' })
      .then(r => r.json()).then(d => setRoutes(d.routes ?? [])).catch(() => {});
  }, []);

  return (
    <div className="adb-ailogs">
      <div className="adb-card">
        <SectionHeader icon="⚡" title="AI Route Logs (ultimele 100)" />
        {routes.length === 0
          ? <p className="adb-empty">Niciun log disponibil</p>
          : (
            <div className="adb-table-wrap">
              <table className="adb-table adb-table--full">
                <thead>
                  <tr>
                    <th>Rută</th>
                    <th>Modul</th>
                    <th>Latență</th>
                    <th>Tokens ↑</th>
                    <th>Tokens ↓</th>
                    <th>Status</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r, i) => (
                    <tr key={i} className={r.success ? '' : 'adb-row--error'}>
                      <td>{r.route}</td>
                      <td>{r.module ?? '—'}</td>
                      <td>{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
                      <td>{r.tokens_in ?? '—'}</td>
                      <td>{r.tokens_out ?? '—'}</td>
                      <td>{r.success ? '✓' : `✗ ${r.error ?? ''}`}</td>
                      <td>{timeAgo(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Tab: Alerts ─────────────────────────────────────────────────────────────

function AlertsTab({ onUnreadChange }: { onUnreadChange: (n: number) => void }) {
  const [alerts, setAlerts] = useState<MaraAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState('');

  const loadAlerts = () => {
    setLoading(true);
    fetch('/api/admin/alerts', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setAlerts(d.alerts ?? []);
        onUnreadChange((d.alerts ?? []).filter((a: MaraAlert) => !a.read).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAlerts(); }, []);

  const markRead = (id: number) => {
    fetch(`/api/admin/alerts/${id}/read`, { method: 'POST', credentials: 'include' })
      .then(() => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: 1 } : a));
        onUnreadChange(alerts.filter(a => !a.read && a.id !== id).length);
      })
      .catch(() => {});
  };

  const markAllRead = () => {
    fetch('/api/admin/alerts/read-all', { method: 'POST', credentials: 'include' })
      .then(() => { setAlerts(prev => prev.map(a => ({ ...a, read: 1 }))); onUnreadChange(0); })
      .catch(() => {});
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setMsg('');
    try {
      const r = await fetch('/api/admin/alerts/analyze', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      setAlerts(d.alerts ?? []);
      onUnreadChange((d.alerts ?? []).filter((a: MaraAlert) => !a.read).length);
      setMsg(`Analiză completă. ${d.count} alerte totale.`);
    } catch {
      setMsg('Eroare la analiză.');
    } finally {
      setAnalyzing(false);
    }
  };

  const sevColor = (s: string) =>
    s === 'critical' ? '#f87171' : s === 'warning' ? '#f59e0b' : '#38bdf8';

  const unread = alerts.filter(a => !a.read).length;

  return (
    <div>
      <div className="adb-card">
        <SectionHeader
          icon="🔔"
          title={`Alerte platform${unread > 0 ? ` (${unread} necitite)` : ''}`}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="adb-btn adb-btn--primary" onClick={runAnalysis} disabled={analyzing}>
                {analyzing ? 'Analizez...' : 'Analizează acum'}
              </button>
              {unread > 0 && (
                <button className="adb-btn" style={{ background: '#1e1e2e', color: '#9ca3af' }} onClick={markAllRead}>
                  Marchează toate citite
                </button>
              )}
            </div>
          }
        />
        {msg && <p className="adb-feedback">{msg}</p>}
        {loading ? (
          <p className="adb-loading">Se încarcă alertele...</p>
        ) : alerts.length === 0 ? (
          <p className="adb-empty">Nicio alertă. Rulează analiza sau așteaptă următorul ciclu brain.</p>
        ) : (
          <div className="adb-alert-list">
            {alerts.map(a => (
              <div
                key={a.id}
                className={`adb-alert-item${a.read ? ' adb-alert--read' : ''}`}
                style={{ borderLeftColor: sevColor(a.severity) }}
              >
                <div className="adb-alert-header">
                  <span className="adb-alert-sev" style={{ color: sevColor(a.severity) }}>
                    {a.severity === 'critical' ? '🚨' : a.severity === 'warning' ? '⚠️' : 'ℹ️'} {a.severity}
                  </span>
                  <span className="adb-alert-time">{timeAgo(a.created_at)}</span>
                  {!a.read && (
                    <button className="adb-alert-read-btn" onClick={() => markRead(a.id)}>citit</button>
                  )}
                </div>
                <div className="adb-alert-title">{a.title}</div>
                <div className="adb-alert-msg">{a.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'brain', icon: '🧠', label: 'Brain' },
  { id: 'growth', icon: '📈', label: 'Growth' },
  { id: 'alerts', icon: '🔔', label: 'Alerte' },
  { id: 'knowledge', icon: '📚', label: 'Knowledge' },
  { id: 'experiments', icon: '🧪', label: 'Experiments' },
  { id: 'library', icon: '📖', label: 'Library' },
  { id: 'chat', icon: '💬', label: 'Chat Mara' },
  { id: 'ailogs', icon: '⚡', label: 'AI Logs' },
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    fetch('/api/admin/dashboard', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => setStats(d))
      .catch(err => setStatsError(`Eroare la încărcare stats: ${err.message}`));

    fetch('/api/admin/alerts/unread', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setUnreadAlerts(d.count ?? 0))
      .catch(() => {});
  }, []);

  return (
    <div className="adb-root">
      <div className="adb-header">
        <h1 className="adb-title">🧠 Admin Dashboard</h1>
        {statsError && <span className="adb-error">{statsError}</span>}
      </div>

      <div className="adb-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`adb-tab ${activeTab === tab.id ? 'adb-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'alerts' && unreadAlerts > 0 && (
              <span className="adb-tab-badge">{unreadAlerts}</span>
            )}
          </button>
        ))}
      </div>

      <div className="adb-content">
        {activeTab === 'overview'     && <OverviewTab stats={stats} />}
        {activeTab === 'brain'        && <BrainTab />}
        {activeTab === 'growth'       && <GrowthTab />}
        {activeTab === 'alerts'       && <AlertsTab onUnreadChange={setUnreadAlerts} />}
        {activeTab === 'knowledge'    && <KnowledgeTab />}
        {activeTab === 'experiments'  && <ExperimentsTab />}
        {activeTab === 'library'      && <LibraryTab />}
        {activeTab === 'chat'         && <ChatTab />}
        {activeTab === 'ailogs'       && <AiLogsTab />}
      </div>
    </div>
  );
}
