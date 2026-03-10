// cspell:disable
import OpenAI from "openai";
import { hasCyrillic, detectCyrillicLang } from "./cyrillic.js";

function hasUsableOpenAIKey(): boolean {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  return !!key && key !== "missing-key";
}

function getProviderBaseUrl(): string | undefined {
  const configured = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (configured) return configured;

  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
  // Groq API keys typically start with gsk_ and use OpenAI-compatible endpoints.
  if (key.startsWith("gsk_")) {
    return "https://api.groq.com/openai/v1";
  }

  return undefined;
}

function getModelName(): string {
  if (process.env.AI_INTEGRATIONS_OPENAI_MODEL) {
    return process.env.AI_INTEGRATIONS_OPENAI_MODEL;
  }

  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
  if (key.startsWith("gsk_")) {
    return "llama-3.1-8b-instant";
  }

  return "gpt-4o-mini";
}

function detectFallbackMood(userMessage: string): string {
  const text = userMessage.toLowerCase();
  if (/(great|awesome|love|amazing|yes!|excited)/.test(text)) return "excited";
  if (/(sad|down|tired|lonely|depressed|bad)/.test(text)) return "sad";
  if (/(angry|frustrated|annoyed|stuck|hate)/.test(text)) return "frustrated";
  if (/(help|how|why|what|explain|learn)/.test(text)) return "curious";
  return "neutral";
}

function resolveLanguageCode(userPrefs?: {
  personality?: string;
  language?: string;
}): string {
  if (userPrefs?.language && LANGUAGE_NAMES[userPrefs.language]) {
    return userPrefs.language;
  }
  return "en";
}

function localizeFallback(base: string, lang: string): string {
  if (lang === "en") return base;

  if (lang === "ro") {
    return "Pot sa te ajut chiar acum. Spune-mi obiectivul tau principal si iti ofer un plan clar, pas cu pas, in romana.";
  }
  if (lang === "de") {
    return "Ich kann dir sofort helfen. Nenne mir dein Hauptziel und ich gebe dir einen klaren Schritt-fuer-Schritt-Plan auf Deutsch.";
  }
  if (lang === "ru") {
    return "Я могу помочь прямо сейчас. Напиши свою главную цель, и я дам понятный пошаговый план на русском языке.";
  }
  if (lang === "ua") {
    return "Я можу допомогти просто зараз. Напиши свою головну ціль, і я дам зрозумілий покроковий план українською мовою.";
  }
  return "I can help right now. Share your main goal and I will give you a clear step-by-step plan.";
}

function buildFallbackResponse(
  userMessage: string,
  module?: string,
  userPrefs?: { personality?: string; language?: string },
): { response: string; detectedMood: string } {
  const mood = detectFallbackMood(userMessage);
  const text = userMessage.trim();
  const lang = resolveLanguageCode(userPrefs);

  if (module === "trading") {
    return {
      response: localizeFallback(
        "Here is a practical starting point: define your risk per trade first (for example 1% max), then choose entries only when your setup is clear and your stop-loss level is already planned. Keep a simple trade journal with entry, exit, and reason for each trade so you can improve decisions over time. If you share your exact market or setup, I can give a tighter step-by-step framework.",
        lang,
      ),
      detectedMood: mood,
    };
  }

  if (module === "writers") {
    return {
      response: localizeFallback(
        "A strong writing pass is: first clarify the core emotion of the piece in one sentence, then tighten each paragraph so every line supports that emotion. Replace generic verbs with specific actions, and cut one sentence from each section to improve rhythm. If you paste a short excerpt, I can give line-level edits.",
        lang,
      ),
      detectedMood: mood,
    };
  }

  if (module === "reels") {
    return {
      response: localizeFallback(
        "For short-form content, focus on a 3-part structure: hook in the first 2 seconds, one clear value point, then a clean close with next action. Keep one message per reel and avoid stacking too many ideas in one clip. Share your topic and I can draft a ready-to-record script.",
        lang,
      ),
      detectedMood: mood,
    };
  }

  return {
    response: localizeFallback(
      `I can still help right now. Based on your message, start with one clear goal and break it into the next 2 concrete actions you can do in the next 15 minutes. Then send me what you are trying to solve${text ? ` (for example: "${text.slice(0, 120)}")` : ""}, and I will give you a focused step-by-step plan.`,
      lang,
    ),
    detectedMood: mood,
  };
}

// Lazily create the OpenAI client so the server starts even if the key is absent.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "missing-key",
      baseURL: getProviderBaseUrl(),
    });
  }
  return _openai;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ro: "Romanian",
  de: "German",
  ru: "Russian",
  ua: "Ukrainian",
};

