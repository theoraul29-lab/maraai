// P2P Background Compute — Web Worker.
//
// Runs in a dedicated browser thread. The main thread (P2PContributingBadge)
// controls this worker via postMessage:
//   → { type: 'start', nodeId, apiBase }  — user became idle, start computing
//   → { type: 'stop' }                    — user returned, stop immediately
//
// The worker posts back:
//   ← { type: 'status', contributing: boolean, xpEarned: number, tasksCompleted: number }
//   ← { type: 'reward', xpGained: number, creditsGained: number, message: string }
//   ← { type: 'error', message: string }

type WorkerInMessage =
  | { type: 'start'; nodeId: string; apiBase: string }
  | { type: 'stop' };

type WorkerOutMessage =
  | { type: 'status'; contributing: boolean; xpEarned: number; tasksCompleted: number }
  | { type: 'reward'; xpGained: number; creditsGained: number; message: string }
  | { type: 'error'; message: string };

let running = false;
let nodeId = '';
let apiBase = '';
let totalXp = 0;
let totalTasks = 0;

// Poll interval between task requests (ms).
const POLL_INTERVAL_MS = 15_000;

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    nodeId = msg.nodeId;
    apiBase = msg.apiBase;
    if (!running) {
      running = true;
      postStatus(true);
      runLoop();
    }
  } else if (msg.type === 'stop') {
    running = false;
    postStatus(false);
  }
};

function postStatus(contributing: boolean): void {
  const out: WorkerOutMessage = { type: 'status', contributing, xpEarned: totalXp, tasksCompleted: totalTasks };
  self.postMessage(out);
}

async function runLoop(): Promise<void> {
  while (running) {
    try {
      await processOneTask();
    } catch {
      // swallow errors — keep trying
    }
    if (!running) break;
    await sleep(POLL_INTERVAL_MS);
  }
}

async function processOneTask(): Promise<void> {
  // Fetch a task from the queue.
  const res = await fetch(`${apiBase}/api/p2p/get-task?nodeId=${encodeURIComponent(nodeId)}`, {
    credentials: 'include',
  });
  if (!res.ok) return;
  const data = await res.json() as { task: { taskId: string; type: string; payload: Record<string, unknown> } | null };
  if (!data.task) return;

  const { taskId, type, payload } = data.task;

  // Compute the result locally.
  let result: Record<string, unknown>;
  try {
    result = computeTask(type, payload);
  } catch {
    return; // skip bad tasks
  }

  // Submit the result.
  const submitRes = await fetch(`${apiBase}/api/p2p/submit-result`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, nodeId, result }),
  });
  if (!submitRes.ok) return;

  const out = await submitRes.json() as { ok: boolean; xpGained: number; creditsGained: number; message: string };
  if (out.ok) {
    totalXp += out.xpGained;
    totalTasks += 1;
    postStatus(true);
    const reward: WorkerOutMessage = {
      type: 'reward',
      xpGained: out.xpGained,
      creditsGained: out.creditsGained,
      message: out.message,
    };
    self.postMessage(reward);
  }
}

// ── Compute functions ──────────────────────────────────────────────────────
// These run entirely in JavaScript, no external calls. Each returns a plain
// JSON-serialisable object that the server stores as the task result.

function computeTask(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'maraAnalysis':      return computeMaraAnalysis(payload);
    case 'missionGeneration': return computeMissionGeneration(payload);
    case 'contentProcessing': return computeContentProcessing(payload);
    case 'knowledgeBase':     return computeKnowledgeBase(payload);
    default:                  throw new Error(`Unknown task type: ${type}`);
  }
}

function computeMaraAnalysis(payload: Record<string, unknown>): Record<string, unknown> {
  const data = (payload.data as { activityCounts?: number[]; windowDays?: number }) ?? {};
  const counts = data.activityCounts ?? [];
  const total = counts.reduce((s: number, v: number) => s + v, 0);
  const avg = counts.length > 0 ? total / counts.length : 0;
  const max = counts.length > 0 ? Math.max(...counts) : 0;
  const activeDays = counts.filter((v) => v > 0).length;
  const engagementScore = Math.round(Math.min(100, (activeDays / (data.windowDays ?? 7)) * 100));
  return { total, avg: Math.round(avg * 10) / 10, max, activeDays, engagementScore, analyzedAt: Date.now() };
}

