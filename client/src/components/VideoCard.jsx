import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Heart, Eye, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
export function VideoCard({
  id,
  title,
  url,
  type,
  likes: initialLikes,
  views: initialViews,
  index,
}) {
  const videoRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [localLikes, setLocalLikes] = useState(initialLikes);
  const [localViews, setLocalViews] = useState(initialViews);
  const [isLiked, setIsLiked] = useState(false);
  const [hasViewed, setHasViewed] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const isAI = type.toLowerCase() === "ai";
  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/videos/${id}/like`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to like");
      return res.json();
    },
    onSuccess: (data) => {
      setLocalLikes(data.likes);
      setIsLiked(data.liked);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
  });
  const viewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/videos/${id}/view`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to record view");
      return res.json();
    },
    onSuccess: (data) => {
      setLocalViews(data.views);
    },
  });
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    videoRef.current?.play().catch(() => {});
    if (!hasViewed) {
      setHasViewed(true);
      viewMutation.mutate();
    }
  }, [hasViewed]);
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    videoRef.current?.pause();
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative rounded-2xl overflow-hidden glass-card aspect-[4/5] cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid={`card-video-${id}`}
    >
      {!hasError ? (
        <video
          ref={videoRef}
          src={url}
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-secondary flex items-center justify-center">
          <div className="text-center p-6 opacity-50">
            <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t("video.unavailable")}</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="absolute inset-0 p-5 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="flex gap-2">
            {isAI && (
              <Badge
                variant="secondary"
                className="bg-primary/20 text-primary border-primary/30 backdrop-blur-md"
              >
                <Sparkles className="w-3 h-3 mr-1" /> AI
              </Badge>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              likeMutation.mutate();
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${isLiked ? "bg-red-500/30 text-red-400" : "bg-white/10 text-white/70 hover:text-red-400"}`}
            data-testid={`button-like-${id}`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
          </button>
        </div>

        <motion.div
          animate={{ y: isHovered ? 0 : 5, opacity: isHovered ? 1 : 0.9 }}
          transition={{ duration: 0.2 }}
        >
          <h3
            className="text-white font-bold text-xl leading-tight line-clamp-2 shadow-sm"
            data-testid={`text-video-title-${id}`}
          >
            {title}
          </h3>

          <div className="mt-3 flex items-center gap-4 text-white/70 text-sm">
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" /> {localLikes}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {localViews}
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