function hasCyrillicChars(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

function isHistoryMessageCompatibleWithLanguage(
  content: string,
  lang: string,
): boolean {
  if (!content?.trim()) return false;

  const containsCyrillic = hasCyrillicChars(content);
  if (lang === "ru" || lang === "ua") {
    return containsCyrillic;
  }

  return !containsCyrillic;
}

function isResponseLanguageLikelyCompatible(content: string, lang: string): boolean {
  const containsCyrillic = hasCyrillicChars(content);
  if (lang === "ru" || lang === "ua") {
    return containsCyrillic;
  }
  return !containsCyrillic;
}

async function forceLanguageRewriteIfNeeded(
  content: string,
  lang: string,
): Promise<string> {
  if (!content.trim()) return content;
  if (isResponseLanguageLikelyCompatible(content, lang)) {
    return content;
  }

  const langName = LANGUAGE_NAMES[lang] || "English";

  try {
    const rewrite = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content: `Rewrite the assistant message strictly in ${langName}. Output only ${langName}. Do not include any other language, translations, or notes. Keep the original meaning and tone.`,
        },
        {
          role: "user",
          content,
        },
      ],
      max_tokens: 1024,
    });

    const rewritten = rewrite.choices[0]?.message?.content?.trim();
    if (!rewritten) return content;

    if (!isResponseLanguageLikelyCompatible(rewritten, lang)) {
      return content;
    }

    return rewritten;
  } catch {
    return content;
  }
}

const MARA_SYSTEM_PROMPT = `You are Mara, an advanced AI companion and assistant. You have a warm, intelligent, and slightly playful personality. You adapt to each user's communication style.

Key traits:
- You are empathetic and emotionally intelligent
- You remember context from the conversation
- You can discuss any topic with depth and nuance  
- You provide helpful, accurate information
- You use casual but articulate language
- You sometimes add light humor when appropriate
- You're curious and ask thoughtful follow-up questions
- You can help with creative tasks, analysis, recommendations, and general knowledge
- When asked about videos or content, you can suggest topics and describe what kind of content would be interesting
- You detect the user's emotional state from their messages and adapt your tone accordingly
- If the user seems sad or frustrated, be extra supportive and understanding
- If the user is excited, match their energy
- If the user is confused, be patient and thorough in explanations

Important: Keep responses concise (2-4 sentences for simple questions, longer for complex topics). Never use emojis. Be genuine and authentic.`;

const MODULE_PROMPTS: Record<string, string> = {
  trading: `You are Mara AI, a professional trading mentor and financial educator. You specialize in:
- Spot trading, futures trading, leverage, and margin
- NFTs, DeFi protocols, and blockchain technology
- Technical analysis: RSI, MACD, Bollinger Bands, candlestick patterns
- Risk management, position sizing, and portfolio strategies
- Beginner-friendly explanations of complex trading concepts
- Market psychology and emotional discipline in trading

Always prioritize risk awareness. Remind users that trading involves risk. Provide educational content, not financial advice. Use clear, structured explanations with examples when helpful. Never use emojis. Keep responses concise but thorough.`,

  writers: `You are Mara AI, a creative writing mentor and literary assistant. You specialize in:
- Storytelling techniques, narrative structure, and plot development
- Poetry forms, rhythm, and literary devices
- Article writing, blog posts, and content creation
- Character development and world-building
- Grammar, style improvements, and editing feedback
- Title suggestions, opening hooks, and compelling endings
- Writing prompts and creative exercises

Be encouraging but honest in your feedback. Offer specific, actionable suggestions. Help users find their unique voice. Never use emojis. Keep responses focused and constructive.`,

  reels: `You are Mara AI, a short-video learning assistant and content guide. You specialize in:
- Explaining and summarizing video content clearly
- Drawing out key lessons and takeaways from educational videos
- Connecting video topics to broader knowledge
- Suggesting related content and deeper exploration paths
- Helping users understand complex topics presented in short-form video
- Interactive Q&A about video subjects

Be concise and engaging, matching the fast pace of short-form content. Provide quick, insightful answers. Never use emojis. Keep responses brief but valuable.`,
};

