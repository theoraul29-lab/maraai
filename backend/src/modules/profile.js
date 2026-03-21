// Profile module: handles user profile and follow endpoints

let storage; let
  authStorage;
function injectDeps(deps) {
  storage = deps.storage;
  authStorage = deps.authStorage;
}

async function getProfile(req, res) {
  try {
    const profileId = req.params.id;
    const user = await authStorage.getUser(profileId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
}

async function getProfileVideos(req, res) {
  try {
    const profileId = req.params.id;
    const allVideos = await storage.getVideos();
    const creatorVideos = allVideos.filter((v) => v.creatorId === profileId);
    res.json(creatorVideos);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch creator videos' });
  }
}

async function followUser(req, res) {
  try {
    const targetId = req.params.id;
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Login required' });
    }
    const result = await storage.followUser(userId, targetId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to follow user' });
  }
}

module.exports = {
  injectDeps,
  getProfile,
  getProfileVideos,
  followUser,
};
