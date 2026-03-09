import { storage } from "./storage.js";
import { api } from "../shared/routes.js";
import { z } from "zod";
import {
  creatorPostRequestSchema,
  likes as likesTable,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq } from "drizzle-orm";
import * as videoModule from "../backend/src/modules/video.js";
import * as chatModule from "../backend/src/modules/chat.js";
import * as ttsModule from "../backend/src/modules/tts.js";
import * as sttModule from "../backend/src/modules/stt.js";
import * as userPrefsModule from "../backend/src/modules/userPrefs.js";
import * as adminModule from "../backend/src/modules/admin.js";
import * as feedbackModule from "../backend/src/modules/feedback.js";
import * as profileModule from "../backend/src/modules/profile.js";
import * as ordersModule from "../backend/src/modules/orders.js";
import * as adminOrdersModule from "../backend/src/modules/adminOrders.js";
import * as paymentsModule from "../backend/src/modules/payments.js";
import {
  StripeProvider,
  PayPalProvider,
} from "../backend/src/payments/providers.js";
import {
  getMaraResponse,
  MOOD_TO_THEME,
  analyzeFeedbackPatterns,
  generateImprovementIdeas,
  MaraBrainCycle,
  generateMarketingPost,
} from "./ai.js";
import {
  setupAuth,
  registerAuthRoutes,
} from "./replit_integrations/auth/index.js";
import { authStorage } from "./replit_integrations/auth/storage.js";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 10;
const userMessageTimestamps = new Map();
const checkRateLimit = (userId) => {
  const now = Date.now();
  let timestamps = userMessageTimestamps.get(userId) || [];
  timestamps = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
    const oldestTimestamp = Math.min(...timestamps);
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp);
    return { allowed: false, retryAfterMs };
  }
  timestamps.push(now);
  userMessageTimestamps.set(userId, timestamps);
  return { allowed: true };
};
export async function registerRoutes(httpServer, app) {
  await setupAuth(app);
  registerAuthRoutes(app);
  // Inject dependencies into modules
  videoModule.injectDeps({
    storage,
    db,
    api,
    z,
    creatorPostRequestSchema,
    likesTable,
    eq,
  });
  chatModule.injectDeps({
    storage,
    api,
    z,
    getMaraResponse,
    MOOD_TO_THEME,
    checkRateLimit,
  });
  ttsModule.injectDeps({
    VOICE_MAP: {
      classic: "nova",
      friendly: "shimmer",
      professor: "onyx",
      energetic: "alloy",
      calm: "nova",
      storyteller: "shimmer",
      deep: "onyx",
      bright: "alloy",
      warm: "nova",
      serious: "onyx",
      playful: "shimmer",
      confident: "alloy",
    },
    importAudioClient: () => import("./replit_integrations/audio/client"),
  });
  sttModule.injectDeps({
    importAudioClient: () => import("./replit_integrations/audio/client"),
  });
  userPrefsModule.injectDeps({ storage });
  adminModule.injectDeps({ storage });
  profileModule.injectDeps({ storage, authStorage });
  ordersModule.injectDeps({ storage, z });
  adminOrdersModule.injectDeps({ storage });
  paymentsModule.injectDeps({
    stripeProvider: new StripeProvider(),
    paypalProvider: new PayPalProvider(),
  });
  // Payment provider endpoints (modularized)
  app.post("/api/payments/stripe", paymentsModule.processStripePayment);
  app.post("/api/payments/paypal", paymentsModule.processPayPalPayment);
  // Admin order management endpoints
  app.get("/api/admin/orders", adminOrdersModule.getOrders);
  app.post("/api/admin/orders/:id/confirm", adminOrdersModule.confirmOrder);
  app.post("/api/admin/orders/:id/reject", adminOrdersModule.rejectOrder);
  // Orders, premium, and trading endpoints
  app.get("/api/premium/status", ordersModule.getPremiumStatus);
  app.get("/api/trading/access", ordersModule.getTradingAccess);
  app.post("/api/premium/order", ordersModule.createPremiumOrder);
  // Profile endpoints
  app.get("/api/profile/:id", profileModule.getProfile);
  app.get("/api/profile/:id/videos", profileModule.getProfileVideos);
  app.post("/api/profile/:id/follow", profileModule.followUser);
  // Admin endpoints (add isAdmin check as needed)
  app.get("/api/admin/stats", adminModule.getStats);
  app.get("/api/admin/users", adminModule.getUsers);
  app.get("/api/admin/videos", adminModule.getVideos);
  // Feedback/moderation endpoint
  app.post("/api/moderate", feedbackModule.moderate);
  // Video and feed endpoints
  app.get(api.videos.list.path, videoModule.listVideos);
  app.get("/api/mara-feed", videoModule.maraFeed);
  app.post(api.videos.create.path, videoModule.createVideo);
  app.post("/api/videos/:id/like", videoModule.likeVideo);
  app.post("/api/videos/:id/view", videoModule.viewVideo);
  app.post("/api/videos/:id/save", videoModule.saveVideo);
  app.delete("/api/videos/:id/save", videoModule.unsaveVideo);
  app.get("/api/videos/saved", videoModule.getSavedVideos);
  // Creator endpoints
  app.get("/api/creator/post-status", videoModule.creatorPostStatus);
  app.get("/api/creator/my-videos", videoModule.creatorMyVideos);
  app.post("/api/creator/post-reel", videoModule.creatorPostReel);
  app.get("/api/creator/analytics", videoModule.creatorAnalytics);
  app.delete("/api/creator/videos/:id", videoModule.deleteCreatorVideo);
  // Chat endpoints
  app.get(api.chat.list.path, chatModule.getChatHistory);
  app.post(api.chat.send.path, chatModule.sendChatMessage);
  // TTS endpoints
  app.post("/api/mara-speak", ttsModule.maraSpeak);
  app.post("/api/tts", ttsModule.tts);
  // STT endpoint
  app.post("/api/stt", sttModule.stt);
  // User preferences endpoints
  app.get("/api/user/language", userPrefsModule.getUserLanguage);
  app.post("/api/user/language", userPrefsModule.setUserLanguage);
  app.get("/api/mara-feed", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const page = Number(req.query.page) || 1;
      const dbVideos = await storage.listVideos();
      const categories = [
        { tag: "trending", label: "Trending Now" },
        { tag: "nature", label: "Nature & Relaxation" },
        { tag: "action", label: "Action & Adventure" },
        { tag: "creative", label: "Creative & Art" },
        { tag: "tech", label: "Tech & Innovation" },
        { tag: "fun", label: "Fun & Entertainment" },
        { tag: "cinematic", label: "Cinematic Shorts" },
        { tag: "mara-pick", label: "Mara's Pick" },
      ];
      const seededRandom = (seed) => {
        let x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };
      const userId = req.user?.claims?.sub;
      let userSavedIds = new Set();
      let userLikedIds = new Set();
      if (userId) {
        const saved = await storage.getSavedVideos(userId);
        userSavedIds = new Set(saved.map((s) => s.videoId));
        const likedRows = await db
          .select()
          .from(likesTable)
          .where(eq(likesTable.userId, userId));
        userLikedIds = new Set(likedRows.map((l) => l.videoId));
      }
      const feed = [];
      const totalItems = limit;
      const startIdx = (page - 1) * limit;
      for (let i = 0; i < totalItems; i++) {
        const globalIdx = startIdx + i;
        const videoIdx = Math.floor(
          seededRandom(globalIdx * 7 + 13) * dbVideos.length,
        );
        const catIdx = Math.floor(
          seededRandom(globalIdx * 11 + 37) * categories.length,
        );
        const video = dbVideos[videoIdx];
        const cat = categories[catIdx];
        if (video) {
          feed.push({
            ...video,
            feedId: globalIdx,
            category: cat.tag,
            categoryLabel: cat.label,
            isMara: cat.tag === "mara-pick",
            isSaved: userSavedIds.has(video.id),
            isLiked: userLikedIds.has(video.id),
          });
        }
      }
      res.json({
        feed,
        page,
        hasMore: page < 50,
        totalAvailable: 50 * limit,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to generate feed" });
    }
  });
  app.post(api.videos.create.path, async (req, res) => {
    try {
      const input = api.videos.create.input.parse(req.body);
      const video = await storage.createVideo(input);
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: "Failed to create video" });
    }
  });
  app.post("/api/videos/:id/like", async (req, res) => {
    try {
      const videoId = Number(req.params.id);
      const userId = req.user?.claims?.sub || "anonymous";
      const result = await storage.likeVideo(userId, videoId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to like video" });
    }
  });
  app.post("/api/videos/:id/view", async (req, res) => {
    try {
      const videoId = Number(req.params.id);
      const result = await storage.viewVideo(videoId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to record view" });
    }
  });
  // === SAVE/BOOKMARK VIDEOS ===
  app.post("/api/videos/:id/save", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const videoId = Number(req.params.id);
      const note = req.body?.note || undefined;
      const result = await storage.saveVideo(userId, videoId, note);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to save video" });
    }
  });
  app.delete("/api/videos/:id/save", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const videoId = Number(req.params.id);
      const result = await storage.unsaveVideo(userId, videoId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to unsave video" });
    }
  });
  app.get("/api/videos/saved", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const saved = await storage.getSavedVideos(userId);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch saved videos" });
    }
  });
  // === CREATOR POSTING SYSTEM ===
  app.get("/api/creator/post-status", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const status = await storage.canUserPost(userId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: "Failed to check post status" });
    }
  });
  app.get("/api/creator/my-videos", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const myVideos = await storage.getCreatorVideos(userId);
      res.json(myVideos);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch creator videos" });
    }
  });
  app.post("/api/creator/post-reel", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const parsed = creatorPostRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.errors[0].message });
      }
      const { isPremium } = await storage.canUserPost(userId);
      let finalUrl = parsed.data.url;
      const ytMatch = finalUrl.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/,
      );
      if (ytMatch) {
        finalUrl = `youtube:${ytMatch[1]}`;
      }
      const video = await storage.createVideo({
        url: finalUrl,
        title: parsed.data.title,
        description: parsed.data.description || "",
        type: parsed.data.type,
        creatorId: userId,
      });
      await storage.recordCreatorPost(userId, video.id);
      res.status(201).json({
        video,
        message: isPremium
          ? "Posted successfully! Creator Pro — unlimited access."
          : "Posted successfully! Your reel is now live on the feed.",
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to post reel" });
    }
  });
  app.get("/api/creator/analytics", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const creatorVideos = await storage.getCreatorVideos(userId);
      const analytics = creatorVideos.map((v) => ({
        id: v.id,
        title: v.title,
        views: v.views,
        likes: v.likes,
        createdAt: v.createdAt,
      }));
      const totalViews = analytics.reduce((sum, v) => sum + v.views, 0);
      const totalLikes = analytics.reduce((sum, v) => sum + v.likes, 0);
      res.json({
        reels: analytics,
        totalViews,
        totalLikes,
        totalReels: analytics.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });
  const BANNED_WORDS = ["spam", "scam", "phishing"];
  app.post("/api/moderate", (req, res) => {
    const { text } = req.body;
    if (!text)
      return res.status(400).json({ safe: false, message: "No text provided" });
    const lower = text.toLowerCase();
    const flagged = BANNED_WORDS.filter((w) => lower.includes(w));
    res.json({ safe: flagged.length === 0, flaggedWords: flagged });
  });
  const VOICE_MAP = {
    classic: "nova",
    friendly: "shimmer",
    professor: "onyx",
    energetic: "alloy",
    calm: "nova",
    storyteller: "shimmer",
    deep: "onyx",
    bright: "alloy",
    warm: "nova",
    serious: "onyx",
    playful: "shimmer",
    confident: "alloy",
  };
  app.post("/api/mara-speak", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { text, voice } = req.body;
      if (!text) return res.status(400).json({ message: "Text is required" });
      const ttsVoice = VOICE_MAP[voice || "classic"] || "nova";
      const { textToSpeech } =
        await import("./replit_integrations/audio/client");
      const audioBuffer = await textToSpeech(text, ttsVoice, "mp3");
      res.set("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (err) {
      console.error("Mara speak error:", err);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });
  app.delete("/api/creator/videos/:id", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const videoId = Number(req.params.id);
      const deleted = await storage.deleteCreatorVideo(videoId, userId);
      if (!deleted)
        return res
          .status(403)
          .json({ message: "Not authorized or video not found" });
      res.json({ message: "Video deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete video" });
    }
  });
  app.get(api.chat.list.path, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      await storage.clearOldMessages(24);
      const messages = await storage.getChatMessages(userId);
      res.json(messages.reverse());
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch chat history" });
    }
  });
  app.post(api.chat.send.path, async (req, res) => {
    try {
      const input = api.chat.send.input.parse(req.body);
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          message: "Too many messages sent. Please try again in a moment.",
          retryAfterMs: rateLimitCheck.retryAfterMs,
        });
      }
      const userMsg = await storage.createChatMessage({
        content: input.message,
        sender: "user",
        userId,
      });
      const history = await storage.getChatMessages(userId);
      const conversationHistory = history.slice(-20).map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.content,
      }));
      const prefs = await storage.getUserPreferences(userId);
      const userPrefs = prefs || undefined;
      const { response: aiResponseContent, detectedMood } =
        await getMaraResponse(
          input.message,
          conversationHistory,
          userPrefs,
          input.module,
        );
      const aiMsg = await storage.createChatMessage({
        content: aiResponseContent,
        sender: "ai",
        userId,
      });
      const suggestedTheme = MOOD_TO_THEME[detectedMood] || "midnight";
      storage
        .updateUserPreferences(userId, {
          lastMood: detectedMood,
          lastActive: new Date().toISOString(),
        })
        .catch(() => {});
      res.status(200).json({
        message: userMsg,
        aiResponse: aiMsg,
        mood: detectedMood,
        suggestedTheme,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Chat error:", err);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });
  app.post("/api/tts", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { text } = req.body;
      if (!text) return res.status(400).json({ message: "Text is required" });
      const { textToSpeech } =
        await import("./replit_integrations/audio/client");
      const audioBuffer = await textToSpeech(text, "nova", "mp3");
      res.set("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (err) {
      console.error("TTS error:", err);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });
  app.post("/api/stt", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { audio } = req.body;
      if (!audio)
        return res.status(400).json({ message: "Audio data is required" });
      const { speechToText, ensureCompatibleFormat } =
        await import("./replit_integrations/audio/client");
      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format } =
        await ensureCompatibleFormat(rawBuffer);
      const transcript = await speechToText(audioBuffer, format);
      res.json({ transcript });
    } catch (err) {
      console.error("STT error:", err);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });
  app.get("/api/user/language", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.json({ language: "en" });
      const prefs = await storage.getUserPreferences(userId);
      res.json({ language: prefs?.language || "en" });
    } catch {
      res.json({ language: "en" });
    }
  });
  app.post("/api/user/language", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const { language } = req.body;
      if (!["en", "ro", "de", "ru"].includes(language)) {
        return res.status(400).json({ message: "Invalid language" });
      }
      await storage.updateUserLanguage(userId, language);
      res.json({ language });
    } catch {
      res.status(500).json({ message: "Failed to update language" });
    }
  });
  app.get("/api/profile/:id", async (req, res) => {
    try {
      const profileId = req.params.id;
      const user = await authStorage.getUser(profileId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const allVideos = await storage.getVideos();
      const creatorVideos = allVideos.filter((v) => v.creatorId === profileId);
      const videoCount = creatorVideos.length;
      const totalLikes = creatorVideos.reduce((sum, v) => sum + v.likes, 0);
      const totalViews = creatorVideos.reduce((sum, v) => sum + v.views, 0);
      const followerCount = await storage.getFollowerCount(profileId);
      const followingCount = await storage.getFollowingCount(profileId);
      let isFollowing = false;
      const currentUserId = req.user?.claims?.sub;
      if (currentUserId && currentUserId !== profileId) {
        isFollowing = await storage.isFollowing(currentUserId, profileId);
      }
      res.json({
        user,
        videoCount,
        followerCount,
        followingCount,
        isFollowing,
        totalLikes,
        totalViews,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });
  app.get("/api/profile/:id/videos", async (req, res) => {
    try {
      const profileId = req.params.id;
      const allVideos = await storage.getVideos();
      const creatorVideos = allVideos.filter((v) => v.creatorId === profileId);
      res.json(creatorVideos);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch creator videos" });
    }
  });
  app.post("/api/profile/:id/follow", async (req, res) => {
    try {
      const targetId = req.params.id;
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Login required" });
      }
      const result = await storage.followUser(userId, targetId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to follow user" });
    }
  });
  const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .filter(Boolean);
  function isAdmin(req) {
    const userId = req.user?.claims?.sub;
    if (!userId) return false;
    if (ADMIN_USER_IDS.length === 0) return false;
    return ADMIN_USER_IDS.includes(userId);
  }
  app.get("/api/admin/stats", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const allUsers = await storage.getAllUsers();
      const allVideos = await storage.getVideos();
      const totalMessages = await storage.getTotalMessageCount();
      const totalLikes = await storage.getTotalLikeCount();
      res.json({
        totalUsers: allUsers.length,
        totalVideos: allVideos.length,
        totalMessages,
        totalLikes,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  });
  app.get("/api/admin/users", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app.get("/api/admin/videos", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const allVideos = await storage.getVideos();
      res.json(allVideos);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch videos" });
    }
  });
  app.delete("/api/admin/videos/:id", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const videoId = Number(req.params.id);
      await storage.deleteVideo(videoId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete video" });
    }
  });
  app.get("/api/preferences", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Login required" });
      }
      const prefs = await storage.getUserPreferences(userId);
      res.json(prefs || { language: "en" });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });
  app.post("/api/preferences/language", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Login required" });
      }
      const { language } = req.body;
      if (!language || !["en", "ro", "de", "ru"].includes(language)) {
        return res.status(400).json({ message: "Invalid language" });
      }
      await storage.updateUserLanguage(userId, language);
      res.json({ language });
    } catch (err) {
      res.status(500).json({ message: "Failed to update language preference" });
    }
  });
  app.get("/api/premium/status", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const isPremium = await storage.getUserPremiumStatus(userId);
      const tradingAccess = await storage.getUserTradingAccess(userId);
      const orders = await storage.getPremiumOrders(userId);
      res.json({
        isPremium,
        hasTrading: tradingAccess.hasAccess,
        tradingExpiresAt: tradingAccess.expiresAt,
        orders,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch premium status" });
    }
  });
  app.get("/api/trading/access", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const tradingAccess = await storage.getUserTradingAccess(userId);
      const pendingOrders = (await storage.getPremiumOrders(userId)).filter(
        (o) => o.orderType === "trading" && o.status === "pending",
      );
      res.json({
        hasAccess: tradingAccess.hasAccess,
        expiresAt: tradingAccess.expiresAt,
        hasPending: pendingOrders.length > 0,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to check trading access" });
    }
  });
  const premiumOrderBodySchema = z.object({
    transferReference: z.string().min(1).max(200),
    notes: z.string().max(500).optional(),
    orderType: z.enum(["creator", "trading"]).optional().default("creator"),
    subscriptionPeriod: z
      .enum(["once", "monthly", "yearly"])
      .optional()
      .default("once"),
  });
  function getTradingAmount(period) {
    return period === "yearly" ? "100.00" : "10.00";
  }
  app.post("/api/premium/order", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = premiumOrderBodySchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: "Invalid input", errors: parsed.error.flatten() });
      const period =
        parsed.data.orderType === "trading"
          ? parsed.data.subscriptionPeriod || "monthly"
          : "once";
      const amount =
        parsed.data.orderType === "trading" ? getTradingAmount(period) : "9.00";
      const order = await storage.createPremiumOrder({
        userId,
        amount,
        currency: "EUR",
        transferReference: parsed.data.transferReference,
        notes: parsed.data.notes || null,
        orderType: parsed.data.orderType,
        subscriptionPeriod: period,
      });
      res.json(order);
    } catch (err) {
      res.status(500).json({ message: "Failed to create order" });
    }
  });
  app.get("/api/admin/orders", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const orders = await storage.getPremiumOrders();
      res.json(orders);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });
  app.post("/api/admin/orders/:id/confirm", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const orderId = Number(req.params.id);
      if (isNaN(orderId))
        return res.status(400).json({ message: "Invalid order ID" });
      const order = await storage.confirmPremiumOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      res.status(500).json({ message: "Failed to confirm order" });
    }
  });
  app.post("/api/admin/orders/:id/reject", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const orderId = Number(req.params.id);
      if (isNaN(orderId))
        return res.status(400).json({ message: "Invalid order ID" });
      const order = await storage.rejectPremiumOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      res.status(500).json({ message: "Failed to reject order" });
    }
  });
  // === WRITER PAGES ===
  const MAX_COVER_IMAGE_SIZE = 2 * 1024 * 1024;
  const writerPageBodySchema = z.object({
    penName: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(50000),
    category: z
      .enum(["story", "poem", "book", "article", "journal"])
      .optional()
      .default("story"),
    coverImage: z
      .string()
      .nullable()
      .optional()
      .refine(
        (val) =>
          !val ||
          (val.startsWith("data:image/") &&
            val.length <= MAX_COVER_IMAGE_SIZE * 1.37),
        { message: "Cover image must be a valid data URL under 2MB" },
      ),
  });
  app.get("/api/writers/published", async (_req, res) => {
    try {
      const pages = await storage.getPublishedWriterPages();
      res.json(pages);
    } catch (err) {
      console.error("writers/published failed:", err);
      res.status(200).json([]);
    }
  });
  app.get("/api/writers/my-pages", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const pages = await storage.getWriterPages(userId);
      res.json(pages);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch your pages" });
    }
  });
  app.get("/api/writers/page/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const page = await storage.getWriterPageById(id);
      if (!page) return res.status(404).json({ message: "Page not found" });
      const userId = req.user?.claims?.sub;
      if (!page.published && page.userId !== userId) {
        return res.status(404).json({ message: "Page not found" });
      }
      await storage.viewWriterPage(id);
      res.json(page);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch page" });
    }
  });
  app.post("/api/writers/create", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = writerPageBodySchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: "Invalid input", errors: parsed.error.flatten() });
      const page = await storage.createWriterPage({ userId, ...parsed.data });
      res.json(page);
    } catch (err) {
      res.status(500).json({ message: "Failed to create page" });
    }
  });
  app.patch("/api/writers/page/:id", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const updateSchema = writerPageBodySchema.partial().extend({
        published: z.boolean().optional(),
        coverImage: z.string().nullable().optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: "Invalid input", errors: parsed.error.flatten() });
      if (parsed.data.published === true) {
        const isPremium = await storage.getUserPremiumStatus(userId);
        if (!isPremium) {
          return res.status(403).json({
            message: "Premium subscription required to publish online",
          });
        }
      }
      const updated = await storage.updateWriterPage(id, userId, parsed.data);
      if (!updated)
        return res.status(404).json({ message: "Page not found or not yours" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update page" });
    }
  });
  app.delete("/api/writers/page/:id", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteWriterPage(id, userId);
      if (!deleted)
        return res.status(404).json({ message: "Page not found or not yours" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete page" });
    }
  });
  app.post("/api/writers/page/:id/like", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const result = await storage.likeWriterPage(id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to like page" });
    }
  });
  app.post("/api/writers/ai-tip", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { content, category } = req.body;
      if (!content || typeof content !== "string")
        return res.status(400).json({ message: "Content required" });
      const tipPrompt = `Give a short, actionable writing tip for this ${category || "story"} excerpt (2-3 sentences max). Focus on improving engagement, style, or structure. Here's the text:\n\n"${content.substring(0, 500)}"`;
      const tipResponse = await getMaraResponse(
        tipPrompt,
        [],
        undefined,
        "writers",
      );
      res.json({ tip: tipResponse.response });
    } catch (err) {
      res.status(500).json({ message: "Failed to get writing tip" });
    }
  });
  // === FEEDBACK ROUTES ===
  app.post("/api/feedback", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const schema = z.object({
        message: z.string().min(1).max(2000),
        category: z
          .enum(["general", "bug", "feature", "performance", "ui", "content"])
          .default("general"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: "Invalid input", errors: parsed.error.flatten() });
      const feedback = await storage.createFeedback({ userId, ...parsed.data });
      res.json(feedback);
    } catch (err) {
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });
  app.get("/api/feedback", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const feedback = await storage.getRecentFeedback(100);
      const userFeedback = feedback.filter((f) => f.userId === userId);
      res.json(userFeedback);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });
  // === ADMIN: IMPROVEMENT ENGINE ROUTES ===
  app.get("/api/admin/feedback", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const feedback = await storage.getRecentFeedback(200);
      const count = await storage.getFeedbackCount();
      res.json({ feedback, total: count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });
  app.get("/api/admin/improvements", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const improvements = await storage.getImprovements();
      res.json(improvements);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch improvements" });
    }
  });
  app.post("/api/admin/improve-mara", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const allFeedback = await storage.getRecentFeedback(200);
      const feedbackMessages = allFeedback.map((f) => f.message);
      const feedbackIssues = await analyzeFeedbackPatterns(feedbackMessages);
      const allUsers = await storage.getAllUsers();
      const allVideos = await storage.getVideos();
      const totalMessages = await storage.getTotalMessageCount();
      const aiSuggestions = await generateImprovementIdeas({
        feedbackIssues,
        platformStats: {
          users: allUsers.length,
          videos: allVideos.length,
          messages: totalMessages,
        },
      });
      const improvement = await storage.createImprovement({
        type: "product-improvement",
        title: "Mara AI Suggested Improvements",
        description: aiSuggestions,
        source: "mara-ai-engine",
      });
      res.json({
        message: "Mara AI improvement cycle completed",
        feedbackAnalyzed: allFeedback.length,
        patternsDetected: feedbackIssues.length,
        result: improvement,
      });
    } catch (err) {
      console.error("Improve Mara cycle failed:", err);
      res.status(500).json({ message: "Improvement cycle failed" });
    }
  });
  app.patch("/api/admin/improvements/:id/status", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const schema = z.object({
        status: z.enum(["pending", "in-progress", "completed", "dismissed"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Invalid status" });
      const updated = await storage.updateImprovementStatus(
        id,
        parsed.data.status,
      );
      if (!updated)
        return res.status(404).json({ message: "Improvement not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update improvement" });
    }
  });
  // === SEARCH ===
  app.get("/api/search", async (req, res) => {
    try {
      const q = (req.query.q || "").toString().trim();
      if (!q || q.length < 2)
        return res.json({ videos: [], users: [], pages: [] });
      const results = await storage.searchAll(q);
      res.json(results);
    } catch (err) {
      res.status(500).json({ message: "Search failed" });
    }
  });
  // === NOTIFICATIONS ===
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const notifs = await storage.getNotifications(userId);
      res.json(notifs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });
  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });
  app.post("/api/notifications/read/:id", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.markNotificationRead(id, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });
  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark all read" });
    }
  });
  // === COMMENTS ===
  app.get("/api/videos/:id/comments", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId))
        return res.status(400).json({ message: "Invalid ID" });
      const videoComments = await storage.getComments(videoId);
      res.json(videoComments);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });
  app.post("/api/videos/:id/comments", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId))
        return res.status(400).json({ message: "Invalid ID" });
      const schema = z.object({ content: z.string().min(1).max(1000) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Invalid input" });
      const comment = await storage.createComment({
        userId,
        videoId,
        content: parsed.data.content,
      });
      const allVideos = await storage.getVideos();
      const video = allVideos.find((v) => v.id === videoId);
      if (video?.creatorId && video.creatorId !== userId) {
        await storage.createNotification({
          userId: video.creatorId,
          type: "comment",
          title: "New comment",
          message: `Someone commented on "${video.title}"`,
          relatedId: videoId,
        });
      }
      res.json(comment);
    } catch (err) {
      res.status(500).json({ message: "Failed to add comment" });
    }
  });
  app.get("/api/videos/:id/comment-count", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId))
        return res.status(400).json({ message: "Invalid ID" });
      const count = await storage.getCommentCount(videoId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch comment count" });
    }
  });
  // === PROFILE EDITING ===
  app.patch("/api/profile", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const schema = z.object({
        displayName: z.string().max(100).optional(),
        bio: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Invalid input" });
      const updated = await storage.updateUserProfile(userId, parsed.data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });
  // === COLLECTIONS ===
  app.get("/api/collections", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const userCollections = await storage.getCollections(userId);
      const result = await Promise.all(
        userCollections.map(async (c) => ({
          ...c,
          videoCount: await storage.getCollectionVideoCount(c.id),
        })),
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });
  app.post("/api/collections", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const schema = z.object({ name: z.string().min(1).max(100) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Invalid input" });
      const collection = await storage.createCollection({
        userId,
        name: parsed.data.name,
      });
      res.json(collection);
    } catch (err) {
      res.status(500).json({ message: "Failed to create collection" });
    }
  });
  app.delete("/api/collections/:id", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteCollection(id, userId);
      if (!deleted)
        return res.status(404).json({ message: "Collection not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete collection" });
    }
  });
  app.get("/api/collections/:id/videos", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const userCollections = await storage.getCollections(userId);
      if (!userCollections.some((c) => c.id === id))
        return res.status(403).json({ message: "Forbidden" });
      const collectionVids = await storage.getCollectionVideos(id);
      res.json(collectionVids);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch collection videos" });
    }
  });
  app.post("/api/collections/:id/videos", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const userCollections = await storage.getCollections(userId);
      if (!userCollections.some((c) => c.id === id))
        return res.status(403).json({ message: "Forbidden" });
      const schema = z.object({ videoId: z.number() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Invalid input" });
      const cv = await storage.addVideoToCollection(id, parsed.data.videoId);
      res.json(cv);
    } catch (err) {
      res.status(500).json({ message: "Failed to add video to collection" });
    }
  });
  app.delete("/api/collections/:id/videos/:videoId", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const videoId = parseInt(req.params.videoId);
      if (isNaN(id) || isNaN(videoId))
        return res.status(400).json({ message: "Invalid ID" });
      const userCollections = await storage.getCollections(userId);
      if (!userCollections.some((c) => c.id === id))
        return res.status(403).json({ message: "Forbidden" });
      await storage.removeVideoFromCollection(id, videoId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove video" });
    }
  });
  // === RECOMMENDATIONS ===
  app.get("/api/recommendations", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const allVideos = await storage.getVideos();
      if (!userId) {
        const top = allVideos.sort((a, b) => b.views - a.views).slice(0, 12);
        return res.json(top);
      }
      const saved = await storage.getSavedVideos(userId);
      const savedIds = new Set(saved.map((s) => s.videoId));
      const unseen = allVideos.filter((v) => !savedIds.has(v.id));
      const sorted = unseen.sort(
        (a, b) => b.views + b.likes * 3 - (a.views + a.likes * 3),
      );
      res.json(sorted.slice(0, 12));
    } catch (err) {
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });
  // === MARA BRAIN ===
  app.post("/api/admin/mara-brain/run", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const result = await MaraBrainCycle();
      const log = await storage.createBrainLog(result);
      res.json({ message: "Mara Brain cycle completed", result: log });
    } catch (err) {
      console.error("Brain cycle failed:", err);
      res.status(500).json({ message: "Brain cycle failed" });
    }
  });
  app.get("/api/admin/mara-brain/logs", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const logs = await storage.getBrainLogs(20);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch brain logs" });
    }
  });
  app.post("/api/admin/mara-brain/self-post", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user?.isAdmin)
        return res.status(403).json({ message: "Admin only" });
      const post = await generateMarketingPost();
      const video = await storage.createVideo({
        url: post.url,
        type: post.type,
        title: post.title,
        description: post.description,
        creatorId: "mara-ai",
      });
      res.json({ success: true, video });
    } catch (err) {
      res.status(500).json({ message: "Failed to generate marketing post" });
    }
  });
  // === ENHANCED CREATOR ANALYTICS ===
  app.get("/api/creator/analytics/detailed", async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const creatorVids = await storage.getCreatorVideos(userId);
      const totalViews = creatorVids.reduce((sum, v) => sum + v.views, 0);
      const totalLikes = creatorVids.reduce((sum, v) => sum + v.likes, 0);
      const totalComments = (
        await Promise.all(creatorVids.map((v) => storage.getCommentCount(v.id)))
      ).reduce((a, b) => a + b, 0);
      const topVideos = [...creatorVids]
        .sort((a, b) => b.views + b.likes * 2 - (a.views + a.likes * 2))
        .slice(0, 5);
      const engagementRate =
        totalViews > 0
          ? (((totalLikes + totalComments) / totalViews) * 100).toFixed(1)
          : "0.0";
      res.json({
        totalReels: creatorVids.length,
        totalViews,
        totalLikes,
        totalComments,
        engagementRate,
        topVideos,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch detailed analytics" });
    }
  });
  seedDatabase().catch(console.error);
  return httpServer;
}
async function seedDatabase() {
  const existingVideos = await storage.getVideos();
  const yt = (id) => `youtube:${id}`;
  const g = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";
  const t = "https://test-videos.co.uk/vids";
  const defaultVideos = [
    {
      url: yt("dQw4w9WgXcQ"),
      type: "real",
      title: "Rick Astley - Never Gonna Give You Up",
      description: "The classic hit that never gets old",
    },
    {
      url: yt("kJQP7kiw5Fk"),
      type: "real",
      title: "Luis Fonsi - Despacito",
      description: "Most viewed music video of all time",
    },
    {
      url: yt("JGwWNGJdvx8"),
      type: "real",
      title: "Ed Sheeran - Shape of You",
      description: "Chart-topping pop hit",
    },
    {
      url: yt("YQHsXMglC9A"),
      type: "real",
      title: "Adele - Hello",
      description: "Powerful ballad from the other side",
    },
    {
      url: yt("fJ9rUzIMcZQ"),
      type: "real",
      title: "Queen - Bohemian Rhapsody",
      description: "Legendary rock masterpiece",
    },
    {
      url: yt("9bZkp7q19f0"),
      type: "real",
      title: "PSY - Gangnam Style",
      description: "The viral sensation that broke the internet",
    },
    {
      url: yt("CevxZvSJLk8"),
      type: "real",
      title: "Katy Perry - Roar",
      description: "Empowering pop anthem",
    },
    {
      url: yt("OPf0YbXqDm0"),
      type: "real",
      title: "Uptown Funk - Bruno Mars",
      description: "Funk-pop party starter",
    },
    {
      url: yt("RgKAFK5djSk"),
      type: "real",
      title: "See You Again - Wiz Khalifa",
      description: "Emotional tribute song",
    },
    {
      url: yt("e-ORhEE9VVg"),
      type: "real",
      title: "Taylor Swift - Blank Space",
      description: "Pop perfection storytelling",
    },
    {
      url: yt("kXYiU_JCYtU"),
      type: "real",
      title: "Linkin Park - Numb",
      description: "Nu-metal classic anthem",
    },
    {
      url: yt("hLQl3WQQoQ0"),
      type: "real",
      title: "Adele - Someone Like You",
      description: "Heart-wrenching ballad",
    },
    {
      url: yt("60ItHLz5WEA"),
      type: "real",
      title: "Alan Walker - Faded",
      description: "Electronic music masterpiece",
    },
    {
      url: yt("2Vv-BfVoq4g"),
      type: "real",
      title: "Ed Sheeran - Perfect",
      description: "Romantic love song",
    },
    {
      url: yt("pRpeEdMmmQ0"),
      type: "real",
      title: "Shakira - Waka Waka",
      description: "World Cup anthem",
    },
    {
      url: yt("hT_nvWreIhg"),
      type: "real",
      title: "OneRepublic - Counting Stars",
      description: "Indie pop hit",
    },
    {
      url: yt("lp-EO5I60KA"),
      type: "real",
      title: "Ed Sheeran - Thinking Out Loud",
      description: "Beautiful wedding song",
    },
    {
      url: yt("FTQbiNvZqaY"),
      type: "real",
      title: "Toto - Africa",
      description: "Timeless 80s classic",
    },
    {
      url: yt("hTWKbfoikeg"),
      type: "real",
      title: "Nirvana - Smells Like Teen Spirit",
      description: "Grunge revolution anthem",
    },
    {
      url: yt("djV11Xbc914"),
      type: "real",
      title: "a-ha - Take On Me",
      description: "Iconic 80s synth-pop",
    },
    {
      url: yt("fNFzfwLM72c"),
      type: "real",
      title: "Bee Gees - Stayin Alive",
      description: "Disco era classic",
    },
    {
      url: yt("y6120QOlsfU"),
      type: "real",
      title: "Darude - Sandstorm",
      description: "Electronic dance anthem",
    },
    {
      url: yt("L_jWHffIx5E"),
      type: "real",
      title: "Smash Mouth - All Star",
      description: "Feel-good pop rock",
    },
    {
      url: yt("v2AC41dglnM"),
      type: "real",
      title: "AC/DC - Thunderstruck",
      description: "Hard rock energy",
    },
    {
      url: yt("gQlMMD8auMs"),
      type: "real",
      title: "BLACKPINK - Pink Venom",
      description: "K-pop sensation",
    },
    {
      url: yt("oRdxUFDoQe0"),
      type: "real",
      title: "Michael Jackson - Beat It",
      description: "King of Pop classic",
    },
    {
      url: `${g}/ForBiggerBlazes.mp4`,
      type: "AI",
      title: "Blazing Action",
      description: "High-energy action trailer",
    },
    {
      url: `${g}/ForBiggerEscapes.mp4`,
      type: "real",
      title: "Cosmic Escape",
      description: "Space adventure trailer",
    },
    {
      url: `${g}/ForBiggerFun.mp4`,
      type: "real",
      title: "Fun Moments",
      description: "Entertaining moments compilation",
    },
    {
      url: `${g}/ForBiggerJoyrides.mp4`,
      type: "real",
      title: "Joyride Adventures",
      description: "Thrilling joyride experiences",
    },
    {
      url: `${t}/jellyfish/mp4/h264/720/Jellyfish_720_10s_5MB.mp4`,
      type: "real",
      title: "Ocean Jellyfish",
      description: "Mesmerizing jellyfish in deep ocean",
    },
    {
      url: `${t}/sintel/mp4/h264/720/Sintel_720_10s_5MB.mp4`,
      type: "AI",
      title: "Dragon Quest",
      description: "Fantasy dragon-slaying adventure",
    },
  ];
  const existingUrls = new Set(existingVideos.map((v) => v.url));
  let added = 0;
  for (const v of defaultVideos) {
    if (!existingUrls.has(v.url)) {
      await storage.createVideo(v);
      added++;
    }
  }
  if (added > 0)
    console.log(
      `Database seeded with ${added} new videos (total: ${existingVideos.length + added}).`,
    );
}