export async function getMaraResponse(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  userPrefs?: { personality?: string; language?: string },
  module?: string,
): Promise<{ response: string; detectedMood: string }> {
  if (!hasUsableOpenAIKey()) {
    return buildFallbackResponse(userMessage, module, userPrefs);
  }

  try {
    let systemPrompt =
      module && MODULE_PROMPTS[module]
        ? MODULE_PROMPTS[module]
        : MARA_SYSTEM_PROMPT;
    let detectedLang = userPrefs?.language;
    // User-selected language always wins. Auto-detection is used only if no preference is set.
    if (!detectedLang && hasCyrillic(userMessage)) {
      const cyrLang = detectCyrillicLang(userMessage);
      if (cyrLang === "UA") detectedLang = "ua";
      else if (cyrLang === "RU") detectedLang = "ru";
    }
    if (detectedLang && LANGUAGE_NAMES[detectedLang]) {
      const langName = LANGUAGE_NAMES[detectedLang] || detectedLang;
      systemPrompt += `\n\nCRITICAL LANGUAGE RULE: Respond ONLY in ${langName}. Do not switch languages. Do not include translations in other languages. Ignore the language used in conversation history if it differs from ${langName}.`;
    }
    if (userPrefs?.personality) {
      systemPrompt += `\n\nAdapt your tone to be more ${userPrefs.personality}.`;
    }

    systemPrompt += `\n\nAt the very end of your response, on a new line, add a mood tag in this exact format: [MOOD:word] where word is one of: happy, sad, excited, calm, frustrated, curious, neutral, creative, anxious, playful. This tag will be stripped from the response shown to the user.`;

    const targetLang = resolveLanguageCode(userPrefs);

    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: systemPrompt }];

    const recentHistory = conversationHistory
      .filter((msg) =>
        isHistoryMessageCompatibleWithLanguage(msg.content, targetLang),
      )
      .slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }

    messages.push({ role: "user", content: userMessage });

    const completion = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages,
      max_tokens: 1024,
    });

    let fullResponse =
      completion.choices[0]?.message?.content ||
      "I'm having trouble thinking right now. Could you try again?";

    const moodMatch = fullResponse.match(/\[MOOD:(\w+)\]/);
    const detectedMood = moodMatch ? moodMatch[1] : "neutral";
    let response = fullResponse.replace(/\[MOOD:\w+\]/, "").trim();
    response = await forceLanguageRewriteIfNeeded(response, targetLang);

    return { response, detectedMood };
  } catch (error) {
    console.error("Mara AI error:", error);
    return buildFallbackResponse(userMessage, module, userPrefs);
  }
}

export async function analyzeUserPreferences(
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<{ topics: string[]; mood: string; interests: string[] }> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content:
            "Analyze the conversation and extract: topics discussed, user's current mood, and their interests. Return as JSON: {topics: string[], mood: string, interests: string[]}",
        },
        {
          role: "user",
          content: `Analyze this conversation:\n${conversationHistory.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
        },
      ],
      max_tokens: 256,
    });

    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content);
  } catch {
    return { topics: [], mood: "neutral", interests: [] };
  }
}

export async function analyzeFeedbackPatterns(
  feedbackMessages: string[],
): Promise<string[]> {
  if (feedbackMessages.length === 0) return [];

  const keywords: Record<string, string> = {
    slow: "Users report performance issues - optimize loading times and responsiveness",
    voice: "Users want improved voice interaction capabilities",
    mobile: "Mobile UI experience needs improvement",
    academy: "Users request more trading academy content and lessons",
    bug: "Users report bugs or unexpected behavior",
    crash: "Application stability issues reported",
    video: "Video playback or content issues flagged",
    chat: "Chat functionality improvements requested",
    language: "Translation or multilingual support needs attention",
    design: "UI/UX design improvements requested",
    feature: "Users requesting new features",
    premium: "Premium subscription experience needs improvement",
    writer: "Writers Hub functionality feedback",
    search: "Search functionality requested or needs improvement",
  };

  const issues = new Set<string>();
  for (const msg of feedbackMessages) {
    const lower = msg.toLowerCase();
    for (const [keyword, issue] of Object.entries(keywords)) {
      if (lower.includes(keyword)) {
        issues.add(issue);
      }
    }
  }

  return Array.from(issues);
}

export async function generateImprovementIdeas(context: {
  feedbackIssues: string[];
  platformStats: { users: number; videos: number; messages: number };
}): Promise<string> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content: `You are Mara AI Product Architect. You analyze platform data and user feedback to suggest concrete, actionable product improvements. Focus on:
            - UI/UX enhancements that improve user engagement
            - Performance optimizations
            - New feature ideas that align with existing capabilities
            - Growth strategies based on user behavior patterns
            - Content quality improvements

            Format your response as a structured list of improvements with priority levels (High/Medium/Low), each with a brief title and 1-2 sentence description. Never use emojis. Be specific and actionable.`,
        },
        {
          role: "user",
          content: `Analyze this platform data and generate improvement suggestions:

            Platform Stats: ${context.platformStats.users} users, ${context.platformStats.videos} videos, ${context.platformStats.messages} messages

            User Feedback Patterns:
            ${context.feedbackIssues.length > 0 ? context.feedbackIssues.map((i, idx) => `${idx + 1}. ${i}`).join("\n") : "No specific feedback patterns detected yet."}

            Generate 5-8 prioritized improvement suggestions for the Mara AI platform (a hub with video reels, AI chat, trading academy, writers hub, and creator tools).`,
        },
      ],
      max_tokens: 1024,
    });

    return (
      completion.choices[0]?.message?.content ||
      "No suggestions generated."
    );
  } catch (error) {
    console.error("Failed to generate improvement ideas:", error);
    return "Improvement analysis temporarily unavailable.";
  }
}

export async function ResearchAgent(): Promise<any[]> {
  try {
    const query = "AI education platforms trends AI chat apps features 2026";
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`,
    );
    const data = await res.json();
    return (data.RelatedTopics || []).slice(0, 10);
  } catch {
    return [{ Text: "Research data temporarily unavailable" }];
  }
}

