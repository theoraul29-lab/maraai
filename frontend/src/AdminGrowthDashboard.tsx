import { useEffect, useState } from 'react';
import './styles/AdminGrowthDashboard.css';

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  dropOffRate: number;
}

interface CohortRow {
  week: string;
  signups: number;
  day7: number;
  day30: number;
}

interface TopReferrer {
  userId: string;
  referralCount: number;
  xpEarned: number;
}

interface GrowthData {
  gateActive: boolean;
  userCount: number;
  threshold: number;
  funnel: {
    current: FunnelStage[];
    previous: FunnelStage[];
  };
  cohorts: CohortRow[];
  topReferrers: TopReferrer[];
  qualitativeSignals: Array<{ type: string; count: number }>;
}

const STAGE_LABELS: Record<string, string> = {
  signup: 'Signup',
  activation: 'Activare (24h)',
  engagement: 'Engagement (D2)',
  conversion: 'Conversie',
  retention: 'Retenție (7 zile)',
};

function FunnelBar({ stage, prev }: { stage: FunnelStage; prev?: FunnelStage }) {
  const pct = Math.max(0, Math.min(100, 100 - stage.dropOffRate * 100));
  const prevPct = prev ? Math.max(0, Math.min(100, 100 - prev.dropOffRate * 100)) : null;
  const delta = prevPct !== null ? pct - prevPct : null;

  return (
    <div className="agd-funnel-row">
      <div className="agd-funnel-label">{STAGE_LABELS[stage.stage] ?? stage.stage}</div>
      <div className="agd-funnel-bar-wrap">
        <div className="agd-funnel-bar" style={{ width: `${pct}%` }} />
        {prevPct !== null && (
          <div className="agd-funnel-bar agd-funnel-bar--prev" style={{ width: `${prevPct}%` }} />
        )}
      </div>
      <div className="agd-funnel-meta">
        <span className="agd-funnel-count">{stage.count}</span>
        {delta !== null && (
          <span className={`agd-funnel-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}pp
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminGrowthDashboard() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/growth/dashboard', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Nu am putut încărca datele.'); setLoading(false); });
  }, []);

  if (loading) return <div className="agd-loading">Se încarcă datele de growth…</div>;
  if (error) return <div className="agd-error">{error}</div>;
  if (!data) return null;

  if (!data.gateActive) {
    return (
      <div className="agd-gate">
        <div className="agd-gate-icon">🌱</div>
        <h2>Growth Dashboard</h2>
        <p>Se activează automat la <strong>{data.threshold} utilizatori</strong>.</p>
        <p className="agd-gate-sub">Momentan: <strong>{data.userCount}</strong> useri înregistrați.</p>
        <div className="agd-gate-bar-wrap">
          <div
            className="agd-gate-bar"
            style={{ width: `${Math.min(100, (data.userCount / data.threshold) * 100)}%` }}
          />
        </div>
        <p className="agd-gate-pct">{Math.round((data.userCount / data.threshold) * 100)}% din prag</p>
      </div>
    );
  }

  return (
    <div className="agd-root">
      <h1 className="agd-title">Growth Dashboard</h1>

      {/* Funnel */}
      <section className="agd-card">
        <h2 className="agd-card-title">Funnel utilizatori <span className="agd-badge">7 zile vs. anterioare</span></h2>
        <div className="agd-funnel">
          {data.funnel.current.map((stage, i) => (
            <FunnelBar key={stage.stage} stage={stage} prev={data.funnel.previous[i]} />
          ))}
        </div>
        <p className="agd-hint">Bara violet = acum · bara gri = perioada anterioară · pp = puncte procentuale</p>
      </section>

      {/* Cohort table */}
      <section className="agd-card">
        <h2 className="agd-card-title">Retenție pe cohorte</h2>
        <table className="agd-table">
          <thead>
            <tr>
              <th>Săptămâna</th>
              <th>Signups</th>
              <th>Zi 7 (%)</th>
              <th>Zi 30 (%)</th>
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map(row => (
              <tr key={row.week}>
                <td>{row.week}</td>
                <td>{row.signups}</td>
                <td className={row.day7 > 30 ? 'good' : row.day7 > 15 ? 'ok' : 'bad'}>
                  {row.signups > 0 ? `${Math.round((row.day7 / row.signups) * 100)}%` : '—'}
                </td>
                <td className={row.day30 > 20 ? 'good' : row.day30 > 10 ? 'ok' : 'bad'}>
                  {row.signups > 0 ? `${Math.round((row.day30 / row.signups) * 100)}%` : '—'}
                </td>
              </tr>
            ))}
            {data.cohorts.length === 0 && (
              <tr><td colSpan={4} className="agd-empty">Nu sunt date suficiente.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Qualitative signals */}
      <section className="agd-card">
        <h2 className="agd-card-title">Semnale calitative Mara</h2>
        <div className="agd-signals">
          {data.qualitativeSignals.map(s => (
            <div key={s.type} className="agd-signal-chip">
              <span className="agd-signal-type">{s.type}</span>
              <span className="agd-signal-count">{s.count}</span>
            </div>
          ))}
          {data.qualitativeSignals.length === 0 && (
            <p className="agd-empty">Niciun semnal activ momentan.</p>
          )}
        </div>
        <p className="agd-hint">Câți useri au primit context de investigator în conversații astăzi.</p>
      </section>

      {/* Top referrers */}
      <section className="agd-card">
        <h2 className="agd-card-title">Top referreri</h2>
        {data.topReferrers.length === 0 ? (
          <p className="agd-empty">Nicio referral înregistrată încă.</p>
        ) : (
          <table className="agd-table">
            <thead>
              <tr><th>#</th><th>User ID</th><th>Referrals</th><th>XP câștigat</th></tr>
            </thead>
            <tbody>
              {data.topReferrers.map((r, i) => (
                <tr key={r.userId}>
                  <td>{i + 1}</td>
                  <td className="agd-mono">{r.userId.slice(0, 12)}…</td>
                  <td>{r.referralCount}</td>
                  <td>+{r.xpEarned} XP</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
