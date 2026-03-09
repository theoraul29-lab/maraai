import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/hooks/use-language";
export function ThemeCustomizer({ triggerMode = "floating" }) {
  const [isOpen, setIsOpen] = useState(false);
  const { currentTheme, setCurrentTheme, themes } = useTheme();
  const { t } = useLanguage();
  return (
    <>
      {triggerMode === "floating" ? (
        <Button
          size="icon"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 rounded-full w-14 h-14 shadow-glow hover:shadow-glow hover:scale-110 transition-all duration-300"
          data-testid="button-theme-floating"
        >
          <Palette className="w-6 h-6" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-1.5"
          data-testid="button-theme-header"
        >
          <Palette className="w-4 h-4" />
          <span className="hidden sm:inline text-xs font-semibold">
            {t("theme.title")}
          </span>
        </Button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 glass-panel rounded-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-display font-semibold text-lg">
                  {t("theme.title")}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {Object.entries(themes).map(([name, colors]) => (
                  <button
                    key={name}
                    onClick={() => setCurrentTheme(name)}
                    className={`
                      group relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300
                      ${currentTheme === name ? "border-primary shadow-glow" : "border-white/10 hover:border-white/30"}
                    `}
                    style={{ backgroundColor: `hsl(${colors.card})` }}
                    data-testid={`button-theme-${name}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: `hsl(${colors.primary})` }}
                      />
                      <span className="font-medium capitalize text-sm">
                        {name}
                      </span>
                    </div>
                    {currentTheme === name && (
                      <motion.div
                        layoutId="activeTheme"
                        className="absolute inset-0 bg-primary/10 pointer-events-none"
                      />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
