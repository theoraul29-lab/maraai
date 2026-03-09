import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Send, Loader2, Volume2, Sparkles } from "lucide-react";
import { MARA_VOICES } from "@/lib/mara-voices";
import { useChatMessages, useSendMessage } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useLocation } from "wouter";
export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("classic");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const { toast } = useToast();
  const { t } = useLanguage();
  const [location] = useLocation();
  const { data: messages, isLoading } = useChatMessages();
  const sendMessage = useSendMessage();
  const isHomePage = location === "/";
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;
    sendMessage.mutate({ message: input });
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const speakLastMaraMessage = async () => {
    if (!messages || messages.length === 0) return;
    const lastMara = [...messages]
      .reverse()
      .find((m) => m.sender === "mara" || m.sender === "ai");
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
  if (isHomePage) return null;
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[70vh] bg-[#111] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
            data-testid="floating-chat-panel"
          >
            <div className="flex items-center gap-3 p-3 border-b border-white/10 bg-[#1a1a1a]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-purple-500 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white leading-none">
                  Mara AI
                </h3>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" /> Online
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                data-testid="button-close-floating-chat"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3 space-y-3"
            >
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400/50" />
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60 space-y-2">
                  <Bot className="w-8 h-8 text-cyan-400" />
                  <p className="text-xs text-gray-400">{t("chat.empty")}</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div
                      key={msg.id || `fc-${idx}`}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap
                          ${
                            isUser
                              ? "bg-cyan-400 text-black rounded-tr-sm"
                              : "bg-[#333] text-white rounded-tl-sm"
                          }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}

              {sendMessage.isPending && (
                <div className="flex justify-start">
                  <div className="bg-[#333] px-4 py-3 rounded-xl rounded-tl-sm flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-2 border-t border-white/10 bg-[#1a1a1a] space-y-1.5">
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-1.5"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("chat.placeholder")}
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-[#333] text-white text-sm rounded-md px-3 py-2 border-none outline-none placeholder:text-gray-500"
                  data-testid="input-floating-chat"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || sendMessage.isPending}
                  className="bg-cyan-400 text-black hover:bg-cyan-300 rounded-md px-3 py-2 text-xs font-medium shrink-0 h-8"
                  data-testid="button-floating-send"
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </Button>
              </form>
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="flex-1 min-w-0 bg-[#444] text-white text-[11px] rounded-md px-1.5 py-1.5 border-none outline-none cursor-pointer"
                  data-testid="select-floating-voice"
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
                  className={`bg-yellow-400 text-black hover:bg-yellow-300 rounded-md px-2 py-1.5 text-[11px] font-medium shrink-0 h-7 ${isSpeaking ? "animate-pulse" : ""}`}
                  data-testid="button-floating-speak"
                >
                  <Volume2 className="w-3 h-3 mr-0.5" />
                  {isSpeaking ? "..." : "Speak"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all ${
          isOpen
            ? "bg-[#333] hover:bg-[#444]"
            : "bg-gradient-to-tr from-cyan-400 to-purple-500 hover:from-cyan-300 hover:to-purple-400"
        }`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        data-testid="button-floating-chat"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Bot className="w-6 h-6 text-white" />
        )}
      </motion.button>
    </>
  );
}
