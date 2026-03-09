import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  Mic,
  MicOff,
  Volume2,
} from "lucide-react";
import { MARA_VOICES } from "@/lib/mara-voices";
import { useChatMessages, useSendMessage } from "@/hooks/use-chat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme, type ThemeName } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

function maraColor(text: string): string {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }
  const h = Math.abs(seed % 360);
  const s = 50 + Math.abs((seed >> 8) % 30);
  const l = 40 + Math.abs((seed >> 16) % 20);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

const NIGHT_COLORS = [
  "#0f0f14",
  "#1a1a2a",
  "#1b1b30",
  "#241c2b",
  "#2b1e2b",
  "#2b1a12",
  "#1a2b1a",
];

const DAY_COLORS = [
  "#f3f6ff",
  "#e9f1ff",
  "#f6f0ff",
  "#fff4e8",
  "#eef7ff",
  "#f0fff4",
  "#fef9f0",
];

function isNightTime() {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6;
}

function getAmbientPalette() {
  return isNightTime() ? NIGHT_COLORS : DAY_COLORS;
}

export function ChatInterface() {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<number | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("classic");
  const [ambientBg, setAmbientBg] = useState(getAmbientPalette()[0]);
  const [isNight, setIsNight] = useState(isNightTime());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data: messages, isLoading } = useChatMessages();
  const sendMessage = useSendMessage();
  const { setCurrentTheme } = useTheme();
  const { toast } = useToast();
  const { t } = useLanguage();

  const changeAmbient = useCallback(() => {
    const night = isNightTime();
    setIsNight(night);
    const palette = night ? NIGHT_COLORS : DAY_COLORS;
    const color = palette[Math.floor(Math.random() * palette.length)];
    setAmbientBg(color);
  }, []);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const refocus = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, []);

  useEffect(() => {
    scrollToBottom();
    if (messages && messages.length > 0) {
      changeAmbient();
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [messages, sendMessage.isPending]);

  useEffect(() => {
    if (sendMessage.data?.suggestedTheme) {
      const theme = sendMessage.data.suggestedTheme as ThemeName;
      const validThemes: ThemeName[] = [
        "midnight",
        "emerald",
        "crimson",
        "amethyst",
      ];
      if (validThemes.includes(theme)) {
        setCurrentTheme(theme);
      }
    }
  }, [sendMessage.data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;
    changeAmbient();
    sendMessage.mutate({ message: input });
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100);
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);

        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const res = await fetch("/api/stt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: base64 }),
              credentials: "include",
            });
            const data = await res.json();
            if (data.transcript) {
              sendMessage.mutate({ message: data.transcript });
            }
          } catch {
            toast({
              title: "Failed to transcribe audio",
              variant: "destructive",
            });
          }
        };
        reader.readAsDataURL(blob);
        resolve();
      };
      recorder.stop();
    });
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  const speakLastMaraMessage = async () => {
    if (!messages || messages.length === 0) return;
    const lastMara = [...messages].reverse().find((m) => m.sender === "mara");
    if (!lastMara) return;
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/mara-speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lastMara.content, voice: selectedVoice }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("TTS failed");
      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.play();
    } catch {
      setIsSpeaking(false);
      toast({ title: "Failed to play audio", variant: "destructive" });
    }
  };

  const playTTS = async (text: string, msgId: number) => {
    if (playingMsgId === msgId) {
      setPlayingMsgId(null);
      return;
    }

    setPlayingMsgId(msgId);
    try {
      const res = await fetch("/api/mara-speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: selectedVoice }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("TTS failed");

      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlayingMsgId(null);
        URL.revokeObjectURL(url);
      };
      audio.play();
    } catch {
      setPlayingMsgId(null);
      toast({ title: "Failed to play audio", variant: "destructive" });
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full border-r-0 border-y-0 lg:border-l border-white/5"
      style={{
        backgroundColor: ambientBg,
        transition: "background-color 1s ease",
      }}
    >
      <div
        className={`p-5 border-b flex items-center gap-4 z-10 ${isNight ? "border-white/5 bg-black/20" : "border-black/5 bg-white/20"}`}
      >
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-accent p-[2px]">
            <div className="w-full h-full bg-card rounded-full flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
        </div>
        <div className="flex-1">
          <h2
            className="font-bold text-lg leading-none"
            data-testid="text-chat-title"
          >
            {t("chat.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 flex items-center">
            <Sparkles className="w-3 h-3 mr-1 text-primary" />{" "}
            {t("chat.poweredBy")}
          </p>
        </div>
      </div>

      <ScrollArea
        className="flex-1 p-5 overflow-y-auto"
        viewportRef={scrollRef}
      >
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
            <Bot className="w-12 h-12 text-primary" />
            <p className="text-sm" data-testid="text-chat-empty">
              {t("chat.empty")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("chat.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const isUser = msg.sender === "user";
                const msgColor = maraColor(msg.content);
                return (
                  <motion.div
                    key={msg.id || `temp-${idx}`}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                    data-testid={`chat-message-${msg.id || idx}`}
                  >
                    <Avatar
                      className={`w-8 h-8 border ${isUser ? "border-primary/20 bg-primary/10" : "border-accent/20 bg-accent/10"}`}
                      style={
                        !isUser
                          ? {
                              borderColor: msgColor,
                              boxShadow: `0 0 8px ${msgColor}40`,
                            }
                          : undefined
                      }
                    >
                      <AvatarFallback className="bg-transparent">
                        {isUser ? (
                          <User className="w-4 h-4 text-primary" />
                        ) : (
                          <Bot className="w-4 h-4 text-accent" />
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[75%]`}
                    >
                      <div
                        className={`relative px-4 py-3 rounded-2xl text-[15px] shadow-sm leading-relaxed whitespace-pre-wrap
                          ${
                            isUser
                              ? "bg-cyan-400 text-black rounded-tr-sm"
                              : isNight
                                ? "bg-white/5 backdrop-blur-sm border border-white/10 rounded-tl-sm text-foreground"
                                : "bg-white/25 backdrop-blur-sm border border-black/5 rounded-tl-sm text-gray-800"
                          }
                        `}
                        style={
                          !isUser
                            ? {
                                borderLeft: `3px solid ${msgColor}`,
                                boxShadow: `0 2px 12px ${msgColor}15`,
                              }
                            : undefined
                        }
                      >
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-2 mt-2 px-1">
                        {!isUser && (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: msgColor,
                              boxShadow: `0 0 6px ${msgColor}`,
                            }}
                            title={`Mara's color: ${msgColor}`}
                          />
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {msg.createdAt
                            ? format(new Date(msg.createdAt), "h:mm a")
                            : "Just now"}
                        </span>
                        {!isUser && (
                          <button
                            onClick={() => playTTS(msg.content, msg.id)}
                            className={`text-muted-foreground hover:text-primary transition-colors ${playingMsgId === msg.id ? "text-primary animate-pulse" : ""}`}
                            data-testid={`button-tts-${msg.id}`}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {sendMessage.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <Avatar className="w-8 h-8 border border-accent/20 bg-accent/10">
                  <AvatarFallback className="bg-transparent">
                    <Bot className="w-4 h-4 text-accent" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 px-5 py-4 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </motion.div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t bg-[#222] border-white/5">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant={isRecording ? "destructive" : "ghost"}
              onClick={isRecording ? stopRecording : startRecording}
              className={`rounded-md w-9 h-9 shrink-0 ${isRecording ? "animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-mic"
            >
              {isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isRecording ? "..." : t("chat.placeholder")}
              autoComplete="off"
              className="flex-1 min-w-0 bg-[#333] text-white text-sm rounded-md px-3 py-2.5 border-none outline-none placeholder:text-gray-400"
              disabled={isRecording}
              data-testid="input-chat"
            />
            <Button
              type="submit"
              disabled={!input.trim() || sendMessage.isPending}
              className="bg-cyan-400 text-black hover:bg-cyan-300 rounded-md px-4 py-2.5 text-sm font-medium shrink-0"
              data-testid="button-send"
            >
              {sendMessage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="flex-1 min-w-0 bg-[#444] text-white text-xs rounded-md px-2 py-2 border-none outline-none cursor-pointer"
              data-testid="select-voice"
            >
              {MARA_VOICES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={speakLastMaraMessage}
              disabled={isSpeaking || !messages || messages.length === 0}
              className={`bg-yellow-400 text-black hover:bg-yellow-300 rounded-md px-3 py-2 text-xs font-medium shrink-0 ${isSpeaking ? "animate-pulse" : ""}`}
              data-testid="button-speak"
            >
              <Volume2 className="w-3.5 h-3.5 mr-1" />
              {isSpeaking ? "Speaking..." : "Speak"}
            </Button>
          </div>
        </form>
        <div className="text-center mt-2">
          <p className="text-[10px] text-gray-500">{t("chat.footer")}</p>
        </div>
      </div>
    </div>
  );
}
