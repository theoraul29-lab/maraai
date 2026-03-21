import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export * from './models/auth';
export * from './models/chat';

// === VIDEOS ===
export const videos = pgTable('videos', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  creatorId: varchar('creator_id'),
  likes: integer('likes').default(0).notNull(),
  views: integer('views').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === LIKES ===
export const likes = pgTable('likes', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === FOLLOWERS ===
export const followers = pgTable('followers', {
  id: serial('id').primaryKey(),
  followerId: varchar('follower_id').notNull(),
  followingId: varchar('following_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === SAVED VIDEOS (bookmarks) ===
export const savedVideos = pgTable('saved_videos', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === CHAT MESSAGES (legacy simple chat) ===
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  sender: text('sender').notNull(),
  userId: varchar('user_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === USER PREFERENCES (AI learning) ===
export const userPreferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  preferences: jsonb('preferences').default({}).notNull(),
  personality: text('personality').default('friendly'),
  language: text('language').default('en'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// === PREMIUM ORDERS (bank transfer) ===
export const premiumOrders = pgTable('premium_orders', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  amount: text('amount').notNull(),
  currency: text('currency').default('EUR').notNull(),
  status: text('status').default('pending').notNull(),
  orderType: text('order_type').default('creator').notNull(),
  subscriptionPeriod: text('subscription_period').default('once'),
  transferReference: text('transfer_reference'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at'),
  expiresAt: timestamp('expires_at'),
});

// === CREATOR POSTS (monthly tracking) ===
export const creatorPosts = pgTable('creator_posts', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === WRITER PAGES ===
export const writerPages = pgTable('writer_pages', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  penName: text('pen_name').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  coverImage: text('cover_image'),
  category: text('category').default('story').notNull(),
  published: boolean('published').default(false).notNull(),
  likes: integer('likes').default(0).notNull(),
  views: integer('views').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// === USER FEEDBACK ===
export const userFeedback = pgTable('user_feedback', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  message: text('message').notNull(),
  category: text('category').default('general').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === AI IMPROVEMENTS ===
export const aiImprovements = pgTable('ai_improvements', {
  id: serial('id').primaryKey(),
  type: text('type').default('product-improvement').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  source: text('source').default('mara-ai-engine').notNull(),
  status: text('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === NOTIFICATIONS ===
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  type: text('type').default('system').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  relatedId: integer('related_id'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === COMMENTS ===
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  videoId: integer('video_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === COLLECTIONS ===
export const collections = pgTable('collections', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === COLLECTION VIDEOS ===
export const collectionVideos = pgTable('collection_videos', {
  id: serial('id').primaryKey(),
  collectionId: integer('collection_id').notNull(),
  videoId: integer('video_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === BRAIN LOGS ===
export const brainLogs = pgTable('brain_logs', {
  id: serial('id').primaryKey(),
  research: jsonb('research').default({}).notNull(),
  productIdeas: text('product_ideas').notNull(),
  devTasks: text('dev_tasks').notNull(),
  growthIdeas: text('growth_ideas').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
