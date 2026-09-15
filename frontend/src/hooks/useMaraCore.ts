import { useCallback, useEffect, useRef, useState } from 'react';

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
 */
export function useMaraCore() {
  const [messages, setMessages] = useState<MaraMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recognitionBlocked, setRecognitionBlocked] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttConfigRef = useRef<SttConfig | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    // First getVoices() call is often [] and just triggers async loading —
    // warm it here so it's populated by the time speak() needs it.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  }, []);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = chooseVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

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
      const res = await fetch(`${config.url}/transcribe`, {
        method: 'POST',
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

  return { messages, sending, listening, transcribing, speaking, voiceSupported, recognitionBlocked, statusNote, sendMessage, toggleListening };
}
