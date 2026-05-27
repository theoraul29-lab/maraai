import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import ShareButton from './components/ShareButton';
import PayPalProgramButton from './components/PayPalProgramButton';
import './styles/Missions.css';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const PILLAR_META: Record<string, { icon: string; color: string }> = {
  discipline: { icon: '🎯', color: '#a855f7' },
  creativity: { icon: '🎨', color: '#ec4899' },
  life:        { icon: '🌱', color: '#22c55e' },
  acceptance:  { icon: '🤍', color: '#06b6d4' },
  helping:     { icon: '🤝', color: '#f59e0b' },
  self:        { icon: '🔍', color: '#8b5cf6' },
  hobby:       { icon: '🎭', color: '#ef4444' },
};

const DIFFICULTY_META: Record<string, { color: string }> = {
  gentle: { color: '#22c55e' },
  medium: { color: '#f59e0b' },
  deep:   { color: '#ef4444' },
};

interface Mission {
  id: string;
  title: string;
  description: string;
  pillar: string;
  difficulty: string;
  xp_reward: number;
  proof_type: string;
  proof_prompt: string;
  steps: string;
  reflection: string | null;
  user_status?: string | null;
  user_mission_id?: string | null;
  mara_feedback?: string | null;
}

interface UserXp {
  xp: number;
  level: number;
  streak: number;
}

interface Program {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  duration_days: number;
  price_cents: number;
  difficulty: string;
  is_featured: number;
}

interface Enrollment {
  id: string;
  program_name: string;
  slug: string;
  duration_days: number;
  current_day: number;
  streak: number;
  longest_streak: number;
  status: string;
}

interface DayMissionData {
  enrollment: Enrollment;
  currentDay: number;
  totalDays: number;
  percentComplete: number;
  isCompleted: boolean;
  streakMessage: string;
  mission: {
    id: string;
    title: string;
    description: string;
    proofPrompt: string;
    intent: string;
    proofType: string;
    xpReward: number;
    steps: string[];
    reflection: string;
    isAiGenerated: boolean;
  } | null;
}

interface JournalEntry {
  id: string;
  day_number: number;
  program_name: string;
  mara_page: string;
  mara_reflection: string;
  mood: string;
  tags: string;
  visibility: string;
  created_at: number;
  is_milestone: number;
}

interface Book {
  id: string;
  title: string;
  subtitle: string;
  total_pages: number;
  program_name: string;
  chapters: string;
  status: string;
}

type View = 'list' | 'onboarding';
type Tab = 'missions' | 'programs' | 'journal' | 'book' | 'community' | 'leaderboard';
type ChatPhase = 'idle' | 'preview' | 'active' | 'reviewing' | 'done' | 'locked';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  profileImageUrl: string | null;
  xp: number;
  level: number;
  streak: number;
  missionsCompleted: number;
}

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: 'include', ...opts });
}

function apiFetchJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  return apiFetch(path, {
    headers: { 'Content-Type': 'application/json', ...((opts.headers as Record<string, string>) ?? {}) },
    ...opts,
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

// ── Transformation milestones ────────────────────────────────────────────────
const TRANSFORMATION_MILESTONES = [
  { days: 1,    label: 'New Mindset',  icon: '🧠', color: '#a78bfa' },
  { days: 21,   label: 'New Habit',    icon: '🔁', color: '#60a5fa' },
  { days: 90,   label: 'New Skills',   icon: '⚡', color: '#34d399' },
  { days: 180,  label: 'New Body',     icon: '💪', color: '#f59e0b' },
  { days: 365,  label: 'New Life',     icon: '🌅', color: '#f472b6' },
  { days: 1095, label: 'New You',      icon: '✨', color: '#c77dff' },
];

function getActiveTier(completed: number) {
  let tier = 0;
  for (let i = 0; i < TRANSFORMATION_MILESTONES.length; i++) {
    if (completed >= TRANSFORMATION_MILESTONES[i].days) tier = i;
    else break;
  }
  return tier;
}

// ── Mara Lightning ───────────────────────────────────────────────────────────
function MaraLightning({ isThinking }: { isThinking: boolean }) {
  return (
    <div className={`mara-lightning-container${isThinking ? ' mara-lightning-container--thinking' : ''}`}>
      <svg viewBox="0 0 300 420" className="mara-lightning-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="30%"  stopColor="#c4b5fd" stopOpacity="0.85" />
            <stop offset="70%"  stopColor="#7c3aed" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orb-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <filter id="bolt-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="orb-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="intense-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="18" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Deep space background dots */}
        {[
          [42,30],[80,18],[200,25],[258,40],[20,90],[278,75],[15,160],
          [285,150],[22,240],[275,220],[50,340],[260,320],[140,12],[160,400],
        ].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={0.8 + (i % 3) * 0.4}
            fill="rgba(200,180,255,0.4)" className={`mara-star mara-star-${(i % 4) + 1}`} />
        ))}

        {/* Halo rings */}
        <circle cx="150" cy="190" r="88" fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="1" className="mara-halo mara-halo-1" />
        <circle cx="150" cy="190" r="66" fill="none" stroke="rgba(167,139,250,0.18)" strokeWidth="1" className="mara-halo mara-halo-2" />
        <circle cx="150" cy="190" r="44" fill="none" stroke="rgba(196,181,253,0.22)" strokeWidth="1" className="mara-halo mara-halo-3" />

        {/* === LIGHTNING BOLTS === */}
        {/* Each bolt: glow layer + sharp layer */}

        {/* Bolt 1 — UP */}
        <polyline className="mara-bolt mara-bolt-1 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 146,152 157,132 149,106 158,78 150,54" />
        <polyline className="mara-bolt mara-bolt-1"
          points="150,190 146,152 157,132 149,106 158,78 150,54" />

        {/* Bolt 2 — UPPER-RIGHT */}
        <polyline className="mara-bolt mara-bolt-2 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 172,165 192,155 214,132 238,112" />
        <polyline className="mara-bolt mara-bolt-2"
          points="150,190 172,165 192,155 214,132 238,112" />

        {/* Bolt 3 — RIGHT */}
        <polyline className="mara-bolt mara-bolt-3 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 186,182 212,192 244,183 272,190" />
        <polyline className="mara-bolt mara-bolt-3"
          points="150,190 186,182 212,192 244,183 272,190" />

        {/* Bolt 4 — LOWER-RIGHT */}
        <polyline className="mara-bolt mara-bolt-4 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 170,214 196,232 220,258 246,276" />
        <polyline className="mara-bolt mara-bolt-4"
          points="150,190 170,214 196,232 220,258 246,276" />

        {/* Bolt 5 — DOWN */}
        <polyline className="mara-bolt mara-bolt-5 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 155,224 144,254 152,284 147,314 153,344" />
        <polyline className="mara-bolt mara-bolt-5"
          points="150,190 155,224 144,254 152,284 147,314 153,344" />

        {/* Bolt 6 — LOWER-LEFT */}
        <polyline className="mara-bolt mara-bolt-6 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 128,213 105,228 82,253 58,270" />
        <polyline className="mara-bolt mara-bolt-6"
          points="150,190 128,213 105,228 82,253 58,270" />

        {/* Bolt 7 — LEFT */}
        <polyline className="mara-bolt mara-bolt-7 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 114,183 90,192 60,182 32,188" />
        <polyline className="mara-bolt mara-bolt-7"
          points="150,190 114,183 90,192 60,182 32,188" />

        {/* Bolt 8 — UPPER-LEFT */}
        <polyline className="mara-bolt mara-bolt-8 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 128,163 109,148 86,124 62,100" />
        <polyline className="mara-bolt mara-bolt-8"
          points="150,190 128,163 109,148 86,124 62,100" />

        {/* Extra thinking bolts (only visible when thinking) */}
        <polyline className="mara-bolt mara-bolt-think mara-bolt-t1 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 158,145 168,118 162,88" />
        <polyline className="mara-bolt mara-bolt-think mara-bolt-t1"
          points="150,190 158,145 168,118 162,88" />
        <polyline className="mara-bolt mara-bolt-think mara-bolt-t2 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 182,198 218,188 252,196" />
        <polyline className="mara-bolt mara-bolt-think mara-bolt-t2"
          points="150,190 182,198 218,188 252,196" />
        <polyline className="mara-bolt mara-bolt-think mara-bolt-t3 mara-bolt-glow" filter="url(#bolt-glow)"
          points="150,190 120,198 88,188 56,194" />
        <polyline className="mara-bolt mara-bolt-think mara-bolt-t3"
          points="150,190 120,198 88,188 56,194" />

        {/* Orb halo (outer glow) */}
        <circle cx="150" cy="190" r="34" fill="url(#orb-halo)" filter="url(#orb-glow)" className="mara-orb-halo" />

        {/* Orb core */}
        <circle cx="150" cy="190" r="18" fill="url(#orb-core)" className="mara-orb-core" />

        {/* Orb inner spark */}
        <circle cx="150" cy="190" r="7" fill="rgba(255,255,255,0.95)" className="mara-orb-spark" />

        {/* Intense pulse when thinking */}
        <circle cx="150" cy="190" r="28" fill="none"
          stroke="rgba(167,139,250,0.6)" strokeWidth="2"
          className="mara-orb-pulse" filter="url(#intense-glow)" />
      </svg>
    </div>
  );
}

