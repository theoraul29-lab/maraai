import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Copy, Check, X, Mail } from "lucide-react";
import {
  SiWhatsapp,
  SiFacebook,
  SiTelegram,
  SiInstagram,
  SiPinterest,
  SiReddit,
  SiTiktok,
} from "react-icons/si";
import { useLanguage } from "@/hooks/use-language";
export function ShareMenu({ url, title, onClose }) {
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const { t } = useLanguage();
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const platforms = [
    {
      name: "Instagram",
      icon: <SiInstagram className="w-5 h-5" />,
      color: "text-pink-500",
      href: `https://www.instagram.com/`,
      action: "open",
    },
    {
      name: "WhatsApp",
      icon: <SiWhatsapp className="w-5 h-5" />,
      color: "text-green-500",
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    },
    {
      name: "Facebook",
      icon: <SiFacebook className="w-5 h-5" />,
      color: "text-blue-500",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: "X",
      icon: (
        <span className="w-5 h-5 font-bold text-sm flex items-center justify-center">
          𝕏
        </span>
      ),
      color: "text-foreground",
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    },
    {
      name: "TikTok",
      icon: <SiTiktok className="w-5 h-5" />,
      color: "text-foreground",
      href: `https://www.tiktok.com/`,
      action: "open",
    },
    {
      name: "Telegram",
      icon: <SiTelegram className="w-5 h-5" />,
      color: "text-sky-500",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    },
    // LinkedIn icon removed due to missing export in react-icons/si
    {
      name: "Pinterest",
      icon: <SiPinterest className="w-5 h-5" />,
      color: "text-red-600",
      href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`,
    },
    {
      name: "Reddit",
      icon: <SiReddit className="w-5 h-5" />,
      color: "text-orange-500",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    },
    {
      name: "Email",
      icon: <Mail className="w-5 h-5" />,
      color: "text-muted-foreground",
      href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`,
    },
  ];
  const handleShare = async (platform) => {
    if (platform.action === "open") {
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
    }
    window.open(platform.href, "_blank", "noopener,noreferrer");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      className="absolute right-0 top-full mt-2 w-72 glass-panel rounded-xl p-4 z-50 shadow-xl border border-white/10"
      data-testid="share-menu"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">{t("share.title")}</h4>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-share-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 mb-3">
        {platforms.map((platform) => (
          <button
            key={platform.name}
            onClick={() => handleShare(platform)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/10 transition-colors"
            data-testid={`button-share-${platform.name.toLowerCase()}`}
          >
            <div className={`${platform.color}`}>{platform.icon}</div>
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
              {platform.name}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={copyLink}
        className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm"
        data-testid="button-copy-link"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-green-500">{t("share.copied")}</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("share.copyLink")}</span>
          </>
        )}
      </button>
    </motion.div>
  );
}
