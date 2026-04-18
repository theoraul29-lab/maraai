import { db } from "./db";
import {
  videos,
  videoComments,
  chatMessages,
  likes,
  followers,
  userPreferences,
  premiumOrders,
  creatorPosts,
  writerPages,
  writerComments,
  writerPurchases,
  savedVideos,
  userFeedback,
  aiImprovements,
  notifications,
  comments,
  collections,
  collectionVideos,
  brainLogs,
  maraKnowledgeBase,
  maraSearchHistory,
  maraLearningQueue,
  maraSelfReflection,
  maraPlatformInsights,
  users,
  type Video,
  type InsertVideo,
  type VideoComment,
  type InsertVideoComment,
  type ChatMessage,
  type InsertChatMessage,
  type PremiumOrder,
  type InsertPremiumOrder,
  type WriterPage,
  type InsertWriterPage,
  type WriterComment,
  type InsertWriterComment,
  type WriterPurchase,
  type InsertWriterPurchase,
  type SavedVideo,
  type Feedback,
  type InsertFeedback,
  type Improvement,
  type InsertImprovement,
  type Notification,
  type InsertNotification,
  type Comment,
  type InsertComment,
  type Collection,
  type InsertCollection,
  type CollectionVideo,
  type BrainLog,
  type InsertBrainLog,
  type KnowledgeEntry,
  type InsertKnowledgeEntry,
  type SearchHistoryEntry,
  type InsertSearchHistoryEntry,
  type LearningQueueEntry,
  type InsertLearningQueueEntry,
  type SelfReflection,
  type InsertSelfReflection,
  type PlatformInsight,
  type InsertPlatformInsight,
  tradingModules,
  tradingLessons,
  tradingLessonProgress,
  tradingCertificates,
  type TradingModule,
  type InsertTradingModule,
  type TradingLesson,
  type InsertTradingLesson,
  type TradingLessonProgress,
  type TradingCertificate,
} from "../shared/schema";
import { eq, desc, and, sql, lt, gte, like, or, count, inArray } from "drizzle-orm";
import type { User } from "../shared/models/auth";

