// Admin-only dashboard for Mara's Growth Engineer experiments.
//
// Visible at /admin/experiments. Mirrors the patterns from AdminBrain.tsx:
// inline styles, fetch-with-credentials, 403 fallback for non-admins, polling
// refresh, and per-row action buttons. The backend gates every endpoint via
// the same requireAdmin middleware used by /api/admin/mara/*.
//
// Lifecycle Mara expects:
//   proposed   → admin clicks ✅ Approve or ❌ Reject
//   approved   → admin ships the PR, then clicks 🚀 Mark implemented
//   implemented → 7-day measurement window auto-runs from the brain cycle
//   measured   → terminal state, results visible inline
//
// No autonomous code changes are made from this UI — every state transition
// requires an explicit admin click.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './contexts/AuthContext';

type ExperimentStatus =
  | 'proposed'
  | 'approved'
  | 'implemented'
  | 'measured'
  | 'rejected';

interface Experiment {
  id: number;
  dropOffStage: string;
  baselineDropOffRate: number;
  baselineMetrics: string;
  hypothesis: string;
  framework: string;
  codeSketch: string;
  iceImpact: number;
  iceConfidence: number;
  iceEase: number;
  iceScore: number;
  expectedImpactPct: number;
  citedKnowledgeIds: string;
  status: ExperimentStatus;
  decidedBy: string | null;
  decidedAt: string | number | null;
  decisionNote: string | null;
  implementedAt: string | number | null;
  measureAfterAt: string | number | null;
  resultMetrics: string | null;
  actualImpactPct: number | null;
  succeeded: number | null;
  learnings: string | null;
  measuredAt: string | number | null;
  createdAt: string | number | null;
}

interface FunnelStage {
  stage: string;
  count: number;
  dropOffRateFromPrev: number;
}

interface FunnelSnapshot {
  windowDays: number;
  windowStart: number;
  windowEnd: number;
  totalSignups: number;
  stages: FunnelStage[];
  signupToActivationPct: number;
  activationToEngagementPct: number;
  engagementToConversionPct: number;
  hasMeaningfulData: boolean;
}

const STATUS_FILTERS: Array<{ label: string; value: ExperimentStatus | '' }> = [
  { label: 'All', value: '' },
  { label: 'Proposed', value: 'proposed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Implemented', value: 'implemented' },
  { label: 'Measured', value: 'measured' },
  { label: 'Rejected', value: 'rejected' },
];

function formatDate(iso: string | number | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

// Status pill colour matches lifecycle "weight": proposed = neutral blue,
// approved = orange (action required from admin to mark implemented),
// implemented = purple (waiting on measurement), measured = green (closed),
// rejected = grey (closed).
function statusColor(status: ExperimentStatus): { bg: string; fg: string } {
  switch (status) {
    case 'proposed':
      return { bg: '#dbeafe', fg: '#1e3a8a' };
    case 'approved':
      return { bg: '#fed7aa', fg: '#9a3412' };
    case 'implemented':
      return { bg: '#e9d5ff', fg: '#581c87' };
    case 'measured':
      return { bg: '#d1fae5', fg: '#065f46' };
    case 'rejected':
      return { bg: '#e5e7eb', fg: '#374151' };
    default:
      return { bg: '#e5e7eb', fg: '#374151' };
  }
}

function StatusPill({ status }: { status: ExperimentStatus }) {
  const { bg, fg } = statusColor(status);
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {status}
    </span>
  );
}

