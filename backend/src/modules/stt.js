// STT module: handles speech-to-text endpoints and logic
// Modularized from server/routes.ts

let importAudioClient;

function injectDeps(deps) {
  importAudioClient = deps.importAudioClient;
}

async function stt(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { audio } = req.body;
    if (!audio)
      return res.status(400).json({ message: "Audio data is required" });
    const { speechToText, ensureCompatibleFormat } = await importAudioClient();
    const rawBuffer = Buffer.from(audio, "base64");
    const { buffer: audioBuffer, format } =
      await ensureCompatibleFormat(rawBuffer);
    const transcript = await speechToText(audioBuffer, format);
    res.json({ transcript });
  } catch (err) {
    res.status(500).json({ message: "Failed to transcribe audio" });
  }
}

module.exports = {
  injectDeps,
  stt,
};
