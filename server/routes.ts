import type { Express } from 'express';
import type { Server } from 'http';
import { storage } from './storage';
import { api } from '../shared/routes';
import { z } from 'zod';
import {
  creatorPostRequestSchema,
  likes as likesTable,
} from '../shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';
import * as videoModule from '../backend/src/modules/video.js';
import * as chatModule from '../backend/src/modules/chat.js';
import * as ttsModule from '../backend/src/modules/tts.js';
import * as sttModule from '../backend/src/modules/stt.js';
import * as userPrefsModule from '../backend/src/modules/userPrefs.js';
import * as adminModule from '../backend/src/modules/admin.js';
import * as feedbackModule from '../backend/src/modules/feedback.js';
import * as profileModule from '../backend/src/modules/profile.js';
import * as ordersModule from '../backend/src/modules/orders.js';
import * as adminOrdersModule from '../backend/src/modules/adminOrders.js';
import * as paymentsModule from '../backend/src/modules/payments.js';
import * as pythonBridgeModule from '../backend/src/modules/pythonBridge.js';
import {
  StripeProvider,
  PayPalProvider,
} from '../backend/src/payments/providers.js';
import {
  getMaraResponse,
  MOOD_TO_THEME,
  analyzeFeedbackPatterns,
  generateImprovementIdeas,
  MaraBrainCycle,
  generateMarketingPost,
} from './ai';
import {
  setupAuth,
  registerAuthRoutes,
} from './replit_integrations/auth/index';
import { authStorage } from './replit_integrations/auth/storage';

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Inject dependencies into modules
  videoModule.injectDeps({
    storage,
    db,
    api,
    z,
      // Middleware: requires a logged-in user; blocks all admin routes from anonymous access.
      const requireAuth = (req: any, res: any, next: any) => {
        const userId = req.user?.claims?.sub || req.user?.uid;
        if (!userId) return res.status(401).json({ message: 'Unauthorized — login required.' });
        return next();
      };

      // Admin guard: requires authentication (extend with role check when user roles are added).
      const requireAdmin = (req: any, res: any, next: any) => {
        const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
        const userEmail: string | undefined = req.user?.email || req.user?.claims?.email;
        const userId: string | undefined = req.user?.claims?.sub || req.user?.uid;
        if (!userId) return res.status(401).json({ message: 'Unauthorized.' });
        if (adminEmails.length > 0 && userEmail && !adminEmails.includes(userEmail)) {
          return res.status(403).json({ message: 'Forbidden — admin access required.' });
        }
        return next();
      };
    creatorPostRequestSchema,
    likesTable,
      app.get('/api/admin/stats', requireAdmin, adminModule.getStats);
      app.get('/api/admin/users', requireAdmin, adminModule.getUsers);
      app.get('/api/admin/videos', requireAdmin, adminModule.getVideos);
    storage,
    api,
      app.get('/api/admin/orders', requireAdmin, adminOrdersModule.getOrders);
      app.post('/api/admin/orders/:id/confirm', requireAdmin, adminOrdersModule.confirmOrder);
      app.post('/api/admin/orders/:id/reject', requireAdmin, adminOrdersModule.rejectOrder);
      classic: 'nova',
      friendly: 'shimmer',
      professor: 'onyx',
      energetic: 'alloy',
      calm: 'nova',
      storyteller: 'shimmer',
      deep: 'onyx',
      bright: 'alloy',
      warm: 'nova',
      serious: 'onyx',
      playful: 'shimmer',
      confident: 'alloy',
    },
    importAudioClient: () => import('./replit_integrations/audio/client'),
  });
  sttModule.injectDeps({
    importAudioClient: () => import('./replit_integrations/audio/client'),
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
  app.post('/api/payments/stripe', paymentsModule.processStripePayment);
  app.post('/api/payments/paypal', paymentsModule.processPayPalPayment);
  // Admin order management endpoints
  app.get('/api/admin/orders', adminOrdersModule.getOrders);
  app.post('/api/admin/orders/:id/confirm', adminOrdersModule.confirmOrder);
  app.post('/api/admin/orders/:id/reject', adminOrdersModule.rejectOrder);
  // Orders, premium, and trading endpoints
  app.get('/api/premium/status', ordersModule.getPremiumStatus);
  app.get('/api/trading/access', ordersModule.getTradingAccess);
  app.post('/api/premium/order', ordersModule.createPremiumOrder);
  // Profile endpoints
  app.get('/api/profile/:id', profileModule.getProfile);
  app.get('/api/profile/:id/videos', profileModule.getProfileVideos);
  app.post('/api/profile/:id/follow', profileModule.followUser);
  // Admin endpoints (add isAdmin check as needed)
  app.get('/api/admin/stats', adminModule.getStats);
  app.get('/api/admin/users', adminModule.getUsers);
  app.get('/api/admin/videos', adminModule.getVideos);

  // Feedback/moderation endpoint
  app.post('/api/moderate', feedbackModule.moderate);

  // Video and feed endpoints
  app.get(api.videos.list.path, videoModule.listVideos);
  app.get('/api/mara-feed', videoModule.maraFeed);
  app.post(api.videos.create.path, videoModule.createVideo);
  app.post('/api/videos/:id/like', videoModule.likeVideo);
  app.post('/api/videos/:id/view', videoModule.viewVideo);
  app.post('/api/videos/:id/save', videoModule.saveVideo);
  app.delete('/api/videos/:id/save', videoModule.unsaveVideo);
  app.get('/api/videos/saved', videoModule.getSavedVideos);
  // Creator endpoints
  app.get('/api/creator/post-status', videoModule.creatorPostStatus);
  app.get('/api/creator/my-videos', videoModule.creatorMyVideos);
  app.post('/api/creator/post-reel', videoModule.creatorPostReel);
  app.get('/api/creator/analytics', videoModule.creatorAnalytics);
  app.delete('/api/creator/videos/:id', videoModule.deleteCreatorVideo);

  // Chat endpoints
  app.get(api.chat.list.path, chatModule.getChatHistory);
  // The POST /api/chat endpoint is now handled by the WebSocket server in index.ts

  // TTS endpoints
  app.post('/api/mara-speak', ttsModule.maraSpeak);
  app.post('/api/tts', ttsModule.tts);

  // STT endpoint
  app.post('/api/stt', sttModule.stt);

  // Python bridge endpoint (Playwright + SQLite + GPT flow)
  app.post('/api/maraai/python-fetch', pythonBridgeModule.fetchWithPython);

  // User preferences endpoints
  app.get('/api/user/language', userPrefsModule.getUserLanguage);
  app.post('/api/user/language', userPrefsModule.setUserLanguage);


  seedDatabase().catch(console.error);
  return httpServer;
}

async function seedDatabase() {
  const existingVideos = await storage.getVideos();
  const yt = (id: string) => `youtube:${id}`;
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
