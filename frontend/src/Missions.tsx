import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import './styles/Missions.css';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const PILLAR_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  discipline:  { label: 'Disciplină',  icon: '🎯', color: '#a855f7' },
  creativity:  { label: 'Creativitate', icon: '🎨', color: '#ec4899' },
  life:        { label: 'Viață',        icon: '🌱', color: '#22c55e' },
  acceptance:  { label: 'Acceptare',    icon: '🤍', color: '#06b6d4' },
  helping:     { label: 'Ajutare',      icon: '🤝', color: '#f59e0b' },
  self:        { label: 'Eu',           icon: '🔍', color: '#8b5cf6' },
  hobby:       { label: 'Hobby',        icon: '🎭', color: '#ef4444' },
};

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  gentle: { label: 'Ușor',   color: '#22c55e' },
  medium: { label: 'Mediu',  color: '#f59e0b' },
  deep:   { label: 'Profund', color: '#ef4444' },
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

type View = 'list' | 'detail' | 'proof' | 'done' | 'onboarding' | 'daily';

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
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
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
    whatYouLove: '',
    wantToChange: '',
    currentHobbies: '',
    dreamLife: '',
    biggestFear: '',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

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
    } catch (e) {
      setError('Nu am putut încărca misiunile. Reîncearcă.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, selectedPillar]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Check onboarding
    apiFetchJson<{ done: boolean }>('/api/missions/onboarding').then((res) => {
      if (!res.done) setView('onboarding');
      else loadMissions();
    }).catch(() => loadMissions());
  }, [isAuthenticated, loadMissions]);

  useEffect(() => {
    if (view === 'list') loadMissions();
  }, [selectedPillar, view, loadMissions]);

  const handleStartMission = async (mission: Mission) => {
    if (!isAuthenticated) { navigate('/'); return; }
    try {
      await apiFetchJson(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' });
      setActiveMission(mission);
      setView('detail');
    } catch {
      setError('Nu am putut porni misiunea.');
    }
  };

  const handleOpenDetail = (mission: Mission) => {
    setActiveMission(mission);
    if (mission.user_status === 'active') setView('proof');
    else setView('detail');
  };

  const handleSubmitProof = async () => {
    if (!activeMission || !proofText.trim()) {
      setError('Completează câmpul de dovadă înainte de a trimite.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetchJson<{
        success: boolean; maraFeedback: string; message: string; leveledUp: boolean;
      }>(`/api/missions/${activeMission.id}/proof`, {
        method: 'POST',
        body: JSON.stringify({
          text: proofText,
          reflectionAnswer: reflectionText || undefined,
        }),
      });
      if (result.success) {
        setCompletionResult(result);
        setView('done');
        setProofText('');
        setReflectionText('');
      }
    } catch {
      setError('Nu am putut trimite dovada. Reîncearcă.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMission = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await apiFetchJson<{ mission: Mission }>('/api/missions/generate', {
        method: 'POST', body: '{}',
      });
      if (result.mission) {
        setMissions((prev) => [result.mission, ...prev]);
      }
    } catch {
      setError('AI indisponibil momentan. Reîncearcă.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOnboardingSubmit = async () => {
    if (!onboardingAnswers.whatYouLove.trim()) {
      setError('Completează cel puțin primul câmp.');
      return;
    }
    setLoading(true);
    try {
      await apiFetchJson('/api/missions/onboarding', {
        method: 'POST',
        body: JSON.stringify(onboardingAnswers),
      });
      setView('list');
    } catch {
      setError('Nu am putut salva profilul tău.');
    } finally {
      setLoading(false);
    }
  };

  const xpToNextLevel = 1000;
  const xpProgress = (userXp.xp % xpToNextLevel) / xpToNextLevel * 100;

  if (!isAuthenticated) {
    return (
      <div className="missions-page">
        <div className="missions-auth-wall">
          <div className="missions-auth-icon">🎯</div>
          <h2>Mara Missions</h2>
          <p>Autentifică-te pentru a începe călătoria ta de transformare personală.</p>
          <button className="missions-btn-primary" onClick={() => navigate('/')}>
            Autentifică-te
          </button>
        </div>
      </div>
    );
  }

  // ONBOARDING
  if (view === 'onboarding') {
    return (
      <div className="missions-page">
        <div className="missions-onboarding">
          <div className="missions-onboarding-header">
            <div className="missions-mara-avatar">🌟</div>
            <h1>Bună! Sunt Mara.</h1>
            <p>Înainte să îți generez misiuni personalizate, vreau să te cunosc puțin.</p>
          </div>
          {error && <div className="missions-error">{error}</div>}
          <div className="missions-onboarding-form">
            {[
              { key: 'whatYouLove', q: 'Ce te face să te simți cel mai viu?' },
              { key: 'wantToChange', q: 'Ce vrei cel mai mult să schimbi la tine?' },
              { key: 'currentHobbies', q: 'Ce faci în timpul liber?' },
              { key: 'dreamLife', q: 'Cum arată viața ta ideală peste 5 ani?' },
              { key: 'biggestFear', q: 'Care e cea mai mare frică a ta?' },
            ].map(({ key, q }) => (
              <div key={key} className="missions-onboarding-field">
                <label>{q}</label>
                <textarea
                  value={onboardingAnswers[key as keyof typeof onboardingAnswers]}
                  onChange={(e) =>
                    setOnboardingAnswers((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder="Scrie liber, fără să judeci..."
                  rows={3}
                />
              </div>
            ))}
            <button
              className="missions-btn-primary missions-btn-full"
              onClick={handleOnboardingSubmit}
              disabled={loading}
            >
              {loading ? 'Se salvează...' : 'Continuă → Misiunile mele'}
            </button>
            <button className="missions-btn-ghost" onClick={() => setView('list')}>
              Sari peste pentru acum
            </button>
          </div>
        </div>
      </div>
    );
  }

  // COMPLETION VIEW
  if (view === 'done' && completionResult) {
    return (
      <div className="missions-page">
        <div className="missions-completion">
          <div className="missions-completion-top">
            <div className="missions-completion-icon">{completionResult.leveledUp ? '🎉' : '✅'}</div>
            <h2>{completionResult.leveledUp ? 'LEVEL UP!' : 'Misiune Completată!'}</h2>
            <div className="missions-xp-gained">{completionResult.message}</div>
          </div>
          <div className="missions-mara-feedback">
            <div className="missions-mara-label">🌟 Mara îți spune:</div>
            <p>{completionResult.maraFeedback}</p>
          </div>
          <div className="missions-completion-actions">
            <button
              className="missions-btn-primary"
              onClick={() => { setView('list'); setCompletionResult(null); }}
            >
              ← Înapoi la misiuni
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PROOF SUBMISSION
  if (view === 'proof' && activeMission) {
    const steps: string[] = (() => {
      try { return JSON.parse(activeMission.steps); } catch { return []; }
    })();
    return (
      <div className="missions-page">
        <div className="missions-proof-view">
          <button className="missions-back-btn" onClick={() => setView('list')}>← Înapoi</button>
          <div className="missions-proof-header">
            <span
              className="missions-pillar-badge"
              style={{ color: PILLAR_LABELS[activeMission.pillar]?.color }}
            >
              {PILLAR_LABELS[activeMission.pillar]?.icon} {PILLAR_LABELS[activeMission.pillar]?.label}
            </span>
            <h2>{activeMission.title}</h2>
          </div>
          {steps.length > 0 && (
            <div className="missions-steps">
              <h4>Pași de urmat:</h4>
              <ol>
                {steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}
          <div className="missions-proof-form">
            <label className="missions-proof-label">{activeMission.proof_prompt}</label>
            <textarea
              value={proofText}
              onChange={(e) => setProofText(e.target.value)}
              placeholder="Scrie dovada ta here..."
              rows={5}
              className="missions-proof-textarea"
            />
            {activeMission.reflection && (
              <>
                <label className="missions-proof-label missions-reflection-label">
                  🔍 Reflecție: {activeMission.reflection}
                </label>
                <textarea
                  value={reflectionText}
                  onChange={(e) => setReflectionText(e.target.value)}
                  placeholder="Opțional, dar puternic..."
                  rows={3}
                  className="missions-proof-textarea"
                />
              </>
            )}
            {error && <div className="missions-error">{error}</div>}
            <button
              className="missions-btn-primary missions-btn-full"
              onClick={handleSubmitProof}
              disabled={loading || !proofText.trim()}
            >
              {loading ? 'Mara analizează...' : `Trimite dovada → +${activeMission.xp_reward} XP`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MISSION DETAIL
  if (view === 'detail' && activeMission) {
    const steps: string[] = (() => {
      try { return JSON.parse(activeMission.steps); } catch { return []; }
    })();
    const pillarInfo = PILLAR_LABELS[activeMission.pillar] ?? { label: activeMission.pillar, icon: '🎯', color: '#a855f7' };
    const diffInfo = DIFFICULTY_LABELS[activeMission.difficulty] ?? { label: activeMission.difficulty, color: '#a855f7' };
    return (
      <div className="missions-page">
        <div className="missions-detail-view">
          <button className="missions-back-btn" onClick={() => setView('list')}>← Înapoi</button>
          <div className="missions-detail-header">
            <span className="missions-pillar-badge" style={{ color: pillarInfo.color }}>
              {pillarInfo.icon} {pillarInfo.label}
            </span>
            <span className="missions-difficulty-badge" style={{ color: diffInfo.color }}>
              {diffInfo.label}
            </span>
          </div>
          <h2 className="missions-detail-title">{activeMission.title}</h2>
          <p className="missions-detail-desc">{activeMission.description}</p>
          {steps.length > 0 && (
            <div className="missions-steps">
              <h4>Cum faci asta:</h4>
              <ol>
                {steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}
          {activeMission.reflection && (
            <div className="missions-reflection-preview">
              <span>💭 Vei reflecta: </span>{activeMission.reflection}
            </div>
          )}
          <div className="missions-detail-xp">
            <span>+{activeMission.xp_reward} XP</span>
          </div>
          {activeMission.user_status === 'completed' ? (
            <div className="missions-completed-badge">✅ Completată</div>
          ) : (
            <button
              className="missions-btn-primary missions-btn-full"
              onClick={() => handleStartMission(activeMission)}
              disabled={loading}
            >
              Acceptă Misiunea 🚀
            </button>
          )}
          {activeMission.mara_feedback && (
            <div className="missions-mara-feedback">
              <div className="missions-mara-label">🌟 Mara a spus:</div>
              <p>{activeMission.mara_feedback}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // MAIN LIST
  const completedMissions = missions.filter((m) => m.user_status === 'completed');
  const activeMissions = missions.filter((m) => m.user_status === 'active');
  const availableMissions = missions.filter((m) => !m.user_status || (m.user_status !== 'active' && m.user_status !== 'completed'));

  return (
    <div className="missions-page">
      {/* Header */}
      <div className="missions-header">
        <button className="missions-back-btn" onClick={() => navigate('/')}>← Acasă</button>
        <div className="missions-header-center">
          <h1 className="missions-title">🎯 Missions</h1>
          <p className="missions-subtitle">Transformă-te printr-o misiune pe zi</p>
        </div>
        {/* XP Bar */}
        <div className="missions-xp-bar-wrap">
          <div className="missions-xp-info">
            <span>Nivel {userXp.level}</span>
            <span>{userXp.xp} XP</span>
          </div>
          <div className="missions-xp-bar">
            <div className="missions-xp-fill" style={{ width: `${xpProgress}%` }} />
          </div>
          {userXp.streak > 0 && (
            <div className="missions-streak">🔥 {userXp.streak} zile streak</div>
          )}
        </div>
      </div>

      {error && <div className="missions-error" onClick={() => setError('')}>{error} ×</div>}

      {/* Pillar Filter */}
      <div className="missions-filters">
        <button
          className={`missions-filter-btn ${selectedPillar === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedPillar('all')}
        >
          Toate
        </button>
        {Object.entries(PILLAR_LABELS).map(([key, info]) => (
          <button
            key={key}
            className={`missions-filter-btn ${selectedPillar === key ? 'active' : ''}`}
            style={selectedPillar === key ? { borderColor: info.color, color: info.color } : {}}
            onClick={() => setSelectedPillar(key)}
          >
            {info.icon} {info.label}
          </button>
        ))}
      </div>

      {/* Daily Missions */}
      {dailyMissions.length > 0 && (
        <section className="missions-section">
          <h3 className="missions-section-title">⚡ Daily Check-in</h3>
          <div className="missions-grid">
            {dailyMissions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onOpen={handleOpenDetail}
                isDaily
              />
            ))}
          </div>
        </section>
      )}

      {/* Active Missions */}
      {activeMissions.length > 0 && (
        <section className="missions-section">
          <h3 className="missions-section-title">🔥 În Desfășurare</h3>
          <div className="missions-grid">
            {activeMissions.map((m) => (
              <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} />
            ))}
          </div>
        </section>
      )}

      {/* Available Missions */}
      <section className="missions-section">
        <div className="missions-section-header">
          <h3 className="missions-section-title">🎯 Misiuni Disponibile</h3>
          <button
            className="missions-btn-generate"
            onClick={handleGenerateMission}
            disabled={generating}
          >
            {generating ? '⚙️ Generez...' : '✨ Generează misiune personalizată'}
          </button>
        </div>
        {loading ? (
          <div className="missions-loading">
            <div className="missions-spinner" />
            <p>Mara pregătește misiunile...</p>
          </div>
        ) : availableMissions.length === 0 ? (
          <div className="missions-empty">
            <p>Toate misiunile disponibile au fost acceptate sau completate! 🎉</p>
            <button className="missions-btn-primary" onClick={handleGenerateMission} disabled={generating}>
              {generating ? '⚙️ Generez...' : '✨ Cere o misiune nouă de la Mara'}
            </button>
          </div>
        ) : (
          <div className="missions-grid">
            {availableMissions.map((m) => (
              <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} />
            ))}
          </div>
        )}
      </section>

      {/* Completed Missions */}
      {completedMissions.length > 0 && (
        <section className="missions-section missions-section-completed">
          <h3 className="missions-section-title">✅ Completate ({completedMissions.length})</h3>
          <div className="missions-grid">
            {completedMissions.map((m) => (
              <MissionCard key={m.id} mission={m} onOpen={handleOpenDetail} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MissionCard({
  mission,
  onOpen,
  isDaily = false,
}: {
  mission: Mission;
  onOpen: (m: Mission) => void;
  isDaily?: boolean;
}) {
  const pillarInfo = PILLAR_LABELS[mission.pillar] ?? { label: mission.pillar, icon: '🎯', color: '#a855f7' };
  const diffInfo = DIFFICULTY_LABELS[mission.difficulty] ?? { label: mission.difficulty, color: '#a855f7' };
  const isCompleted = mission.user_status === 'completed';
  const isActive = mission.user_status === 'active';

  return (
    <button
      className={`missions-card ${isCompleted ? 'missions-card--done' : ''} ${isActive ? 'missions-card--active' : ''} ${isDaily ? 'missions-card--daily' : ''}`}
      onClick={() => onOpen(mission)}
      style={{ '--pillar-color': pillarInfo.color } as React.CSSProperties}
    >
      <div className="missions-card-top">
        <span className="missions-card-icon">{pillarInfo.icon}</span>
        <div className="missions-card-badges">
          <span className="missions-card-diff" style={{ color: diffInfo.color }}>
            {diffInfo.label}
          </span>
          {isCompleted && <span className="missions-card-done">✅</span>}
          {isActive && <span className="missions-card-active-badge">▶</span>}
          {isDaily && <span className="missions-card-daily-badge">⚡</span>}
        </div>
      </div>
      <h4 className="missions-card-title">{mission.title}</h4>
      <p className="missions-card-desc">{mission.description}</p>
      <div className="missions-card-footer">
        <span className="missions-card-pillar" style={{ color: pillarInfo.color }}>
          {pillarInfo.label}
        </span>
        <span className="missions-card-xp">+{mission.xp_reward} XP</span>
      </div>
    </button>
  );
}
