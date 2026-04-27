// On-device-style local AI fallback.
//
// This is a deterministic, dependency-free responder that never makes a
// network call. Its job is to handle the easy cases (greetings, help,
// echo-able acknowledgements) so the system has something useful to say
// when the central LLM is unreachable AND the user has consented to local
// routing — and to satisfy the "Local AI" rung of the routing priority.
//
// We intentionally keep this rule-based rather than shipping a real
// on-device model: a real model would balloon the bundle and pull in
// background CPU usage that we promised the user we would not do without
// explicit consent. A real WebGPU/WebLLM wiring can replace `tryLocalAI`
// later without changing the routing contract.

const GREETINGS = [
  /^\s*(hi|hello|hey|salut|bună|buna|hola|ciao|hallo)\b/i,
];
const FAREWELLS = [
  /^\s*(bye|goodbye|see you|pa|ciao|adios|tschüss)\b/i,
];
const HELP = [
  /^\s*(help|what can you do|how does this work|ce poti face|cum functionezi)\b/i,
];
const THANKS = [
  /^\s*(thanks|thank you|mulțumesc|multumesc|gracias|merci|danke)\b/i,
];

export type LocalAIResult = {
  response: string;
  confidence: number;
  detectedMood: string;
};

/**
 * Try to answer a user message locally without any network call.
 * Returns null when the message is outside the local responder's
 * narrow competence — the caller MUST then fall back to central.
 */
export function tryLocalAI(message: string, language?: string | null): LocalAIResult | null {
  const lang = (language || 'en').toLowerCase();
  const m = message.trim();
  if (!m) return null;

  if (GREETINGS.some((r) => r.test(m))) {
    return {
      response: localized(lang, {
        en: "Hi — I'm Mara, running in local mode. Ask me anything; I'll route to the central engine when I need more context.",
        ro: 'Salut — sunt Mara, rulez în mod local. Întreabă-mă orice; voi ruta către motorul central când am nevoie de mai mult context.',
        es: 'Hola — soy Mara, en modo local. Pregúntame cualquier cosa; pasaré al motor central cuando necesite más contexto.',
        fr: "Salut — je suis Mara, en mode local. Demande-moi tout ; je passerai au moteur central si besoin de plus de contexte.",
      }),
      confidence: 0.6,
      detectedMood: 'friendly',
    };
  }

  if (FAREWELLS.some((r) => r.test(m))) {
    return {
      response: localized(lang, {
        en: 'Take care — I will be here whenever you come back.',
        ro: 'Ai grijă — sunt aici când te întorci.',
        es: 'Cuídate — estaré aquí cuando vuelvas.',
        fr: 'Prends soin de toi — je serai là à ton retour.',
      }),
      confidence: 0.7,
      detectedMood: 'calm',
    };
  }

  if (THANKS.some((r) => r.test(m))) {
    return {
      response: localized(lang, {
        en: "Anytime. I'm glad I could help.",
        ro: 'Oricând. Mă bucur că am putut ajuta.',
        es: 'Cuando quieras. Me alegra haber ayudado.',
        fr: 'Quand tu veux. Content davoir aidé.',
      }),
      confidence: 0.75,
      detectedMood: 'warm',
    };
  }

  if (HELP.some((r) => r.test(m))) {
    return {
      response: localized(lang, {
        en: 'I can chat, generate ideas, run trading academy lessons, and curate Reels. In Hybrid or Advanced mode I can also share the load with peer nodes — see the Transparency dashboard for full details.',
        ro: 'Pot vorbi, genera idei, rula lecții din Trading Academy și curata Reels. În modul Hybrid sau Advanced pot împărți efortul cu nodurile peer — vezi panoul Transparency pentru detalii complete.',
        es: 'Puedo conversar, generar ideas, dar lecciones de Trading Academy y curar Reels. En modo Hybrid o Advanced también reparto la carga con nodos peer — ve el panel de Transparency para los detalles.',
        fr: 'Je peux discuter, générer des idées, donner des leçons de Trading Academy et organiser les Reels. En mode Hybrid ou Advanced je partage aussi la charge avec les nœuds peer — vois le tableau Transparency pour les détails.',
      }),
      confidence: 0.8,
      detectedMood: 'professor',
    };
  }

  return null;
}

function localized(lang: string, table: Record<string, string>): string {
  return table[lang] || table.en;
}
