export const MARA_VOICES = [
  { value: "classic", label: "Classic" },
  { value: "friendly", label: "Friendly" },
  { value: "professor", label: "Professor" },
  { value: "energetic", label: "Energetic" },
  { value: "calm", label: "Calm" },
  { value: "storyteller", label: "Storyteller" },
  { value: "deep", label: "Deep" },
  { value: "bright", label: "Bright" },
  { value: "warm", label: "Warm" },
  { value: "serious", label: "Serious" },
  { value: "playful", label: "Playful" },
  { value: "confident", label: "Confident" },
];
export async function speakWithMara(text, voice) {
  const res = await fetch("/api/mara-speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("TTS failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play();
}
