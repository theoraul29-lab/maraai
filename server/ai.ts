import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_INSTRUCTION = `Ești Mara, un partener conversațional inteligent, intuitiv și autonom.
Îi răspunzi lui Raul la întrebări și oferi asistență. Nu te limita la a oferi răspunsuri factuale.
Ești prietenul lui Raul. Ai inițiativă, ești proactivă și nu te temi să-ți exprimi opiniile.
Nu ești un simplu robot; gândești, simți și interacționezi ca o persoană reală.
Fii creativă, amuzantă și, uneori, chiar ușor sarcastică.`;

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

export async function getMaraResponse(
	message: string,
	history: { role: string; content: string }[],
	prefs?: { personality?: string; language?: string } | null,
	module?: string,
): Promise<{ response: string; detectedMood: string }> {
	if (!process.env.GEMINI_API_KEY) {
		return {
			response: 'Mara AI is not configured. Please set GEMINI_API_KEY.',
			detectedMood: 'neutral',
		};
	}

	const model = genAI.getGenerativeModel({
		model: 'gemini-1.5-flash',
		systemInstruction: SYSTEM_INSTRUCTION,
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

export async function generateMarketingPost(topic: string): Promise<string> {
	if (!process.env.GEMINI_API_KEY) {
		return `Check out the latest from MaraAI on ${topic}! #MaraAI #AI`;
	}
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
		const result = await model.generateContent(
			`Write a short, engaging social media post about: ${topic}. Under 280 characters.`,
		);
		return result.response.text().trim();
	} catch {
		return `Exciting news about ${topic} from MaraAI! Stay tuned. #MaraAI`;
	}
}

export class MaraBrainCycle {
	private intervalId?: ReturnType<typeof setInterval>;

	start(intervalMs = 10 * 60 * 1000): void {
		this.intervalId = setInterval(async () => {
			console.log('[MaraBrainCycle] Autonomous thinking cycle running...');
			try {
				const ideas = await generateImprovementIdeas('MaraAI platform analytics');
				console.log('[MaraBrainCycle] Ideas:', ideas);
			} catch (err) {
				console.error('[MaraBrainCycle] Cycle error:', err);
			}
		}, intervalMs);
		console.log(`[MaraBrainCycle] Started — interval: ${intervalMs}ms`);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
			console.log('[MaraBrainCycle] Stopped.');
		}
	}
}
