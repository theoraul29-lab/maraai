import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export default function VoiceAI() {
  const { t, i18n } = useTranslation();
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [recording, setRecording] = useState(false);

  // Placeholder for browser speech recognition
  const handleRecord = () => {
    setRecording(true);
    setTranscript("");
    setResponse("");
    // Simulate speech recognition (replace with real API in production)
    setTimeout(() => {
      const fakeTranscript = t("example_voice_input");
      setTranscript(fakeTranscript);
      setRecording(false);
      // Send transcript to backend for AI response
      fetch(
        `${import.meta.env.VITE_API_URL}/api/voiceai?lang=${i18n.language}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: fakeTranscript }),
        },
      )
        .then((res) => res.json())
        .then((data) => setResponse(data.response || "(No response)"));
    }, 2000);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded shadow p-4 mt-6">
      <h2 className="text-lg font-bold mb-2">{t("voice_ai")}</h2>
      <button
        className={`px-4 py-2 rounded ${recording ? "bg-gray-400" : "bg-purple-500 hover:bg-purple-600 text-white"}`}
        onClick={handleRecord}
        disabled={recording}
      >
        {recording ? t("listening") : t("start_recording")}
      </button>
      {transcript && (
        <div className="mt-4">
          <div className="font-semibold">{t("your_input")}</div>
          <div className="bg-gray-100 rounded p-2">{transcript}</div>
        </div>
      )}
      {response && (
        <div className="mt-4">
          <div className="font-semibold">{t("ai_response")}</div>
          <div className="bg-blue-50 rounded p-2">{response}</div>
        </div>
      )}
    </div>
  );
}
