// Admin-only dashboard for the pre-launch waitlist.
//
// Visible at /admin/waitlist. Mirrors AdminBrain / AdminExperiments
// patterns: inline styles, fetch-with-credentials, 403 fallback for
// non-admins. The backend gates every endpoint via the same
// requireAdmin middleware used by /api/admin/mara/*.
//
// CSV download is a plain anchor to /api/admin/waitlist/export.csv —
// the browser handles streaming and the Content-Disposition header.

import { useCallback, useEffect, useState } from 'react';

interface WaitlistEntry {
  id: number;
  email: string;
  source: string;
  referrer: string | null;
  createdAt: number;
  createdAtIso: string;
}

interface WaitlistResponse {
  total: number;
  last_24h: number;
  entries: WaitlistEntry[];
}

export default function AdminWaitlist() {
  const [data, setData] = useState<WaitlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/waitlist', {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(`Failed to load waitlist (${res.status})`);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as WaitlistResponse;
      setData(json);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <h1>Admin · Waitlist</h1>
        <p>Loading…</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={pageStyle}>
        <h1>Admin · Waitlist</h1>
        <p style={{ color: '#c00' }}>
          403 — admin access required. Set your email in{' '}
          <code>ADMIN_EMAILS</code> on the server.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <h1>Admin · Waitlist</h1>
        <p style={{ color: '#c00' }}>{error}</p>
        <button onClick={() => void load()} style={btnStyle}>
          Retry
        </button>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const filterLc = filter.trim().toLowerCase();
  const visible = filterLc
    ? entries.filter(
        (e) =>
          e.email.toLowerCase().includes(filterLc) ||
          (e.source ?? '').toLowerCase().includes(filterLc) ||
          (e.referrer ?? '').toLowerCase().includes(filterLc),
      )
    : entries;

  return (
    <div style={pageStyle}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Admin · Waitlist</h1>
        <span style={{ color: '#666', fontSize: 14 }}>
          {data?.total ?? 0} total · {data?.last_24h ?? 0} in the last 24h
        </span>
        <span style={{ flex: 1 }} />
        <a
          href="/api/admin/waitlist/export.csv"
          style={{ ...btnStyle, textDecoration: 'none' }}
        >
          Export CSV
        </a>
        <button onClick={() => void load()} style={btnStyle}>
          Refresh
        </button>
      </header>

      <input
        type="search"
        placeholder="Filter by email, source, or referrer…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          margin: '16px 0',
          border: '1px solid #ddd',
          borderRadius: 4,
          fontSize: 14,
        }}
      />

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Source</th>
            <th style={thStyle}>Referrer</th>
            <th style={thStyle}>Signed up at</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, color: '#888' }}>
                {filterLc
                  ? 'No entries match this filter.'
                  : 'No waitlist signups yet.'}
              </td>
            </tr>
          ) : (
            visible.map((e) => (
              <tr key={e.id}>
                <td style={tdStyle}>{e.id}</td>
                <td style={tdStyle}>{e.email}</td>
                <td style={tdStyle}>{e.source}</td>
                <td style={{ ...tdStyle, color: '#666', fontSize: 12 }}>
                  {e.referrer || '—'}
                </td>
                <td style={{ ...tdStyle, color: '#666', fontSize: 12 }}>
                  {e.createdAtIso.slice(0, 19).replace('T', ' ')}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: 1100,
  margin: '0 auto',
  color: '#222',
};

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  border: '1px solid #ddd',
  background: '#f8f8f8',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  color: '#222',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #ddd',
  background: '#fafafa',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #eee',
};
