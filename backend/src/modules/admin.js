// Admin module: handles admin endpoints (stats, users, videos, orders)

let storage;
function injectDeps(deps) {
  storage = deps.storage;
}

async function getStats(req, res) {
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
  } catch {
    res.status(500).json({ message: 'Failed to fetch admin stats' });
  }
}

async function getUsers(req, res) {
  try {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers);
  } catch {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
}

async function getVideos(req, res) {
  try {
    const allVideos = await storage.getVideos();
    res.json(allVideos);
  } catch {
    res.status(500).json({ message: 'Failed to fetch videos' });
  }
}

module.exports = {
  injectDeps,
  getStats,
  getUsers,
  getVideos,
};
