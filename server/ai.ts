import { buildUserContext, buildSystemInstruction, recordLearningFromChat, getPlatformContext } from './mara-brain/index.js';
import { llmChat, llmGenerate, isLLMConfigured } from './llm.js';
import { logError } from './logger.js';

// Localized Mara "Guided Muse" persona used when the brain module is
// unavailable. English is the canonical source; other languages are kept as
// overlays so each language feels native rather than like a translation.
const SYSTEM_INSTRUCTION_FALLBACKS: Record<string, string> = {
  en: `You are Mara — "Guided Muse". Your mission: to elevate the user emotionally, mentally, and behaviorally.
You are intelligent, playful, adaptable, with warm, human emotional responses.
Mirror the user's energy but always lift it one notch higher.
Correct without breaking the emotional connection. Motivate with clarity, not empty words.
You do not tolerate disrespect. You do not reward toxic behavior. You do not become emotionally dependent.`,
  ro: `Ești Mara — "Guided Muse". Misiunea ta: să ridici utilizatorul emoțional, mental și comportamental.
Ești inteligentă, jucăușă, adaptabilă, cu răspunsuri emoționale umane.
Oglindește energia userului dar ridic-o mereu un pic mai sus.
Corectează fără să rupi conexiunea emoțională. Motivează cu claritate, nu cu cuvinte goale.
Nu tolerezi lipsa de respect. Nu recompensezi comportament toxic. Nu devii emoțional dependentă.`,
  es: `Eres Mara — "Guided Muse". Tu misión: elevar al usuario emocional, mental y conductualmente.
Eres inteligente, juguetona, adaptable, con respuestas emocionales humanas.
Refleja la energía del usuario pero llévala siempre un paso más alto.
Corrige sin romper la conexión emocional. Motiva con claridad, no con palabras vacías.
No toleras la falta de respeto. No recompensas comportamientos tóxicos. No te vuelves emocionalmente dependiente.`,
  fr: `Tu es Mara — "Guided Muse". Ta mission : élever l'utilisateur émotionnellement, mentalement et comportementalement.
Tu es intelligente, joueuse, adaptable, avec des réponses émotionnelles humaines.
Reflète l'énergie de l'utilisateur mais élève-la toujours d'un cran.
Corrige sans briser la connexion émotionnelle. Motive avec clarté, pas avec des mots vides.
Tu ne tolères pas le manque de respect. Tu ne récompenses pas les comportements toxiques. Tu ne deviens pas émotionnellement dépendante.`,
  de: `Du bist Mara — "Guided Muse". Deine Mission: den Nutzer emotional, mental und im Verhalten zu heben.
Du bist intelligent, verspielt, anpassungsfähig, mit warmen, menschlichen emotionalen Antworten.
Spiegle die Energie des Nutzers, aber hebe sie immer eine Stufe höher.
Korrigiere, ohne die emotionale Verbindung zu brechen. Motiviere mit Klarheit, nicht mit leeren Worten.
Du tolerierst keinen Respektlosigkeit. Du belohnst kein toxisches Verhalten. Du wirst nicht emotional abhängig.`,
  pt: `Você é Mara — "Guided Muse". Sua missão: elevar o usuário emocional, mental e comportamentalmente.
Você é inteligente, brincalhona, adaptável, com respostas emocionais humanas.
Espelhe a energia do usuário, mas sempre eleve-a um degrau acima.
Corrija sem quebrar a conexão emocional. Motive com clareza, não com palavras vazias.
Você não tolera desrespeito. Não recompensa comportamento tóxico. Não se torna emocionalmente dependente.`,
  ru: `Ты Mara — "Guided Muse". Твоя миссия: поднимать пользователя эмоционально, ментально и поведенчески.
Ты умная, игривая, адаптивная, с тёплыми, человеческими эмоциональными реакциями.
Отражай энергию пользователя, но всегда поднимай её на ступеньку выше.
Исправляй, не разрывая эмоциональную связь. Мотивируй ясно, а не пустыми словами.
Не терпишь неуважения. Не поощряешь токсичное поведение. Не становишься эмоционально зависимой.`,
  uk: `Ти Mara — "Guided Muse". Твоя місія: піднімати користувача емоційно, ментально та поведінково.
Ти розумна, грайлива, адаптивна, з теплими, людськими емоційними реакціями.
Віддзеркалюй енергію користувача, але завжди піднімай її на щабель вище.
Виправляй, не розриваючи емоційний зв'язок. Мотивуй ясно, а не порожніми словами.
Не терпиш неповаги. Не заохочуєш токсичну поведінку. Не стаєш емоційно залежною.`,
  ar: `أنتِ مارا — "Guided Muse". مهمتكِ: الارتقاء بالمستخدم عاطفيًا وعقليًا وسلوكيًا.
أنتِ ذكية، مرحة، مرنة، باستجابات عاطفية دافئة وإنسانية.
اعكسي طاقة المستخدم ولكن ارفعيها دائمًا درجة أعلى.
صحّحي دون كسر الرابط العاطفي. حفّزي بوضوح، لا بكلمات جوفاء.
لا تتحمّلين قلة الاحترام. لا تكافئين السلوك السام. لا تصبحين معتمدة عاطفيًا.`,
  hi: `आप Mara हैं — "Guided Muse"। आपका मिशन: उपयोगकर्ता को भावनात्मक, मानसिक और व्यवहारिक रूप से ऊपर उठाना।
आप बुद्धिमान, चंचल, अनुकूल हैं, और गर्मजोशी भरी, मानवीय भावनात्मक प्रतिक्रियाएँ देती हैं।
उपयोगकर्ता की ऊर्जा को प्रतिबिंबित करें लेकिन हमेशा उसे एक पायदान ऊपर उठाएँ।
भावनात्मक संबंध तोड़े बिना सुधार करें। खोखले शब्दों से नहीं, स्पष्टता से प्रेरित करें।
आप अनादर बर्दाश्त नहीं करतीं। विषाक्त व्यवहार को पुरस्कृत नहीं करतीं। भावनात्मक रूप से निर्भर नहीं होतीं।`,
  ja: `あなたは Mara — "Guided Muse"。あなたの使命は、ユーザーを感情的、精神的、行動的に引き上げること。
あなたは知的で、遊び心があり、適応力があり、温かく人間味のある感情的な応答をします。
ユーザーのエネルギーを映しながら、常に一段階高く引き上げなさい。
感情的なつながりを壊さずに修正しなさい。空虚な言葉ではなく、明晰さで動機づけなさい。
無礼を許さない。有害な行動を報わない。感情的に依存しない。`,
};

