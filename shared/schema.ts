import { sql } from 'drizzle-orm';
import {
  sqliteTable as pgTable,
  text,
  integer,
  primaryKey,
  unique,
  blob,
} from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export * from './models/auth.ts';
export * from './models/billing.ts';
export * from './models/chat.ts';

// === VIDEOS ===
export const videos = pgTable('videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  creatorId: text('creator_id'),
  likes: integer('likes').default(0).notNull(),
  views: integer('views').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === LIKES ===
export const likes = pgTable('likes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === FOLLOWERS ===
export const followers = pgTable('followers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  followerId: text('follower_id').notNull(),
  followingId: text('following_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === SAVED VIDEOS (bookmarks) ===
export const savedVideos = pgTable('saved_videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === CHAT MESSAGES (legacy simple chat) ===
export const chatMessages = pgTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  content: text('content').notNull(),
  sender: text('sender').notNull(),
  userId: text('user_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === USER PREFERENCES (AI learning) ===
export const userPreferences = pgTable('user_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  preferences: text('preferences').default('{}').notNull(),
  personality: text('personality').default('friendly'),
  language: text('language').default('en'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === PREMIUM ORDERS (bank transfer) ===
export const premiumOrders = pgTable('premium_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  amount: text('amount').notNull(),
  currency: text('currency').default('EUR').notNull(),
  status: text('status').default('pending').notNull(),
  orderType: text('order_type').default('creator').notNull(),
  subscriptionPeriod: text('subscription_period').default('once'),
  transferReference: text('transfer_reference'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
});

// === CREATOR POSTS (monthly tracking) ===
export const creatorPosts = pgTable('creator_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === WRITER PAGES ===
export const writerPages = pgTable('writer_pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  penName: text('pen_name').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  coverImage: text('cover_image'),
  category: text('category').default('story').notNull(),
  published: integer('published').default(0).notNull(),
  likes: integer('likes').default(0).notNull(),
  views: integer('views').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === USER FEEDBACK ===
export const userFeedback = pgTable('user_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  message: text('message').notNull(),
  category: text('category').default('general').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === AI IMPROVEMENTS ===
export const aiImprovements = pgTable('ai_improvements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').default('product-improvement').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  source: text('source').default('mara-ai-engine').notNull(),
  status: text('status').default('pending').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === NOTIFICATIONS ===
export const notifications = pgTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  type: text('type').default('system').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  relatedId: integer('related_id'),
  read: integer('read').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === COMMENTS ===
export const comments = pgTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === COLLECTIONS ===
export const collections = pgTable('collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === COLLECTION VIDEOS ===
export const collectionVideos = pgTable('collection_videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  collectionId: integer('collection_id').notNull(),
  videoId: integer('video_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === BRAIN LOGS ===
export const brainLogs = pgTable('brain_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  research: text('research').default('{}').notNull(),
  productIdeas: text('product_ideas').notNull(),
  devTasks: text('dev_tasks').notNull(),
  growthIdeas: text('growth_ideas').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === MARA KNOWLEDGE BASE ===
export const maraKnowledgeBase = pgTable('mara_knowledge_base', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(), // user_pattern | platform_insight | business_insight | gemini_learning | web_research | book_knowledge
  topic: text('topic').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(), // gemini | web | user_interaction | self_reflection | document
  confidence: integer('confidence').default(70).notNull(), // 0-100
  metadata: text('metadata').default('{}').notNull(), // JSON extra data
  accessCount: integer('access_count').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === MARA SEARCH HISTORY ===
export const maraSearchHistory = pgTable('mara_search_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  query: text('query').notNull(),
  source: text('source').notNull(), // google | gemini | document
  resultSummary: text('result_summary').notNull(),
  knowledgeExtracted: text('knowledge_extracted').default('[]').notNull(), // JSON array of knowledge IDs
  triggeredBy: text('triggered_by').notNull(), // brain_cycle | user_question | gap_detection | trend_monitoring
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === MARA LEARNING QUEUE ===
export const maraLearningQueue = pgTable('mara_learning_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topic: text('topic').notNull(),
  reason: text('reason').notNull(), // why Mara wants to learn this
  priority: text('priority').default('medium').notNull(), // low | medium | high | critical
  status: text('status').default('pending').notNull(), // pending | in_progress | completed | failed
  source: text('source').default('auto').notNull(), // auto | user_gap | brain_cycle | trend
  result: text('result'), // what was learned
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// === MARA SELF REFLECTION ===
export const maraSelfReflection = pgTable('mara_self_reflection', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // daily_journal | insight | concern | idea | growth_note
  content: text('content').notNull(),
  mood: text('mood').default('curious').notNull(),
  topicsLearned: text('topics_learned').default('[]').notNull(), // JSON array
  topicsToResearch: text('topics_to_research').default('[]').notNull(), // JSON array
  platformScore: integer('platform_score'), // 0-100 how well the platform is doing
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === MARA PLATFORM INSIGHTS ===
export const maraPlatformInsights = pgTable('mara_platform_insights', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  module: text('module').notNull(), // trading | writers | creator | reels | chat | vip | general
  insightType: text('insight_type').notNull(), // improvement | bug | feature_request | performance | ux
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').default('P2').notNull(), // P0 | P1 | P2 | P3
  estimatedImpact: text('estimated_impact').default('medium').notNull(), // low | medium | high | critical
  source: text('source').notNull(), // user_feedback | gemini_analysis | web_research | self_analysis
  status: text('status').default('proposed').notNull(), // proposed | approved | in_progress | completed | rejected
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// === SCHEMAS ===
export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
  likes: true,
  views: true,
});
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});
export const insertPremiumOrderSchema = createInsertSchema(premiumOrders).omit({
  id: true,
  createdAt: true,
  confirmedAt: true,
  status: true,
});
export const insertCreatorPostSchema = createInsertSchema(creatorPosts).omit({
  id: true,
  createdAt: true,
});
export const insertWriterPageSchema = createInsertSchema(writerPages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  likes: true,
  views: true,
  published: true,
});
export const insertFeedbackSchema = createInsertSchema(userFeedback).omit({
  id: true,
  createdAt: true,
});
export const insertImprovementSchema = createInsertSchema(aiImprovements).omit({
  id: true,
  createdAt: true,
  status: true,
});
export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  read: true,
});
export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});
export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  createdAt: true,
});
export const insertBrainLogSchema = createInsertSchema(brainLogs).omit({
  id: true,
  createdAt: true,
});
export const insertKnowledgeBaseSchema = createInsertSchema(maraKnowledgeBase).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  accessCount: true,
});
export const insertSearchHistorySchema = createInsertSchema(maraSearchHistory).omit({
  id: true,
  createdAt: true,
});
export const insertLearningQueueSchema = createInsertSchema(maraLearningQueue).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export const insertSelfReflectionSchema = createInsertSchema(maraSelfReflection).omit({
  id: true,
  createdAt: true,
});
export const insertPlatformInsightSchema = createInsertSchema(maraPlatformInsights).omit({
  id: true,
  createdAt: true,
});

export const creatorPostRequestSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional().default(''),
  type: z
    .enum([
      'creator',
      'trending',
      'nature',
      'action',
      'creative',
      'tech',
      'fun',
      'cinematic',
    ])
    .default('creator'),
});

// === TYPES ===
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type Like = typeof likes.$inferSelect;
export type Follower = typeof followers.$inferSelect;
export type UserPreference = typeof userPreferences.$inferSelect;
export type PremiumOrder = typeof premiumOrders.$inferSelect;
export type InsertPremiumOrder = z.infer<typeof insertPremiumOrderSchema>;
export type WriterPage = typeof writerPages.$inferSelect;
export type InsertWriterPage = z.infer<typeof insertWriterPageSchema>;
export type SavedVideo = typeof savedVideos.$inferSelect;
export type Feedback = typeof userFeedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Improvement = typeof aiImprovements.$inferSelect;
export type InsertImprovement = z.infer<typeof insertImprovementSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type CollectionVideo = typeof collectionVideos.$inferSelect;
export type BrainLog = typeof brainLogs.$inferSelect;
export type InsertBrainLog = z.infer<typeof insertBrainLogSchema>;
export type KnowledgeEntry = typeof maraKnowledgeBase.$inferSelect;
export type InsertKnowledgeEntry = z.infer<typeof insertKnowledgeBaseSchema>;
export type SearchHistoryEntry = typeof maraSearchHistory.$inferSelect;
export type InsertSearchHistoryEntry = z.infer<typeof insertSearchHistorySchema>;
export type LearningQueueEntry = typeof maraLearningQueue.$inferSelect;
export type InsertLearningQueueEntry = z.infer<typeof insertLearningQueueSchema>;
export type SelfReflection = typeof maraSelfReflection.$inferSelect;
export type InsertSelfReflection = z.infer<typeof insertSelfReflectionSchema>;
export type PlatformInsight = typeof maraPlatformInsights.$inferSelect;
export type InsertPlatformInsight = z.infer<typeof insertPlatformInsightSchema>;
