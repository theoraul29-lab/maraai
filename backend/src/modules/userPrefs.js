// User Preferences module: handles user language and preferences endpoints
// Modularized from server/routes.ts

let storage;

function injectDeps(deps) {
  storage = deps.storage;
}

async function getUserLanguage(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.json({ language: "en" });
    const prefs = await storage.getUserPreferences(userId);
    res.json({ language: prefs?.language || "en" });
  } catch {
    res.json({ language: "en" });
  }
}

async function setUserLanguage(req, res) {
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
}

module.exports = {
  injectDeps,
  getUserLanguage,
  setUserLanguage,
};