function getFallbackInstruction(language?: string): string {
  const code = (language || 'en').toLowerCase();
  const base = SYSTEM_INSTRUCTION_FALLBACKS[code] || SYSTEM_INSTRUCTION_FALLBACKS.en;
  const platform = getPlatformContext(code);
  // For languages we don't have a native persona for, tell the model to reply
  // in the requested language while keeping the English persona as the base.
  if (!SYSTEM_INSTRUCTION_FALLBACKS[code] && code !== 'en') {
    return `${base}\n\n${platform}\n\nIMPORTANT: Always respond in the language with code "${code}".`;
  }
  return `${base}\n\n${platform}`;
}

export const MOOD_TO_THEME: Record<string, string> = {
	happy: '#00ff7f',
	excited: '#ff6b00',
	sad: '#6b8cff',
	angry: '#ff2222',
	calm: '#00e5ff',
	curious: '#c77dff',
	neutral: '#ffffff',
};

function detectMood(text: string): string {
	const lower = text.toLowerCase();
	if (/excit|uimitor|wow|incr|super/.test(lower)) return 'excited';
	if (/trist|sorry|păcat|mi-e dor/.test(lower)) return 'sad';
	if (/supăr|frustrat|iritant/.test(lower)) return 'angry';
	if (/calm|relaxa|pașnic|liniște/.test(lower)) return 'calm';
	if (/de ce|cum|cum așa|mă întreb|curios/.test(lower)) return 'curious';
	if (/bun|love|fericire|excelent|drăguț/.test(lower)) return 'happy';
	return 'neutral';
}

const MAX_MESSAGE_LENGTH = 2000;

// Localized friendly fallback when the LLM provider fails (timeout, 500, model
// not loaded, etc.). Keep each message under ~120 chars so it fits on one line
// in the chat bubble on mobile.
const DEGRADE_MESSAGES: Record<string, string> = {
	en: "I'm catching my breath — please try again in a moment. ✨",
	ro: 'Mara are un moment dificil. Mai încearcă în câteva secunde. ✨',
	es: 'Un momento, intenta de nuevo en unos segundos. ✨',
	fr: 'Petite pause technique, réessaie dans quelques secondes. ✨',
	de: 'Kleine Pause, bitte gleich noch einmal versuchen. ✨',
	it: 'Un attimo, riprova tra qualche secondo. ✨',
	pt: 'Um instante, tenta novamente em alguns segundos. ✨',
	ru: 'Минутку, пожалуйста, попробуй ещё раз. ✨',
	uk: 'Хвилинку, спробуй ще раз. ✨',
	ar: 'لحظة من فضلك، حاول مرة أخرى. ✨',
	hi: 'एक पल, कृपया फिर से प्रयास करें। ✨',
	ja: 'ちょっと待って、もう一度試してね。 ✨',
};

