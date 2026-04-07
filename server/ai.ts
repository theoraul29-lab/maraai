import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildUserContext, buildSystemInstruction, recordLearningFromChat } from './mara-brain/index.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
	if (!process.env.GEMINI_API_KEY) {
		return {
			response: 'Mara AI is not configured. Please set GEMINI_API_KEY.',
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

	const model = genAI.getGenerativeModel({
		model: 'gemini-1.5-flash',
		systemInstruction,
		generationConfig: { temperature: 0.95 },
	});

	const chatHistory = history
		.filter((h) => h.role === 'user' || h.role === 'model' || h.role === 'assistant')
		.map((h) => ({
			role: h.role === 'user' ? ('user' as const) : ('model' as const),
			parts: [{ text: h.content }],
		}));

	const chat = model.startChat({ history: chatHistory });
	const result = await chat.sendMessage(message);
	const responseText = result.response.text();
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
	if (!process.env.GEMINI_API_KEY) {
		return ['Improve response time', 'Add more personalization', 'Enhance context understanding'];
	}
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
		const result = await model.generateContent(
			`Give 3 concise improvement ideas for this AI system context: ${context}. Return a JSON array of strings.`,
		);
		const text = result.response.text().trim();
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
	if (!process.env.GEMINI_API_KEY) {
		return `Check out the latest from MaraAI on ${postTopic}! #MaraAI #AI`;
	}
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
		const result = await model.generateContent(
			`Write a short, engaging social media post about: ${postTopic}. Under 280 characters.`,
		);
		return result.response.text().trim();
	} catch {
		return `Exciting news about ${postTopic} from MaraAI! Stay tuned. #MaraAI`;
	}
}

// Re-export the brain cycle from the new module
export { runBrainCycle, runInitialLearning } from './mara-brain/index.js';
