export { registerAudioRoutes } from "./routes.js";
export {
  openai,
  detectAudioFormat,
  convertToWav,
  ensureCompatibleFormat,
  type AudioFormat,
  voiceChat,
  voiceChatStream,
  textToSpeech,
  textToSpeechStream,
  speechToText,
  speechToTextStream,
} from "./client.js";
