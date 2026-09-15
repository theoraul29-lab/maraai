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

function chooseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferred = voices.find((voice) => /female|samantha|zira|aria|susan|google us english/i.test(voice.name));
  return preferred ?? voices[0] ?? null;
}

/**
 * Electron's bundled Chromium ships the Web Speech Recognition API but not
 * the network speech service real Chrome has signed credentials for — every
 * recognition attempt starts, then immediately fires a "network" error, a
 * platform limitation confirmed live, not fixable from app code.
 */
function isElectronRuntime(): boolean {
  return /electron/i.test(navigator.userAgent);
}

/**
 * Shared conversational core for Mara: text chat and voice both funnel
 * through the same sendMessage() (and both admin surfaces — the central
 * Nexus Core presence and any other future entry point — share this one
 * hook so a fix to the voice-loading-race or the Electron STT limitation
 * only has to happen once).
 */
export function useMaraCore() {
  const [messages, setMessages] = useState<MaraMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recognitionBlocked, setRecognitionBlocked] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
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

  // recognition.onresult is wired up once (see effect below); it always
  // calls the latest sendMessage via this ref so it never closes over a
  // stale version.
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  useEffect(() => {
    const voiceWindow = window as VoiceWindow;
    const RecognitionApi = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    setVoiceSupported(Boolean(RecognitionApi && 'speechSynthesis' in window));
    if (!RecognitionApi) return;
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
      if (event?.error === 'network' && isElectronRuntime()) {
        setRecognitionBlocked(true);
        setStatusNote('Ascultarea nu e disponibilă în aplicația desktop (limitare Electron) — deschide hellomara.net/control-center într-un tab Chrome sau Edge pentru control vocal.');
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return () => { recognition.stop(); recognitionRef.current = null; };
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      setRecognitionBlocked(false);
      setStatusNote(null);
      setListening(true);
      recognitionRef.current.start();
    }
  }, [listening]);

  return { messages, sending, listening, speaking, voiceSupported, recognitionBlocked, statusNote, sendMessage, toggleListening };
}