export interface IStorage {
  getVideos(topic?: string): Promise<Video[]>;
  createVideo(video: InsertVideo): Promise<Video>;
  likeVideo(
    userId: string,
    videoId: number,
  ): Promise<{ liked: boolean; likes: number }>;
  viewVideo(videoId: number): Promise<{ views: number }>;
  shareVideo(videoId: number): Promise<{ shares: number }>;
  deleteVideo(videoId: number): Promise<void>;
  getVideoById(videoId: number): Promise<Video | null>;
  getReelsFeed(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Video[]>;

  createVideoComment(
    comment: InsertVideoComment,
  ): Promise<VideoComment>;
  listVideoComments(
    videoId: number,
    limit?: number,
  ): Promise<VideoComment[]>;
  deleteVideoComment(
    commentId: number,
    userId: string,
    isAdmin: boolean,
  ): Promise<boolean>;
  countVideoComments(videoId: number): Promise<number>;

  getChatMessages(userId?: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  followUser(
    followerId: string,
    followingId: string,
  ): Promise<{ following: boolean }>;
  getFollowerCount(userId: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;

  getUserPreferences(
    userId: string,
  ): Promise<{ personality?: string; language?: string } | null>;
  updateUserPreferences(
    userId: string,
    prefs: Record<string, unknown>,
  ): Promise<void>;

  getAllUsers(): Promise<User[]>;
  getTotalMessageCount(): Promise<number>;
  getTotalLikeCount(): Promise<number>;
  clearOldMessages(hoursOld: number): Promise<void>;
  updateUserLanguage(userId: string, language: string): Promise<void>;

  createPremiumOrder(order: InsertPremiumOrder): Promise<PremiumOrder>;
  getPremiumOrders(userId?: string): Promise<PremiumOrder[]>;
  getUserPremiumStatus(userId: string): Promise<boolean>;
  confirmPremiumOrder(orderId: number): Promise<PremiumOrder>;
  rejectPremiumOrder(orderId: number): Promise<PremiumOrder>;

  getMonthlyPostCount(userId: string): Promise<number>;
  recordCreatorPost(userId: string, videoId: number): Promise<void>;
  canUserPost(userId: string): Promise<{
    canPost: boolean;
    used: number;
    limit: number;
    isPremium: boolean;
  }>;
  getCreatorVideos(userId: string): Promise<Video[]>;
  deleteCreatorVideo(videoId: number, userId: string): Promise<boolean>;
  getUserTradingAccess(
    userId: string,
  ): Promise<{ hasAccess: boolean; expiresAt: Date | null }>;

  createWriterPage(page: InsertWriterPage): Promise<WriterPage>;
  getWriterPages(userId?: string): Promise<WriterPage[]>;
  getPublishedWriterPages(): Promise<WriterPage[]>;
  getWriterLibrary(options?: {
    limit?: number;
    offset?: number;
    visibility?: 'public' | 'vip' | 'paid' | 'all';
    category?: string;
    authorId?: string;
    search?: string;
  }): Promise<WriterPage[]>;
  getWriterPageById(id: number): Promise<WriterPage | null>;
  getWriterPageBySlug(slug: string): Promise<WriterPage | null>;
  updateWriterPage(
    id: number,
    userId: string,
    data: Partial<InsertWriterPage & { published: boolean }>,
    options?: { isAdmin?: boolean },
  ): Promise<WriterPage | null>;
  deleteWriterPage(
    id: number,
    userId: string,
    options?: { isAdmin?: boolean },
  ): Promise<boolean>;
  likeWriterPage(pageId: number): Promise<{ likes: number }>;
  viewWriterPage(pageId: number): Promise<{ views: number }>;

  // Writer comments (PR E)
  createWriterComment(comment: InsertWriterComment): Promise<WriterComment>;
  listWriterComments(pageId: number, limit?: number): Promise<WriterComment[]>;
  deleteWriterComment(
    commentId: number,
    userId: string,
    isAdmin: boolean,
  ): Promise<boolean>;

  // Writer paid-article purchases (PR E)
  createWriterPurchase(purchase: InsertWriterPurchase): Promise<WriterPurchase>;
  hasPurchasedWriterPage(userId: string, pageId: number): Promise<boolean>;
  getWriterPurchasesByUser(userId: string): Promise<WriterPurchase[]>;
  getWriterPurchasesForPage(pageId: number): Promise<WriterPurchase[]>;

  saveVideo(
    userId: string,
    videoId: number,
    note?: string,
  ): Promise<{ saved: boolean }>;
  unsaveVideo(userId: string, videoId: number): Promise<{ saved: boolean }>;
  getSavedVideos(userId: string): Promise<SavedVideo[]>;
  isVideoSaved(userId: string, videoId: number): Promise<boolean>;

  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  getRecentFeedback(limit?: number): Promise<Feedback[]>;
  getFeedbackCount(): Promise<number>;

  createImprovement(improvement: InsertImprovement): Promise<Improvement>;
  getImprovements(): Promise<Improvement[]>;
  updateImprovementStatus(
    id: number,
    status: string,
  ): Promise<Improvement | null>;

  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  createComment(comment: InsertComment): Promise<Comment>;
  getComments(videoId: number): Promise<Comment[]>;
  getCommentCount(videoId: number): Promise<number>;

  createCollection(collection: InsertCollection): Promise<Collection>;
  getCollections(userId: string): Promise<Collection[]>;
  deleteCollection(id: number, userId: string): Promise<boolean>;
  addVideoToCollection(
    collectionId: number,
    videoId: number,
  ): Promise<CollectionVideo>;
  removeVideoFromCollection(
    collectionId: number,
    videoId: number,
  ): Promise<void>;
  getCollectionVideos(collectionId: number): Promise<Video[]>;
  getCollectionVideoCount(collectionId: number): Promise<number>;

  createBrainLog(log: InsertBrainLog): Promise<BrainLog>;
  getBrainLogs(limit?: number): Promise<BrainLog[]>;

  searchAll(
    query: string,
  ): Promise<{ videos: Video[]; users: User[]; pages: any[] }>;
  updateUserProfile(
    userId: string,
    data: {
      displayName?: string;
      bio?: string;
      profileImageUrl?: string | null;
    },
  ): Promise<User | null>;

  // === Trading Academy (PR F) ===
  listTradingModules(): Promise<TradingModule[]>;
  getTradingModuleBySlug(slug: string): Promise<TradingModule | null>;
  getTradingModuleById(id: number): Promise<TradingModule | null>;
  listTradingLessonsByModule(moduleId: number): Promise<TradingLesson[]>;
  getTradingLessonById(id: number): Promise<TradingLesson | null>;
  upsertTradingModule(mod: InsertTradingModule): Promise<TradingModule>;
  upsertTradingLesson(lesson: InsertTradingLesson): Promise<TradingLesson>;
  recordLessonCompletion(
    userId: string,
    lessonId: number,
    quizScore: number | null,
  ): Promise<TradingLessonProgress>;
  listUserLessonProgress(
    userId: string,
    lessonIds?: number[],
  ): Promise<TradingLessonProgress[]>;
  issueCertificateIfEligible(
    userId: string,
    moduleId: number,
  ): Promise<TradingCertificate | null>;
  listUserCertificates(userId: string): Promise<TradingCertificate[]>;

  // --- Profile / You (PR H) ------------------------------------------------
  getUserById(userId: string): Promise<User | null>;
  listFollowers(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<
    Array<{
      id: string;
      displayName: string | null;
      firstName: string | null;
      profileImageUrl: string | null;
      followedAt: Date | null;
    }>
  >;
  listFollowing(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<
    Array<{
      id: string;
      displayName: string | null;
      firstName: string | null;
      profileImageUrl: string | null;
      followedAt: Date | null;
    }>
  >;
  getProfileActivity(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<
    Array<{
      kind: 'writer_page' | 'reel';
      id: number;
      title: string;
      thumbnailUrl: string | null;
      createdAt: Date;
      views: number;
      likes: number;
    }>
  >;
}

export class DatabaseStorage implements IStorage {
  async getVideos(topic?: string): Promise<Video[]> {
    if (topic && topic !== "") {
      return await db
        .select()
        .from(videos)
        .where(eq(videos.type, topic))
        .orderBy(desc(videos.createdAt));
    }
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  async createVideo(video: InsertVideo): Promise<Video> {
    const [created] = await db.insert(videos).values(video).returning();
    return created;
  }

  async likeVideo(
    userId: string,
    videoId: number,
  ): Promise<{ liked: boolean; likes: number }> {
    const existing = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)));

    if (existing.length > 0) {
      await db
        .delete(likes)
        .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)));
      await db
        .update(videos)
        .set({ likes: sql`${videos.likes} - 1` })
        .where(eq(videos.id, videoId));
      const [video] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, videoId));
      return { liked: false, likes: video.likes };
    } else {
      await db.insert(likes).values({ userId, videoId });
      await db
        .update(videos)
        .set({ likes: sql`${videos.likes} + 1` })
        .where(eq(videos.id, videoId));
      const [video] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, videoId));
      return { liked: true, likes: video.likes };
    }
  }

  async viewVideo(videoId: number): Promise<{ views: number }> {
    await db
      .update(videos)
      .set({ views: sql`${videos.views} + 1` })
      .where(eq(videos.id, videoId));
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));
    return { views: video.views };
  }

  async getChatMessages(userId?: string): Promise<ChatMessage[]> {
    if (userId) {
      return await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, userId))
        .orderBy(desc(chatMessages.createdAt));
    }
    return await db
      .select()
      .from(chatMessages)
      .orderBy(desc(chatMessages.createdAt));
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }

  async followUser(
    followerId: string,
    followingId: string,
  ): Promise<{ following: boolean }> {
    const existing = await db
      .select()
      .from(followers)
      .where(
        and(
          eq(followers.followerId, followerId),
          eq(followers.followingId, followingId),
        ),
      );

    if (existing.length > 0) {
      await db
        .delete(followers)
        .where(
          and(
            eq(followers.followerId, followerId),
            eq(followers.followingId, followingId),
          ),
        );
      return { following: false };
    } else {
      await db.insert(followers).values({ followerId, followingId });
      return { following: true };
    }
  }

  async getFollowerCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followers)
      .where(eq(followers.followingId, userId));
    return Number(result[0]?.count || 0);
  }

  async getFollowingCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followers)
      .where(eq(followers.followerId, userId));
    return Number(result[0]?.count || 0);
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(followers)
      .where(
        and(
          eq(followers.followerId, followerId),
          eq(followers.followingId, followingId),
        ),
      );
    return result.length > 0;
  }

  async getUserPreferences(
    userId: string,
  ): Promise<{ personality?: string; language?: string } | null> {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    if (!prefs) return null;
    return {
      personality: prefs.personality || undefined,
      language: prefs.language || undefined,
    };
  }

  async updateUserPreferences(
    userId: string,
    prefs: Record<string, unknown>,
  ): Promise<void> {
    const serializedPrefs = JSON.stringify(prefs || {});

    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    if (existing.length > 0) {
      await db
        .update(userPreferences)
        .set({ preferences: serializedPrefs, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db
        .insert(userPreferences)
        .values({ userId, preferences: serializedPrefs });
    }
  }

  async deleteVideo(videoId: number): Promise<void> {
    await db.delete(likes).where(eq(likes.videoId, videoId));
    await db.delete(videos).where(eq(videos.id, videoId));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getTotalMessageCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatMessages);
    return Number(result[0]?.count || 0);
  }

  async getTotalLikeCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(likes);
    return Number(result[0]?.count || 0);
  }

  async clearOldMessages(hoursOld: number): Promise<void> {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    await db.delete(chatMessages).where(lt(chatMessages.createdAt, cutoff));
  }

  async createPremiumOrder(order: InsertPremiumOrder): Promise<PremiumOrder> {
    const [created] = await db.insert(premiumOrders).values(order).returning();
    return created;
  }

  async getPremiumOrders(userId?: string): Promise<PremiumOrder[]> {
    if (userId) {
      return await db
        .select()
        .from(premiumOrders)
        .where(eq(premiumOrders.userId, userId))
        .orderBy(desc(premiumOrders.createdAt));
    }
    return await db
      .select()
      .from(premiumOrders)
      .orderBy(desc(premiumOrders.createdAt));
  }

  async getUserPremiumStatus(userId: string): Promise<boolean> {
    const orders = await db
      .select()
      .from(premiumOrders)
      .where(
        and(
          eq(premiumOrders.userId, userId),
          eq(premiumOrders.status, "confirmed"),
        ),
      );
    return orders.length > 0;
  }

  async confirmPremiumOrder(orderId: number): Promise<PremiumOrder> {
    const [order] = await db
      .select()
      .from(premiumOrders)
      .where(eq(premiumOrders.id, orderId));
    const now = new Date();
    const updates: any = { status: "confirmed", confirmedAt: now };

    if (order && order.orderType === "trading") {
      const currentAccess = await this.getUserTradingAccess(order.userId);
      const baseDate =
        currentAccess.hasAccess &&
        currentAccess.expiresAt &&
        new Date(currentAccess.expiresAt) > now
          ? new Date(currentAccess.expiresAt)
          : now;
      const expiresAt = new Date(baseDate);
      if (order.subscriptionPeriod === "yearly") {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }
      updates.expiresAt = expiresAt;
    }

    const [updated] = await db
      .update(premiumOrders)
      .set(updates)
      .where(eq(premiumOrders.id, orderId))
      .returning();
    return updated;
  }

  async rejectPremiumOrder(orderId: number): Promise<PremiumOrder> {
    const [updated] = await db
      .update(premiumOrders)
      .set({ status: "rejected" })
      .where(eq(premiumOrders.id, orderId))
      .returning();
    return updated;
  }

  async updateUserLanguage(userId: string, language: string): Promise<void> {
    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    if (existing.length > 0) {
      await db
        .update(userPreferences)
        .set({ language, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({ userId, language });
    }
  }

  async getMonthlyPostCount(userId: string): Promise<number> {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(creatorPosts)
      .where(
        and(
          eq(creatorPosts.userId, userId),
          gte(creatorPosts.createdAt, firstOfMonth),
        ),
      );
    return Number(result[0]?.count || 0);
  }

  async recordCreatorPost(userId: string, videoId: number): Promise<void> {
    await db.insert(creatorPosts).values({ userId, videoId });
  }

  async canUserPost(userId: string): Promise<{
    canPost: boolean;
    used: number;
    limit: number;
    isPremium: boolean;
  }> {
    const isPremium = await this.getUserPremiumStatus(userId);
    const used = await this.getMonthlyPostCount(userId);
    return {
      canPost: true,
      used,
      limit: -1,
      isPremium,
    };
  }

  async getCreatorVideos(userId: string): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.creatorId, userId))
      .orderBy(desc(videos.createdAt));
  }

  async deleteCreatorVideo(videoId: number, userId: string): Promise<boolean> {
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.creatorId, userId)));
    if (!video) return false;
    await db
      .delete(creatorPosts)
      .where(
        and(eq(creatorPosts.videoId, videoId), eq(creatorPosts.userId, userId)),
      );
    await db.delete(likes).where(eq(likes.videoId, videoId));
    await db.delete(videos).where(eq(videos.id, videoId));
    return true;
  }

  async getUserTradingAccess(
    userId: string,
  ): Promise<{ hasAccess: boolean; expiresAt: Date | null }> {
    const now = new Date();
    const orders = await db
      .select()
      .from(premiumOrders)
      .where(
        and(
          eq(premiumOrders.userId, userId),
          eq(premiumOrders.status, "confirmed"),
          eq(premiumOrders.orderType, "trading"),
        ),
      )
      .orderBy(desc(premiumOrders.expiresAt));

    const activeOrder = orders.find(
      (o) => o.expiresAt && new Date(o.expiresAt) > now,
    );
    if (activeOrder) {
      return { hasAccess: true, expiresAt: activeOrder.expiresAt };
    }
    return { hasAccess: false, expiresAt: null };
  }

  async createWriterPage(page: InsertWriterPage): Promise<WriterPage> {
    const [created] = await db.insert(writerPages).values(page).returning();
    return created;
  }

  async getWriterPages(userId?: string): Promise<WriterPage[]> {
    if (userId) {
      return await db
        .select()
        .from(writerPages)
        .where(eq(writerPages.userId, userId))
        .orderBy(desc(writerPages.updatedAt));
    }
    return await db
      .select()
      .from(writerPages)
      .orderBy(desc(writerPages.updatedAt));
  }

  async getPublishedWriterPages(): Promise<WriterPage[]> {
    return await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.published, 1))
      .orderBy(desc(writerPages.createdAt));
  }

  async getWriterPageById(id: number): Promise<WriterPage | null> {
    const [page] = await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.id, id));
    return page || null;
  }

  async getWriterLibrary(options?: {
    limit?: number;
    offset?: number;
    visibility?: 'public' | 'vip' | 'paid' | 'all';
    category?: string;
    authorId?: string;
    search?: string;
  }): Promise<WriterPage[]> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    // Library lists ONLY published articles. Drafts never appear here; the
    // author-facing "my pages" path uses `getWriterPages(userId)` instead.
    const conds = [eq(writerPages.published, 1)];

    if (options?.visibility && options.visibility !== 'all') {
      conds.push(eq(writerPages.visibility, options.visibility));
    }
    if (options?.category) {
      conds.push(eq(writerPages.category, options.category));
    }
    if (options?.authorId) {
      conds.push(eq(writerPages.userId, options.authorId));
    }
    if (options?.search) {
      const needle = `%${options.search.trim().toLowerCase()}%`;
      conds.push(
        or(
          like(sql`lower(${writerPages.title})`, needle),
          like(sql`lower(${writerPages.penName})`, needle),
          like(sql`lower(${writerPages.excerpt})`, needle),
        )!,
      );
    }

    return await db
      .select()
      .from(writerPages)
      .where(and(...conds))
      .orderBy(desc(writerPages.publishedAt), desc(writerPages.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getWriterPageBySlug(slug: string): Promise<WriterPage | null> {
    const [page] = await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.slug, slug));
    return page || null;
  }

  async updateWriterPage(
    id: number,
    userId: string,
    data: Partial<InsertWriterPage & { published: boolean }>,
    options?: { isAdmin?: boolean },
  ): Promise<WriterPage | null> {
    // Authors can only touch their own pages. Admins (resolved upstream by
    // the route handler against `ADMIN_USER_IDS`) can patch anything.
    const ownershipCond = options?.isAdmin
      ? eq(writerPages.id, id)
      : and(eq(writerPages.id, id), eq(writerPages.userId, userId));
    const [existing] = await db
      .select()
      .from(writerPages)
      .where(ownershipCond);
    if (!existing) return null;
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    if (typeof data.published === "boolean") {
      updateData.published = data.published ? 1 : 0;
      // Stamp `publishedAt` exactly once, on the transition to published.
      if (data.published && !existing.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }

    const [updated] = await db
      .update(writerPages)
      .set(updateData)
      .where(eq(writerPages.id, id))
      .returning();
    return updated;
  }

  async deleteWriterPage(
    id: number,
    userId: string,
    options?: { isAdmin?: boolean },
  ): Promise<boolean> {
    const ownershipCond = options?.isAdmin
      ? eq(writerPages.id, id)
      : and(eq(writerPages.id, id), eq(writerPages.userId, userId));
    const [existing] = await db
      .select()
      .from(writerPages)
      .where(ownershipCond);
    if (!existing) return false;
    // Cascade: delete children first so a partial failure (DB error between
    // statements) doesn't strand orphan purchase rows (which carry userId —
    // PII) after the parent page is already gone. Order matters for GDPR.
    await db.delete(writerComments).where(eq(writerComments.pageId, id));
    await db.delete(writerPurchases).where(eq(writerPurchases.pageId, id));
    await db.delete(writerPages).where(eq(writerPages.id, id));
    return true;
  }

  async likeWriterPage(pageId: number): Promise<{ likes: number }> {
    await db
      .update(writerPages)
      .set({ likes: sql`${writerPages.likes} + 1` })
      .where(eq(writerPages.id, pageId));
    const [page] = await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.id, pageId));
    return { likes: page?.likes ?? 0 };
  }

  async viewWriterPage(pageId: number): Promise<{ views: number }> {
    await db
      .update(writerPages)
      .set({ views: sql`${writerPages.views} + 1` })
      .where(eq(writerPages.id, pageId));
    const [page] = await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.id, pageId));
    return { views: page?.views ?? 0 };
  }

  // --- Writer comments (PR E) -----------------------------------------------

  async createWriterComment(
    comment: InsertWriterComment,
  ): Promise<WriterComment> {
    const [created] = await db
      .insert(writerComments)
      .values(comment)
      .returning();
    return created;
  }

  async listWriterComments(
    pageId: number,
    limit = 100,
  ): Promise<WriterComment[]> {
    const capped = Math.min(Math.max(limit, 1), 500);
    return await db
      .select()
      .from(writerComments)
      .where(eq(writerComments.pageId, pageId))
      .orderBy(desc(writerComments.createdAt))
      .limit(capped);
  }

  async deleteWriterComment(
    commentId: number,
    userId: string,
    isAdmin: boolean,
  ): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(writerComments)
      .where(eq(writerComments.id, commentId));
    if (!existing) return false;
    if (!isAdmin && existing.userId !== userId) return false;
    await db.delete(writerComments).where(eq(writerComments.id, commentId));
    return true;
  }

  // --- Writer purchases (PR E, 70/30 revenue share) -------------------------

  async createWriterPurchase(
    purchase: InsertWriterPurchase,
  ): Promise<WriterPurchase> {
    const [created] = await db
      .insert(writerPurchases)
      .values(purchase)
      .returning();
    return created;
  }

  async hasPurchasedWriterPage(
    userId: string,
    pageId: number,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: writerPurchases.id })
      .from(writerPurchases)
      .where(
        and(
          eq(writerPurchases.userId, userId),
          eq(writerPurchases.pageId, pageId),
        ),
      )
      .limit(1);
    return !!row;
  }

  async getWriterPurchasesByUser(userId: string): Promise<WriterPurchase[]> {
    return await db
      .select()
      .from(writerPurchases)
      .where(eq(writerPurchases.userId, userId))
      .orderBy(desc(writerPurchases.createdAt));
  }

  async getWriterPurchasesForPage(
    pageId: number,
  ): Promise<WriterPurchase[]> {
    return await db
      .select()
      .from(writerPurchases)
      .where(eq(writerPurchases.pageId, pageId))
      .orderBy(desc(writerPurchases.createdAt));
  }

  async saveVideo(
    userId: string,
    videoId: number,
    note?: string,
  ): Promise<{ saved: boolean }> {
    const existing = await db
      .select()
      .from(savedVideos)
      .where(
        and(eq(savedVideos.userId, userId), eq(savedVideos.videoId, videoId)),
      );
    if (existing.length > 0) {
      return { saved: true };
    }
    await db
      .insert(savedVideos)
      .values({ userId, videoId, note: note || null });
    return { saved: true };
  }

  async unsaveVideo(
    userId: string,
    videoId: number,
  ): Promise<{ saved: boolean }> {
    await db
      .delete(savedVideos)
      .where(
        and(eq(savedVideos.userId, userId), eq(savedVideos.videoId, videoId)),
      );
    return { saved: false };
  }

  async getSavedVideos(userId: string): Promise<SavedVideo[]> {
    return await db
      .select()
      .from(savedVideos)
      .where(eq(savedVideos.userId, userId))
      .orderBy(desc(savedVideos.createdAt));
  }

  async isVideoSaved(userId: string, videoId: number): Promise<boolean> {
    const existing = await db
      .select()
      .from(savedVideos)
      .where(
        and(eq(savedVideos.userId, userId), eq(savedVideos.videoId, videoId)),
      );
    return existing.length > 0;
  }

  async createFeedback(feedback: InsertFeedback): Promise<Feedback> {
    const [created] = await db
      .insert(userFeedback)
      .values(feedback)
      .returning();
    return created;
  }

  async getRecentFeedback(limit = 100): Promise<Feedback[]> {
    return await db
      .select()
      .from(userFeedback)
      .orderBy(desc(userFeedback.createdAt))
      .limit(limit);
  }

  async getFeedbackCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userFeedback);
    return Number(result[0].count);
  }

  async createImprovement(
    improvement: InsertImprovement,
  ): Promise<Improvement> {
    const [created] = await db
      .insert(aiImprovements)
      .values(improvement)
      .returning();
    return created;
  }

  async getImprovements(): Promise<Improvement[]> {
    return await db
      .select()
      .from(aiImprovements)
      .orderBy(desc(aiImprovements.createdAt));
  }

  async updateImprovementStatus(
    id: number,
    status: string,
  ): Promise<Improvement | null> {
    const [updated] = await db
      .update(aiImprovements)
      .set({ status })
      .where(eq(aiImprovements.id, id))
      .returning();
    return updated || null;
  }

  async createNotification(
    notification: InsertNotification,
  ): Promise<Notification> {
    const [created] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return created;
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async markNotificationRead(id: number, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false)),
      );
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false)),
      );
    return Number(result[0].count);
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [created] = await db.insert(comments).values(comment).returning();
    return created;
  }

  async getComments(videoId: number): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.videoId, videoId))
      .orderBy(desc(comments.createdAt));
  }

  async getCommentCount(videoId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.videoId, videoId));
    return Number(result[0].count);
  }

  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [created] = await db
      .insert(collections)
      .values(collection)
      .returning();
    return created;
  }

  async getCollections(userId: string): Promise<Collection[]> {
    return await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.createdAt));
  }

  async deleteCollection(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)));
    if (result.rowCount && result.rowCount > 0) {
      await db
        .delete(collectionVideos)
        .where(eq(collectionVideos.collectionId, id));
      return true;
    }
    return false;
  }

  async addVideoToCollection(
    collectionId: number,
    videoId: number,
  ): Promise<CollectionVideo> {
    const existing = await db
      .select()
      .from(collectionVideos)
      .where(
        and(
          eq(collectionVideos.collectionId, collectionId),
          eq(collectionVideos.videoId, videoId),
        ),
      );
    if (existing.length > 0) return existing[0];
    const [created] = await db
      .insert(collectionVideos)
      .values({ collectionId, videoId })
      .returning();
    return created;
  }

  async removeVideoFromCollection(
    collectionId: number,
    videoId: number,
  ): Promise<void> {
    await db
      .delete(collectionVideos)
      .where(
        and(
          eq(collectionVideos.collectionId, collectionId),
          eq(collectionVideos.videoId, videoId),
        ),
      );
  }

  async getCollectionVideos(collectionId: number): Promise<Video[]> {
    const cvs = await db
      .select()
      .from(collectionVideos)
      .where(eq(collectionVideos.collectionId, collectionId));
    if (cvs.length === 0) return [];
    const videoIds = cvs.map((cv) => cv.videoId);
    const result = await db
      .select()
      .from(videos)
      .where(inArray(videos.id, videoIds))
      .orderBy(desc(videos.createdAt));
    return result;
  }

  async getCollectionVideoCount(collectionId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(collectionVideos)
      .where(eq(collectionVideos.collectionId, collectionId));
    return Number(result[0].count);
  }

  async createBrainLog(log: InsertBrainLog): Promise<BrainLog> {
    const [created] = await db.insert(brainLogs).values(log).returning();
    return created;
  }

  async getBrainLogs(limit = 20): Promise<BrainLog[]> {
    return await db
      .select()
      .from(brainLogs)
      .orderBy(desc(brainLogs.createdAt))
      .limit(limit);
  }

  async searchAll(
    query: string,
  ): Promise<{ videos: Video[]; users: User[]; pages: any[] }> {
    const { hasCyrillic, transliterate, detectCyrillicLang } =
      await import("./cyrillic");
    const pattern = `%${query}%`;
    const patterns = [pattern];
    if (hasCyrillic(query)) {
      const lang = detectCyrillicLang(query);
      const latinized = transliterate(query, lang);
      patterns.push(`%${latinized}%`);
    }
    const videoConditions = patterns.flatMap((p) => [
      like(videos.title, p),
      like(videos.description, p),
    ]);
    const foundVideos = await db
      .select()
      .from(videos)
      .where(or(...videoConditions))
      .orderBy(desc(videos.views))
      .limit(10);
    const userConditions = patterns.flatMap((p) => [
      like(users.firstName, p),
      like(users.lastName, p),
      like(users.email, p),
      like(users.displayName, p),
    ]);
    const foundUsers = await db
      .select()
      .from(users)
      .where(or(...userConditions))
      .limit(10);
    const pageConditions = patterns.flatMap((p) => [
      like(writerPages.title, p),
      like(writerPages.penName, p),
    ]);
    const foundPages = await db
      .select()
      .from(writerPages)
      .where(and(eq(writerPages.published, true), or(...pageConditions)))
      .orderBy(desc(writerPages.views))
      .limit(10);
    return { videos: foundVideos, users: foundUsers, pages: foundPages };
  }

  async updateUserProfile(
    userId: string,
    data: {
      displayName?: string;
      bio?: string;
      profileImageUrl?: string | null;
    },
  ): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated || null;
  }

  // --- Profile / You (PR H) ------------------------------------------------

  async getUserById(userId: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    return row ?? null;
  }

  async listFollowers(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const offset = Math.max(opts?.offset ?? 0, 0);
    return await db
      .select({
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        profileImageUrl: users.profileImageUrl,
        followedAt: followers.createdAt,
      })
      .from(followers)
      .innerJoin(users, eq(users.id, followers.followerId))
      .where(eq(followers.followingId, userId))
      .orderBy(desc(followers.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async listFollowing(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const offset = Math.max(opts?.offset ?? 0, 0);
    return await db
      .select({
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        profileImageUrl: users.profileImageUrl,
        followedAt: followers.createdAt,
      })
      .from(followers)
      .innerJoin(users, eq(users.id, followers.followingId))
      .where(eq(followers.followerId, userId))
      .orderBy(desc(followers.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getProfileActivity(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);

    // Fetch a window of recent items from each source and merge in memory.
    // Pull 2*limit per source so we still have enough after the offset cut.
    const fetchSize = limit * 2 + offset;

    const pageRows = await db
      .select({
        id: writerPages.id,
        title: writerPages.title,
        thumbnailUrl: writerPages.coverImage,
        createdAt: writerPages.publishedAt,
        fallbackCreatedAt: writerPages.createdAt,
        views: writerPages.views,
        likes: writerPages.likes,
      })
      .from(writerPages)
      .where(
        and(eq(writerPages.userId, userId), eq(writerPages.published, 1)),
      )
      .orderBy(desc(writerPages.publishedAt))
      .limit(fetchSize);

    const reelRows = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnailUrl: videos.thumbnailUrl,
        createdAt: videos.createdAt,
        views: videos.views,
        likes: videos.likes,
      })
      .from(videos)
      .where(eq(videos.creatorId, userId))
      .orderBy(desc(videos.createdAt))
      .limit(fetchSize);

    const combined: Array<{
      kind: 'writer_page' | 'reel';
      id: number;
      title: string;
      thumbnailUrl: string | null;
      createdAt: Date;
      views: number;
      likes: number;
    }> = [];

    for (const p of pageRows) {
      const when = p.createdAt ?? p.fallbackCreatedAt;
      if (!when) continue;
      combined.push({
        kind: 'writer_page',
        id: p.id,
        title: p.title,
        thumbnailUrl: p.thumbnailUrl ?? null,
        createdAt: when,
        views: p.views ?? 0,
        likes: p.likes ?? 0,
      });
    }
    for (const r of reelRows) {
      combined.push({
        kind: 'reel',
        id: r.id,
        title: r.title,
        thumbnailUrl: r.thumbnailUrl ?? null,
        createdAt: r.createdAt,
        views: r.views ?? 0,
        likes: r.likes ?? 0,
      });
    }

    combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return combined.slice(offset, offset + limit);
  }

  // === MARA KNOWLEDGE BASE ===
  async createKnowledgeEntry(entry: InsertKnowledgeEntry): Promise<KnowledgeEntry> {
    const [created] = await db.insert(maraKnowledgeBase).values(entry).returning();
    return created;
  }

  async getKnowledgeByCategory(category: string, limit = 50): Promise<KnowledgeEntry[]> {
    return await db
      .select()
      .from(maraKnowledgeBase)
      .where(eq(maraKnowledgeBase.category, category))
      .orderBy(desc(maraKnowledgeBase.updatedAt))
      .limit(limit);
  }

  async getKnowledgeByTopic(topic: string): Promise<KnowledgeEntry[]> {
    return await db
      .select()
      .from(maraKnowledgeBase)
      .where(like(maraKnowledgeBase.topic, `%${topic}%`))
      .orderBy(desc(maraKnowledgeBase.confidence))
      .limit(20);
  }

  async getAllKnowledge(limit = 100): Promise<KnowledgeEntry[]> {
    return await db
      .select()
      .from(maraKnowledgeBase)
      .orderBy(desc(maraKnowledgeBase.updatedAt))
      .limit(limit);
  }

  async updateKnowledgeEntry(id: number, data: Partial<InsertKnowledgeEntry>): Promise<KnowledgeEntry | null> {
    const [updated] = await db
      .update(maraKnowledgeBase)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(maraKnowledgeBase.id, id))
      .returning();
    return updated || null;
  }

  async incrementKnowledgeAccess(id: number): Promise<void> {
    await db
      .update(maraKnowledgeBase)
      .set({ accessCount: sql`${maraKnowledgeBase.accessCount} + 1` })
      .where(eq(maraKnowledgeBase.id, id));
  }

  // === MARA SEARCH HISTORY ===
  async createSearchHistory(entry: InsertSearchHistoryEntry): Promise<SearchHistoryEntry> {
    const [created] = await db.insert(maraSearchHistory).values(entry).returning();
    return created;
  }

  async getSearchHistory(limit = 50): Promise<SearchHistoryEntry[]> {
    return await db
      .select()
      .from(maraSearchHistory)
      .orderBy(desc(maraSearchHistory.createdAt))
      .limit(limit);
  }

  // === MARA LEARNING QUEUE ===
  async createLearningTask(entry: InsertLearningQueueEntry): Promise<LearningQueueEntry> {
    const [created] = await db.insert(maraLearningQueue).values(entry).returning();
    return created;
  }

  async getPendingLearningTasks(limit = 20): Promise<LearningQueueEntry[]> {
    return await db
      .select()
      .from(maraLearningQueue)
      .where(eq(maraLearningQueue.status, 'pending'))
      .orderBy(desc(maraLearningQueue.createdAt))
      .limit(limit);
  }

  async updateLearningTask(id: number, status: string, result?: string): Promise<LearningQueueEntry | null> {
    const updates: Record<string, unknown> = { status };
    if (result) updates.result = result;
    if (status === 'completed') updates.completedAt = new Date();
    const [updated] = await db
      .update(maraLearningQueue)
      .set(updates)
      .where(eq(maraLearningQueue.id, id))
      .returning();
    return updated || null;
  }

  // === MARA SELF REFLECTION ===
  async createSelfReflection(entry: InsertSelfReflection): Promise<SelfReflection> {
    const [created] = await db.insert(maraSelfReflection).values(entry).returning();
    return created;
  }

  async getSelfReflections(limit = 20): Promise<SelfReflection[]> {
    return await db
      .select()
      .from(maraSelfReflection)
      .orderBy(desc(maraSelfReflection.createdAt))
      .limit(limit);
  }

  // === MARA PLATFORM INSIGHTS ===
  async createPlatformInsight(entry: InsertPlatformInsight): Promise<PlatformInsight> {
    const [created] = await db.insert(maraPlatformInsights).values(entry).returning();
    return created;
  }

  async getPlatformInsights(status?: string): Promise<PlatformInsight[]> {
    if (status) {
      return await db
        .select()
        .from(maraPlatformInsights)
        .where(eq(maraPlatformInsights.status, status))
        .orderBy(desc(maraPlatformInsights.createdAt));
    }
    return await db
      .select()
      .from(maraPlatformInsights)
      .orderBy(desc(maraPlatformInsights.createdAt));
  }

  async updatePlatformInsightStatus(id: number, status: string): Promise<PlatformInsight | null> {
    const [updated] = await db
      .update(maraPlatformInsights)
      .set({ status })
      .where(eq(maraPlatformInsights.id, id))
      .returning();
    return updated || null;
  }

  // --- Reels (PR D) ------------------------------------------------------

  async getVideoById(videoId: number): Promise<Video | null> {
    const [row] = await db.select().from(videos).where(eq(videos.id, videoId));
    return row ?? null;
  }

  async shareVideo(videoId: number): Promise<{ shares: number }> {
    await db
      .update(videos)
      .set({ shares: sql`${videos.shares} + 1` })
      .where(eq(videos.id, videoId));
    const [row] = await db
      .select({ shares: videos.shares })
      .from(videos)
      .where(eq(videos.id, videoId));
    return { shares: row?.shares ?? 0 };
  }

  async getReelsFeed(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Video[]> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);
    // Engagement score: likes*3 + views + shares*5 - hours_since_creation*0.1
    // so newer videos get a small boost and very old videos decay. We only
    // include approved videos — pending/rejected never hit the feed.
    //
    // `videos.created_at` in SQLite is defaulted via `CURRENT_TIMESTAMP`,
    // which produces an ISO-8601 text string (not a unix epoch integer).
    // We coerce it through `strftime('%s', …)` so the subtraction is in
    // seconds. `COALESCE` + fallback to `strftime('%s','now')` keeps rows
    // with a NULL `createdAt` from torpedoing the sort.
    return await db
      .select()
      .from(videos)
      .where(eq(videos.moderationStatus, 'approved'))
      .orderBy(
        desc(
          sql`(${videos.likes} * 3 + ${videos.views} + ${videos.shares} * 5) - ((CAST(strftime('%s','now') AS INTEGER) - CAST(COALESCE(strftime('%s', ${videos.createdAt}), strftime('%s','now')) AS INTEGER)) / 3600.0) * 0.1`,
        ),
        desc(videos.createdAt),
      )
      .limit(limit)
      .offset(offset);
  }

  async createVideoComment(
    comment: InsertVideoComment,
  ): Promise<VideoComment> {
    const [created] = await db
      .insert(videoComments)
      .values(comment)
      .returning();
    return created;
  }

  async listVideoComments(
    videoId: number,
    limit = 100,
  ): Promise<VideoComment[]> {
    return await db
      .select()
      .from(videoComments)
      .where(eq(videoComments.videoId, videoId))
      .orderBy(desc(videoComments.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
  }

  async deleteVideoComment(
    commentId: number,
    userId: string,
    isAdmin: boolean,
  ): Promise<boolean> {
    const [row] = await db
      .select()
      .from(videoComments)
      .where(eq(videoComments.id, commentId));
    if (!row) return false;
    if (!isAdmin && row.userId !== userId) return false;
    await db
      .delete(videoComments)
      .where(eq(videoComments.id, commentId));
    return true;
  }

  async countVideoComments(videoId: number): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(videoComments)
      .where(eq(videoComments.videoId, videoId));
    return Number(row?.n ?? 0);
  }

  // ==========================================================
  // Trading Academy (PR F)
  // ==========================================================

  async listTradingModules(): Promise<TradingModule[]> {
    return await db
      .select()
      .from(tradingModules)
      .orderBy(tradingModules.level, tradingModules.orderIdx);
  }

  async getTradingModuleBySlug(slug: string): Promise<TradingModule | null> {
    const [row] = await db
      .select()
      .from(tradingModules)
      .where(eq(tradingModules.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async getTradingModuleById(id: number): Promise<TradingModule | null> {
    const [row] = await db
      .select()
      .from(tradingModules)
      .where(eq(tradingModules.id, id))
      .limit(1);
    return row ?? null;
  }

  async listTradingLessonsByModule(moduleId: number): Promise<TradingLesson[]> {
    return await db
      .select()
      .from(tradingLessons)
      .where(eq(tradingLessons.moduleId, moduleId))
      .orderBy(tradingLessons.orderIdx);
  }

  async getTradingLessonById(id: number): Promise<TradingLesson | null> {
    const [row] = await db
      .select()
      .from(tradingLessons)
      .where(eq(tradingLessons.id, id))
      .limit(1);
    return row ?? null;
  }

  async upsertTradingModule(mod: InsertTradingModule): Promise<TradingModule> {
    // Slug is the natural key. Content-only fields (title/description/etc.)
    // get rewritten so seeding the catalogue a second time picks up edits
    // without a new migration.
    const existing = await this.getTradingModuleBySlug(mod.slug);
    if (existing) {
      await db
        .update(tradingModules)
        .set({
          level: mod.level,
          title: mod.title,
          description: mod.description ?? '',
          orderIdx: mod.orderIdx ?? 0,
          requiredFeature: mod.requiredFeature,
        })
        .where(eq(tradingModules.id, existing.id));
      const [row] = await db
        .select()
        .from(tradingModules)
        .where(eq(tradingModules.id, existing.id));
      return row;
    }
    const [inserted] = await db
      .insert(tradingModules)
      .values(mod)
      .returning();
    return inserted;
  }

  async upsertTradingLesson(lesson: InsertTradingLesson): Promise<TradingLesson> {
    // Natural key is (moduleId, slug). Same motivation as upsertTradingModule.
    const [existing] = await db
      .select()
      .from(tradingLessons)
      .where(
        and(
          eq(tradingLessons.moduleId, lesson.moduleId),
          eq(tradingLessons.slug, lesson.slug),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(tradingLessons)
        .set({
          title: lesson.title,
          content: lesson.content ?? '',
          videoUrl: lesson.videoUrl ?? null,
          durationSeconds: lesson.durationSeconds ?? 0,
          orderIdx: lesson.orderIdx ?? 0,
          quizJson: lesson.quizJson ?? null,
        })
        .where(eq(tradingLessons.id, existing.id));
      const [row] = await db
        .select()
        .from(tradingLessons)
        .where(eq(tradingLessons.id, existing.id));
      return row;
    }
    const [inserted] = await db
      .insert(tradingLessons)
      .values(lesson)
      .returning();
    return inserted;
  }

  async recordLessonCompletion(
    userId: string,
    lessonId: number,
    quizScore: number | null,
  ): Promise<TradingLessonProgress> {
    // (user_id, lesson_id) is unique (enforced by migration index). On
    // a repeat call we refresh `completed_at` and keep the best quiz
    // score seen so far — users aren't penalised for re-taking a quiz.
    const [existing] = await db
      .select()
      .from(tradingLessonProgress)
      .where(
        and(
          eq(tradingLessonProgress.userId, userId),
          eq(tradingLessonProgress.lessonId, lessonId),
        ),
      )
      .limit(1);

    if (existing) {
      const newScore =
        quizScore === null
          ? existing.quizScore
          : existing.quizScore === null
            ? quizScore
            : Math.max(existing.quizScore, quizScore);
      await db
        .update(tradingLessonProgress)
        .set({ quizScore: newScore, completedAt: new Date() })
        .where(eq(tradingLessonProgress.id, existing.id));
      const [row] = await db
        .select()
        .from(tradingLessonProgress)
        .where(eq(tradingLessonProgress.id, existing.id));
      return row;
    }

    const [inserted] = await db
      .insert(tradingLessonProgress)
      .values({ userId, lessonId, quizScore })
      .returning();
    return inserted;
  }

  async listUserLessonProgress(
    userId: string,
    lessonIds?: number[],
  ): Promise<TradingLessonProgress[]> {
    if (lessonIds && lessonIds.length > 0) {
      return await db
        .select()
        .from(tradingLessonProgress)
        .where(
          and(
            eq(tradingLessonProgress.userId, userId),
            inArray(tradingLessonProgress.lessonId, lessonIds),
          ),
        );
    }
    return await db
      .select()
      .from(tradingLessonProgress)
      .where(eq(tradingLessonProgress.userId, userId));
  }

  async issueCertificateIfEligible(
    userId: string,
    moduleId: number,
  ): Promise<TradingCertificate | null> {
    // A certificate is issued once every lesson in the module is completed.
    // The `avgScore` averages graded quizzes only (lessons without a quiz
    // are ignored for scoring). If the user already has a certificate we
    // return the existing row instead of inserting a duplicate.
    const lessons = await this.listTradingLessonsByModule(moduleId);
    if (lessons.length === 0) return null;

    const lessonIds = lessons.map((l) => l.id);
    const progress = await this.listUserLessonProgress(userId, lessonIds);
    if (progress.length < lessons.length) return null;

    const scored = progress
      .map((p) => p.quizScore)
      .filter((s): s is number => typeof s === 'number');
    const avg = scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : 0;

    const [existing] = await db
      .select()
      .from(tradingCertificates)
      .where(
        and(
          eq(tradingCertificates.userId, userId),
          eq(tradingCertificates.moduleId, moduleId),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [inserted] = await db
      .insert(tradingCertificates)
      .values({ userId, moduleId, avgScore: avg })
      .returning();
    return inserted ?? null;
  }

  async listUserCertificates(userId: string): Promise<TradingCertificate[]> {
    return await db
      .select()
      .from(tradingCertificates)
      .where(eq(tradingCertificates.userId, userId))
      .orderBy(desc(tradingCertificates.issuedAt));
  }
}

export const storage = new DatabaseStorage();
