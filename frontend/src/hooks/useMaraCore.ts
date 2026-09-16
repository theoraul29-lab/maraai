import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MaraMessage {
  role: 'user' | 'mara';
  content: string;
  ts: number;
}

type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;
type VoiceWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

type SttConfig = { url: string; token: string };
type TtsConfig = { url: string; token: string };
export type VoiceStyle = 'male' | 'female';

const VOICE_STYLE_STORAGE_KEY = 'mara_voice_style';

function loadStoredVoiceStyle(): VoiceStyle {
  try {
    return localStorage.getItem(VOICE_STYLE_STORAGE_KEY) === 'female' ? 'female' : 'male';
  } catch {
    return 'male'; // storage quota / privacy mode — fall back to the service's own default
  }
}

function chooseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferred = voices.find((voice) => /female|samantha|zira|aria|susan|google us english/i.test(voice.name));
  return preferred ?? voices[0] ?? null;
}

/**
 * Shared conversational core for Mara: text chat and voice both funnel
 * through the same sendMessage() (and both admin surfaces — the central
 * Nexus Core presence and any other future entry point — share this one
 * hook so a fix only has to happen once).
 *
 * Voice capture prefers Mara's own local STT service (server/stt/stt_server.py,
 * running on the owner's laptop via faster-whisper/CUDA, reached directly from
 * this renderer through a Cloudflare Tunnel) over the browser's built-in Web
 * Speech Recognition. Electron's bundled Chromium ships the Web Speech
 * Recognition *API* but not the network speech service real Chrome has signed
 * credentials for — every recognition attempt there fires a "network" error
 * immediately (confirmed live) — so the local STT path is what makes voice
 * actually work in the desktop app. It also runs the same way in a normal
 * browser tab, so behavior stays identical everywhere. Web Speech is kept
 * only as a fallback for when the laptop/STT service is unreachable.
 *
 * Voice output mirrors the same pattern in reverse: it prefers Mara's own
 * local TTS service (server/stt/tts_server.py, edge-tts neural voices,
 * reached the same way — direct Cloudflare Tunnel fetch, bearer token from
 * an admin-gated config endpoint) over the browser's native
 * window.speechSynthesis, which is what made Mara sound robotic in the
 * first place (OS-level SAPI voices, not neural). The local service
 * auto-selects a native neural voice per language (RO/EN/DE) from the
 * reply text itself. window.speechSynthesis is kept only as a fallback for
 * when the laptop/TTS service is unreachable — Mara should never go silent
 * just because the local service is down.
 *
 * `voiceStyle` ('male' | 'female') picks which of the two native voices the
 * TTS service offers per language (see LANG_VOICE_MAP in tts_server.py).
 * It's a single-admin desktop preference, so it's persisted in
 * localStorage rather than synced server-side, and exposed here so
 * MaraCore.tsx can render a picker.
 */