// ── Transformation Journey ───────────────────────────────────────────────────
const MILESTONE_KEYS: Record<number, string> = {
  1: 'missions.milestone.newMindset',
  21: 'missions.milestone.newHabit',
  90: 'missions.milestone.newSkills',
  180: 'missions.milestone.newBody',
  365: 'missions.milestone.newLife',
  1095: 'missions.milestone.newYou',
};

function TransformationJourney({ completed }: { completed: number }) {
  const { t } = useTranslation();
  const activeTier = getActiveTier(completed);
  const next = TRANSFORMATION_MILESTONES[activeTier + 1];
  const current = TRANSFORMATION_MILESTONES[activeTier];
  const _prev = activeTier > 0 ? TRANSFORMATION_MILESTONES[activeTier - 1] : null; void _prev;
  const progress = next
    ? Math.min(1, (completed - current.days) / (next.days - current.days))
    : 1;

  const getLabel = (m: typeof TRANSFORMATION_MILESTONES[number]) =>
    t(MILESTONE_KEYS[m.days], m.label);

  return (
    <div className="transformation-journey">
      <div className="tj-milestones">
        {TRANSFORMATION_MILESTONES.map((m, i) => (
          <div
            key={m.days}
            className={`tj-node ${i < activeTier ? 'tj-node--done' : i === activeTier ? 'tj-node--active' : 'tj-node--future'}`}
            title={`${getLabel(m)} — ${m.days} ${t('missions.days', 'days')}`}
          >
            <span className="tj-node-icon">{i <= activeTier ? m.icon : '○'}</span>
          </div>
        ))}
      </div>
      <div className="tj-track">
        <div className="tj-track-fill" style={{ width: `${((activeTier + progress) / (TRANSFORMATION_MILESTONES.length - 1)) * 100}%` }} />
      </div>
      <div className="tj-label">
        <span className="tj-current" style={{ color: current.color }}>
          {current.icon} {getLabel(current)}
        </span>
        {next && (
          <span className="tj-next">→ {getLabel(next)} ({next.days - completed} {t('missions.days', 'days')})</span>
        )}
      </div>
    </div>
  );
}

