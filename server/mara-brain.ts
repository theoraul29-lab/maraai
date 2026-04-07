// Mara Brain - Memory & Learning System Enhancement
// Integrates with server/storage.ts for persistent learning

import { storage } from './storage';

export interface MaraMemory {
  userId: string;
  interactions: InteractionRecord[];
  preferences: UserPreferences;
  learningData: LearningRecord[];
  mood: string;
}

export interface InteractionRecord {
  timestamp: string;
  userMessage: string;
  maraResponse: string;
  detectedMood: string;
  emotionalContext: string;
  topicsDiscussed: string[];
  confidence: number;
}

export interface UserPreferences {
  personality: string;
  language: string;
  communicationStyle: 'formal' | 'casual' | 'warm';
  preferredModules: string[];
}

export interface LearningRecord {
  topic: string;
  sentiment: number; // -1 to 1
  frequency: number;
  lastMentioned: string;
}

export class MaraBrainMemory {
  private userId: string;
  private maxMemoryItems = 100;
  private autosaveInterval = 30000; // 30 seconds

  constructor(userId: string) {
    this.userId = userId;
    this.startAutosave();
  }

  async loadMemory(): Promise<MaraMemory | null> {
    try {
      const messages = await storage.getChatMessages(this.userId);
      const prefs = await storage.getUserPreferences(this.userId);

      if (!messages || messages.length === 0) return null;

      const interactions = messages.slice(-this.maxMemoryItems).map((msg) => ({
        timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
        userMessage: msg.sender === 'user' ? msg.content : '',
        maraResponse: msg.sender === 'ai' ? msg.content : '',
        detectedMood: 'neutral',
        emotionalContext: this.analyzeEmotionalContext(msg.content, msg.sender),
        topicsDiscussed: this.extractTopics(msg.content),
        confidence: msg.metadata?.confidence || 0.7,
      }));

      return {
        userId: this.userId,
        interactions,
        preferences: prefs || this.getDefaultPreferences(),
        learningData: this.buildLearningData(interactions),
        mood: this.getCurrentMood(interactions),
      };
    } catch (error) {
      console.error('[MaraBrainMemory] Failed to load memory:', error);
      return null;
    }
  }

  async recordInteraction(
    userMessage: string,
    maraResponse: string,
    mood: string,
  ): Promise<void> {
    try {
      await storage.createChatMessage({
        content: userMessage,
        sender: 'user',
        userId: this.userId,
        metadata: { mood },
      });

      await storage.createChatMessage({
        content: maraResponse,
        sender: 'ai',
        userId: this.userId,
        metadata: { mood, timestamp: new Date().toISOString() },
      });
    } catch (error) {
      console.error('[MaraBrainMemory] Failed to record interaction:', error);
    }
  }

  async updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
    try {
      const current = await storage.getUserPreferences(this.userId);
      const updated = { ...current, ...prefs, userId: this.userId };
      await storage.setUserPreferences(this.userId, updated);
    } catch (error) {
      console.error('[MaraBrainMemory] Failed to update preferences:', error);
    }
  }

  buildContextPrompt(memory: MaraMemory | null): string {
    if (!memory || memory.interactions.length === 0) {
      return 'No previous interactions. Starting fresh conversation.';
    }

    const recentInteractions = memory.interactions.slice(-5);
    const frequentTopics = memory.learningData
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3)
      .map((l) => l.topic);

    const contextLines = [
      `User language: ${memory.preferences.language}`,
      `Communication style: ${memory.preferences.communicationStyle}`,
      `Last detected mood: ${memory.mood}`,
      `Frequent topics: ${frequentTopics.join(', ')}`,
      '',
      'Recent interaction patterns:',
      ...recentInteractions.map(
        (i) =>
          `- ${i.emotionalContext}: "${i.userMessage.substring(0, 60)}..." → Mara detected ${i.detectedMood}`,
      ),
    ];

    return contextLines.join('\n');
  }

  private analyzeEmotionalContext(content: string, sender: string): string {
    const lower = content.toLowerCase();

    if (sender === 'user') {
      if (/please|thank|grateful|appreciate/i.test(lower)) return 'grateful';
      if (/urgent|asap|now|quick/i.test(lower)) return 'urgent';
      if (/confused|help|stuck|lost/i.test(lower)) return 'confused';
      if (/excited|amazing|great|awesome/i.test(lower)) return 'excited';
      if (/sad|sorry|depressed|down/i.test(lower)) return 'sad';
    }

    return 'neutral';
  }

  private extractTopics(content: string): string[] {
    const topicKeywords: Record<string, string[]> = {
      trading: ['btc', 'eth', 'chart', 'signal', 'trading', 'crypto', 'market'],
      writing: ['write', 'book', 'story', 'manuscript', 'article', 'poetry', 'essay'],
      creation: ['video', 'creator', 'content', 'reel', 'post', 'upload', 'publish'],
      learning: ['learn', 'teach', 'course', 'tutorial', 'lesson', 'improve'],
      technical: ['code', 'dev', 'api', 'database', 'server', 'deploy'],
    };

    const found: Set<string> = new Set();
    const lower = content.toLowerCase();

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((k) => lower.includes(k))) {
        found.add(topic);
      }
    }

    return Array.from(found);
  }

  private buildLearningData(interactions: InteractionRecord[]): LearningRecord[] {
    const learningMap: Map<string, LearningRecord> = new Map();

    interactions.forEach((i) => {
      i.topicsDiscussed.forEach((topic) => {
        const existing = learningMap.get(topic) || {
          topic,
          sentiment: 0,
          frequency: 0,
          lastMentioned: new Date().toISOString(),
        };

        existing.frequency += 1;
        existing.lastMentioned = i.timestamp;
        existing.sentiment = (existing.sentiment + (i.confidence > 0.7 ? 1 : -1)) / 2;

        learningMap.set(topic, existing);
      });
    });

    return Array.from(learningMap.values()).sort((a, b) => b.frequency - a.frequency);
  }

  private getCurrentMood(interactions: InteractionRecord[]): string {
    if (interactions.length === 0) return 'neutral';

    const recentMoods = interactions.slice(-5).map((i) => i.detectedMood);
    const moodCounts = recentMoods.reduce(
      (acc, mood) => {
        acc[mood] = (acc[mood] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0][0];
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      personality: 'warm',
      language: 'ro',
      communicationStyle: 'warm',
      preferredModules: ['chat', 'creative'],
    };
  }

  private startAutosave(): void {
    setInterval(async () => {
      try {
        const memory = await this.loadMemory();
        if (memory) {
          console.log(`[MaraBrainMemory] Auto-saved memory for ${this.userId}`);
        }
      } catch (error) {
        console.warn('[MaraBrainMemory] Autosave warning:', error);
      }
    }, this.autosaveInterval);
  }
}

// Export singleton for Mara's global brain
export const maraBrain = {
  memories: new Map<string, MaraBrainMemory>(),

  getOrCreate(userId: string): MaraBrainMemory {
    if (!this.memories.has(userId)) {
      this.memories.set(userId, new MaraBrainMemory(userId));
    }
    return this.memories.get(userId)!;
  },

  async getContextForUser(userId: string): Promise<string> {
    const brain = this.getOrCreate(userId);
    const memory = await brain.loadMemory();
    return brain.buildContextPrompt(memory);
  },
};
