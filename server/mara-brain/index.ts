// Mara Brain v2 — Module Entry Point
// Re-exports everything for clean imports

export { runBrainCycle, runInitialLearning } from './core.js';
export { buildUserContext, buildSystemInstruction, recordLearningFromChat } from './memory.js';
export { storeKnowledge, searchKnowledge, getKnowledgeContext, getKnowledgeStats, learnFromText, type ExtractedIdea } from './knowledge-base.js';
export {
  buildPersonalityPrompt,
  detectEmotion,
  detectToxicity,
  getToxicityLevel,
  buildAdminNotebookEntry,
  MARA_PERSONALITY,
  type ToxicityState,
  type EmotionalProfile,
  type PersonalityConfig,
} from './personality.js';
export { learnFromGemini, deepenConcept, validateIdeas, selfImproveQuery } from './agents/gemini-learner.js';
export { researchTopic, researchModuleTrends, researchGap, generateResearchAgenda } from './agents/web-research.js';
export { analyzePlatform, collectPlatformMetrics, generateGrowthSuggestions, identifyWeakModules } from './agents/platform-analyzer.js';
export { processDocument, processDocumentBatch, type DocumentReadResult } from './agents/document-reader.js';
export { readNextLibraryBook, getNextUnreadBook, getLibraryProgress, addAndReadCustomBook, getBuiltInLibrary, type LibraryBook } from './library.js';