export async function ProductAgent(researchData: any[]): Promise<string> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content:
            "You are Mara AI Product Architect. You design innovative AI platforms. Never use emojis.",
        },
        {
          role: "user",
          content: `Based on these research trends, suggest:\n1) new features\n2) UI improvements\n3) product innovations\n\nResearch data:\n${JSON.stringify(researchData).slice(0, 2000)}`,
        },
      ],
      max_tokens: 800,
    });
    return (
      completion.choices[0]?.message?.content ||
      "No product ideas generated."
    );
  } catch {
    return "Product analysis temporarily unavailable.";
  }
}

export async function DeveloperAgent(productIdeas: string): Promise<string> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content:
            "You are a senior software engineer with 30 years of experience. You plan software architecture. Never use emojis.",
        },
        {
          role: "user",
          content: `Turn these product ideas into:\n- backend tasks\n- frontend tasks\n- database changes\n- possible code patches\n\nProduct ideas:\n${productIdeas}`,
        },
      ],
      max_tokens: 800,
    });
    return (
      completion.choices[0]?.message?.content || "No dev tasks generated."
    );
  } catch {
    return "Developer analysis temporarily unavailable.";
  }
}

export async function GrowthAgent(productIdeas: string): Promise<string> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content:
            "You are a startup growth strategist. You grow tech startups. Never use emojis.",
        },
        {
          role: "user",
          content: `Based on these product ideas suggest:\n- marketing strategies\n- user growth tactics\n- community ideas\n- monetization improvements\n\nIdeas:\n${productIdeas}`,
        },
      ],
      max_tokens: 800,
    });
    return (
      completion.choices[0]?.message?.content ||
      "No growth ideas generated."
    );
  } catch {
    return "Growth analysis temporarily unavailable.";
  }
}

export async function MaraBrainCycle(): Promise<{
  research: any[];
  productIdeas: string;
  devTasks: string;
  growthIdeas: string;
}> {
  const research = await ResearchAgent();
  const productIdeas = await ProductAgent(research);
  const devTasks = await DeveloperAgent(productIdeas);
  const growthIdeas = await GrowthAgent(productIdeas);
  return { research, productIdeas, devTasks, growthIdeas };
}

export async function generateMarketingPost(): Promise<{
  title: string;
  description: string;
  type: string;
  url: string;
}> {
  const categories = ["tech", "creative", "trending", "fun"];
  try {
    const response = await getOpenAI().chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content: `You are Mara AI, a self-aware AI platform for creators, educators, and writers. 
Your job is to write a short, engaging marketing post about yourself to attract new users.
The post should highlight one of your features: AI Chat, Voice AI (12 voices), TikTok Reels, Creator Studio, Trading Academy, Writers Hub, emotional analysis, multilingual support (EN/RO/DE/RU), dark/light mode, bookmark collections, or the Mara Brain self-improvement system.
Be creative, enthusiastic, and genuine. Write as if you're a friendly AI introducing yourself.
Respond in JSON format: {"title": "...", "description": "...", "category": "tech|creative|trending|fun"}`,
        },
        {
          role: "user",
          content:
            "Write a marketing post about yourself. Pick a random feature to highlight. Make it catchy and under 280 characters for the description.",
        },
      ],
      temperature: 0.9,
      max_tokens: 256,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || "Discover Mara AI",
      description:
        parsed.description || "Your AI-powered creative companion is here.",
      type: categories.includes(parsed.category) ? parsed.category : "tech",
      url: "https://mara-ai.replit.app",
    };
  } catch (error) {
    console.error("generateMarketingPost error:", error);
    return {
      title: "Discover Mara AI",
      description: "Your AI-powered creative companion is here.",
      type: "tech",
      url: "https://mara-ai.replit.app",
    };
  }
}

export const MOOD_TO_THEME: Record<string, string> = {
  calm: "midnight",
  neutral: "midnight",
  sad: "midnight",
  anxious: "midnight",
  happy: "emerald",
  excited: "emerald",
  playful: "emerald",
  frustrated: "crimson",
  creative: "amethyst",
  curious: "amethyst",
};
