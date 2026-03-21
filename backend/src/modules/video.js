// Video module: handles video CRUD, feed, likes, views, saves/bookmarks, and creator posting
// Modularized from server/routes.ts

// Import dependencies (to be injected or required in main app)
let storage; let db; let api; let z; let creatorPostRequestSchema; let likesTable; let
  eq;

function injectDeps(deps) {
  storage = deps.storage;
  db = deps.db;
  api = deps.api;
  z = deps.z;
  creatorPostRequestSchema = deps.creatorPostRequestSchema;
  likesTable = deps.likesTable;
  eq = deps.eq;
}

// Video endpoints
async function listVideos(req, res) {
  try {
    const topic =
      typeof req.query.topic === 'string' ? req.query.topic : undefined;
    const vids = await storage.getVideos(topic);
    res.json(vids);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch videos' });
  }
}

async function maraFeed(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const dbVideos = await storage.getVideos();
    if (dbVideos.length === 0) {
      return res.json({ feed: [], page, hasMore: false, totalAvailable: 0 });
    }
    const categories = [
      { tag: 'trending', label: 'Trending Now' },
      { tag: 'nature', label: 'Nature & Relaxation' },
      { tag: 'action', label: 'Action & Adventure' },
      { tag: 'creative', label: 'Creative & Art' },
      { tag: 'tech', label: 'Tech & Innovation' },
      { tag: 'fun', label: 'Fun & Entertainment' },
      { tag: 'cinematic', label: 'Cinematic Shorts' },
      { tag: 'mara-pick', label: "Mara's Pick" },
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
          isMara: cat.tag === 'mara-pick',
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
    res.status(500).json({ message: 'Failed to generate feed' });
  }
}

async function createVideo(req, res) {
  try {
    const input = api.videos.create.input.parse(req.body);
    const video = await storage.createVideo(input);
    res.status(201).json(video);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    res.status(500).json({ message: 'Failed to create video' });
  }
}

async function likeVideo(req, res) {
  try {
    const videoId = Number(req.params.id);
    const userId = req.user?.claims?.sub || 'anonymous';
    const result = await storage.likeVideo(userId, videoId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to like video' });
  }
}

async function viewVideo(req, res) {
  try {
    const videoId = Number(req.params.id);
    const result = await storage.viewVideo(videoId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to record view' });
  }
}

async function saveVideo(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const videoId = Number(req.params.id);
    const note = req.body?.note || undefined;
    const result = await storage.saveVideo(userId, videoId, note);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save video' });
  }
}

async function unsaveVideo(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const videoId = Number(req.params.id);
    const result = await storage.unsaveVideo(userId, videoId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to unsave video' });
  }
}

async function getSavedVideos(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const saved = await storage.getSavedVideos(userId);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch saved videos' });
  }
}

async function creatorPostStatus(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const status = await storage.canUserPost(userId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: 'Failed to check post status' });
  }
}

async function creatorMyVideos(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const myVideos = await storage.getCreatorVideos(userId);
    res.json(myVideos);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch creator videos' });
  }
}

async function creatorPostReel(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const parsed = creatorPostRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
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
      description: parsed.data.description || '',
      type: parsed.data.type,
      creatorId: userId,
    });
    await storage.recordCreatorPost(userId, video.id);
    res.status(201).json({
      video,
      message: isPremium
        ? 'Posted successfully! Creator Pro — unlimited access.'
        : 'Posted successfully! Your reel is now live on the feed.',
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to post reel' });
  }
}

async function creatorAnalytics(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
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
    res.status(500).json({ message: 'Failed to load analytics' });
  }
}

async function deleteCreatorVideo(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Login required' });
    const videoId = Number(req.params.id);
    const deleted = await storage.deleteCreatorVideo(videoId, userId);
    if (!deleted) return res
      .status(403)
      .json({ message: 'Not authorized or video not found' });
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete video' });
  }
}

module.exports = {
  injectDeps,
  listVideos,
  maraFeed,
  createVideo,
  likeVideo,
  viewVideo,
  saveVideo,
  unsaveVideo,
  getSavedVideos,
  creatorPostStatus,
  creatorMyVideos,
  creatorPostReel,
  creatorAnalytics,
  deleteCreatorVideo,
};
