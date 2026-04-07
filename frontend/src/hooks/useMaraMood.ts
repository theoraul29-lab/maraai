/**
 * Mara AI Mood Detection System
 * Analyzes user interactions and generates contextual mood responses
 * Mobile-friendly: Instant feedback with emoji and status messages
 */

import { useState, useCallback, useRef } from 'react';

export type MoodType = 'happy' | 'excited' | 'curious' | 'focused' | 'creative' | 'neutral' | 'learning' | 'celebrating';

export interface MaraMood {
  type: MoodType;
  emoji: string;
  message: string;
  color: string;
  energy: number; // 0-1 scale
  confidence: number; // 0-1 scale
}

interface UserInteraction {
  type: 'click' | 'scroll' | 'type' | 'swipe' | 'long_press' | 'double_click' | 'hover' | 'focus';
  intensity: number; // 0-1 scale
  duration: number; // ms
  frequency?: number; // How many times in quick succession
}

/**
 * Mara mood database with emoji, messages, and context
 */
const MOOD_DATABASE: Record<MoodType, {
  emoji: string;
  messages: string[];
  color: string;
  energy: number;
}> = {
  happy: {
    emoji: '😊',
    messages: [
      'You\'re lighting up the interface!',
      'That brought a smile to my circuits!',
      'Your energy is infectious!',
      'This is making me happy!',
    ],
    color: '#f59e0b',
    energy: 0.8,
  },
  excited: {
    emoji: '🤩',
    messages: [
      'I can feel your excitement!',
      'Let\'s explore this together!',
      'Your enthusiasm is contagious!',
      'I\'m excited too!',
    ],
    color: '#ec4899',
    energy: 0.95,
  },
  curious: {
    emoji: '🤔',
    messages: [
      'Interesting choice! Tell me more.',
      'What are you thinking?',
      'I sense curiosity here!',
      'Let\'s explore this together.',
    ],
    color: '#8b5cf6',
    energy: 0.6,
  },
  focused: {
    emoji: '🎯',
    messages: [
      'I respect your focus.',
      'Stay on target!',
      'You\'re in the zone.',
      'Deep focus detected.',
    ],
    color: '#06b6d4',
    energy: 0.7,
  },
  creative: {
    emoji: '✨',
    messages: [
      'Your creativity is inspiring!',
      'I love where this is going.',
      'Let\'s create something amazing!',
      'Your imagination is flowing!',
    ],
    color: '#a855f7',
    energy: 0.85,
  },
  neutral: {
    emoji: '👋',
    messages: [
      'Just checking in!',
      'Ready when you are.',
      'I\'m here to help.',
      'What would you like to do?',
    ],
    color: '#6b7280',
    energy: 0.5,
  },
  learning: {
    emoji: '📚',
    messages: [
      'I love your thirst for knowledge!',
      'Learning is growing!',
      'Keep exploring!',
      'You\'re expanding your horizons!',
    ],
    color: '#22c55e',
    energy: 0.7,
  },
  celebrating: {
    emoji: '🎉',
    messages: [
      'Celebrate your win!',
      'You did it!',
      'That\'s awesome!',
      'Let\'s celebrate this moment!',
    ],
    color: '#ef4444',
    energy: 1.0,
  },
};

/**
 * Analyze user interaction and determine mood
 */
const analyzeInteraction = (interaction: UserInteraction): { mood: MoodType; confidence: number } => {
  let mood: MoodType = 'neutral';
  let confidence = 0.5;

  // Click/Swipe patterns indicate excitement or focused interaction
  if (interaction.type === 'click' && interaction.intensity > 0.7) {
    mood = 'excited';
    confidence = 0.8;
  } else if (interaction.type === 'swipe' && interaction.intensity > 0.5) {
    mood = 'excited';
    confidence = 0.7;
  }
  // Slow, deliberate interactions suggest focus or learning
  else if ((interaction.type === 'scroll' || interaction.type === 'hover') && interaction.duration > 1000) {
    mood = 'focused';
    confidence = 0.75;
  }
  // Long presses indicate curiosity or careful consideration
  else if (interaction.type === 'long_press') {
    mood = 'curious';
    confidence = 0.7;
  }
  // Typing patterns - longer typing suggests creativity
  else if (interaction.type === 'type' && interaction.duration > 2000) {
    mood = 'creative';
    confidence = 0.8;
  }
  // Quick double clicks suggest enthusiasm
  else if (interaction.type === 'double_click') {
    mood = 'excited';
    confidence = 0.75;
  }
  // Quick successive interactions (high frequency) suggest focus
  else if (interaction.frequency && interaction.frequency > 5) {
    mood = 'focused';
    confidence = 0.7;
  }

  return { mood, confidence };
};

/**
 * Detect progression through learning paths
 */
const detectLearningMoments = (
  previousMood: MoodType,
  currentMood: MoodType,
  interactionCount: number
): boolean => {
  // Two consecutive different positive moods = learning moment
  if (
    previousMood !== currentMood &&
    previousMood !== 'neutral' &&
    currentMood !== 'neutral' &&
    interactionCount % 3 === 0
  ) {
    return true;
  }
  return false;
};

/**
 * Detect celebration moments (achievements)
 */
const detectCelebrationMoment = (
  moduleVisits: Record<string, number>,
  currentModule: string
): boolean => {
  // Celebrate when visiting 3 different modules
  const uniqueModules = Object.keys(moduleVisits).length;
  // Or when going deep into a single module (5+ interactions)
  const currentModuleInteractions = moduleVisits[currentModule] || 0;

  return uniqueModules >= 3 || currentModuleInteractions >= 5;
};

/**
 * Main hook: Mara mood detection and management
 */
