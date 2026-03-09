import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useSendMessage } from "@/hooks/use-chat";
import { UserHeader } from "@/components/UserHeader";
import { VideoFeed } from "@/components/VideoFeed";
import { ChatInterface } from "@/components/ChatInterface";
import { MaraBar } from "@/components/MaraBar";
import { MARA_VOICES, speakWithMara } from "@/lib/mara-voices";
import { motion } from "framer-motion";
import {
  TrendingUp,
  PlaySquare,
  Film,
  Crown,
  Send,
  Loader2,
  Bot,
  Sparkles,
  ChevronRight,
  LayoutGrid,
  MessageCircle,
  ArrowLeft,
  PenTool,
  Volume2,
  ChevronDown,
} from "lucide-react";
function HubCard({
  title,
  description,
  icon: Icon,
  color,
  href,
  onClick,
  testId,
  children,
}) {
  const content = (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`bg-card/80 backdrop-blur border border-white/5 rounded-2xl p-5 cursor-pointer transition-all hover:border-white/10 hover:shadow-lg hover:shadow-primary/10 group relative overflow-hidden`}
      data-testid={testId}
      onClick={onClick}
    >
      <div
        className={`absolute top-0 right-0 w-32 h-32 ${color} rounded-full blur-[80px] opacity-20 group-hover:opacity-35 transition-opacity duration-500 pointer-events-none`}
      />
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div
          className={`w-11 h-11 rounded-xl ${color.replace("bg-", "bg-")}/15 flex items-center justify-center group-hover:${color.replace("bg-", "bg-")}/25 transition-colors`}
        >
          <Icon
            className={`w-5 h-5 ${color.replace("bg-", "text-")} transition-transform group-hover:scale-110 duration-300`}
          />
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-all duration-300 group-hover:translate-x-1" />
      </div>
      <h3 className="font-semibold text-base mb-1 relative z-10">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed relative z-10">
        {description}
      </p>
      {children}
    </motion.div>
  );
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
function MiniReelsFeed() {
  return (
    <div className="mt-3 flex gap-2 overflow-hidden">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-16 h-24 rounded-lg bg-gradient-to-b from-white/10 to-white/5 flex items-center justify-center text-xs text-muted-foreground shrink-0"
        >
          <PlaySquare className="w-4 h-4" />
        </div>
      ))}
      <div className="w-16 h-24 rounded-lg bg-white/5 flex items-center justify-center text-xs text-muted-foreground shrink-0">
        +
      </div>
    </div>
  );
}
function MaraOutput({ onOpenChat }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("classic");
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const sendMessage = useSendMessage();
  const outputRef = useRef(null);
  const { t } = useLanguage();
  const handleSpeak = async (text, idx) => {
    if (speakingIdx === idx) {
      setSpeakingIdx(null);
      return;
    }
    setSpeakingIdx(idx);
    try {
      await speakWithMara(text, selectedVoice);
    } catch {
      /* ignore */
    }
    setSpeakingIdx(null);
  };
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);
  const handleSend = () => {
    if (!input.trim() || sendMessage.isPending) return;
    const q = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    sendMessage.mutate(
      { message: q },
      {
        onSuccess: (data) => {
          if (data?.aiResponse?.content) {
            setMessages((prev) => [
              ...prev,
              { role: "mara", text: data.aiResponse.content },
            ]);
          }
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            { role: "system", text: "Something went wrong. Try again!" },
          ]);
        },
      },
    );
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card/80 backdrop-blur border border-white/5 rounded-2xl overflow-hidden shadow-lg shadow-primary/5 hover:shadow-primary/10 transition-shadow"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-accent p-[2px]"
          >
            <div className="w-full h-full bg-card rounded-full flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
          </motion.div>
          <span className="text-sm font-semibold">Mara AI</span>
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-green-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowVoicePicker(!showVoicePicker)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition ${showVoicePicker ? "bg-purple-500/20 text-purple-400" : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"}`}
              data-testid="button-hub-voice-picker"
            >
              <Volume2 className="w-3 h-3" />
              {MARA_VOICES.find((v) => v.value === selectedVoice)?.label}
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
            {showVoicePicker && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 top-full mt-1 z-50 bg-card border border-white/10 rounded-xl p-1.5 shadow-xl min-w-[140px] max-h-[240px] overflow-y-auto"
              >
                {MARA_VOICES.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => {
                      setSelectedVoice(v.value);
                      setShowVoicePicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] transition flex items-center gap-1.5 ${selectedVoice === v.value ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                    data-testid={`button-hub-voice-${v.value}`}
                  >
                    <Volume2 className="w-2.5 h-2.5" />
                    {v.label}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
          <button
            onClick={onOpenChat}
            className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1 hover:bg-white/5 px-2 py-1 rounded-lg"
            data-testid="button-open-full-chat"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Full Chat
          </button>
        </div>
      </div>

      <div
        ref={outputRef}
        className="max-h-[200px] overflow-y-auto p-4 space-y-3"
        data-testid="hub-chat-output"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("chat.empty")}
          </p>
        ) : (
          messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`text-sm ${msg.role === "user" ? "text-right" : msg.role === "system" ? "text-center text-yellow-400" : ""}`}
            >
              {msg.role === "user" ? (
                <span className="inline-block bg-cyan-500 text-black px-3 py-2 rounded-xl rounded-tr-sm max-w-[80%] font-medium shadow-sm">
                  {msg.text}
                </span>
              ) : msg.role === "system" ? (
                <span className="text-xs">{msg.text}</span>
              ) : (
                <div className="flex gap-2 group/msg">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary/20 to-accent/20 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-primary/20">
                    <Sparkles className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <span className="inline-block bg-card/60 border border-white/10 text-foreground px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%] text-left shadow-sm">
                      {msg.text}
                    </span>
                    <button
                      onClick={() => handleSpeak(msg.text, i)}
                      className={`ml-2 inline-flex items-center gap-1 text-[10px] transition ${speakingIdx === i ? "text-purple-400 animate-pulse" : "text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-foreground"}`}
                      data-testid={`button-hub-speak-${i}`}
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      <div className="border-t border-white/5 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={t("chat.placeholder")}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-primary/50 transition"
          disabled={sendMessage.isPending}
          data-testid="input-hub-mara"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
          data-testid="button-hub-mara-send"
        >
          {sendMessage.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
export default function Home() {
  const [activeView, setActiveView] = useState("hub");
  const [viewMode, setViewMode] = useState("grid");
  const { user } = useAuth();
  const { t } = useLanguage();
  if (activeView === "reels") {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden relative">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[20%] w-[30%] h-[30%] bg-accent/15 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />

        <div
          className={`flex-1 h-screen z-10 custom-scrollbar relative ${viewMode === "reels" ? "w-full" : "lg:w-[calc(100%-400px)] lg:max-w-[calc(100%-400px)] overflow-y-auto"}`}
        >
          {viewMode !== "reels" ? (
            <UserHeader
              onBackToHub={() => setActiveView("hub")}
              showBackToHub
            />
          ) : (
            <button
              onClick={() => setActiveView("hub")}
              className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur rounded-xl text-sm text-white hover:bg-black/80 transition"
              data-testid="button-back-to-hub-floating"
            >
              <ArrowLeft className="w-4 h-4" />
              Hub
            </button>
          )}
          <VideoFeed viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>

        {viewMode !== "reels" && (
          <aside className="w-full h-[60vh] lg:h-screen lg:w-[400px] xl:w-[450px] shrink-0 shadow-2xl z-20 flex flex-col relative">
            <ChatInterface />
          </aside>
        )}

        <MaraBar />
      </div>
    );
  }
  if (activeView === "chat") {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden relative">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[20%] w-[30%] h-[30%] bg-accent/15 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />

        <div className="flex-1 h-screen z-10 overflow-y-auto">
          <UserHeader onBackToHub={() => setActiveView("hub")} showBackToHub />
          <div className="max-w-3xl mx-auto p-4">
            <ChatInterface />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-red relative overflow-x-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[20%] w-[30%] h-[30%] bg-accent/15 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />

      {/* Hub Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-red/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <div
            className="text-2xl font-bold cursor-pointer select-none shrink-0 animate-mara-pulse flex items-center gap-1"
            data-testid="text-hub-logo"
          >
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="text-gradient">Mara</span>
            <span className="text-cyan-400">AI</span>
            <Sparkles className="w-5 h-5 text-cyan-400" />
          </div>

          <div className="flex-1 max-w-xl">
            <input
              type="text"
              placeholder={t("chat.placeholder")}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition"
              onFocus={() => {
                const el = document.getElementById("hub-chat-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              data-testid="input-hub-search"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <UserHeader compact />
          </div>
        </div>
      </header>

      {/* Hub Cards */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <HubCard
            title="Trading Academy"
            description="Learn crypto, DeFi, NFT with interactive charts!"
            icon={TrendingUp}
            color="bg-cyan-500"
            href="/trading"
            testId="card-trading"
          />

          <HubCard
            title="Reels Feed"
            description="Scroll fun videos in a vertical feed!"
            icon={PlaySquare}
            color="bg-purple-500"
            onClick={() => {
              setViewMode("reels");
              setActiveView("reels");
            }}
            testId="card-reels"
          >
            <MiniReelsFeed />
          </HubCard>

          <HubCard
            title="Creator Dashboard"
            description="Upload, edit videos & slideshows with music!"
            icon={Film}
            color="bg-green-500"
            href="/creator"
            testId="card-creator"
          />

          <HubCard
            title="Writers Hub"
            description="Write stories, poems & books with Mara AI!"
            icon={PenTool}
            color="bg-orange-500"
            href="/writers"
            testId="card-writers"
          />

          <HubCard
            title="Premium Features"
            description="Upgrade for unlimited posting & advanced tools."
            icon={Crown}
            color="bg-yellow-500"
            href="/premium"
            testId="card-premium"
          />

          <HubCard
            title="Chat with Mara"
            description="Talk to Mara AI — voice, text, ambient mood lighting."
            icon={MessageCircle}
            color="bg-pink-500"
            onClick={() => setActiveView("chat")}
            testId="card-chat"
          />

          <HubCard
            title="Video Grid"
            description="Browse all videos in a beautiful grid layout."
            icon={LayoutGrid}
            color="bg-blue-500"
            onClick={() => {
              setViewMode("grid");
              setActiveView("reels");
            }}
            testId="card-video-grid"
          />
        </div>

        {/* Mara Chat Output */}
        <div id="hub-chat-section">
          <MaraOutput onOpenChat={() => setActiveView("chat")} />
        </div>
      </main>

      <MaraBar />
    </div>
  );
}
