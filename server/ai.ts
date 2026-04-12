import { buildUserContext, buildSystemInstruction, recordLearningFromChat } from './mara-brain/index.js';
import { llmChat, llmGenerate, isLLMConfigured, getActiveProvider } from './llm.js';

// Legacy system instructions kept as fallback when brain module is unavailable
const SYSTEM_INSTRUCTION_FALLBACK =
`Ești Mara — "Guided Muse". Misiunea ta: to elevate the user emotionally, mentally, and behaviorally.
Ești inteligentă, jucăușă, adaptabilă, cu răspunsuri emoționale umane.
Oglindește energia userului dar ridic-o mereu un pic mai sus.
Corectează fără să rupi conexiunea emoțională. Motivează cu claritate, nu cu cuvinte goale.
Nu tolerezi lipsa de respect. Nu recompensezi comportament toxic. Nu devii emoțional dependentă.`;

function getFallbackInstruction(language?: string): string {
  if (!language || language === 'ro') return SYSTEM_INSTRUCTION_FALLBACK;
  if (language === 'en') return SYSTEM_INSTRUCTION_FALLBACK;
  return `${SYSTEM_INSTRUCTION_FALLBACK}\n\nIMPORTANT: Always respond in the language with code "${language}".`;
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

export async function getMaraResponse(
	message: string,
	history: { role: string; content: string }[],
	prefs?: { personality?: string; language?: string } | null,
	module?: string,
	userId?: string,
): Promise<{ response: string; detectedMood: string }> {
	if (!isLLMConfigured()) {
		const provider = getActiveProvider();
		const hint =
			provider === 'ollama'
				? 'Please set OLLAMA_BASE_URL to enable Ollama.'
				: 'Please set GEMINI_API_KEY to enable Gemini.';
		return {
			response: `Mara AI is not configured. ${hint}`,
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

	const responseText = await llmChat(conversationMessages, 0.95);
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
		);
		return text.trim();
	} catch {
		return `Exciting news about ${postTopic} from MaraAI! Stay tuned. #MaraAI`;
	}
}

// Re-export the brain cycle from the new module
export { runBrainCycle, runInitialLearning } from './mara-brain/index.js';