// ── Mission card (collection) ───────────────────────────────────────────────
function MissionCardNew({
  mission, index, isLocked, isFree, isActive, onSelect, isSelected,
}: {
  mission: Mission;
  index: number;
  isLocked: boolean;
  isFree: boolean;
  isActive: boolean;
  onSelect: (m: Mission, locked: boolean) => void;
  isSelected: boolean;
}) {
  const { t } = useTranslation();
  const pillarMeta = PILLAR_META[mission.pillar] ?? { icon: '🎯', color: '#a855f7' };
  const isCompleted = mission.user_status === 'completed';

  return (
    <button
      className={[
        'mc-card',
        isCompleted ? 'mc-card--done' : '',
        isActive ? 'mc-card--active' : '',
        isLocked ? 'mc-card--locked' : '',
        isSelected ? 'mc-card--selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(mission, isLocked)}
      style={{ '--pillar': pillarMeta.color } as React.CSSProperties}
    >
      {index >= 0 && <div className="mc-num">#{index + 1}</div>}
      {isFree && index >= 0 && index < 10 && !isCompleted && <div className="mc-free">{t('missions.freeBadge', 'FREE')}</div>}
      <div className="mc-icon">
        {isLocked ? '🔒' : pillarMeta.icon}
      </div>
      <div className="mc-title">{isLocked ? '???' : mission.title}</div>
      {isCompleted && <div className="mc-done-check">✓</div>}
      {isActive && <div className="mc-active-ring" />}
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Missions() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('list');
  const [activeTab, setActiveTab] = useState<Tab>('missions');
  const [chatPhase, setChatPhase] = useState<ChatPhase>('idle');

  const [missions, setMissions] = useState<Mission[]>([]);
  const [dailyMissions, setDailyMissions] = useState<Mission[]>([]);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [userXp, setUserXp] = useState<UserXp>({ xp: 0, level: 1, streak: 0 });
  const [selectedPillar, setSelectedPillar] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [proofText, setProofText] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [completionResult, setCompletionResult] = useState<{
    maraFeedback: string; message: string; leveledUp: boolean;
  } | null>(null);
  const [onboardingAnswers, setOnboardingAnswers] = useState({
    whatYouLove: '', wantToChange: '', currentHobbies: '', dreamLife: '', biggestFear: '',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const [programs, setPrograms] = useState<Program[]>([]);
  const [billingPrograms, setBillingPrograms] = useState<Array<{
    id: string; name: string; durationDays: number; priceCents: number; freeDays: number; currency: string;
  }>>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [dayMissions, setDayMissions] = useState<Record<string, DayMissionData>>({});
  const [enrollingSlug, setEnrollingSlug] = useState<string | null>(null);
  const [enrollSettings, setEnrollSettings] = useState({ habitDescription: '', notificationHour: 8 });
  const [completingEnrollment, setCompletingEnrollment] = useState<string | null>(null);
  const [programProofText, setProgramProofText] = useState('');
  const [programResult, setProgramResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [communityFeed, setCommunityFeed] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [statsDetailed, setStatsDetailed] = useState<{
    completed: number; byPillar: Array<{ pillar: string; cnt: number }>;
  } | null>(null);
  const [purchasedPrograms, setPurchasedPrograms] = useState<string[]>([]);
  const [paymentNotice, setPaymentNotice] = useState<'success' | 'failed' | 'cancelled' | null>(null);
  const [paymentProgram, setPaymentProgram] = useState<string | null>(null);

  const location = useLocation();

  // ── data loaders ──────────────────────────────────────────────────────────
  const loadMissions = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const langQ = `lang=${encodeURIComponent(i18n.language)}`;
      const pillarQ = selectedPillar !== 'all' ? `?pillar=${selectedPillar}&${langQ}` : `?${langQ}`;
      const [data, daily] = await Promise.all([
        apiFetchJson<{ missions: Mission[]; userXp: UserXp }>(`/api/missions${pillarQ}`),
        apiFetchJson<{ missions: Mission[] }>(`/api/missions/daily?${langQ}`),
      ]);
      setMissions(data.missions);
      setUserXp(data.userXp);
      setDailyMissions(daily.missions);
    } catch {
      setError(t('missions.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, selectedPillar, t]);

  async function loadPrograms() {
    try {
      const [r, billing] = await Promise.all([
        apiFetchJson<{ programs: Program[] }>('/api/programs'),
        apiFetchJson<{ programs: Array<{ id: string; name: string; durationDays: number; priceCents: number; freeDays: number; currency: string }> }>('/api/billing/programs').catch(() => ({ programs: [] })),
      ]);
      setPrograms(r.programs ?? []);
      setBillingPrograms(billing.programs ?? []);
    } catch {}
  }

  async function loadEnrollments() {
    if (!isAuthenticated) return;
    try {
      const r = await apiFetchJson<{ enrollments: Enrollment[] }>('/api/programs/my/enrollments');
      setEnrollments(r.enrollments ?? []);
      for (const e of r.enrollments ?? []) {
        if (e.status === 'active') loadDayMission(e.id);
      }
    } catch {}
  }

  async function loadDayMission(enrollmentId: string) {
    try {
      const d = await apiFetchJson<DayMissionData>(`/api/programs/enrollment/${enrollmentId}/today?lang=${encodeURIComponent(i18n.language)}`);
      setDayMissions((prev) => ({ ...prev, [enrollmentId]: d }));
    } catch {}
  }

  async function loadJournal() {
    if (!isAuthenticated) return;
    try {
      const r = await apiFetchJson<{ entries: JournalEntry[]; total: number }>('/api/journal?limit=20');
      setJournalEntries(r.entries ?? []);
      setJournalTotal(r.total ?? 0);
    } catch {}
  }

  async function loadBooks() {
    if (!isAuthenticated) return;
    try {
      const r = await apiFetchJson<{ books: Book[] }>('/api/books/my');
      setBooks(r.books ?? []);
    } catch {}
  }

  async function loadCommunity() {
    try {
      const r = await apiFetchJson<{ feed: any[] }>('/api/missions/community');
      setCommunityFeed(r.feed ?? []);
    } catch {}
  }

  async function loadLeaderboard() {
    setLeaderboardLoading(true);
    try {
      const r = await apiFetchJson<{ leaderboard: LeaderboardEntry[] }>('/api/missions/leaderboard');
      setLeaderboard(r.leaderboard ?? []);
    } catch {} finally { setLeaderboardLoading(false); }
  }

  async function loadStatsDetailed() {
    if (!isAuthenticated) return;
    try {
      const r = await apiFetchJson<{
        completed: number; byPillar: Array<{ pillar: string; cnt: number }>;
      }>('/api/missions/stats');
      setStatsDetailed(r);
    } catch {}
  }

  async function loadPurchasedPrograms() {
    if (!isAuthenticated) return;
    try {
      const r = await apiFetchJson<{ purchased: string[] }>('/api/billing/program/access');
      setPurchasedPrograms(r.purchased ?? []);
    } catch {}
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    apiFetchJson<{ done: boolean }>('/api/missions/onboarding')
      .then((res) => { if (!res.done) setView('onboarding'); else loadMissions(); })
      .catch(() => loadMissions());
    loadPrograms();
    loadEnrollments();
    loadJournal();
    loadBooks();
    loadCommunity();
    loadStatsDetailed();
    loadPurchasedPrograms();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle PayPal redirect back (?payment=success&program=new_habit)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payment = params.get('payment') as 'success' | 'failed' | 'cancelled' | null;
    if (payment) {
      setPaymentNotice(payment);
      setPaymentProgram(params.get('program'));
      if (payment === 'success') {
        loadPurchasedPrograms();
        loadEnrollments();
        setActiveTab('programs');
      }
      window.history.replaceState({}, '', location.pathname);
      setTimeout(() => setPaymentNotice(null), 6000);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === 'list') loadMissions();
  }, [selectedPillar, view, loadMissions]);

  useEffect(() => {
    if (activeTab === 'leaderboard') loadLeaderboard();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleCardSelect = (mission: Mission, isLocked: boolean) => {
    setError('');
    if (isLocked) {
      setActiveMission(null);
      setChatPhase('locked');
      return;
    }
    setActiveMission(mission);
    if (mission.user_status === 'active') {
      setChatPhase('active');
    } else {
      setChatPhase('preview');
    }
  };

  const handleStartMission = async (mission: Mission) => {
    if (!isAuthenticated) { navigate('/'); return; }
    setLoading(true);
    try {
      await apiFetchJson(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' });
      setActiveMission(mission);
      setChatPhase('active');
    } catch { setError(t('missions.errorStart')); }
    finally { setLoading(false); }
  };

  const handleSubmitProof = async () => {
    if (!activeMission || !proofText.trim()) { setError(t('missions.errorProofRequired')); return; }
    setChatPhase('reviewing');
    try {
      const result = await apiFetchJson<{
        success: boolean; maraFeedback: string; message: string; leveledUp: boolean;
      }>(`/api/missions/${activeMission.id}/proof`, {
        method: 'POST',
        body: JSON.stringify({ text: proofText, reflectionAnswer: reflectionText || undefined, lang: i18n.language }),
      });
      if (result.success) {
        setCompletionResult(result);
        setChatPhase('done');
        setProofText('');
        setReflectionText('');
        loadMissions();
        loadStatsDetailed();
      }
    } catch { setError(t('missions.errorProof')); setChatPhase('active'); }
  };

  const handleGenerateMission = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await apiFetchJson<{ mission: Mission }>('/api/missions/generate', {
        method: 'POST', body: JSON.stringify({ lang: i18n.language }),
      });
      if (result.mission) setMissions((prev) => [result.mission, ...prev]);
    } catch { setError(t('missions.errorAI')); }
    finally { setGenerating(false); }
  };

  const handleOnboardingSubmit = async () => {
    if (!onboardingAnswers.whatYouLove.trim()) { setError(t('missions.errorFill')); return; }
    setLoading(true);
    try {
      await apiFetchJson('/api/missions/onboarding', {
        method: 'POST', body: JSON.stringify(onboardingAnswers),
      });
      setView('list');
    } catch { setError(t('missions.errorSave')); }
    finally { setLoading(false); }
  };

  async function confirmEnroll() {
    if (!enrollingSlug) return;
    try {
      const r = await apiFetchJson<{ success: boolean; enrollmentId?: string; message?: string }>(
        `/api/programs/${enrollingSlug}/enroll`,
        { method: 'POST', body: JSON.stringify({ ...enrollSettings, language: i18n.language }) },
      );
      if (r.success) {
        setEnrollingSlug(null);
        await loadEnrollments();
      } else {
        setError(r.message ?? t('missions.errorEnroll'));
      }
    } catch { setError(t('missions.errorNetwork')); }
  }

  async function handleCompleteDay(enrollmentId: string, proofContent: string) {
    setSubmitting(true);
    try {
      const r = await apiFetchJson<any>(
        `/api/programs/enrollment/${enrollmentId}/complete`,
        { method: 'POST', body: JSON.stringify({ type: 'text', content: proofContent, language: i18n.language }) },
      );
      if (r.success) {
        setProgramResult(r);
        await loadEnrollments();
        await loadJournal();
        if (r.programCompleted) await loadBooks();
      } else {
        setError(r.message ?? t('common.error'));
      }
    } catch { setError(t('missions.errorNetwork')); }
    setSubmitting(false);
  }

  async function updateVisibility(entryId: string, visibility: string) {
    await apiFetch(`/api/journal/${entryId}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    });
    loadJournal();
  }

  // ── sequential unlock logic ───────────────────────────────────────────────
  const orderedMissions = [...missions].sort((a, b) => {
    const rank = (s?: string | null) => s === 'completed' ? 0 : s === 'active' ? 1 : 2;
    return rank(a.user_status) - rank(b.user_status);
  });

  const isMissionLocked = (idx: number) => {
    if (idx === 0) return false;
    return orderedMissions[idx - 1]?.user_status !== 'completed';
  };

  const xpProgress = (userXp.xp % 1000) / 1000 * 100;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'missions',    label: t('missions.tabMissions') },
    { key: 'programs',    label: t('missions.tabPrograms') },
    { key: 'journal',     label: t('missions.tabJournal') },
    { key: 'book',        label: t('missions.tabBook') },
    { key: 'community',   label: t('missions.tabCommunity') },
    { key: 'leaderboard', label: t('missions.tabLeaderboard') },
  ];

  // ── auth wall ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="missions-page">
        <div className="missions-auth-wall">
          <div className="missions-auth-icon">🌳</div>
          <h2>Mara Missions</h2>
          <p>{t('missions.authWall')}</p>
          <button className="mara-cta-btn" onClick={() => navigate('/')}>{t('missions.loginBtn')}</button>
        </div>
      </div>
    );
  }

  // ── onboarding ────────────────────────────────────────────────────────────
  if (view === 'onboarding') {
    const questions = [
      { key: 'whatYouLove',     q: t('missions.q1') },
      { key: 'wantToChange',    q: t('missions.q2') },
      { key: 'currentHobbies', q: t('missions.q3') },
      { key: 'dreamLife',       q: t('missions.q4') },
      { key: 'biggestFear',     q: t('missions.q5') },
    ];
    return (
      <div className="missions-page missions-page--onboarding">
        <MaraLightning isThinking={loading} />
        <div className="missions-onboarding">
          <div className="missions-onboarding-header">
            <h1>{t('missions.onboardingTitle')}</h1>
            <p>{t('missions.onboardingSubtitle')}</p>
          </div>
          {error && <div className="missions-error">{error}</div>}
          <div className="missions-onboarding-form">
            {questions.map(({ key, q }) => (
              <div key={key} className="missions-onboarding-field">
                <label>{q}</label>
                <textarea
                  value={onboardingAnswers[key as keyof typeof onboardingAnswers]}
                  onChange={(e) => setOnboardingAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={t('missions.placeholderFree')}
                  rows={3}
                />
              </div>
            ))}
            <button className="mara-cta-btn mara-cta-btn--full" onClick={handleOnboardingSubmit} disabled={loading}>
              {loading ? t('missions.saving') : t('missions.continue')}
            </button>
            <button className="mara-btn-ghost" onClick={() => setView('list')}>{t('missions.skip')}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── main layout ───────────────────────────────────────────────────────────
  return (
    <div className="missions-page">

      {/* Enroll modal */}
      {enrollingSlug && (
        <div className="enroll-modal-overlay" onClick={() => setEnrollingSlug(null)}>
          <div className="enroll-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('missions.customizeProgram')}</h3>
            <p>{t('missions.customizeProgramDesc')}</p>
            <textarea
              className="mara-proof-input"
              placeholder={t('missions.customizeProgramPlaceholder')}
              value={enrollSettings.habitDescription}
              onChange={(e) => setEnrollSettings((prev) => ({ ...prev, habitDescription: e.target.value }))}
              rows={3}
            />
            <div className="enroll-modal-actions">
              <button className="mara-cta-btn" onClick={confirmEnroll}>{t('missions.startProgram')}</button>
              <button className="mara-btn-ghost" onClick={() => setEnrollingSlug(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Compact header */}
      <div className="missions-header-v4">
        <button className="missions-back-btn" onClick={() => navigate('/')}>{t('missions.backHome')}</button>
        <div className="missions-xp-strip">
          <span className="missions-level-badge">Lvl {userXp.level}</span>
          <div className="missions-xp-bar">
            <div className="missions-xp-fill" style={{ width: `${xpProgress}%` }} />
          </div>
          <span className="missions-xp-num">{userXp.xp} XP</span>
          {userXp.streak > 0 && <span className="missions-streak-badge">🔥 {userXp.streak}</span>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="missions-tabs">
        {TABS.map((tab) => (
          <button key={tab.key}
            className={`missions-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── MISSIONS TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'missions' && (
        <div className="missions-split">

          {/* LEFT PANEL: Mara lightning + chat */}
          <div className="missions-panel-left">
            <MaraLightning isThinking={chatPhase === 'reviewing' || (loading && chatPhase === 'idle') || generating} />
            <div className="mara-motto">
              <span>{t('missions.motto1')}</span>
              <span>{t('missions.motto21')}</span>
              <span>{t('missions.motto90')}</span>
              <span>{t('missions.motto180')}</span>
              <span>{t('missions.motto365')}</span>
              <span>{t('missions.motto1095')}</span>
            </div>

            <div className="mara-chat-area">
              {error && (
                <div className="missions-error" onClick={() => setError('')}>{error} ×</div>
              )}

              {/* IDLE */}
              {chatPhase === 'idle' && (
                <div className="mara-bubble mara-bubble--mara">
                  <p className="mara-greeting">{t('missions.maraGreeting')}</p>
                  <p>{t('missions.maraIdleDesc')}</p>
                  {dailyMissions.length > 0 && (
                    <button className="mara-cta-btn" onClick={() => handleCardSelect(dailyMissions[0], false)}>
                      {t('missions.dailyMissionCta')}
                    </button>
                  )}
                </div>
              )}

              {/* LOCKED */}
              {chatPhase === 'locked' && (
                <div className="mara-bubble mara-bubble--mara">
                  <p>{t('missions.lockedMsg')}</p>
                  <p style={{ opacity: 0.7, fontSize: '0.88rem' }}>{t('missions.lockedSub')}</p>
                  <button className="mara-cta-btn mara-cta-btn--secondary" onClick={() => setChatPhase('idle')}>
                    {t('missions.back')}
                  </button>
                </div>
              )}

              {/* PREVIEW */}
              {chatPhase === 'preview' && activeMission && (
                <div className="mara-bubble mara-bubble--mara">
                  <div className="mara-mission-header">
                    <span className="mara-pillar-icon">{PILLAR_META[activeMission.pillar]?.icon ?? '🎯'}</span>
                    <span className="mara-difficulty" style={{ color: DIFFICULTY_META[activeMission.difficulty]?.color }}>
                      {t(`missions.difficulty.${activeMission.difficulty}`, activeMission.difficulty)}
                    </span>
                  </div>
                  <h3 className="mara-mission-title">{activeMission.title}</h3>
                  <p className="mara-mission-desc">{activeMission.description}</p>
                  {(() => {
                    try {
                      const steps = JSON.parse(activeMission.steps) as string[];
                      return steps.length > 0 ? (
                        <ol className="mara-steps">
                          {steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      ) : null;
                    } catch { return null; }
                  })()}
                  <div className="mara-xp-badge">+{activeMission.xp_reward} XP</div>
                  {activeMission.user_status === 'completed' ? (
                    <div className="mara-completed-note">
                      <span>{t('missions.missionCompleted')}</span>
                      {activeMission.mara_feedback && (
                        <p className="mara-feedback-quote">"{activeMission.mara_feedback}"</p>
                      )}
                    </div>
                  ) : (
                    <button className="mara-cta-btn" onClick={() => handleStartMission(activeMission)} disabled={loading}>
                      {loading ? t('missions.starting') : t('missions.acceptMission')}
                    </button>
                  )}
                </div>
              )}

              {/* ACTIVE */}
              {chatPhase === 'active' && activeMission && (
                <div className="mara-active-area">
                  <div className="mara-bubble mara-bubble--mara">
                    <div className="mara-mission-header">
                      <span className="mara-pillar-icon">{PILLAR_META[activeMission.pillar]?.icon ?? '🎯'}</span>
                      <span className="mara-active-label">{t('missions.inProgress')}</span>
                    </div>
                    <h3 className="mara-mission-title">{activeMission.title}</h3>
                    <p className="mara-proof-prompt">{activeMission.proof_prompt}</p>
                  </div>
                  <div className="mara-bubble mara-bubble--input">
                    <textarea
                      className="mara-proof-input"
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      placeholder={t('missions.proofPlaceholderDetailed')}
                      rows={5}
                    />
                    {activeMission.reflection && (
                      <textarea
                        className="mara-proof-input"
                        value={reflectionText}
                        onChange={(e) => setReflectionText(e.target.value)}
                        placeholder={t('missions.reflectionPrefix') + activeMission.reflection}
                        rows={2}
                        style={{ marginTop: '8px' }}
                      />
                    )}
                    <div className="mara-input-actions">
                      <button className="mara-cta-btn" onClick={handleSubmitProof} disabled={!proofText.trim()}>
                        {t('missions.submitProofXp', { xp: activeMission.xp_reward })}
                      </button>
                      <button className="mara-btn-ghost" onClick={() => setChatPhase('preview')}>
                        {t('missions.back')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* REVIEWING */}
              {chatPhase === 'reviewing' && (
                <div className="mara-bubble mara-bubble--mara">
                  <div className="mara-thinking">
                    <span /><span /><span />
                  </div>
                  <p style={{ opacity: 0.7, marginTop: '8px' }}>{t('missions.analyzing', 'Mara is analyzing your answer...')}</p>
                </div>
              )}

              {/* DONE */}
              {chatPhase === 'done' && completionResult && (
                <div className="mara-done-area">
                  <div className="mara-bubble mara-bubble--mara mara-bubble--celebration">
                    <div className="mara-done-icon">{completionResult.leveledUp ? '🎉' : '✅'}</div>
                    <p className="mara-done-message">{completionResult.message}</p>
                    <p className="mara-done-feedback">"{completionResult.maraFeedback}"</p>
                  </div>
                  <div className="mara-done-actions">
                    {activeMission && (
                      <ShareButton
                        sourceModule="mission"
                        sourceId={activeMission.id}
                        title={activeMission.title}
                        caption={completionResult.maraFeedback ?? undefined}
                        compact={false}
                      />
                    )}
                    <button className="mara-cta-btn mara-cta-btn--secondary"
                      onClick={() => { setChatPhase('idle'); setActiveMission(null); setCompletionResult(null); }}>
                      {t('missions.newMission')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: mission cards */}
          <div className="missions-panel-right">
            <div className="missions-panel-right-header">
              <div>
                <h3 className="missions-panel-right-title">{t('missions.yourMissions')}</h3>
                <p className="missions-panel-right-sub">
                  {t('missions.completedFreeLabel', { count: statsDetailed?.completed ?? 0 })}
                </p>
              </div>
              <TransformationJourney completed={statsDetailed?.completed ?? 0} />
            </div>

            {/* Pillar filters */}
            <div className="mc-filters">
              <button
                className={`mc-filter-btn ${selectedPillar === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedPillar('all')}
              >
                {t('missions.filterAll')}
              </button>
              {Object.entries(PILLAR_META).map(([key, meta]) => (
                <button
                  key={key}
                  className={`mc-filter-btn ${selectedPillar === key ? 'active' : ''}`}
                  style={selectedPillar === key ? { borderColor: meta.color, color: meta.color } : {}}
                  onClick={() => setSelectedPillar(key)}
                >
                  {meta.icon}
                </button>
              ))}
            </div>

            {/* Daily missions row */}
            {dailyMissions.length > 0 && (
              <div className="mc-section">
                <div className="mc-section-label">{t('missions.dailyLabel')}</div>
                <div className="mc-grid mc-grid--daily">
                  {dailyMissions.map((m) => (
                    <MissionCardNew
                      key={m.id} mission={m} index={-1}
                      isLocked={false} isFree={true}
                      isActive={m.user_status === 'active'}
                      onSelect={handleCardSelect}
                      isSelected={activeMission?.id === m.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Missions collection */}
            <div className="mc-section">
              <div className="mc-section-label">{t('missions.collectionLabel', { count: orderedMissions.length })}</div>
              {loading ? (
                <div className="missions-loading"><div className="missions-spinner" /></div>
              ) : orderedMissions.length === 0 ? (
                <div className="missions-empty">
                  <p>{t('missions.noMissions')}</p>
                </div>
              ) : (
                <div className="mc-grid">
                  {orderedMissions.map((m, idx) => {
                    const milestone = TRANSFORMATION_MILESTONES.find(t => t.days === idx + 1);
                    return (
                      <React.Fragment key={m.id}>
                        {milestone && (
                          <div className="mc-milestone-banner" style={{ '--m-color': milestone.color } as React.CSSProperties}>
                            <span>{milestone.icon}</span>
                            <span>{milestone.label}</span>
                            <span className="mc-milestone-days">{t('missions.daysLabel', { count: milestone.days })}</span>
                          </div>
                        )}
                        <MissionCardNew
                          mission={m} index={idx}
                          isLocked={isMissionLocked(idx)}
                          isFree={idx < 10}
                          isActive={m.user_status === 'active'}
                          onSelect={handleCardSelect}
                          isSelected={activeMission?.id === m.id}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mc-generate">
              <button className="mara-cta-btn mara-cta-btn--secondary" onClick={handleGenerateMission} disabled={generating}>
                {generating ? t('missions.generating') : t('missions.requestNew')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROGRAMS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'programs' && (
        <div className="programs-root">

          {/* Payment notice banner */}
          {paymentNotice && (
            <div className={`payment-notice payment-notice--${paymentNotice}`}>
              {paymentNotice === 'success' && t('missions.paymentSuccess', { name: paymentProgram ? paymentProgram.replace(/_/g, ' ') : '' })}
              {paymentNotice === 'failed' && t('missions.paymentFailed')}
              {paymentNotice === 'cancelled' && t('missions.paymentCancelled')}
            </div>
          )}

          {/* Transformation progression */}
          {billingPrograms.length > 0 && (
            <div className="billing-programs-section">
              <h2 className="billing-programs-title">{t('missions.transformationPath')}</h2>
              <div className="billing-programs-grid">
                {billingPrograms.map((bp) => {
                  const icons: Record<string, string> = {
                    new_mindset: '🧠', new_habit: '🔁', new_skills: '⚡',
                    new_body: '💪', new_life: '🌅', new_you: '✨',
                  };
                  const isPurchased = purchasedPrograms.includes(bp.id);
                  const isFree = bp.priceCents === 0;
                  const hasFreeDays = bp.freeDays > 0 && !isFree;
                  return (
                    <div key={bp.id} className={`billing-program-card ${isPurchased ? 'billing-program-card--owned' : ''} ${isFree ? 'billing-program-card--free' : ''}`}>
                      <div className="billing-program-icon">{icons[bp.id] ?? '📘'}</div>
                      <div className="billing-program-info">
                        <h3>{bp.name}</h3>
                        <span className="billing-program-days">{t('missions.daysLabel', { count: bp.durationDays })}</span>
                        {hasFreeDays && !isPurchased && (
                          <span className="billing-program-free-days">{t('missions.freeDaysLabel', { count: bp.freeDays })}</span>
                        )}
                      </div>
                      <div className="billing-program-action">
                        {isFree || isPurchased ? (
                          <span className="billing-program-badge">
                            {isFree ? t('missions.free') : t('missions.unlocked')}
                          </span>
                        ) : (
                          <PayPalProgramButton
                            programId={bp.id}
                            programName={bp.name}
                            priceCents={bp.priceCents}
                            onSuccess={(id) => {
                              // Reload from server to get authoritative purchased list
                              loadPurchasedPrograms();
                              loadEnrollments();
                              setPaymentNotice('success');
                              setPaymentProgram(id);
                              setTimeout(() => setPaymentNotice(null), 6000);
                            }}
                            onError={() => {
                              setPaymentNotice('failed');
                              setTimeout(() => setPaymentNotice(null), 6000);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {enrollments.filter((e) => e.status === 'active').map((enrollment) => {
            const dm = dayMissions[enrollment.id];
            const pct = Math.round((enrollment.current_day / enrollment.duration_days) * 100);
            return (
              <div key={enrollment.id} className="enrollment-active">
                <div className="enrollment-header">
                  <div className="enrollment-title-row">
                    <h2>{enrollment.program_name}</h2>
                    {enrollment.streak > 0 && (
                      <span className="enrollment-streak">{t('missions.streakDays', { count: enrollment.streak })}</span>
                    )}
                  </div>
                  <div className="enrollment-progress-wrap">
                    <div className="enrollment-bar">
                      <div className="enrollment-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="enrollment-pct">{t('missions.dayOf', { current: enrollment.current_day, total: enrollment.duration_days, pct })}</span>
                  </div>
                  {dm?.streakMessage && <div className="enrollment-streak-msg">{dm.streakMessage}</div>}
                </div>
                {dm && !dm.isCompleted && dm.mission && (
                  <div className="day-mission-card">
                    <div className="day-mission-header">
                      <span className="day-badge">{t('missions.dayBadge', { day: dm.currentDay })}</span>
                      {dm.mission.isAiGenerated && <span className="ai-badge">{t('missions.personalizedByMara')}</span>}
                    </div>
                    <h3 className="day-mission-title">{dm.mission.title}</h3>
                    <p className="day-mission-desc">{dm.mission.description}</p>
                    {dm.mission.steps.length > 0 && (
                      <ol className="day-mission-steps">
                        {dm.mission.steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    )}
                    {dm.mission.proofPrompt && (
                      <div className="day-mission-proof-hint">
                        <span>📎</span><span>{dm.mission.proofPrompt}</span>
                      </div>
                    )}
                    {dm.mission.intent && (
                      <div className="day-mission-intent">
                        <span>✍️</span><span>{dm.mission.intent}</span>
                      </div>
                    )}
                    <textarea
                      className="mara-proof-input"
                      placeholder={t('missions.todayExperience')}
                      value={completingEnrollment === enrollment.id ? programProofText : ''}
                      onChange={(e) => {
                        setCompletingEnrollment(enrollment.id);
                        setProgramProofText(e.target.value);
                        setProgramResult(null);
                      }}
                      rows={4}
                    />
                    {dm.mission.reflection && (
                      <p className="day-mission-reflection">💭 {dm.mission.reflection}</p>
                    )}
                    <button
                      className="mara-cta-btn mara-cta-btn--full"
                      disabled={submitting || !programProofText.trim() || completingEnrollment !== enrollment.id}
                      onClick={() => handleCompleteDay(enrollment.id, programProofText)}
                    >
                      {submitting ? t('missions.maraWritingJournal') : t('missions.completeDay', { day: dm.currentDay })}
                    </button>
                    {programResult && completingEnrollment === enrollment.id && (
                      <div className="program-result">
                        <div className="program-result-page">{programResult.maraJournalPage}</div>
                        <div className="program-result-xp">
                          +{programResult.xpGained} XP
                          {programResult.streakMessage && ` · ${programResult.streakMessage}`}
                        </div>
                        {programResult.programCompleted && (
                          <div className="program-completed">
                            {t('missions.bookReady')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {dm?.isCompleted && (
                  <div className="day-completed">
                    {t('missions.dayCompletedMsg', { day: enrollment.current_day + 1 })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="programs-section-title">
            {enrollments.filter((e) => e.status === 'active').length > 0
              ? t('missions.morePrograms')
              : t('missions.chooseProgram')}
          </div>
          <div className="programs-grid">
            {programs
              .filter((p) => !enrollments.some((e) => e.slug === p.slug && e.status === 'active'))
              .map((program) => (
                <div key={program.id} className={`program-card ${program.is_featured ? 'program-card--featured' : ''}`}>
                  {program.is_featured && <div className="program-featured-badge">{t('missions.featuredBadge')}</div>}
                  <div className="program-card-header">
                    <h2>{program.name}</h2>
                    <span className="program-tagline">{program.tagline}</span>
                  </div>
                  <p className="program-description">{program.description}</p>
                  <div className="program-meta">
                    <span>📅 {t('missions.daysLabel', { count: program.duration_days })}</span>
                    <span>💪 {program.difficulty}</span>
                    <span>{program.price_cents === 0 ? t('missions.free') : `💰 ${(program.price_cents / 100).toFixed(2)} EUR`}</span>
                  </div>
                  <button className="program-enroll-btn" onClick={() => setEnrollingSlug(program.slug)}>
                    {t('missions.startProgramCta', { name: program.name })}
                  </button>
                </div>
              ))}
          </div>

          {enrollments.filter((e) => e.status === 'completed').length > 0 && (
            <>
              <div className="programs-section-title" style={{ marginTop: '32px' }}>{t('missions.completedPrograms')}</div>
              <div className="programs-grid">
                {enrollments.filter((e) => e.status === 'completed').map((e) => (
                  <div key={e.id} className="program-card program-card--completed">
                    <h2>{e.program_name}</h2>
                    <p className="program-description">
                      {t('missions.programCompletedInfo', { days: e.duration_days, streak: e.longest_streak })}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── JOURNAL TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'journal' && (
        <div className="journal-root">
          <div className="journal-header">
            <h2>{t('missions.journalTitle')}</h2>
            <p>{t('missions.journalPages', { count: journalTotal })}</p>
          </div>
          {journalEntries.length === 0 ? (
            <div className="missions-empty">
              <p>{t('missions.journalEmpty')}</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                {t('missions.journalEmptyDesc')}
              </p>
            </div>
          ) : (
            <div className="journal-entries">
              {journalEntries.map((entry) => (
                <div key={entry.id} className={`journal-entry ${entry.is_milestone ? 'journal-entry--milestone' : ''}`}>
                  {entry.is_milestone && <div className="journal-milestone-badge">{t('missions.milestoneMoment')}</div>}
                  <div className="journal-entry-header">
                    <span className="journal-day">{t('missions.dayBadge', { day: entry.day_number })}</span>
                    {entry.program_name && <span className="journal-program">{entry.program_name}</span>}
                    {entry.mood && <span className="journal-mood">{entry.mood}</span>}
                    <span className="journal-date">
                      {new Date(entry.created_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="journal-page">{entry.mara_page}</div>
                  {entry.tags && (() => {
                    try {
                      const tags = JSON.parse(entry.tags) as string[];
                      return tags.length > 0 ? (
                        <div className="journal-tags">
                          {tags.map((tag, i) => <span key={i} className="journal-tag">#{tag}</span>)}
                        </div>
                      ) : null;
                    } catch { return null; }
                  })()}
                  <div className="journal-visibility-row">
                    <select value={entry.visibility} onChange={(e) => updateVisibility(entry.id, e.target.value)}>
                      <option value="private">{t('missions.privLabel')}</option>
                      <option value="community">{t('missions.communityLabel')}</option>
                      <option value="public">{t('missions.publicLabel')}</option>
                    </select>
                    <span className="journal-visibility-hint">
                      {entry.visibility === 'private' ? t('missions.visPrivate')
                        : entry.visibility === 'community' ? t('missions.visCommunity') : t('missions.visPublic')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BOOK TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'book' && (
        <div className="book-root">
          <div className="journal-header">
            <h2>{t('missions.bookTitle')}</h2>
            <p>{t('missions.bookDesc')}</p>
          </div>
          {books.length === 0 ? (
            <div className="missions-empty">
              <p>{t('missions.bookEmpty')}</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                {t('missions.bookEmptyDesc')}
              </p>
              <button className="mara-cta-btn" style={{ marginTop: '16px' }} onClick={() => setActiveTab('programs')}>
                {t('missions.viewPrograms')}
              </button>
            </div>
          ) : (
            books.map((book) => (
              <div key={book.id} className="book-card">
                <div className="book-cover" onClick={() => setSelectedBook(selectedBook?.id === book.id ? null : book)}>
                  <div className="book-cover-spine" />
                  <div className="book-cover-content">
                    <h1 className="book-title">{book.title}</h1>
                    {book.subtitle && <h2 className="book-subtitle">{book.subtitle}</h2>}
                    <p className="book-meta">{t('missions.bookMeta', { pages: book.total_pages, program: book.program_name })}</p>
                    <button className="book-read-btn">
                      {selectedBook?.id === book.id ? t('missions.bookClose') : t('missions.bookRead')}
                    </button>
                  </div>
                </div>
                {selectedBook?.id === book.id && (
                  <div className="book-content">
                    {(() => {
                      try {
                        const chapters = JSON.parse(book.chapters) as any[];
                        return chapters.map((ch) => (
                          <div key={ch.number} className="book-chapter">
                            <h3 className="book-chapter-title">{ch.title}</h3>
                            <p className="book-chapter-range">{ch.dayRange}</p>
                            {(ch.entries ?? []).map((entry: any, i: number) => (
                              <div key={i} className="book-page">
                                <div className="book-page-number">{t('missions.dayBadge', { day: entry.day })}</div>
                                <div className="book-page-content">{entry.page}</div>
                              </div>
                            ))}
                          </div>
                        ));
                      } catch { return <p>{t('missions.bookLoadError')}</p>; }
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── LEADERBOARD TAB ───────────────────────────────────────────────── */}
      {activeTab === 'leaderboard' && (
        <div className="leaderboard-root">
          <div className="journal-header">
            <h2>{t('missions.leaderboardTitle')}</h2>
            <p>{t('missions.leaderboardSubtitle')}</p>
          </div>
          {leaderboardLoading ? (
            <div className="missions-loading"><div className="missions-spinner" /></div>
          ) : leaderboard.length === 0 ? (
            <div className="missions-empty"><p>{t('missions.leaderboardEmpty')}</p></div>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((entry) => (
                <div key={entry.userId} className={`leaderboard-row ${entry.rank <= 3 ? `leaderboard-row--top${entry.rank}` : ''}`}>
                  <div className="leaderboard-rank">
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </div>
                  <div className="leaderboard-avatar">
                    {entry.profileImageUrl
                      ? <img src={entry.profileImageUrl} alt="" />
                      : <div className="leaderboard-avatar-fallback">{(entry.displayName || '?')[0].toUpperCase()}</div>
                    }
                  </div>
                  <div className="leaderboard-info">
                    <div className="leaderboard-name">{entry.displayName}</div>
                    <div className="leaderboard-meta">
                      {t('missions.levelShort')} {entry.level} · {t('missions.missionsCompleted', { count: entry.missionsCompleted })}
                      {entry.streak > 0 && ` · 🔥 ${entry.streak}z`}
                    </div>
                  </div>
                  <div className="leaderboard-xp">{entry.xp.toLocaleString()} XP</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COMMUNITY TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'community' && (
        <div className="community-root">
          <div className="journal-header">
            <h2>{t('missions.communityTitle')}</h2>
            <p>{t('missions.communitySubtitle')}</p>
          </div>
          {communityFeed.length === 0 ? (
            <div className="missions-empty">
              <p>{t('missions.communityEmpty')}</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                {t('missions.communityEmptyDesc')}
              </p>
            </div>
          ) : (
            <div className="journal-entries">
              {communityFeed.map((entry, i) => (
                <div key={i} className="journal-entry">
                  <div className="journal-entry-header">
                    <span className="journal-day">{entry.display_name ?? t('missions.anonymous')}</span>
                    {entry.program_name && <span className="journal-program">{entry.program_name}</span>}
                    {entry.mood && <span className="journal-mood">{entry.mood}</span>}
                    <span className="journal-date">
                      {new Date(entry.created_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="journal-page">{entry.mara_page}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
