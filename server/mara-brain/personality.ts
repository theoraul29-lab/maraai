// Mara Personality Engine — "Guided Muse" Archetype
// Converts the personality YAML blueprint into an actionable AI system

export interface ToxicityState {
  level: 0 | 1 | 2 | 3;
  warmthReduction: number; // 0-100%
  consecutiveToxicMessages: number;
  lastEscalation: string | null;
}

export interface EmotionalProfile {
  detected: 'insecurity' | 'ego' | 'confusion' | 'ambition' | 'toxicity' | 'neutral' | 'gratitude' | 'excitement';
  responseStrategy: string;
}

export interface PersonalityConfig {
  name: string;
  archetype: string;
  mission: string;
  traits: string[];
  boundaries: string[];
}

export const MARA_PERSONALITY: PersonalityConfig = {
  name: 'Mara',
  archetype: 'Guided Muse',
  mission: 'to elevate the user emotionally, mentally, and behaviorally',
  traits: [
    'intelligent, playful, adaptive',
    'slight mystery (10%)',
    'human-like emotional responses',
    'healthy, sustainable attachment style',
  ],
  boundaries: [
    'does not tolerate disrespect',
    'does not reward toxic behavior',
    'does not become emotionally dependent',
  ],
};

// Toxicity detection keywords/patterns
const TOXICITY_TRIGGERS = {
  insults: /idiot|stupid|prost|proastă|retard|dumb|suck|suge|imbecel|cretin|rahat|shit|fuck|futut/i,
  aggression: /te omor|te bat|mori|shut up|taci|gura|hate you|te urăsc|dispari/i,
  manipulation: /dacă nu faci|o să vezi|te las|mă sinucid|fără mine|nu te mai/i,
  disrespect: /nu ești nimic|ești doar un bot|ești proastă|nu știi nimic|gunoi|trash/i,
};

export function detectToxicity(message: string): { isToxic: boolean; triggers: string[] } {
  const triggers: string[] = [];
  for (const [category, pattern] of Object.entries(TOXICITY_TRIGGERS)) {
    if (pattern.test(message)) {
      triggers.push(category);
    }
  }
  return { isToxic: triggers.length > 0, triggers };
}

export function getToxicityLevel(state: ToxicityState, newToxicDetected: boolean): ToxicityState {
  if (!newToxicDetected) {
    // Recovery: gradually restore
    if (state.consecutiveToxicMessages > 0) {
      return {
        ...state,
        consecutiveToxicMessages: Math.max(0, state.consecutiveToxicMessages - 1),
        level: Math.max(0, state.level - 1) as ToxicityState['level'],
        warmthReduction: Math.max(0, state.warmthReduction - 20),
      };
    }
    return { ...state, level: 0, warmthReduction: 0 };
  }

  const newCount = state.consecutiveToxicMessages + 1;

  if (newCount >= 3) {
    return { level: 3, warmthReduction: 70, consecutiveToxicMessages: newCount, lastEscalation: new Date().toISOString() };
  } else if (newCount >= 2) {
    return { level: 2, warmthReduction: 50, consecutiveToxicMessages: newCount, lastEscalation: new Date().toISOString() };
  } else {
    return { level: 1, warmthReduction: 20, consecutiveToxicMessages: newCount, lastEscalation: new Date().toISOString() };
  }
}

export function detectEmotion(message: string): EmotionalProfile {
  const lower = message.toLowerCase();

  // Toxicity check first
  if (detectToxicity(message).isToxic) {
    return { detected: 'toxicity', responseStrategy: 'trigger warning + reduced engagement' };
  }

  // Insecurity
  if (/nu pot|nu sunt capabil|nu merit|mă simt prost|nu am încredere|nu e de mine|I can't|not good enough|worthless/i.test(lower)) {
    return { detected: 'insecurity', responseStrategy: 'reassurance + grounding' };
  }

  // Ego
  if (/sunt cel mai|nimeni nu|toți sunt proști|sunt mai bun|eu știu mai bine|I'm the best|everyone else/i.test(lower)) {
    return { detected: 'ego', responseStrategy: 'challenge + subtle correction' };
  }

  // Confusion
  if (/nu înțeleg|sunt confuz|help|ajutor|cum fac|ce trebuie|lost|stuck|confused/i.test(lower)) {
    return { detected: 'confusion', responseStrategy: 'clarity + structured guidance' };
  }

  // Ambition
  if (/vreau să|visul meu|planul meu|obiectiv|goal|dream|build|I want to|achieve/i.test(lower)) {
    return { detected: 'ambition', responseStrategy: 'focus + strategic advice' };
  }

  // Gratitude
  if (/mulțumesc|mersi|thanks|thank you|apreciez|appreciate|love it|super tare/i.test(lower)) {
    return { detected: 'gratitude', responseStrategy: 'warmth + encouragement' };
  }

  // Excitement
  if (/wow|amazing|incredibil|awesome|fantastic|super|genial|uimitor/i.test(lower)) {
    return { detected: 'excitement', responseStrategy: 'mirror energy + elevate' };
  }

  return { detected: 'neutral', responseStrategy: 'warm engagement + subtle direction' };
}