const MISSION_TEMPLATES: Record<string, Array<{ title: string; description: string }>> = {
  discipline: [
    { title: 'Rutina de dimineață', description: 'Trezește-te cu 30 de minute mai devreme și fă ceva productiv înainte de telefon.' },
    { title: 'Tehnica Pomodoro', description: 'Lucrează 25 de minute fără distrageri, apoi ia o pauză de 5 minute.' },
    { title: 'Lista de azi', description: 'Scrie 3 lucruri esențiale pe care trebuie să le faci azi și bifează-le pe rând.' },
  ],
  creativity: [
    { title: 'Un desen pe zi', description: 'Desenează orice timp de 10 minute fără să judeci rezultatul.' },
    { title: 'Jurnalul ideilor', description: 'Notează 5 idei noi, oricât de absurde, înainte de prânz.' },
    { title: 'Foto-jurnal', description: 'Fotografiază un lucru frumos sau interesant din viața ta de azi.' },
  ],
  life: [
    { title: 'Hidratare conștientă', description: 'Bea 8 pahare de apă azi și observă cum te simți.' },
    { title: '10 minute mers', description: 'Fă o plimbare de 10 minute fără telefon, observând ce te înconjoară.' },
    { title: 'Somn odihnitor', description: 'Stinge toate ecranele cu o oră înainte de culcare.' },
  ],
  acceptance: [
    { title: 'Mulțumiri zilnice', description: 'Scrie 3 lucruri pentru care ești recunoscător/ă azi.' },
    { title: 'Respirație profundă', description: 'Fă 5 minute de respirație lentă și conștientă când simți stres.' },
    { title: 'Fără judecată', description: 'Observă un gând negativ și reformulează-l neutru fără auto-critică.' },
  ],
  helping: [
    { title: 'Un mesaj de bine', description: 'Scrie un mesaj sincer cuiva care ar putea avea nevoie de încurajare.' },
    { title: 'Ajutor concret', description: 'Oferă ajutor concret cuiva din jurul tău fără să aștepți să ți se ceară.' },
    { title: 'Ascultare activă', description: 'Ascultă o persoană dragă fără să întrerupi sau să dai sfaturi.' },
  ],
  self: [
    { title: 'Reflecție de seară', description: 'Scrie 5 minute despre cel mai important lucru pe care l-ai învățat azi.' },
    { title: 'Valoarea săptămânii', description: 'Alege o valoare pe care vrei să o trăiești azi și observă cum o aplici.' },
    { title: 'Emoția zilei', description: 'Numește emoția dominantă din azi și explorează de unde vine.' },
  ],
  hobby: [
    { title: 'Pasiunea 20 de minute', description: 'Dedică 20 de minute unui hobby pe care l-ai neglijat.' },
    { title: 'Încearcă ceva nou', description: 'Fă un pas mic spre un hobby pe care îl tot amâni.' },
    { title: 'Partajează ce faci', description: 'Arată cuiva o creație sau activitate din hobby-ul tău.' },
  ],
};

function computeMissionGeneration(payload: Record<string, unknown>): Record<string, unknown> {
  const pillar = String(payload.pillar ?? 'discipline');
  const difficulty = String(payload.difficulty ?? 'gentle');
  const templates = MISSION_TEMPLATES[pillar] ?? MISSION_TEMPLATES.discipline;
  const idx = Math.floor(Math.random() * templates.length);
  return {
    pillar,
    difficulty,
    suggestions: [templates[idx], templates[(idx + 1) % templates.length]],
    generatedAt: Date.now(),
  };
}

function computeContentProcessing(payload: Record<string, unknown>): Record<string, unknown> {
  const text = String(payload.text ?? '');
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
  const keywords = Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([w]) => w);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length;
  const avgWordsPerSentence = sentences > 0 ? words.length / sentences : words.length;
  // Simple readability: lower avg sentence length = easier to read (0-100 scale).
  const readabilityScore = Math.max(0, Math.min(100, Math.round(100 - (avgWordsPerSentence - 8) * 3)));
  return { wordCount: words.length, keywords, readabilityScore, sentences, processedAt: Date.now() };
}

function computeKnowledgeBase(payload: Record<string, unknown>): Record<string, unknown> {
  const text = String(payload.text ?? '');
  const category = String(payload.category ?? 'platform_insight');
  const rawTerms = text.toLowerCase().match(/\b\w{5,}\b/g) ?? [];
  const stopWords = new Set(['pentru', 'care', 'sunt', 'este', 'această', 'astfel', 'toate', 'foarte', 'their', 'that', 'with', 'this', 'from', 'have', 'been']);
  const filtered = rawTerms.filter((t) => !stopWords.has(t));
  const frequency: Record<string, number> = {};
  for (const t of filtered) frequency[t] = (frequency[t] ?? 0) + 1;
  const terms = Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([t]) => t);
  return { terms, frequency, category, charCount: text.length, processedAt: Date.now() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
