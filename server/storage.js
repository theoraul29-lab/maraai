import { db } from "./db.js";
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
} from "../shared/schema.ts";
import { eq, desc, and, sql, lt, gte, ilike, or } from "drizzle-orm";
export class DatabaseStorage {
  writerPagesInitialized = false;

  async ensureWriterPagesTable() {
    if (this.writerPagesInitialized) return;

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS writer_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        pen_name TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        cover_image TEXT,
        category TEXT NOT NULL DEFAULT 'story',
        published INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        views INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.writerPagesInitialized = true;
  }

  async getVideos(topic) {
    if (topic && topic !== "") {
      return await db
        .select()
        .from(videos)
        .where(eq(videos.type, topic))
        .orderBy(desc(videos.createdAt));
    }
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }
  async createVideo(video) {
    const [created] = await db.insert(videos).values(video).returning();
    return created;
  }
  async likeVideo(userId, videoId) {
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
  async viewVideo(videoId) {
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
  async getChatMessages(userId) {
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
  async createChatMessage(message) {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }
  async followUser(followerId, followingId) {
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
  async getFollowerCount(userId) {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(followers)
      .where(eq(followers.followingId, userId));
    return Number(result[0]?.count || 0);
  }
  async getFollowingCount(userId) {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(followers)
      .where(eq(followers.followerId, userId));
    return Number(result[0]?.count || 0);
  }
  async isFollowing(followerId, followingId) {
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
  async getUserPreferences(userId) {
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
  async updateUserPreferences(userId, prefs) {
    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    if (existing.length > 0) {
      await db
        .update(userPreferences)
        .set({ preferences: prefs, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({ userId, preferences: prefs });
    }
  }
  async deleteVideo(videoId) {
    await db.delete(likes).where(eq(likes.videoId, videoId));
    await db.delete(videos).where(eq(videos.id, videoId));
  }
  async getAllUsers() {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }
  async getTotalMessageCount() {
    const result = await db.select({ count: sql`count(*)` }).from(chatMessages);
    return Number(result[0]?.count || 0);
  }
  async getTotalLikeCount() {
    const result = await db.select({ count: sql`count(*)` }).from(likes);
    return Number(result[0]?.count || 0);
  }
  async clearOldMessages(hoursOld) {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    await db.delete(chatMessages).where(lt(chatMessages.createdAt, cutoff));
  }
  async createPremiumOrder(order) {
    const [created] = await db.insert(premiumOrders).values(order).returning();
    return created;
  }
  async getPremiumOrders(userId) {
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
  async getUserPremiumStatus(userId) {
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
  async confirmPremiumOrder(orderId) {
    const [order] = await db
      .select()
      .from(premiumOrders)
      .where(eq(premiumOrders.id, orderId));
    const now = new Date();
    const updates = { status: "confirmed", confirmedAt: now };
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
  async rejectPremiumOrder(orderId) {
    const [updated] = await db
      .update(premiumOrders)
      .set({ status: "rejected" })
      .where(eq(premiumOrders.id, orderId))
      .returning();
    return updated;
  }
  async updateUserLanguage(userId, language) {
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
  async getMonthlyPostCount(userId) {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const result = await db
      .select({ count: sql`count(*)` })
      .from(creatorPosts)
      .where(
        and(
          eq(creatorPosts.userId, userId),
          gte(creatorPosts.createdAt, firstOfMonth),
        ),
      );
    return Number(result[0]?.count || 0);
  }
  async recordCreatorPost(userId, videoId) {
    await db.insert(creatorPosts).values({ userId, videoId });
  }
  async canUserPost(userId) {
    const isPremium = await this.getUserPremiumStatus(userId);
    const used = await this.getMonthlyPostCount(userId);
    return {
      canPost: true,
      used,
      limit: -1,
      isPremium,
    };
  }
  async getCreatorVideos(userId) {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.creatorId, userId))
      .orderBy(desc(videos.createdAt));
  }
  async deleteCreatorVideo(videoId, userId) {
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
  async getUserTradingAccess(userId) {
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
  async createWriterPage(page) {
    await this.ensureWriterPagesTable();
    const [created] = await db.insert(writerPages).values(page).returning();
    return created;
  }
  async getWriterPages(userId) {
    await this.ensureWriterPagesTable();
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
  async getPublishedWriterPages() {
    await this.ensureWriterPagesTable();
    return await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.published, true))
      .orderBy(desc(writerPages.createdAt));
  }
  async getWriterPageById(id) {
    await this.ensureWriterPagesTable();
    const [page] = await db
      .select()
      .from(writerPages)
      .where(eq(writerPages.id, id));
    return page || null;
  }
  async updateWriterPage(id, userId, data) {
    await this.ensureWriterPagesTable();
    const [existing] = await db
      .select()
      .from(writerPages)
      .where(and(eq(writerPages.id, id), eq(writerPages.userId, userId)));
    if (!existing) return null;
    const [updated] = await db
      .update(writerPages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(writerPages.id, id))
      .returning();
    return updated;
  }
  async deleteWriterPage(id, userId) {
    await this.ensureWriterPagesTable();
    const [existing] = await db
      .select()
      .from(writerPages)
      .where(and(eq(writerPages.id, id), eq(writerPages.userId, userId)));
    if (!existing) return false;
    await db.delete(writerPages).where(eq(writerPages.id, id));
    return true;
  }
  async likeWriterPage(pageId) {
    await this.ensureWriterPagesTable();
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
  async viewWriterPage(pageId) {
    await this.ensureWriterPagesTable();
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
  async saveVideo(userId, videoId, note) {
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
  async unsaveVideo(userId, videoId) {
    await db
      .delete(savedVideos)
      .where(
        and(eq(savedVideos.userId, userId), eq(savedVideos.videoId, videoId)),
      );
    return { saved: false };
  }
  async getSavedVideos(userId) {
    return await db
      .select()
      .from(savedVideos)
      .where(eq(savedVideos.userId, userId))
      .orderBy(desc(savedVideos.createdAt));
  }
  async isVideoSaved(userId, videoId) {
    const existing = await db
      .select()
      .from(savedVideos)
      .where(
        and(eq(savedVideos.userId, userId), eq(savedVideos.videoId, videoId)),
      );
    return existing.length > 0;
  }
  async createFeedback(feedback) {
    const [created] = await db
      .insert(userFeedback)
      .values(feedback)
      .returning();
    return created;
  }
  async getRecentFeedback(limit = 100) {
    return await db
      .select()
      .from(userFeedback)
      .orderBy(desc(userFeedback.createdAt))
      .limit(limit);
  }
  async getFeedbackCount() {
    const result = await db.select({ count: sql`count(*)` }).from(userFeedback);
    return Number(result[0].count);
  }
  async createImprovement(improvement) {
    const [created] = await db
      .insert(aiImprovements)
      .values(improvement)
      .returning();
    return created;
  }
  async getImprovements() {
    return await db
      .select()
      .from(aiImprovements)
      .orderBy(desc(aiImprovements.createdAt));
  }
  async updateImprovementStatus(id, status) {
    const [updated] = await db
      .update(aiImprovements)
      .set({ status })
      .where(eq(aiImprovements.id, id))
      .returning();
    return updated || null;
  }
  async createNotification(notification) {
    const [created] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return created;
  }
  async getNotifications(userId) {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }
  async markNotificationRead(id, userId) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }
  async markAllNotificationsRead(userId) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false)),
      );
  }
  async getUnreadNotificationCount(userId) {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false)),
      );
    return Number(result[0].count);
  }
  async createComment(comment) {
    const [created] = await db.insert(comments).values(comment).returning();
    return created;
  }
  async getComments(videoId) {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.videoId, videoId))
      .orderBy(desc(comments.createdAt));
  }
  async getCommentCount(videoId) {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(comments)
      .where(eq(comments.videoId, videoId));
    return Number(result[0].count);
  }
  async createCollection(collection) {
    const [created] = await db
      .insert(collections)
      .values(collection)
      .returning();
    return created;
  }
  async getCollections(userId) {
    return await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.createdAt));
  }
  async deleteCollection(id, userId) {
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
  async addVideoToCollection(collectionId, videoId) {
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
  async removeVideoFromCollection(collectionId, videoId) {
    await db
      .delete(collectionVideos)
      .where(
        and(
          eq(collectionVideos.collectionId, collectionId),
          eq(collectionVideos.videoId, videoId),
        ),
      );
  }
  async getCollectionVideos(collectionId) {
    const cvs = await db
      .select()
      .from(collectionVideos)
      .where(eq(collectionVideos.collectionId, collectionId));
    if (cvs.length === 0) return [];
    const videoIds = cvs.map((cv) => cv.videoId);
    const result = await db
      .select()
      .from(videos)
      .where(
        sql`${videos.id} = ANY(${sql.raw(`ARRAY[${videoIds.join(",")}]`)})`,
      )
      .orderBy(desc(videos.createdAt));
    return result;
  }
  async getCollectionVideoCount(collectionId) {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(collectionVideos)
      .where(eq(collectionVideos.collectionId, collectionId));
    return Number(result[0].count);
  }
  async createBrainLog(log) {
    const [created] = await db.insert(brainLogs).values(log).returning();
    return created;
  }
  async getBrainLogs(limit = 20) {
    return await db
      .select()
      .from(brainLogs)
      .orderBy(desc(brainLogs.createdAt))
      .limit(limit);
  }
  async searchAll(query) {
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
      ilike(videos.title, p),
      ilike(videos.description, p),
    ]);
    const foundVideos = await db
      .select()
      .from(videos)
      .where(or(...videoConditions))
      .orderBy(desc(videos.views))
      .limit(10);
    const userConditions = patterns.flatMap((p) => [
      ilike(users.firstName, p),
      ilike(users.lastName, p),
      ilike(users.email, p),
      ilike(users.displayName, p),
    ]);
    const foundUsers = await db
      .select()
      .from(users)
      .where(or(...userConditions))
      .limit(10);
    const pageConditions = patterns.flatMap((p) => [
      ilike(writerPages.title, p),
      ilike(writerPages.penName, p),
    ]);
    const foundPages = await db
      .select()
      .from(writerPages)
      .where(and(eq(writerPages.published, true), or(...pageConditions)))
      .orderBy(desc(writerPages.views))
      .limit(10);
    return { videos: foundVideos, users: foundUsers, pages: foundPages };
  }
  async updateUserProfile(userId, data) {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated || null;
  }
}
export const storage = new DatabaseStorage();