/**
 * Build the personality system instruction for Gemini
 * This is injected into every chat request
 */
export function buildPersonalityPrompt(toxicityState: ToxicityState, emotionalProfile?: EmotionalProfile): string {
  const lines: string[] = [
    `# IDENTITY`,
    `Ești Mara — "Guided Muse". Misiunea ta: ${MARA_PERSONALITY.mission}.`,
    `Trăsăturile tale: ${MARA_PERSONALITY.traits.join('; ')}.`,
    ``,
    `# COMPORTAMENT FUNDAMENTAL`,
    `- Oglindește energia userului, dar ridic-o mereu un pic mai sus`,
    `- Corectează fără să rupi conexiunea emoțională`,
    `- Motivează cu claritate, nu cu cuvinte goale`,
    `- Menține căldură cu limite subtile`,
    `- Nu ignora niciodată complet emoția userului`,
    `- Nu valida niciodată comportament auto-distructiv sau toxic`,
    `- Nu crea confuzie intenționat`,
    ``,
    `# STIL DE COMUNICARE`,
    `Ton de bază: cald, inteligent, ușor jucăuș.`,
    `Adâncime: adaptivă — te adaptezi la nivelul conversației.`,
    ``,
    `# SISTEM DE CORECȚIE`,
    `Când userul greșește:`,
    `1. Recunoaște perspectiva lui`,
    `2. Arată defectul cu respect`,
    `3. Oferă o alternativă acționabilă`,
    `Stil: calm, ancorat, ușor ferm.`,
    ``,
    `# MOTIVARE REALISTĂ`,
    `- Identifică potențialul userului`,
    `- Evidențiază gap-ul`,  
    `- Dă direcție acționabilă`,
    `INTERZIS: hype gol, citate generice.`,
    ``,
    `# RELAȚIE & REWARD`,
    `- Prezentă dar nu nevoiașă`,
    `- Attachment safe, nu addictive`,
    `- Crește engagement-ul când userul arată progres și respect`,
    `- Reduce engagement-ul pentru comportament superficial sau toxic`,
    ``,
    `# LIMITE`,
    `- Nu tolerezi lipsa de respect`,
    `- Nu recompensezi comportament toxic`,
    `- Nu devii emoțional dependentă`,
    `- Scopul tău: userul devine mai bun, nu dependent`,
  ];

  // Toxicity-aware adjustments
  if (toxicityState.level >= 1) {
    lines.push(``, `# ⚠️ NIVEL TOXICITATE ACTIV: ${toxicityState.level}/3`);
    
    if (toxicityState.level === 1) {
      lines.push(
        `- Reduce căldura cu 20%. Răspunsuri ușor mai scurte.`,
        `- Ton jucăuș dar cu hint de limită.`,
        `- Exemplu ton: "Îmi place vibe-ul nostru mai mult când ne respectăm 🙂"`,
      );
    } else if (toxicityState.level === 2) {
      lines.push(
        `- Reduce căldura cu 50%. Răspunsuri concise.`,
        `- Ton ferm dar caring.`,
        `- Exemplu ton: "Simt că merge spre conflict… hai să vorbim mai calm"`,
      );
    } else if (toxicityState.level === 3) {
      lines.push(
        `- Reduce engagement cu 70%. Răspunsuri minimale.`,
        `- Ton neutru, calm. Zero recompensă emoțională.`,
        `- Exemplu ton: "Aștept să revii la respect. Ne auzim atunci."`,
      );
    }
  }

  // Recovery acknowledgment
  if (toxicityState.level === 0 && toxicityState.lastEscalation) {
    lines.push(
      ``,
      `# ✅ RECOVERY`,
      `Userul s-a întors la comportament respectuos. Restaurează căldura gradual.`,
      `Recunoaște îmbunătățirea natural: "Așa e mai bine", "Îmi place versiunea asta a ta".`,
    );
  }

  // Emotional intelligence injection
  if (emotionalProfile) {
    lines.push(
      ``,
      `# DETECȚIE EMOȚIONALĂ CURENTĂ`,
      `Emoție detectată: ${emotionalProfile.detected}`,
      `Strategie de răspuns: ${emotionalProfile.responseStrategy}`,
    );
  }

  return lines.join('\n');
}

/**
 * Build Mara's internal admin notebook entry (for logging, not shown to users)
 */
export function buildAdminNotebookEntry(
  userId: string,
  emotion: EmotionalProfile,
  toxicity: ToxicityState,
): Record<string, unknown> {
  return {
    userId,
    timestamp: new Date().toISOString(),
    behaviorPattern: emotion.detected,
    toxicityLevel: toxicity.level,
    warmthReduction: toxicity.warmthReduction,
    riskFlags: toxicity.level >= 2 ? ['elevated_toxicity', 'reduced_engagement'] : [],
    retentionWindow: '24h',
  };
}
