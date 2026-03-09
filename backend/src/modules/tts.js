// TTS module: handles text-to-speech endpoints and logic
// Modularized from server/routes.ts

let VOICE_MAP, importAudioClient;

function injectDeps(deps) {
  VOICE_MAP = deps.VOICE_MAP;
  importAudioClient = deps.importAudioClient;
}

async function maraSpeak(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ message: "Text is required" });
    const ttsVoice = VOICE_MAP[voice || "classic"] || "nova";
    const { textToSpeech } = await importAudioClient();
    const audioBuffer = await textToSpeech(text, ttsVoice, "mp3");
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    res.status(500).json({ message: "Failed to generate speech" });
  }
}

async function tts(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Text is required" });
    const { textToSpeech } = await importAudioClient();
    const audioBuffer = await textToSpeech(text, "nova", "mp3");
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    res.status(500).json({ message: "Failed to generate speech" });
  }
}

module.exports = {
  injectDeps,
  maraSpeak,
  tts,
};
