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
  // Whether the hands-free conversation loop is engaged — spans multiple
  // listen -> transcribe -> reply -> speak cycles started by one click, as
  // opposed to `listening`, which is only true for the current instant of
  // active recording. See toggleConversation below.
  const [conversationActive, setConversationActiveState] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttConfigRef = useRef<SttConfig | null>(null);
  const ttsConfigRef = useRef<TtsConfig | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sendingRef = useRef(false);
  const { i18n } = useTranslation();

  // Mirrors `conversationActive` synchronously for use inside async
  // callbacks (VAD ticks, recognition events, the post-speak continuation
  // in sendMessage) that would otherwise close over a stale state value.
  const conversationModeRef = useRef(false);
  const setConversationMode = useCallback((active: boolean) => {
    conversationModeRef.current = active;
    setConversationActiveState(active);
  }, []);
  // Lets a "hang up" click force-resolve the Promise a pending speak() call
  // is awaiting, so the conversation loop's `await speak(reply)` doesn't
  // hang forever when playback is stopped manually (pause()/cancel() don't
  // reliably fire 'ended'/'onend' across browsers).
  const speakResolveRef = useRef<(() => void) | null>(null);
  // Forward reference to startListeningAny (defined further down, after
  // startLocalListening) — sendMessage needs to call it once a voice-turn
  // reply finishes speaking, without depending on definition order.
  const startListeningAnyRef = useRef<() => void>(() => {});
  // Set by the VAD/no-speech-timeout path in startLocalListening so its
  // onstop handler knows to skip transcription for a turn where nothing
  // was actually said.
  const noSpeechDetectedRef = useRef(false);

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
  // fully silent. Returns a Promise that resolves once speech finishes, so
  // the conversation loop (see toggleConversation) knows when it's safe to
  // start listening again.
  const speakWithBrowserVoice = useCallback((text: string): Promise<void> => {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = chooseVoice(window.speechSynthesis.getVoices());
      if (voice) utterance.voice = voice;
      utterance.onstart = () => setSpeaking(true);
      const finish = () => {
        setSpeaking(false);
        if (speakResolveRef.current === resolve) speakResolveRef.current = null;
        resolve();
      };
      speakResolveRef.current = resolve;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Returns a Promise that resolves once Mara has finished speaking (via
  // either path) — never rejects, so it's always safe to `await`. `lang`
  // overrides the admin's UI locale when the caller already knows the real
  // spoken/reply language (a voice turn's STT detection) — the UI locale is
  // just a guess otherwise, and a wrong guess is exactly what let Romanian
  // replies get read with the wrong voice.
  const speak = useCallback((text: string, lang?: string): Promise<void> => {
    // Stop whatever's currently playing (either path) before starting the
    // next reply — mirrors the old unconditional speechSynthesis.cancel().
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    const ttsConfig = ttsConfigRef.current;
    if (!ttsConfig) {
      return speakWithBrowserVoice(text);
    }

    return (async () => {
      try {
        // credentials must be explicit 'omit' — same cross-origin reasoning
        // as the STT fetch below (frontend/src/csrf.ts's global fetch
        // wrapper defaults every POST to credentials:'include', which this
        // different origin's CORS response doesn't allow).
        const res = await fetch(`${ttsConfig.url}/synthesize`, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ttsConfig.token}` },
          body: JSON.stringify({ text, lang: lang || i18n.language, voiceStyle }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        await new Promise<void>((resolve) => {
          const cleanup = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
            if (currentAudioRef.current === audio) currentAudioRef.current = null;
            if (speakResolveRef.current === resolve) speakResolveRef.current = null;
            resolve();
          };
          speakResolveRef.current = resolve;
          audio.onended = cleanup;
          audio.onerror = cleanup;
          audio.play().catch(cleanup);
        });
      } catch {
        // Local TTS unreachable or the request/playback failed — fall back
        // to the browser voice rather than leaving Mara silent.
        await speakWithBrowserVoice(text);
      }
    })();
  }, [i18n.language, voiceStyle, speakWithBrowserVoice]);

  const sendMessage = useCallback(async (text: string, opts?: { voiceTurn?: boolean; lang?: string }) => {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, ts: Date.now() }]);
    let reply: string;
    try {
      const response = await fetch('/api/admin/mara/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // `lang` is the language Whisper detected for this turn's audio (see
        // transcribeWithLocalStt) — lets the backend instruct the model to
        // reply in that exact language instead of guessing from the text.
        body: JSON.stringify({ message: trimmed, lang: opts?.lang }),
      });
      const data = await response.json() as { reply?: string };
      reply = data.reply ?? 'Mara nu a răspuns.';
    } catch {
      reply = 'Conexiunea cu Mara a eșuat — încearcă din nou.';
    }
    setMessages((prev) => [...prev, { role: 'mara', content: reply, ts: Date.now() }]);
    sendingRef.current = false;
    setSending(false);

    if (opts?.voiceTurn) {
      // Voice-initiated turn in an active conversation: wait for Mara to
      // actually finish speaking before opening the mic again — otherwise
      // the mic would pick up her own reply. Typed chat below skips this
      // (fire-and-forget) since there's no next listening turn to gate.
      await speak(reply, opts.lang);
      if (conversationModeRef.current) startListeningAnyRef.current();
    } else {
      void speak(reply);
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
      if (transcript) void sendMessageRef.current(transcript, { voiceTurn: true });
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event?.error === 'network' && !sttConfigRef.current) {
        setRecognitionBlocked(true);
        setStatusNote('Ascultarea nu e disponibilă acum — serviciul vocal local al Marei nu răspunde.');
      }
      // Web Speech's own "you didn't say anything" signal — without this,
      // a conversation would get stuck showing itself as active with
      // nothing left to drive it forward (no transcript means sendMessage,
      // and so the next listen, never fires).
      if (event?.error === 'no-speech' && conversationModeRef.current) {
        setConversationMode(false);
        setStatusNote('Nu am detectat nimic — apasă din nou ca să vorbești.');
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
      const data = await res.json() as { text?: string; language?: string };
      const text = (data.text ?? '').trim();
      if (text) {
        // stt_server.py now restricts its own language detection to ro/en/de
        // before transcribing, so `language` here is reliable enough to
        // drive both the chat reply's language and the TTS voice pick.
        void sendMessageRef.current(text, { voiceTurn: true, lang: data.language });
      } else {
        setStatusNote('Nu am înțeles nimic — încearcă din nou, mai aproape de microfon.');
        if (conversationModeRef.current) setConversationMode(false);
      }
    } catch {
      setStatusNote('Transcrierea vocală a eșuat — serviciul local nu a răspuns.');
      if (conversationModeRef.current) setConversationMode(false);
    } finally {
      setTranscribing(false);
    }
  }, [setConversationMode]);

  // Voice-activity detection tuning for the auto-stop-on-silence below.
  // RMS is computed on a -1..1 normalized signal, so background noise
  // typically sits under ~0.02 and actual speech well above it — 0.035
  // leaves margin either way without being so low that quiet rooms falsely
  // trigger "speech detected".
  const VAD_VOICE_RMS_THRESHOLD = 0.035;
  const VAD_SILENCE_STOP_MS = 1200; // pause length that means "done talking"
  const VAD_NO_SPEECH_TIMEOUT_MS = 7000; // nothing said at all — give up this turn
  const VAD_MAX_RECORDING_MS = 25000; // hard safety cap regardless of VAD

  const startLocalListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };

      // Auto-stop the recording once the user pauses, instead of requiring
      // a second click — this is what makes the conversation loop feel
      // hands-free. A basic RMS-amplitude check over the raw mic signal is
      // enough here (no need for a real VAD model): we only need to know
      // "is anyone talking right now", not transcribe anything ourselves.
      let stopVad = () => {};
      try {
        const AudioCtx = window.AudioContext;
        const audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const vadBuffer = new Uint8Array(analyser.fftSize);
        const startedAt = Date.now();
        let lastVoiceAt = 0;
        let hasSpoken = false;

        const vadTimer = setInterval(() => {
          analyser.getByteTimeDomainData(vadBuffer);
          let sumSquares = 0;
          for (let i = 0; i < vadBuffer.length; i++) {
            const normalized = (vadBuffer[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / vadBuffer.length);
          const now = Date.now();
          if (rms > VAD_VOICE_RMS_THRESHOLD) {
            hasSpoken = true;
            lastVoiceAt = now;
          }
          const elapsed = now - startedAt;
          if (hasSpoken && now - lastVoiceAt > VAD_SILENCE_STOP_MS) {
            if (recorder.state === 'recording') recorder.stop();
          } else if (!hasSpoken && elapsed > VAD_NO_SPEECH_TIMEOUT_MS) {
            noSpeechDetectedRef.current = true;
            if (recorder.state === 'recording') recorder.stop();
          } else if (elapsed > VAD_MAX_RECORDING_MS) {
            if (recorder.state === 'recording') recorder.stop();
          }
        }, 150);

        stopVad = () => {
          clearInterval(vadTimer);
          void audioCtx.close().catch(() => {});
        };
      } catch {
        // AudioContext unavailable for some reason — recording still works,
        // it just won't auto-stop on silence (the manual "that's it, send
        // it" click in toggleConversation still covers this case).
      }

      recorder.onstop = () => {
        stopVad();
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        const noSpeech = noSpeechDetectedRef.current;
        noSpeechDetectedRef.current = false;
        if (noSpeech) {
          setStatusNote('Nu am detectat nimic — apasă din nou ca să vorbești.');
          if (conversationModeRef.current) setConversationMode(false);
          return;
        }
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
  }, [transcribeWithLocalStt, setConversationMode]);

  // Starts one listening turn via whichever backend is active — shared by
  // the initial click in toggleConversation and by sendMessage's
  // post-speak continuation of an active conversation.
  const startListeningAny = useCallback(() => {
    if (sttConfigRef.current) {
      void startLocalListening();
      return;
    }
    if (!recognitionRef.current) return;
    setRecognitionBlocked(false);
    setStatusNote(null);
    setListening(true);
    recognitionRef.current.start();
  }, [startLocalListening]);

  useEffect(() => { startListeningAnyRef.current = startListeningAny; }, [startListeningAny]);

  // The orb's single click target. A click's meaning depends on what's
  // happening right now, mirroring a real conversation:
  //  - idle, no conversation yet -> start one (begin listening).
  //  - mid-recording -> "that's it, send it" (same effect VAD firing on
  //    its own has — finishes the turn normally, doesn't abort it).
  //  - Mara mid-reply -> stop her and end the conversation (a "hang up").
  //  - the brief gap between turns -> end the conversation.
  // This is what removes the old "click to start, click again to stop,
  // click again to reply" friction — after the first click a full
  // back-and-forth runs on its own via VAD + the sendMessage/speak chain
  // above, until the user explicitly ends it.
  const toggleConversation = useCallback(() => {
    if (!conversationModeRef.current) {
      setConversationMode(true);
      startListeningAny();
      return;
    }

    if (listening) {
      if (sttConfigRef.current) {
        mediaRecorderRef.current?.stop();
      } else {
        recognitionRef.current?.stop();
      }
      return;
    }

    if (speaking) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setSpeaking(false);
      // pause()/cancel() don't reliably fire 'ended'/onend across browsers
      // — force-resolve so a pending `await speak(...)` in sendMessage
      // doesn't hang.
      speakResolveRef.current?.();
      speakResolveRef.current = null;
    }

    setConversationMode(false);
  }, [listening, speaking, startListeningAny, setConversationMode]);

  return {
    messages, sending, listening, transcribing, speaking, voiceSupported, recognitionBlocked, statusNote,
    sendMessage, toggleConversation, conversationActive,
    ttsSupported, voiceStyle, setVoiceStyle,
  };
}