export function useMaraCore() {
  const [messages, setMessages] = useState<MaraMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [voiceStyle, setVoiceStyleState] = useState<VoiceStyle>(loadStoredVoiceStyle);
  const [recognitionBlocked, setRecognitionBlocked] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttConfigRef = useRef<SttConfig | null>(null);
  const ttsConfigRef = useRef<TtsConfig | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sendingRef = useRef(false);
  const { i18n } = useTranslation();

  // Single-admin desktop preference — persisted locally rather than synced
  // server-side (mirrors how the rest of the app treats this kind of local
  // UI choice). Read once at mount via loadStoredVoiceStyle's useState
  // initializer above; every change is written straight back out here.
  const setVoiceStyle = useCallback((style: VoiceStyle) => {
    setVoiceStyleState(style);
    try {
      localStorage.setItem(VOICE_STYLE_STORAGE_KEY, style);
    } catch {
      // Storage quota / privacy mode — the in-memory choice for this session still applies.
    }
  }, []);

  useEffect(() => {
    // First getVoices() call is often [] and just triggers async loading —
    // warm it here so it's populated by the time speak() needs it.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  }, []);

  // Last-resort fallback: the browser's native OS voice (SAPI/etc.) — this
  // is the robotic voice the local edge-tts service exists to replace. Kept
  // only for when the laptop/TTS service is unreachable, so Mara never goes
  // fully silent.
  const speakWithBrowserVoice = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = chooseVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text: string) => {
    // Stop whatever's currently playing (either path) before starting the
    // next reply — mirrors the old unconditional speechSynthesis.cancel().
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    const ttsConfig = ttsConfigRef.current;
    if (!ttsConfig) {
      speakWithBrowserVoice(text);
      return;
    }

    void (async () => {
      try {
        // credentials must be explicit 'omit' — same cross-origin reasoning
        // as the STT fetch below (frontend/src/csrf.ts's global fetch
        // wrapper defaults every POST to credentials:'include', which this
        // different origin's CORS response doesn't allow).
        const res = await fetch(`${ttsConfig.url}/synthesize`, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ttsConfig.token}` },
          body: JSON.stringify({ text, lang: i18n.language, voiceStyle }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        const cleanup = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        await audio.play();
      } catch {
        // Local TTS unreachable or the request/playback failed — fall back
        // to the browser voice rather than leaving Mara silent.
        speakWithBrowserVoice(text);
      }
    })();
  }, [i18n.language, voiceStyle, speakWithBrowserVoice]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, ts: Date.now() }]);
    try {
      const response = await fetch('/api/admin/mara/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await response.json() as { reply?: string };
      const reply = data.reply ?? 'Mara nu a răspuns.';
      setMessages((prev) => [...prev, { role: 'mara', content: reply, ts: Date.now() }]);
      speak(reply);
    } catch {
      setMessages((prev) => [...prev, { role: 'mara', content: 'Conexiunea cu Mara a eșuat — încearcă din nou.', ts: Date.now() }]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [speak]);

  // Both recognition.onresult and MediaRecorder.onstop are wired up once and
  // always call the latest sendMessage via this ref so neither closes over a
  // stale version.
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // Fetch the local STT service's URL + bearer token once, from an
  // admin-session-gated endpoint — kept out of the static frontend bundle so
  // it isn't a literal, permanently-extractable secret in shipped JS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/mara/stt-config', { credentials: 'include' });
        const data = await res.json() as { configured?: boolean; url?: string; token?: string };
        if (cancelled || !data.configured || !data.url || !data.token) return;
        sttConfigRef.current = { url: data.url, token: data.token };
        setVoiceSupported(true);
      } catch {
        // Local STT unreachable (laptop off, tunnel down) — Web Speech fallback below still applies.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Same idea as the STT config fetch above, for the local TTS service —
  // fetched once from an admin-session-gated endpoint so the bearer token
  // never ends up as a literal in the shipped frontend bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/mara/tts-config', { credentials: 'include' });
        const data = await res.json() as { configured?: boolean; url?: string; token?: string };
        if (cancelled || !data.configured || !data.url || !data.token) return;
        ttsConfigRef.current = { url: data.url, token: data.token };
        setTtsSupported(true);
      } catch {
        // Local TTS unreachable (laptop off, tunnel down) — browser voice fallback in speak() still applies.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const voiceWindow = window as VoiceWindow;
    const RecognitionApi = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!RecognitionApi) return;
    // Local STT (checked above) takes priority; this only becomes the active
    // path if the local service never reports itself configured.
    if (!sttConfigRef.current) setVoiceSupported(true);
    const recognition = new RecognitionApi();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) void sendMessageRef.current(transcript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event?.error === 'network' && !sttConfigRef.current) {
        setRecognitionBlocked(true);
        setStatusNote('Ascultarea nu e disponibilă acum — serviciul vocal local al Marei nu răspunde.');
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return () => { recognition.stop(); recognitionRef.current = null; };
  }, []);

  const transcribeWithLocalStt = useCallback(async (blob: Blob) => {
    const config = sttConfigRef.current;
    if (!config) return;
    setTranscribing(true);
    setStatusNote(null);
    try {
      const form = new FormData();
      form.append('file', blob, 'speech.webm');
      // credentials must be explicit 'omit': the app's global fetch wrapper
      // (frontend/src/csrf.ts) defaults every POST to credentials:'include'
      // + an X-CSRF-Token header for same-origin API calls — sending either
      // to this different origin makes the browser require
      // Access-Control-Allow-Credentials:true on the STT server's preflight
      // response, which it correctly doesn't send (confirmed live: the
      // fetch failed with exactly that CORS error until this was added).
      const res = await fetch(`${config.url}/transcribe`, {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      });
      if (!res.ok) throw new Error(`stt ${res.status}`);
      const data = await res.json() as { text?: string };
      const text = (data.text ?? '').trim();
      if (text) {
        void sendMessageRef.current(text);
      } else {
        setStatusNote('Nu am înțeles nimic — încearcă din nou, mai aproape de microfon.');
      }
    } catch {
      setStatusNote('Transcrierea vocală a eșuat — serviciul local nu a răspuns.');
    } finally {
      setTranscribing(false);
    }
  }, []);

  const startLocalListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) void transcribeWithLocalStt(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatusNote(null);
      setListening(true);
    } catch {
      setStatusNote('Microfonul nu e accesibil — verifică permisiunile aplicației.');
    }
  }, [transcribeWithLocalStt]);

  const toggleListening = useCallback(() => {
    if (sttConfigRef.current) {
      if (listening) {
        mediaRecorderRef.current?.stop();
      } else {
        void startLocalListening();
      }
      return;
    }
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      setRecognitionBlocked(false);
      setStatusNote(null);
      setListening(true);
      recognitionRef.current.start();
    }
  }, [listening, startLocalListening]);

  return {
    messages, sending, listening, transcribing, speaking, voiceSupported, recognitionBlocked, statusNote,
    sendMessage, toggleListening,
    ttsSupported, voiceStyle, setVoiceStyle,
  };
}
