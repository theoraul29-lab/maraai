import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, Sparkles, Loader2, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/hooks/use-chat";
import { useLanguage } from "@/hooks/use-language";
function maraColor(text) {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }
  const h = Math.abs(seed % 360);
  const s = 50 + Math.abs((seed >> 8) % 30);
  const l = 40 + Math.abs((seed >> 16) % 20);
  return `hsl(${h}, ${s}%, ${l}%)`;
}
export function MaraBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lastResponse, setLastResponse] = useState(null);
  const [responseColor, setResponseColor] = useState("");
  const sendMessage = useSendMessage();
  const { t } = useLanguage();
  const inputRef = useRef(null);
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;
    setLastResponse(null);
    sendMessage.mutate(
      { message: input },
      {
        onSuccess: (data) => {
          if (data?.aiResponse?.content) {
            setLastResponse(data.aiResponse.content);
            setResponseColor(maraColor(data.aiResponse.content));
          }
        },
      },
    );
    setInput("");
  };
  const handleClose = () => {
    setIsOpen(false);
    setLastResponse(null);
  };
  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      data-testid="mara-bar-container"
    >
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="mara-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setIsOpen(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-accent shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 transition-transform"
            data-testid="button-mara-open"
          >
            <MessageCircle className="w-6 h-6 text-white" />
          </motion.button>
        ) : (
          <motion.div
            key="mara-panel"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-[340px] max-w-[calc(100vw-3rem)]"
          >
            <div className="glass-panel rounded-2xl border border-white/10 shadow-2xl shadow-black/30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-accent p-[2px]">
                    <div className="w-full h-full bg-card rounded-full flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    Mara
                  </span>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                </div>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                  data-testid="button-mara-close"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <AnimatePresence>
                {lastResponse && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-4 py-3 border-b border-white/5"
                      style={{
                        borderLeft: `3px solid ${responseColor}`,
                        boxShadow: `inset 0 0 20px ${responseColor}08`,
                      }}
                      data-testid="mara-bar-response"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <Sparkles className="w-3 h-3 text-primary" />
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: responseColor,
                              boxShadow: `0 0 6px ${responseColor}`,
                            }}
                          />
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed">
                          {lastResponse}
                        </p>
                      </div>
                      <button
                        onClick={() => setLastResponse(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground mt-1.5 transition-colors"
                        data-testid="button-dismiss-response"
                      >
                        {t("maraBar.dismiss")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 p-3"
                data-testid="mara-bar"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("maraBar.placeholder")}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 py-2.5 px-3 transition-colors"
                  disabled={sendMessage.isPending}
                  data-testid="input-mara-bar"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || sendMessage.isPending}
                  className="rounded-xl w-10 h-10 shrink-0"
                  data-testid="button-mara-bar-send"
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
