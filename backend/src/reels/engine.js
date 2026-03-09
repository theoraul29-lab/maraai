// Modular Reels Engine for MaraAI.
// Handles fetching, generating, and managing video reels (real and AI-generated).

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../../../logs/reels");
const DATA_FILE = path.join(DATA_DIR, "reels.json");

function ensureDataStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

function readStore() {
  ensureDataStore();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(reels) {
  ensureDataStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(reels, null, 2), "utf8");
}

function sanitizeString(value, maxLen = 400) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

function normalizeType(type) {
  const value = sanitizeString(type, 20).toLowerCase();
  if (["ai", "real"].includes(value)) return value;
  return "real";
}

class ReelsEngine {
  constructor() {
    // Use local JSON persistence to avoid data loss between restarts.
    this.reels = readStore();
  }

  // Fetch all reels.
  async getAllReels() {
    this.reels = readStore();
    return [...this.reels].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  // Add a new reel (real or AI-generated).
  async addReel(reel) {
    const url = sanitizeString(reel?.url, 1200);
    if (!url) {
      return { success: false, message: "url is required" };
    }

    const normalized = {
      id: this.reels.length + 1,
      type: normalizeType(reel?.type),
      url,
      title: sanitizeString(reel?.title || "Untitled Reel", 160),
      description: sanitizeString(reel?.description || "", 1200),
      prompt: sanitizeString(reel?.prompt || "", 500),
      createdAt: new Date().toISOString(),
    };

    this.reels.push(normalized);
    writeStore(this.reels);

    return { success: true, reel: normalized };
  }

  // Generate an AI reel.
  async generateAIReel(prompt) {
    const normalizedPrompt = sanitizeString(prompt || "Mara AI reel", 500);
    const aiReel = {
      id: this.reels.length + 1,
      type: "ai",
      prompt: normalizedPrompt,
      title: "AI Generated Reel",
      description: `Generated from prompt: ${normalizedPrompt}`,
      url: "https://example.com/ai-reel.mp4",
      createdAt: new Date().toISOString(),
    };

    this.reels.push(aiReel);
    writeStore(this.reels);

    return aiReel;
  }
}

module.exports = ReelsEngine;