export default function AdminExperiments() {
  const { isAuthenticated } = useAuth();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [funnel, setFunnel] = useState<FunnelSnapshot | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '100');
      const [listRes, funnelRes] = await Promise.all([
        fetch(`/api/admin/mara/experiments?${params.toString()}`, { credentials: 'include' }),
        fetch('/api/admin/mara/experiments/funnel?days=14', { credentials: 'include' }),
      ]);
      if (listRes.status === 401 || listRes.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (!listRes.ok) throw new Error(`experiments ${listRes.status}`);
      const listPayload = await listRes.json();
      setExperiments(Array.isArray(listPayload?.experiments) ? listPayload.experiments : []);
      if (funnelRes.ok) setFunnel(await funnelRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15_000);
    return () => clearInterval(poll);
  }, [load]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const act = useCallback(
    async (id: number, action: 'approve' | 'reject' | 'implement', extraBody?: Record<string, unknown>) => {
      setActingOnId(id);
      setActionMsg(null);
      try {
        const res = await fetch(`/api/admin/mara/experiments/${id}/${action}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extraBody ?? {}),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionMsg(`Action failed (${res.status}): ${payload?.error ?? 'unknown error'}`);
        } else {
          const pastTense =
            action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'implemented';
          setActionMsg(`Experiment #${id} → ${pastTense}`);
        }
        await load();
      } catch (err) {
        setActionMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setActingOnId(null);
      }
    },
    [load],
  );

  const approve = useCallback(
    (id: number) => {
      const note = window.prompt('Optional approval note (visible in DB):') ?? '';
      void act(id, 'approve', note ? { note } : undefined);
    },
    [act],
  );

  const reject = useCallback(
    (id: number) => {
      const note = window.prompt('Reason for rejection (recommended):') ?? '';
      void act(id, 'reject', note ? { note } : undefined);
    },
    [act],
  );

  const markImplemented = useCallback(
    (id: number) => {
      if (!window.confirm('Mark this experiment as implemented? This starts the 7-day measurement window.')) return;
      void act(id, 'implement');
    },
    [act],
  );

  // Sort: proposed first (so the admin's queue is at the top), then by recency
  const sorted = useMemo(() => {
    const weight: Record<ExperimentStatus, number> = {
      proposed: 0,
      approved: 1,
      implemented: 2,
      measured: 3,
      rejected: 4,
    };
    return [...experiments].sort((a, b) => {
      if (weight[a.status] !== weight[b.status]) return weight[a.status] - weight[b.status];
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad;
    });
  }, [experiments]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Admin · Growth Experiments</h1>
        <p>
          Please <a href="/" style={{ color: '#00c' }}>sign in</a> as an admin to view this page.
        </p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Admin · Growth Experiments</h1>
        <p style={{ color: '#c00' }}>
          403 — admin access required. Set your email in <code>ADMIN_EMAILS</code> on the server.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0 }}>Mara · Growth Experiments</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/admin/brain"
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', textDecoration: 'none', color: '#333' }}
          >
            ← Brain
          </a>
          <button
            onClick={() => void load()}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </header>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#c00' }}>Error: {error}</p>}
      {actionMsg && <p style={{ color: '#333', background: '#fffbdd', padding: 8, borderRadius: 6 }}>{actionMsg}</p>}

      {/* === Funnel snapshot === */}
      {funnel && (
        <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>Funnel (last {funnel.windowDays} days)</h2>
          {!funnel.hasMeaningfulData && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>
              Not enough signal yet — Mara will start proposing experiments once the funnel has at least 5 signups in the window.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {funnel.stages.map((s) => (
              <div
                key={s.stage}
                style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, textAlign: 'center' }}
              >
                <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {s.stage}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{s.count}</div>
                {s.stage !== 'signup' && (
                  <div style={{ fontSize: 12, color: s.dropOffRateFromPrev > 0.5 ? '#c00' : '#666' }}>
                    drop-off vs prev: {formatPct(s.dropOffRateFromPrev)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* === Filter bar === */}
      <section style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setStatusFilter(f.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
              background: statusFilter === f.value ? '#000' : '#fff',
              color: statusFilter === f.value ? '#fff' : '#333',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </section>

      {/* === Experiments list === */}
      <section>
        <h2>Experiments ({sorted.length})</h2>
        {sorted.length === 0 && !loading && (
          <p style={{ color: '#666' }}>
            No experiments yet. Mara will propose one each brain cycle once the funnel has signal and an LLM (Ollama or Anthropic) is configured.
          </p>
        )}
        {sorted.map((exp) => {
          const isExpanded = expanded.has(exp.id);
          const isActing = actingOnId === exp.id;
          return (
            <div
              key={exp.id}
              style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 12 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <strong>#{exp.id}</strong>
                  <StatusPill status={exp.status} />
                  <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                    stage: {exp.dropOffStage}
                  </span>
                  <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    framework: {exp.framework}
                  </span>
                  <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    ICE: {exp.iceScore.toFixed(1)} ({exp.iceImpact}×{exp.iceConfidence}×{exp.iceEase})
                  </span>
                  <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    expected: {formatPct(exp.expectedImpactPct)}
                  </span>
                </div>
                <span style={{ color: '#666', fontSize: 12 }}>{formatDate(exp.createdAt)}</span>
              </div>

              <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
                <strong>Hypothesis:</strong> {exp.hypothesis}
              </div>

              <button
                onClick={() => toggleExpand(exp.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  background: '#fafafa',
                  cursor: 'pointer',
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                {isExpanded ? 'Hide details ▴' : 'Show code sketch + baseline ▾'}
              </button>

              {isExpanded && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Baseline drop-off:</strong> {formatPct(exp.baselineDropOffRate)} (at proposal time)
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Code sketch:</strong>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: '#f7f7f7',
                        padding: 12,
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    >
                      {exp.codeSketch}
                    </pre>
                  </div>
                  {exp.citedKnowledgeIds && exp.citedKnowledgeIds !== '[]' && (
                    <div style={{ marginBottom: 8, fontSize: 13, color: '#444' }}>
                      <strong>Cited knowledge ids:</strong> <code>{exp.citedKnowledgeIds}</code>
                    </div>
                  )}
                  {exp.status === 'measured' && (
                    <div style={{ background: exp.succeeded ? '#ecfdf5' : '#fef2f2', padding: 12, borderRadius: 4, marginTop: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Outcome: {exp.succeeded ? '✅ Success' : '❌ Did not hit target'}
                      </div>
                      <div>Actual impact: {formatPct(exp.actualImpactPct)} (expected {formatPct(exp.expectedImpactPct)})</div>
                      {exp.learnings && (
                        <div style={{ marginTop: 8, fontSize: 13, color: '#444' }}>
                          <em>Learnings:</em> {exp.learnings}
                        </div>
                      )}
                      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                        Measured at {formatDate(exp.measuredAt)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lifecycle metadata */}
              {(exp.status === 'approved' || exp.status === 'implemented' || exp.status === 'measured') && (
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  Approved by {exp.decidedBy ?? '—'} at {formatDate(exp.decidedAt)}
                  {exp.decisionNote && <> — <em>"{exp.decisionNote}"</em></>}
                </div>
              )}
              {exp.status === 'rejected' && (
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  Rejected by {exp.decidedBy ?? '—'} at {formatDate(exp.decidedAt)}
                  {exp.decisionNote && <> — <em>"{exp.decisionNote}"</em></>}
                </div>
              )}
              {(exp.status === 'implemented' || exp.status === 'measured') && (
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  Implemented at {formatDate(exp.implementedAt)} · Measurement window ends {formatDate(exp.measureAfterAt)}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {exp.status === 'proposed' && (
                  <>
                    <button
                      onClick={() => approve(exp.id)}
                      disabled={isActing}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background: '#059669',
                        color: '#fff',
                        cursor: isActing ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ✅ Approve
                    </button>
                    <button
                      onClick={() => reject(exp.id)}
                      disabled={isActing}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background: '#dc2626',
                        color: '#fff',
                        cursor: isActing ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ❌ Reject
                    </button>
                  </>
                )}
                {exp.status === 'approved' && (
                  <button
                    onClick={() => markImplemented(exp.id)}
                    disabled={isActing}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#7c3aed',
                      color: '#fff',
                      cursor: isActing ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    🚀 Mark implemented (start 7d timer)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
