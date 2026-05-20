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

function fmtDate(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

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
          <StatCard icon="📝" label="Ultimul log brain" value={stats.brain.lastLog?.message?.slice(0, 40) ?? '—'} sub={stats.brain.lastLog ? fmtDate(stats.brain.lastLog.created_at) : ''} />
        </div>
      </div>
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
                  <span className="adb-log-time">{fmtDate(l.created_at)}</span>
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
              <p>{r.content}</p>
              <span className="adb-reflection-time">{fmtDate(r.created_at)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Tab: Knowledge ───────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);

  useEffect(() => {
    fetch('/api/admin/dashboard/knowledge', { credentials: 'include' })
      .then(r => r.json()).then(d => setEntries(d.entries ?? [])).catch(() => {});
  }, []);

  return (
    <div className="adb-knowledge">
      <div className="adb-card">
        <SectionHeader icon="📚" title="Ce a învățat Mara (ultimele 20)" />
        {entries.length === 0
          ? <p className="adb-empty">Nicio intrare în knowledge base</p>
          : (
            <table className="adb-table adb-table--full">
              <thead>
                <tr>
                  <th>Categorie</th>
                  <th>Topic</th>
                  <th>Sursă</th>
                  <th>Confidence</th>
                  <th>Acces</th>
                  <th>Actualizat</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>{e.category}</td>
                    <td title={e.content}>{e.topic}</td>
                    <td>{e.source}</td>
                    <td>{e.confidence ?? '—'}</td>
                    <td>{e.access_count}</td>
                    <td>{fmtDate(e.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
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
                <span>Creat: {fmtDate(exp.created_at)}</span>
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
                    <td>{fmtDate(b.created_at)}</td>
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
            <div className="adb-chat-time">{fmtDate(m.created_at)}</div>
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
                      <td>{fmtDate(r.created_at)}</td>
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

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'brain', icon: '🧠', label: 'Brain' },
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

  useEffect(() => {
    fetch('/api/admin/dashboard', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => setStats(d))
      .catch(err => setStatsError(`Eroare la încărcare stats: ${err.message}`));
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
          </button>
        ))}
      </div>

      <div className="adb-content">
        {activeTab === 'overview'     && <OverviewTab stats={stats} />}
        {activeTab === 'brain'        && <BrainTab />}
        {activeTab === 'knowledge'    && <KnowledgeTab />}
        {activeTab === 'experiments'  && <ExperimentsTab />}
        {activeTab === 'library'      && <LibraryTab />}
        {activeTab === 'chat'         && <ChatTab />}
        {activeTab === 'ailogs'       && <AiLogsTab />}
      </div>
    </div>
  );
}
