import { db } from "./db";
import {
  videos,
  chatMessages,
  likes,
  followers,
  userPreferences,
  premiumOrders,
  creatorPosts,
  writerPages,
  savedVideos,
  userFeedback,
  aiImprovements,
  notifications,
  comments,
  collections,
  collectionVideos,
  brainLogs,
  users,
  type Video,
  type InsertVideo,
  type ChatMessage,
  type InsertChatMessage,
  type PremiumOrder,
  type InsertPremiumOrder,
  type WriterPage,
  type InsertWriterPage,
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
  deleteVideo(videoId: number): Promise<void>;

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
  getWriterPageById(id: number): Promise<WriterPage | null>;
  updateWriterPage(
    id: number,
    userId: string,
    data: Partial<InsertWriterPage & { published: boolean }>,
  ): Promise<WriterPage | null>;
  deleteWriterPage(id: number, userId: string): Promise<boolean>;
  likeWriterPage(pageId: number): Promise<{ likes: number }>;
  viewWriterPage(pageId: number): Promise<{ views: number }>;

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
    data: { displayName?: string; bio?: string },
  ): Promise<User | null>;
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

  async updateWriterPage(
    id: number,
    userId: string,
    data: Partial<InsertWriterPage & { published: boolean }>,
  ): Promise<WriterPage | null> {
    const [existing] = await db
      .select()
      .from(writerPages)
      .where(and(eq(writerPages.id, id), eq(writerPages.userId, userId)));
    if (!existing) return null;
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    if (typeof data.published === "boolean") {
      updateData.published = data.published ? 1 : 0;
    }

    const [updated] = await db
      .update(writerPages)
      .set(updateData)
      .where(eq(writerPages.id, id))
      .returning();
    return updated;
  }

  async deleteWriterPage(id: number, userId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(writerPages)
      .where(and(eq(writerPages.id, id), eq(writerPages.userId, userId)));
    if (!existing) return false;
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
    data: { displayName?: string; bio?: string },
  ): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated || null;
  }
}

export const storage = new DatabaseStorage();
