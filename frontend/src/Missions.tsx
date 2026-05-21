import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import ShareButton from './components/ShareButton';
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

type View = 'list' | 'detail' | 'proof' | 'done' | 'onboarding' | 'daily';
type Tab = 'missions' | 'programs' | 'journal' | 'book' | 'community';

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

export default function Missions() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // ── existing state ─────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('list');
  const [activeTab, setActiveTab] = useState<Tab>('missions');
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

  // ── programs state ─────────────────────────────────────────────────────────
  const [programs, setPrograms] = useState<Program[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [dayMissions, setDayMissions] = useState<Record<string, DayMissionData>>({});
  const [enrollingSlug, setEnrollingSlug] = useState<string | null>(null);
  const [enrollSettings, setEnrollSettings] = useState({ habitDescription: '', notificationHour: 8 });
  const [completingEnrollment, setCompletingEnrollment] = useState<string | null>(null);
  const [programProofText, setProgramProofText] = useState('');
  const [programResult, setProgramResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── journal state ──────────────────────────────────────────────────────────
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);

  // ── book state ─────────────────────────────────────────────────────────────
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // ── community state ────────────────────────────────────────────────────────
  const [communityFeed, setCommunityFeed] = useState<any[]>([]);

  // ── data loaders ───────────────────────────────────────────────────────────
  const loadMissions = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const pillarQ = selectedPillar !== 'all' ? `?pillar=${selectedPillar}` : '';
      const [data, daily] = await Promise.all([
        apiFetchJson<{ missions: Mission[]; userXp: UserXp }>(`/api/missions${pillarQ}`),
        apiFetchJson<{ missions: Mission[] }>('/api/missions/daily'),
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
      const r = await apiFetchJson<{ programs: Program[] }>('/api/programs');
      setPrograms(r.programs ?? []);
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
      const d = await apiFetchJson<DayMissionData>(`/api/programs/enrollment/${enrollmentId}/today`);
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
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === 'list') loadMissions();
  }, [selectedPillar, view, loadMissions]);

  // ── missions handlers ──────────────────────────────────────────────────────
  const handleStartMission = async (mission: Mission) => {
    if (!isAuthenticated) { navigate('/'); return; }
    try {
      await apiFetchJson(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' });
      setActiveMission(mission);
      setView('detail');
    } catch { setError(t('missions.errorStart')); }
  };

  const handleOpenDetail = (mission: Mission) => {
    setActiveMission(mission);
    if (mission.user_status === 'active') setView('proof');
    else setView('detail');
  };

  const handleSubmitProof = async () => {
    if (!activeMission || !proofText.trim()) { setError(t('missions.errorProofRequired')); return; }
    setLoading(true);
    try {
      const result = await apiFetchJson<{
        success: boolean; maraFeedback: string; message: string; leveledUp: boolean;
      }>(`/api/missions/${activeMission.id}/proof`, {
        method: 'POST',
        body: JSON.stringify({ text: proofText, reflectionAnswer: reflectionText || undefined }),
      });
      if (result.success) {
        setCompletionResult(result);
        setView('done');
        setProofText('');
        setReflectionText('');
      }
    } catch { setError(t('missions.errorProof')); }
    finally { setLoading(false); }
  };

  const handleGenerateMission = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await apiFetchJson<{ mission: Mission }>('/api/missions/generate', {
        method: 'POST', body: '{}',
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

  // ── programs handlers ──────────────────────────────────────────────────────
  async function confirmEnroll() {
    if (!enrollingSlug) return;
    try {
      const r = await apiFetchJson<{ success: boolean; enrollmentId?: string; message?: string }>(
        `/api/programs/${enrollingSlug}/enroll`,
        {
          method: 'POST',
          body: JSON.stringify({ ...enrollSettings, language: i18n.language }),
        },
      );
      if (r.success) {
        setEnrollingSlug(null);
        await loadEnrollments();
      } else {
        setError(r.message ?? 'Eroare la înrolare.');
      }
    } catch { setError('Eroare de rețea.'); }
  }

  async function handleCompleteDay(enrollmentId: string, proofContent: string) {
    setSubmitting(true);
    try {
      const r = await apiFetchJson<any>(
        `/api/programs/enrollment/${enrollmentId}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ type: 'text', content: proofContent, language: i18n.language }),
        },
      );
      if (r.success) {
        setProgramResult(r);
        await loadEnrollments();
        await loadJournal();
        if (r.programCompleted) await loadBooks();
      } else {
        setError(r.message ?? 'Eroare.');
      }
    } catch { setError('Eroare de rețea.'); }
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

  // ── XP bar ─────────────────────────────────────────────────────────────────
  const xpToNextLevel = 1000;
  const xpProgress = (userXp.xp % xpToNextLevel) / xpToNextLevel * 100;

  if (!isAuthenticated) {
    return (
      <div className="missions-page">
        <div className="missions-auth-wall">
          <div className="missions-auth-icon">🎯</div>
          <h2>Mara Missions</h2>
          <p>{t('missions.authWall')}</p>
          <button className="missions-btn-primary" onClick={() => navigate('/')}>{t('missions.loginBtn')}</button>
        </div>
      </div>
    );
  }

  // ── ONBOARDING ─────────────────────────────────────────────────────────────
  if (view === 'onboarding') {
    const onboardingQuestions = [
      { key: 'whatYouLove',     q: t('missions.q1') },
      { key: 'wantToChange',    q: t('missions.q2') },
      { key: 'currentHobbies', q: t('missions.q3') },
      { key: 'dreamLife',       q: t('missions.q4') },
      { key: 'biggestFear',     q: t('missions.q5') },
    ];
    return (
      <div className="missions-page">
        <div className="missions-onboarding">
          <div className="missions-onboarding-header">
            <div className="missions-mara-avatar">🌟</div>
            <h1>{t('missions.onboardingTitle')}</h1>
            <p>{t('missions.onboardingSubtitle')}</p>
          </div>
          {error && <div className="missions-error">{error}</div>}
          <div className="missions-onboarding-form">
            {onboardingQuestions.map(({ key, q }) => (
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
            <button className="missions-btn-primary missions-btn-full" onClick={handleOnboardingSubmit} disabled={loading}>
              {loading ? t('missions.saving') : t('missions.continue')}
            </button>
            <button className="missions-btn-ghost" onClick={() => setView('list')}>{t('missions.skip')}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── COMPLETION ─────────────────────────────────────────────────────────────
  if (view === 'done' && completionResult) {
    return (
      <div className="missions-page">
        <div className="missions-completion">
          <div className="missions-completion-top">
            <div className="missions-completion-icon">{completionResult.leveledUp ? '🎉' : '✅'}</div>
            <h2>{completionResult.leveledUp ? t('missions.levelUp') : t('missions.missionCompleted')}</h2>
            <div className="missions-xp-gained">{completionResult.message}</div>
          </div>
          <div className="missions-mara-feedback">
            <div className="missions-mara-label">{t('missions.maraLabel')}</div>
            <p>{completionResult.maraFeedback}</p>
          </div>
          <div className="missions-completion-actions">
            <button className="missions-btn-primary" onClick={() => { setView('list'); setCompletionResult(null); }}>
              {t('missions.backToMissions')}
            </button>
            {activeMission && (
              <ShareButton
                sourceModule="mission"
                sourceId={activeMission.id}
                title={activeMission.title}
                caption={completionResult.maraFeedback ?? undefined}
                compact={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PROOF ──────────────────────────────────────────────────────────────────
  if (view === 'proof' && activeMission) {
    const steps: string[] = (() => { try { return JSON.parse(activeMission.steps); } catch { return []; } })();
    const pillarMeta = PILLAR_META[activeMission.pillar] ?? { icon: '🎯', color: '#a855f7' };
    return (
      <div className="missions-page">
        <div className="missions-proof-view">
          <button className="missions-back-btn" onClick={() => setView('list')}>{t('missions.backToMissions')}</button>
          <div className="missions-proof-header">
            <span className="missions-pillar-badge" style={{ color: pillarMeta.color }}>
              {pillarMeta.icon} {t(`missions.pillar.${activeMission.pillar}`, activeMission.pillar)}
            </span>
            <h2>{activeMission.title}</h2>
          </div>
          {steps.length > 0 && (
            <div className="missions-steps">
              <h4>{t('missions.stepsTitle')}</h4>
              <ol>{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
            </div>
          )}
          <div className="missions-proof-form">
            <label className="missions-proof-label">{activeMission.proof_prompt}</label>
            <textarea value={proofText} onChange={(e) => setProofText(e.target.value)}
              placeholder={t('missions.proofPlaceholder')} rows={5} className="missions-proof-textarea" />
            {activeMission.reflection && (
              <>
                <label className="missions-proof-label missions-reflection-label">
                  {t('missions.reflectLabel')}{activeMission.reflection}
                </label>
                <textarea value={reflectionText} onChange={(e) => setReflectionText(e.target.value)}
                  placeholder={t('missions.reflectionPlaceholder')} rows={3} className="missions-proof-textarea" />
              </>
            )}
            {error && <div className="missions-error">{error}</div>}
            <button className="missions-btn-primary missions-btn-full" onClick={handleSubmitProof}
              disabled={loading || !proofText.trim()}>
              {loading ? t('missions.analyzing') : t('missions.submitProof', { xp: activeMission.xp_reward })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DETAIL ─────────────────────────────────────────────────────────────────
  if (view === 'detail' && activeMission) {
    const steps: string[] = (() => { try { return JSON.parse(activeMission.steps); } catch { return []; } })();
    const pillarMeta = PILLAR_META[activeMission.pillar] ?? { icon: '🎯', color: '#a855f7' };
    const diffMeta = DIFFICULTY_META[activeMission.difficulty] ?? { color: '#a855f7' };
    return (
      <div className="missions-page">
        <div className="missions-detail-view">
          <button className="missions-back-btn" onClick={() => setView('list')}>{t('missions.backToMissions')}</button>
          <div className="missions-detail-header">
            <span className="missions-pillar-badge" style={{ color: pillarMeta.color }}>
              {pillarMeta.icon} {t(`missions.pillar.${activeMission.pillar}`, activeMission.pillar)}
            </span>
            <span className="missions-difficulty-badge" style={{ color: diffMeta.color }}>
              {t(`missions.difficulty.${activeMission.difficulty}`, activeMission.difficulty)}
            </span>
          </div>
          <h2 className="missions-detail-title">{activeMission.title}</h2>
          <p className="missions-detail-desc">{activeMission.description}</p>
          {steps.length > 0 && (
            <div className="missions-steps">
              <h4>{t('missions.howToTitle')}</h4>
              <ol>{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
            </div>
          )}
          {activeMission.reflection && (
            <div className="missions-reflection-preview">
              <span>{t('missions.reflectLabel')}</span>{activeMission.reflection}
            </div>
          )}
          <div className="missions-detail-xp"><span>+{activeMission.xp_reward} XP</span></div>
          {activeMission.user_status === 'completed' ? (
            <div className="missions-completed-badge">{t('missions.completedBadge')}</div>
          ) : (
            <button className="missions-btn-primary missions-btn-full"
              onClick={() => handleStartMission(activeMission)} disabled={loading}>
              {t('missions.accept')}
            </button>
          )}
          {activeMission.mara_feedback && (
            <div className="missions-mara-feedback">
              <div className="missions-mara-label">{t('missions.maraSaid')}</div>
              <p>{activeMission.mara_feedback}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── MAIN LIST ──────────────────────────────────────────────────────────────
  const completedMissions = missions.filter((m) => m.user_status === 'completed');
  const activeMissions = missions.filter((m) => m.user_status === 'active');
  const availableMissions = missions.filter((m) => !m.user_status || (m.user_status !== 'active' && m.user_status !== 'completed'));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'missions',  label: t('missions.tabMissions', '🎯 Misiuni') },
    { key: 'programs',  label: '📋 Programe' },
    { key: 'journal',   label: '📖 Jurnal' },
    { key: 'book',      label: '📚 Cartea mea' },
    { key: 'community', label: t('missions.tabCommunity', '👥 Comunitate') },
  ];

  return (
    <div className="missions-page">
      {/* Enroll modal */}
      {enrollingSlug && (
        <div className="enroll-modal-overlay" onClick={() => setEnrollingSlug(null)}>
          <div className="enroll-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Personalizează programul</h3>
            <p>Spune-i Marei cu ce vrei să lucrezi:</p>
            <textarea
              className="missions-proof-textarea"
              placeholder="Ex: vreau să mă trezesc mai devreme, să fac sport, să scriu zilnic..."
              value={enrollSettings.habitDescription}
              onChange={(e) => setEnrollSettings((prev) => ({ ...prev, habitDescription: e.target.value }))}
              rows={3}
            />
            <div className="enroll-modal-actions">
              <button className="missions-btn-primary" onClick={confirmEnroll}>🌱 Începe programul</button>
              <button className="missions-btn-ghost" onClick={() => setEnrollingSlug(null)}>Anulează</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="missions-header">
        <button className="missions-back-btn" onClick={() => navigate('/')}>{t('missions.backHome')}</button>
        <div className="missions-header-center">
          <h1 className="missions-title">{t('missions.title')}</h1>
          <p className="missions-subtitle">{t('missions.subtitle')}</p>
        </div>
        <div className="missions-xp-bar-wrap">
          <div className="missions-xp-info">
            <span>{t('missions.levelLabel', { level: userXp.level })}</span>
            <span>{userXp.xp} XP</span>
          </div>
          <div className="missions-xp-bar">
            <div className="missions-xp-fill" style={{ width: `${xpProgress}%` }} />
          </div>
          {userXp.streak > 0 && (
            <div className="missions-streak">{t('missions.streakLabel', { count: userXp.streak })}</div>
          )}
        </div>
      </div>

      {error && <div className="missions-error" onClick={() => setError('')}>{error} ×</div>}

      {/* Tab navigation */}
      <div className="missions-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`missions-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: MISIUNI ──────────────────────────────────────────────────── */}
      {activeTab === 'missions' && (
        <>
          <div className="missions-filters">
            <button
              className={`missions-filter-btn ${selectedPillar === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedPillar('all')}
            >
              {t('missions.filterAll')}
            </button>
            {Object.entries(PILLAR_META).map(([key, meta]) => (
              <button
                key={key}
                className={`missions-filter-btn ${selectedPillar === key ? 'active' : ''}`}
                style={selectedPillar === key ? { borderColor: meta.color, color: meta.color } : {}}
                onClick={() => setSelectedPillar(key)}
              >
                {meta.icon} {t(`missions.pillar.${key}`, key)}
              </button>
            ))}
          </div>

          {dailyMissions.length > 0 && (
            <section className="missions-section">
              <h3 className="missions-section-title">{t('missions.dailyTitle')}</h3>
              <div className="missions-grid">
                {dailyMissions.map((m) => <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} isDaily />)}
              </div>
            </section>
          )}

          {activeMissions.length > 0 && (
            <section className="missions-section">
              <h3 className="missions-section-title">{t('missions.activeTitle')}</h3>
              <div className="missions-grid">
                {activeMissions.map((m) => <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} />)}
              </div>
            </section>
          )}

          <section className="missions-section">
            <div className="missions-section-header">
              <h3 className="missions-section-title">{t('missions.availableTitle')}</h3>
              <button className="missions-btn-generate" onClick={handleGenerateMission} disabled={generating}>
                {generating ? t('missions.generating') : t('missions.generate')}
              </button>
            </div>
            {loading ? (
              <div className="missions-loading"><div className="missions-spinner" /><p>{t('missions.loadingMissions')}</p></div>
            ) : availableMissions.length === 0 ? (
              <div className="missions-empty">
                <p>{t('missions.allDone')}</p>
                <button className="missions-btn-primary" onClick={handleGenerateMission} disabled={generating}>
                  {generating ? t('missions.generating') : t('missions.requestNew')}
                </button>
              </div>
            ) : (
              <div className="missions-grid">
                {availableMissions.map((m) => <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} />)}
              </div>
            )}
          </section>

          {completedMissions.length > 0 && (
            <section className="missions-section missions-section-completed">
              <h3 className="missions-section-title">
                {t('missions.completedSection', { count: completedMissions.length })}
              </h3>
              <div className="missions-grid">
                {completedMissions.map((m) => <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── TAB: PROGRAME ─────────────────────────────────────────────────── */}
      {activeTab === 'programs' && (
        <div className="programs-root">
          {/* Active enrollments */}
          {enrollments.filter((e) => e.status === 'active').map((enrollment) => {
            const dm = dayMissions[enrollment.id];
            const pct = Math.round((enrollment.current_day / enrollment.duration_days) * 100);
            return (
              <div key={enrollment.id} className="enrollment-active">
                <div className="enrollment-header">
                  <div className="enrollment-title-row">
                    <h2>{enrollment.program_name}</h2>
                    {enrollment.streak > 0 && (
                      <span className="enrollment-streak">🔥 {enrollment.streak} zile</span>
                    )}
                  </div>
                  <div className="enrollment-progress-wrap">
                    <div className="enrollment-bar">
                      <div className="enrollment-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="enrollment-pct">Ziua {enrollment.current_day}/{enrollment.duration_days} · {pct}%</span>
                  </div>
                  {dm?.streakMessage && <div className="enrollment-streak-msg">{dm.streakMessage}</div>}
                </div>

                {dm && !dm.isCompleted && dm.mission && (
                  <div className="day-mission-card">
                    <div className="day-mission-header">
                      <span className="day-badge">Ziua {dm.currentDay}</span>
                      {dm.mission.isAiGenerated && <span className="ai-badge">✨ Personalizată de Mara</span>}
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
                      className="missions-proof-textarea"
                      placeholder="Scrie experiența ta de azi..."
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
                      className="missions-btn-primary missions-btn-full"
                      disabled={submitting || !programProofText.trim() || completingEnrollment !== enrollment.id}
                      onClick={() => handleCompleteDay(enrollment.id, programProofText)}
                    >
                      {submitting ? '⏳ Mara scrie jurnalul...' : `✓ Completează ziua ${dm.currentDay}`}
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
                            🎉 Felicitări! Cartea ta e gata în tab-ul "Cartea mea"!
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {dm?.isCompleted && (
                  <div className="day-completed">
                    ✅ Misiunea de azi completată! Revino mâine pentru ziua {enrollment.current_day + 1}.
                  </div>
                )}
              </div>
            );
          })}

          {/* Available programs */}
          <div className="programs-section-title">
            {enrollments.filter((e) => e.status === 'active').length > 0
              ? '📚 Alte programe disponibile'
              : '🎯 Alege programul tău'}
          </div>
          <div className="programs-grid">
            {programs
              .filter((p) => !enrollments.some((e) => e.slug === p.slug && e.status === 'active'))
              .map((program) => (
                <div key={program.id} className={`program-card ${program.is_featured ? 'program-card--featured' : ''}`}>
                  {program.is_featured && <div className="program-featured-badge">⭐ Recomandat</div>}
                  <div className="program-card-header">
                    <h2>{program.name}</h2>
                    <span className="program-tagline">{program.tagline}</span>
                  </div>
                  <p className="program-description">{program.description}</p>
                  <div className="program-meta">
                    <span>📅 {program.duration_days} zile</span>
                    <span>💪 {program.difficulty}</span>
                    <span>{program.price_cents === 0 ? '🎁 Gratuit' : `💰 ${(program.price_cents / 100).toFixed(2)} EUR`}</span>
                  </div>
                  <button className="program-enroll-btn" onClick={() => setEnrollingSlug(program.slug)}>
                    Începe {program.name} →
                  </button>
                </div>
              ))}
          </div>

          {/* Completed enrollments */}
          {enrollments.filter((e) => e.status === 'completed').length > 0 && (
            <>
              <div className="programs-section-title" style={{ marginTop: '32px' }}>🏆 Programe completate</div>
              <div className="programs-grid">
                {enrollments.filter((e) => e.status === 'completed').map((e) => (
                  <div key={e.id} className="program-card program-card--completed">
                    <h2>{e.program_name}</h2>
                    <p className="program-description">
                      Completat în {e.duration_days} zile · Streak maxim: {e.longest_streak} zile
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: JURNAL ───────────────────────────────────────────────────── */}
      {activeTab === 'journal' && (
        <div className="journal-root">
          <div className="journal-header">
            <h2>📖 Jurnalul tău</h2>
            <p>{journalTotal} {journalTotal === 1 ? 'pagină scrisă' : 'pagini scrise'} de Mara pentru tine</p>
          </div>

          {journalEntries.length === 0 ? (
            <div className="missions-empty">
              <p>🌱 Jurnalul tău e gol.</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                Completează misiunile din Programe și Mara va scrie prima ta pagină. ✍️
              </p>
            </div>
          ) : (
            <div className="journal-entries">
              {journalEntries.map((entry) => (
                <div key={entry.id} className={`journal-entry ${entry.is_milestone ? 'journal-entry--milestone' : ''}`}>
                  {entry.is_milestone && <div className="journal-milestone-badge">🌟 Moment important</div>}
                  <div className="journal-entry-header">
                    <span className="journal-day">Ziua {entry.day_number}</span>
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
                    <select
                      value={entry.visibility}
                      onChange={(e) => updateVisibility(entry.id, e.target.value)}
                    >
                      <option value="private">🔒 Privat</option>
                      <option value="community">👥 Comunitate</option>
                      <option value="public">🌍 Public</option>
                    </select>
                    <span className="journal-visibility-hint">
                      {entry.visibility === 'private'
                        ? 'Doar tu poți vedea'
                        : entry.visibility === 'community'
                        ? 'Vizibil în comunitate'
                        : 'Public'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CARTEA MEA ───────────────────────────────────────────────── */}
      {activeTab === 'book' && (
        <div className="book-root">
          <div className="journal-header">
            <h2>📚 Cartea ta</h2>
            <p>Generată automat când completezi un program</p>
          </div>

          {books.length === 0 ? (
            <div className="missions-empty">
              <p>📖 Cartea ta nu e gata încă.</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                Completează un program și Mara va genera cartea vieții tale.
              </p>
              <button className="missions-btn-primary" style={{ marginTop: '16px' }}
                onClick={() => setActiveTab('programs')}>
                Vezi programele →
              </button>
            </div>
          ) : (
            books.map((book) => (
              <div key={book.id} className="book-card">
                <div
                  className="book-cover"
                  onClick={() => setSelectedBook(selectedBook?.id === book.id ? null : book)}
                >
                  <div className="book-cover-spine" />
                  <div className="book-cover-content">
                    <h1 className="book-title">{book.title}</h1>
                    {book.subtitle && <h2 className="book-subtitle">{book.subtitle}</h2>}
                    <p className="book-meta">{book.total_pages} pagini · {book.program_name}</p>
                    <button className="book-read-btn">
                      {selectedBook?.id === book.id ? '▲ Închide' : '▼ Citește cartea'}
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
                                <div className="book-page-number">Ziua {entry.day}</div>
                                <div className="book-page-content">{entry.page}</div>
                              </div>
                            ))}
                          </div>
                        ));
                      } catch { return <p>Eroare la încărcarea cărții.</p>; }
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: COMUNITATE ───────────────────────────────────────────────── */}
      {activeTab === 'community' && (
        <div className="community-root">
          <div className="journal-header">
            <h2>👥 Jurnalul comunității</h2>
            <p>Pagini publice scrise de Mara pentru membrii comunității</p>
          </div>
          {communityFeed.length === 0 ? (
            <div className="missions-empty">
              <p>Nicio pagină publică încă.</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                Marchează o pagină din jurnalul tău ca "Comunitate" pentru a o partaja.
              </p>
            </div>
          ) : (
            <div className="journal-entries">
              {communityFeed.map((entry, i) => (
                <div key={i} className="journal-entry">
                  <div className="journal-entry-header">
                    <span className="journal-day">{entry.display_name ?? 'Anonim'}</span>
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

function MissionCard({
  mission, onOpen, isDaily = false,
}: { mission: Mission; onOpen: (m: Mission) => void; isDaily?: boolean }) {
  const { t } = useTranslation();
  const pillarMeta = PILLAR_META[mission.pillar] ?? { icon: '🎯', color: '#a855f7' };
  const diffMeta = DIFFICULTY_META[mission.difficulty] ?? { color: '#a855f7' };
  const isCompleted = mission.user_status === 'completed';
  const isActive = mission.user_status === 'active';

  return (
    <button
      className={`missions-card ${isCompleted ? 'missions-card--done' : ''} ${isActive ? 'missions-card--active' : ''} ${isDaily ? 'missions-card--daily' : ''}`}
      onClick={() => onOpen(mission)}
      style={{ '--pillar-color': pillarMeta.color } as React.CSSProperties}
    >
      <div className="missions-card-top">
        <span className="missions-card-icon">{pillarMeta.icon}</span>
        <div className="missions-card-badges">
          <span className="missions-card-diff" style={{ color: diffMeta.color }}>
            {t(`missions.difficulty.${mission.difficulty}`, mission.difficulty)}
          </span>
          {isCompleted && <span className="missions-card-done">✅</span>}
          {isActive && <span className="missions-card-active-badge">▶</span>}
          {isDaily && <span className="missions-card-daily-badge">⚡</span>}
        </div>
      </div>
      <h4 className="missions-card-title">{mission.title}</h4>
      <p className="missions-card-desc">{mission.description}</p>
      <div className="missions-card-footer">
        <span className="missions-card-pillar" style={{ color: pillarMeta.color }}>
          {t(`missions.pillar.${mission.pillar}`, mission.pillar)}
        </span>
        <span className="missions-card-xp">+{mission.xp_reward} XP</span>
      </div>
    </button>
  );
}