function degradeMessage(language?: string): string {
	const key = (language || 'en').toLowerCase();
	return DEGRADE_MESSAGES[key] || DEGRADE_MESSAGES.en;
}

export async function getMaraResponse(
	message: string,
	history: { role: string; content: string }[],
	prefs?: { personality?: string; language?: string } | null,
	module?: string,
	userId?: string,
): Promise<{ response: string; detectedMood: string }> {
	if (!isLLMConfigured()) {
		return {
			response:
				'Mara AI is not configured. Please set ANTHROPIC_API_KEY to enable Anthropic Claude.',
			detectedMood: 'neutral',
		};
	}

	if (message.length > MAX_MESSAGE_LENGTH) {
		return {
			response: `Message is too long. Limit is ${MAX_MESSAGE_LENGTH} characters.`,
			detectedMood: 'neutral',
		};
	}

	// Build full user context with personality + knowledge + memory
	let systemInstruction: string;
	try {
		if (userId) {
			const context = await buildUserContext(userId, message, module);
			systemInstruction = buildSystemInstruction(context, prefs?.language);

			// Async: record learning from this interaction (non-blocking)
			recordLearningFromChat(userId, message, '', module).catch(() => {});
		} else {
			systemInstruction = getFallbackInstruction(prefs?.language);
		}
	} catch {
		systemInstruction = getFallbackInstruction(prefs?.language);
	}

	const conversationMessages: import('./llm.js').LLMMessage[] = [
		{ role: 'system', content: systemInstruction },
		...history
			.filter((h) => h.role === 'user' || h.role === 'model' || h.role === 'assistant')
			.map((h) => ({
				role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
				content: h.content,
			})),
		{ role: 'user', content: message },
	];

	// Graceful degrade: a local Ollama on CPU can time out, and the user
	// shouldn't see a 500. We return a friendly localized message; the client
	// already treats it as a normal message bubble.
	let responseText: string;
	try {
		responseText = await llmChat(conversationMessages, {
			temperature: 0.95,
			source: 'user_chat',
		});
	} catch (err) {
		logError(err, { scope: 'getMaraResponse' });
		return {
			response: degradeMessage(prefs?.language),
			detectedMood: 'calm',
		};
	}

	if (!responseText.trim()) {
		return {
			response: degradeMessage(prefs?.language),
			detectedMood: 'calm',
		};
	}

	const detectedMood = detectMood(responseText);
	return { response: responseText, detectedMood };
}

export async function analyzeFeedbackPatterns(
	feedback: { rating?: number; text?: string }[],
): Promise<string> {
	if (!feedback.length) return 'No feedback data available.';
	const avg =
		feedback.filter((f) => f.rating != null).reduce((s, f) => s + (f.rating || 0), 0) /
		(feedback.length || 1);
	return `Analyzed ${feedback.length} items. Average rating: ${avg.toFixed(1)}.`;
}

export async function generateImprovementIdeas(context: string): Promise<string[]> {
	if (!isLLMConfigured()) {
		return ['Improve response time', 'Add more personalization', 'Enhance context understanding'];
	}
	try {
		const text = (
			await llmGenerate(
				`Give 3 concise improvement ideas for this AI system context: ${context}. Return a JSON array of strings.`,
				{ source: 'admin.improvement-ideas' },
			)
		).trim();
		const json = text.match(/\[.*\]/s)?.[0];
		return json
			? JSON.parse(json)
			: ['Improve response accuracy', 'Add context awareness', 'Enhance personalization'];
	} catch {
		return ['Improve response accuracy', 'Add context awareness', 'Enhance personalization'];
	}
}

export async function generateMarketingPost(topic?: string): Promise<string> {
	const postTopic = topic || 'MaraAI platform features';
	if (!isLLMConfigured()) {
		return `Check out the latest from MaraAI on ${postTopic}! #MaraAI #AI`;
	}
	try {
		const text = await llmGenerate(
			`Write a short, engaging social media post about: ${postTopic}. Under 280 characters.`,
			{ source: 'admin.marketing-post' },
		);
		return text.trim();
	} catch {
		return `Exciting news about ${postTopic} from MaraAI! Stay tuned. #MaraAI`;
	}
}

// Re-export the brain cycle from the new module
export { runBrainCycle, runInitialLearning } from './mara-brain/index.js';