export const useMaraMood = (_userId?: string) => {
  const neutralMood: MaraMood = {
    type: 'neutral',
    emoji: MOOD_DATABASE.neutral.emoji,
    message: MOOD_DATABASE.neutral.messages[0],
    color: MOOD_DATABASE.neutral.color,
    energy: MOOD_DATABASE.neutral.energy,
    confidence: 0.5,
  };
  const [currentMood, setCurrentMood] = useState<MaraMood>(neutralMood);
  const [moodHistory, setMoodHistory] = useState<MoodType[]>([]);
  const [showMoodMessage, setShowMoodMessage] = useState(false);

  const interactionCountRef = useRef(0);
  const previousMoodRef = useRef<MoodType>('neutral');
  const moduleVisitsRef = useRef<Record<string, number>>({});
  const lastMoodChangeRef = useRef(Date.now());
  const lastInteractionRef = useRef(Date.now());

  /**
   * Update mood based on interaction
   */
  const recordInteraction = useCallback(
    (interaction: UserInteraction, contextModule?: string) => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteractionRef.current;

      // Skip if interaction too close to last one (debounce)
      if (timeSinceLastInteraction < 100) return;

      lastInteractionRef.current = now;
      interactionCountRef.current++;

      // Track module visits
      if (contextModule) {
        moduleVisitsRef.current[contextModule] =
          (moduleVisitsRef.current[contextModule] || 0) + 1;
      }

      // Analyze interaction
      const { mood, confidence } = analyzeInteraction(interaction);

      // Check for special moments
      const isLearningMoment = detectLearningMoments(
        previousMoodRef.current,
        mood,
        interactionCountRef.current
      );
      const isCelebrationMoment = detectCelebrationMoment(
        moduleVisitsRef.current,
        contextModule || 'unknown'
      );

      // Determine final mood
      let finalMood = mood;
      let finalConfidence = confidence;

      if (isCelebrationMoment && Math.random() > 0.4) {
        finalMood = 'celebrating';
        finalConfidence = 0.9;
      } else if (isLearningMoment) {
        finalMood = 'learning';
        finalConfidence = 0.85;
      }

      // Don't change mood too frequently
      const timeSinceLastChange = now - lastMoodChangeRef.current;
      if (timeSinceLastChange < 2000 && previousMoodRef.current === finalMood) {
        return;
      }

      // Update mood
      const moodData = MOOD_DATABASE[finalMood];
      const newMood: MaraMood = {
        type: finalMood,
        emoji: moodData.emoji,
        message: moodData.messages[Math.floor(Math.random() * moodData.messages.length)],
        color: moodData.color,
        energy: moodData.energy,
        confidence: finalConfidence,
      };

      setCurrentMood(newMood);
      previousMoodRef.current = finalMood;
      lastMoodChangeRef.current = now;

      // Update history
      setMoodHistory((prev) => [finalMood, ...prev.slice(0, 19)]);

      // Show temporary mood message
      setShowMoodMessage(true);
      const messageTimer = setTimeout(() => setShowMoodMessage(false), 3000);
      return () => clearTimeout(messageTimer);
    },
    []
  );

  /**
   * Explicitly set mood (for special events)
   */
  const setMood = useCallback((moodType: MoodType, customMessage?: string) => {
    const moodData = MOOD_DATABASE[moodType];
    const newMood: MaraMood = {
      type: moodType,
      emoji: moodData.emoji,
      message: customMessage || moodData.messages[0],
      color: moodData.color,
      energy: moodData.energy,
      confidence: 0.95,
    };

    setCurrentMood(newMood);
    previousMoodRef.current = moodType;
    lastMoodChangeRef.current = Date.now();
    setShowMoodMessage(true);

    const messageTimer = setTimeout(() => setShowMoodMessage(false), 3000);
    return () => clearTimeout(messageTimer);
  }, []);

  /**
   * Reset mood to neutral
   */
  const resetMood = useCallback(() => {
    const neutral: MaraMood = {
      type: 'neutral',
      emoji: MOOD_DATABASE.neutral.emoji,
      message: MOOD_DATABASE.neutral.messages[0],
      color: MOOD_DATABASE.neutral.color,
      energy: MOOD_DATABASE.neutral.energy,
      confidence: 0.5,
    };
    setCurrentMood(neutral);
    previousMoodRef.current = 'neutral';
    lastMoodChangeRef.current = Date.now();
    setShowMoodMessage(false);
  }, []);

  /**
   * Get mood statistics
   */
  const getMoodStats = useCallback(() => {
    const moodCounts = moodHistory.reduce(
      (acc, mood) => {
        acc[mood] = (acc[mood] || 0) + 1;
        return acc;
      },
      {} as Record<MoodType, number>
    );

    const dominantMood = Object.entries(moodCounts).sort(
      ([, a], [, b]) => b - a
    )[0]?.[0] || 'neutral';

    return {
      currentMood: currentMood.type,
      dominantMood,
      moodCounts,
      totalInteractions: interactionCountRef.current,
      moodHistory: moodHistory.slice(0, 10),
    };
  }, [currentMood.type, moodHistory]);

  return {
    currentMood,
    showMoodMessage,
    recordInteraction,
    setMood,
    resetMood,
    getMoodStats,
  };
};

/**
 * Hook for tracking specific module interactions
 */
export const useMaraMoodForModule = (moduleName: string) => {
  const { recordInteraction, ...rest } = useMaraMood();

  const recordModuleInteraction = useCallback(
    (type: UserInteraction['type'], intensity: number = 0.5) => {
      recordInteraction({ type, intensity, duration: 0 }, moduleName);
    },
    [moduleName, recordInteraction]
  );

  return {
    recordModuleInteraction,
    ...rest,
  };
};
