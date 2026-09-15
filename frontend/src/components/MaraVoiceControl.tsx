import { useEffect, useRef, useState } from 'react';

type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

type VoiceWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

function chooseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((voice) => /female|samantha|zira|aria|susan|google us english/i.test(voice.name));
  return preferred ?? voices[0] ?? null;
}

export function MaraVoiceControl() {
  const recognitionRef = useRef<Recognition | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState('Voice idle');
  const [lastTranscript, setLastTranscript] = useState('');

  useEffect(() => {
    const voiceWindow = window as VoiceWindow;
    const RecognitionApi = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    setSupported(Boolean(RecognitionApi && 'speechSynthesis' in window));
    if (!RecognitionApi) return;
    const recognition = new RecognitionApi();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        setLastTranscript(transcript);
        void sendToMara(transcript);
      }
    };
    recognition.onerror = () => { setListening(false); setStatus('Voice recognition unavailable'); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return () => { recognition.stop(); recognitionRef.current = null; };
  }, []);

  async function sendToMara(text: string) {
    setStatus('Mara is thinking');
    try {
      const response = await fetch('/api/admin/mara/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json() as { reply?: string };
      const reply = data.reply ?? 'Mara did not return a response.';
      const utterance = new SpeechSynthesisUtterance(reply);
      const voice = chooseVoice();
      if (voice) utterance.voice = voice;
      utterance.onstart = () => { setSpeaking(true); setStatus(`Speaking${voice ? ` · ${voice.name}` : ''}`); };
      utterance.onend = () => { setSpeaking(false); setStatus('Voice idle'); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      setStatus('Mara voice request failed');
    }
  }

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) recognitionRef.current.stop();
    else { setStatus('Listening'); setListening(true); recognitionRef.current.start(); }
  }

  return (
    <section className="mcc-panel mcc-panel--wide" aria-label="Mara voice control">
      <div className="mcc-panel-heading"><h2>Voice control</h2><span>{supported ? 'Browser speech runtime' : 'Not supported'}</span></div>
      <div className="mcc-signal"><span>{lastTranscript || status}</span><strong>{speaking ? 'SPEAKING' : listening ? 'LISTENING' : 'IDLE'}</strong></div>
      <button type="button" disabled={!supported} onClick={toggleListening}>{listening ? 'Stop listening' : 'Speak to Mara'}</button>
    </section>
  );
}
