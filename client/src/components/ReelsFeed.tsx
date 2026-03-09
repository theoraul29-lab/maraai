import { useRef, useState, useEffect, useCallback } from "react";
import {
  Heart,
  Eye,
  Share2,
  Film,
  Star,
  Sparkles,
  Flame,
  Leaf,
  Zap,
  Palette,
  Cpu,
  PartyPopper,
  LayoutGrid,
  Maximize2,
  ArrowLeft,
  X,
  Bookmark,
  BookmarkCheck,
  Volume2,
  VolumeX,
  MessageCircle,
  Filter,
  TrendingUp,
  GraduationCap,
  Pen,
  Plus,
  Send,
  Loader2,
  Mic,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import {
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MARA_VOICES } from "@/lib/mara-voices";
import { ShareMenu } from "@/components/ShareMenu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface FeedVideo {
  id: number;
  feedId: number;
  url: string;
  type: string;
  title: string;
  description: string | null;
  likes: number;
  views: number;
  category: string;
  categoryLabel: string;
  isMara: boolean;
  isSaved?: boolean;
  isLiked?: boolean;
}

function isYouTube(url: string): boolean {
  return url.startsWith("youtube:");
}

function getYouTubeId(url: string): string {
  return url.replace("youtube:", "");
}

const categoryIcons: Record<string, any> = {
  trending: Flame,
  nature: Leaf,
  action: Zap,
  creative: Palette,
  tech: Cpu,
  fun: PartyPopper,
  cinematic: Film,
  "mara-pick": Star,
};

const categoryColors: Record<string, string> = {
  trending: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  nature: "text-green-400 bg-green-500/20 border-green-500/30",
  action: "text-red-400 bg-red-500/20 border-red-500/30",
  creative: "text-purple-400 bg-purple-500/20 border-purple-500/30",
  tech: "text-cyan-400 bg-cyan-500/20 border-cyan-500/30",
  fun: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  cinematic: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  "mara-pick": "text-primary bg-primary/20 border-primary/30",
};

type InterestFilter =
  | "all"
  | "trading"
  | "education"
  | "creative"
  | "tech"
  | "nature"
  | "trending";

const INTEREST_FILTERS: {
  value: InterestFilter;
  label: string;
  icon: any;
  categories: string[];
}[] = [
  { value: "all", label: "All", icon: Sparkles, categories: [] },
  {
    value: "trading",
    label: "Trading",
    icon: TrendingUp,
    categories: ["trending", "tech", "action"],
  },
  {
    value: "education",
    label: "Education",
    icon: GraduationCap,
    categories: ["tech", "mara-pick"],
  },
  {
    value: "creative",
    label: "Creative",
    icon: Pen,
    categories: ["creative", "cinematic"],
  },
  { value: "tech", label: "Tech", icon: Cpu, categories: ["tech"] },
  { value: "nature", label: "Nature", icon: Leaf, categories: ["nature"] },
  {
    value: "trending",
    label: "Trending",
    icon: Flame,
    categories: ["trending", "fun"],
  },
];

interface ReelCardProps {
  video: FeedVideo;
  onFullscreen: (video: FeedVideo) => void;
}

function ReelCardSkeleton() {
  return (
    <div className="snap-center flex flex-col items-center">
      <div className="relative w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl shadow-black/50">
        <Skeleton style={{ aspectRatio: "9/16" }} className="bg-white/5" />
        <div className="p-3 bg-[#111]">
          <Skeleton className="h-4 bg-white/5 mb-2 w-3/4" />
          <Skeleton className="h-3 bg-white/5 mb-3 w-1/2" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 bg-white/5 w-12" />
            <Skeleton className="h-4 bg-white/5 w-12" />
            <Skeleton className="h-4 bg-white/5 w-12 ml-auto" />
          </div>
          <Skeleton className="h-10 bg-white/5 mt-3 w-full" />
        </div>
      </div>
    </div>
  );
}

function ReelCard({ video, onFullscreen }: ReelCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLiked, setIsLiked] = useState(video.isLiked ?? false);
  const [localLikes, setLocalLikes] = useState(video.likes);
  const [isSaved, setIsSaved] = useState(video.isSaved ?? false);
  const [shareOpen, setShareOpen] = useState(false);
  const [inView, setInView] = useState(false);
  const [hasViewed, setHasViewed] = useState(false);
  const [comment, setComment] = useState("");
  const [maraReply, setMaraReply] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isYT = isYouTube(video.url);
  const ytId = isYT ? getYouTubeId(video.url) : "";

  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(entry.isIntersecting);
      },
      { threshold: 0.75 },
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isYT && videoRef.current) {
      if (inView) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [inView, isYT]);

  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/videos/${video.id}/like`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to like video");
      return res.json();
    },
    onSuccess: (data) => {
      setLocalLikes(data.likes);
      setIsLiked(data.liked);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to like video. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isSaved) {
        await apiRequest("DELETE", `/api/videos/${video.id}/save`);
        return { saved: false };
      }
      const res = await apiRequest("POST", `/api/videos/${video.id}/save`);
      return res.json();
    },
    onSuccess: (data) => {
      setIsSaved(data.saved);
      queryClient.invalidateQueries({ queryKey: ["/api/videos/saved"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save video. Please try again.",
        variant: "destructive",
      });
    },
  });

  const viewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/videos/${video.id}/view`, {
        method: "POST",
        credentials: "include",
      });
      return res.json();
    },
  });

  useEffect(() => {
    if (inView && !hasViewed) {
      viewMutation.mutate();
      setHasViewed(true);
    }
  }, [inView, hasViewed]);

  const handleComment = useCallback(async () => {
    if (!comment.trim() || commentLoading) return;
    const text = comment.trim();
    setComment("");
    setCommentLoading(true);
    try {
      const modRes = await apiRequest("POST", "/api/moderate", { text });
      const modData = await modRes.json();
      if (!modData.safe) {
        setMaraReply(
          "Your comment was flagged. Please keep the discussion respectful.",
        );
        setTimeout(() => setMaraReply(""), 5000);
        setCommentLoading(false);
        return;
      }
      const prompt = `User is watching a video reel titled "${video.title}" (category: ${video.categoryLabel}). They commented: "${text}". Respond briefly as Mara AI - acknowledge their note, give a short relevant insight about the video topic. Keep it under 2 sentences.`;
      const res = await apiRequest("POST", "/api/chat", { message: prompt });
      const data = await res.json();
      setMaraReply(data.response || data.message || "Got it!");
      setTimeout(() => setMaraReply(""), 8000);
    } catch {
      toast({
        title: "Comment Error",
        description: "Failed to send comment. Please try again.",
        variant: "destructive",
      });
      setMaraReply("Note saved!");
      setTimeout(() => setMaraReply(""), 3000);
    } finally {
      setCommentLoading(false);
    }
  }, [comment, commentLoading, video, toast]);

  const CatIcon = categoryIcons[video.category] || Sparkles;
  const catStyle = categoryColors[video.category] || categoryColors.trending;

  const ytSrc = isYT
    ? inView
      ? `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&rel=0&modestbranding=1&playsinline=1`
      : `https://www.youtube.com/embed/${ytId}?autoplay=0&mute=1&controls=0&loop=1&playlist=${ytId}&rel=0&modestbranding=1&playsinline=1`
    : "";

  const handleVideoClick = () => {
    onFullscreen(video);
  };

  return (
    <div
      ref={cardRef}
      className="snap-center flex flex-col items-center"
      data-testid={`reel-video-${video.feedId}`}
    >
      <div className="relative w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl shadow-black/50">
        <div
          className="relative cursor-pointer"
          style={{ aspectRatio: "9/16" }}
          onClick={handleVideoClick}
        >
          {isYT ? (
            <iframe
              key={`yt-${ytId}-${inView ? "play" : "pause"}`}
              src={ytSrc}
              className="absolute inset-0 w-full h-full border-0 pointer-events-none"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              ref={videoRef}
              src={video.url}
              loop
              playsInline
              muted
              preload="metadata"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 pointer-events-none">
            <div
              className={`backdrop-blur-md rounded-full px-2.5 py-1 flex items-center gap-1 text-[11px] border ${catStyle}`}
            >
              <CatIcon className="w-3 h-3" />
              <span className="font-medium">{video.categoryLabel}</span>
            </div>
            {isYT && (
              <div className="bg-red-600/90 backdrop-blur-md rounded-full px-2 py-1 flex items-center gap-1">
                <SiYoutube className="w-3 h-3 text-white" />
              </div>
            )}
            {video.isMara && (
              <div className="bg-primary/80 backdrop-blur-md rounded-full px-2 py-1 flex items-center gap-1">
                <Star className="w-3 h-3 text-white fill-white" />
                <span className="text-white text-[10px] font-bold">MARA</span>
              </div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onFullscreen(video);
            }}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all"
            data-testid={`reel-fullscreen-${video.feedId}`}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <div className="absolute bottom-3 left-0 right-0 px-3 flex justify-center pointer-events-none">
            <span className="text-white/40 text-[10px] bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
              Tap to watch with sound
            </span>
          </div>
        </div>

        <div className="p-3 bg-[#111]">
          <h3
            className="text-white font-semibold text-sm leading-snug mb-1 line-clamp-1"
            data-testid={`reel-title-${video.feedId}`}
          >
            {video.title}
          </h3>
          {video.description && (
            <p className="text-white/50 text-xs line-clamp-1 mb-2">
              {video.description}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => likeMutation.mutate()}
              className={`flex items-center gap-1 text-xs transition-colors ${isLiked ? "text-red-400" : "text-white/50 hover:text-white"}`}
              data-testid={`reel-like-${video.feedId}`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
              <span>{localLikes}</span>
            </button>

            <div className="flex items-center gap-1 text-xs text-white/50">
              <Eye className="w-4 h-4" />
              <span>{video.views}</span>
            </div>

            {user && (
              <button
                onClick={() => saveMutation.mutate()}
                className={`flex items-center gap-1 text-xs transition-colors ${isSaved ? "text-cyan-400" : "text-white/50 hover:text-white"}`}
                data-testid={`reel-save-${video.feedId}`}
              >
                {isSaved ? (
                  <BookmarkCheck className="w-4 h-4 fill-current" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            )}

            <div className="relative ml-auto">
              <button
                onClick={() => setShareOpen(!shareOpen)}
                className={`flex items-center gap-1 text-xs transition-colors ${shareOpen ? "text-primary" : "text-white/50 hover:text-white"}`}
                data-testid={`reel-share-${video.feedId}`}
              >
                <Share2 className="w-4 h-4" />
              </button>
              {shareOpen && (
                <div className="absolute right-0 bottom-8 z-30">
                  <ShareMenu
                    url={
                      isYT
                        ? `https://www.youtube.com/watch?v=${ytId}`
                        : `${window.location.origin}?reel=${video.id}`
                    }
                    title={video.title}
                    onClose={() => setShareOpen(false)}
                  />
                </div>
              )}
            </div>

            {isYT && (
              <a
                href={`https://www.youtube.com/watch?v=${ytId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                data-testid={`reel-youtube-link-${video.feedId}`}
              >
                <SiYoutube className="w-3.5 h-3.5" />
                <span>YouTube</span>
              </a>
            )}
          </div>

          {maraReply && (
            <div className="mt-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
              <p className="text-xs text-white/70 leading-relaxed">
                {maraReply}
              </p>
            </div>
          )}

          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleComment()}
              placeholder="Comment or ask Mara..."
              className="flex-1 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              data-testid={`input-comment-${video.feedId}`}
            />
            <button
              onClick={handleComment}
              disabled={!comment.trim() || commentLoading}
              className="px-2.5 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs hover:bg-cyan-500/30 transition disabled:opacity-30"
              data-testid={`button-comment-${video.feedId}`}
            >
              {commentLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FullscreenView({
  video,
  onClose,
}: {
  video: FeedVideo;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(video.isLiked ?? false);
  const [localLikes, setLocalLikes] = useState(video.likes);
  const [isSaved, setIsSaved] = useState(video.isSaved ?? false);
  const [shareOpen, setShareOpen] = useState(false);
  const [maraNote, setMaraNote] = useState("");
  const [maraResponse, setMaraResponse] = useState("");
  const [showMaraPanel, setShowMaraPanel] = useState(false);
  const [maraLoading, setMaraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();

  const isYT = isYouTube(video.url);
  const ytId = isYT ? getYouTubeId(video.url) : "";

  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/videos/${video.id}/like`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to like video");
      return res.json();
    },
    onSuccess: (data) => {
      setLocalLikes(data.likes);
      setIsLiked(data.liked);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to like video. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isSaved) {
        await apiRequest("DELETE", `/api/videos/${video.id}/save`);
        return { saved: false };
      }
      const res = await apiRequest("POST", `/api/videos/${video.id}/save`, {
        note: maraNote || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setIsSaved(data.saved);
      queryClient.invalidateQueries({ queryKey: ["/api/videos/saved"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save video. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  }, []);

  const askMara = useCallback(async () => {
    if (maraLoading) return;
    setMaraLoading(true);
    try {
      const prompt = maraNote.trim()
        ? `The user is watching a video titled "${video.title}" (category: ${video.categoryLabel}). They ask: "${maraNote}". Give a brief, helpful response about this video topic.`
        : `The user is watching a video titled "${video.title}" (category: ${video.categoryLabel}). ${video.description ? `Description: ${video.description}.` : ""} Give a brief educational context about this video - what they can learn from it and why it's interesting. Keep it under 3 sentences.`;
      const res = await apiRequest("POST", "/api/chat", { message: prompt });
      const data = await res.json();
      setMaraResponse(
        data.response ||
          data.message ||
          "Mara couldn't analyze this video right now.",
      );
      setMaraNote("");
    } catch {
      setMaraResponse("Couldn't connect to Mara right now. Try again later.");
    } finally {
      setMaraLoading(false);
    }
  }, [video, maraNote, maraLoading]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex"
      data-testid="fullscreen-overlay"
    >
      <div className="flex-1 relative flex items-center justify-center">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-[10000] flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors"
          data-testid="button-fullscreen-back"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>

        <div className="absolute top-4 right-4 z-[10000] flex items-center gap-2">
          {!isYT && (
            <button
              onClick={toggleMute}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              data-testid="button-fullscreen-mute"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            data-testid="button-fullscreen-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[10000] flex flex-col gap-4">
          <button
            onClick={() => likeMutation.mutate()}
            className={`w-12 h-12 rounded-full backdrop-blur-md flex flex-col items-center justify-center transition-all ${isLiked ? "bg-red-500/30 text-red-400" : "bg-white/10 text-white/70 hover:text-red-400"}`}
            data-testid="button-fullscreen-like"
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
            <span className="text-[10px] mt-0.5">{localLikes}</span>
          </button>
          {user && (
            <button
              onClick={() => saveMutation.mutate()}
              className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${isSaved ? "bg-cyan-500/30 text-cyan-400" : "bg-white/10 text-white/70 hover:text-cyan-400"}`}
              data-testid="button-fullscreen-save"
            >
              {isSaved ? (
                <BookmarkCheck className="w-5 h-5 fill-current" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>
          )}
          <button
            onClick={() => setShareOpen(!shareOpen)}
            className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${shareOpen ? "bg-primary/30 text-primary" : "bg-white/10 text-white/70 hover:text-white"}`}
            data-testid="button-fullscreen-share"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowMaraPanel(!showMaraPanel)}
            className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${showMaraPanel ? "bg-primary/30 text-primary" : "bg-white/10 text-white/70 hover:text-white"}`}
            data-testid="button-fullscreen-mara"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
          {shareOpen && (
            <div className="absolute right-14 top-24 z-30">
              <ShareMenu
                url={
                  isYT
                    ? `https://www.youtube.com/watch?v=${ytId}`
                    : `${window.location.origin}?reel=${video.id}`
                }
                title={video.title}
                onClose={() => setShareOpen(false)}
              />
            </div>
          )}
        </div>

        <div className="absolute bottom-6 left-6 right-20 z-[10000]">
          <h3 className="text-white font-bold text-xl mb-1">{video.title}</h3>
          {video.description && (
            <p className="text-white/60 text-sm">{video.description}</p>
          )}
          {isYT && (
            <a
              href={`https://www.youtube.com/watch?v=${ytId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-red-400 text-sm hover:text-red-300 transition-colors"
            >
              <SiYoutube className="w-4 h-4" />
              <span>Watch on YouTube</span>
            </a>
          )}
        </div>

        {isYT ? (
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=1&loop=1&playlist=${ytId}&rel=0&modestbranding=1&playsinline=1`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            ref={videoRef}
            src={video.url}
            autoPlay
            controls
            loop
            playsInline
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {showMaraPanel && (
        <div
          className="w-[320px] bg-[#111] border-l border-white/10 flex flex-col"
          data-testid="mara-panel"
        >
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-white font-semibold text-sm">
                Mara AI Context
              </span>
            </div>
            <button
              onClick={() => setShowMaraPanel(false)}
              className="text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-xs text-white/40 mb-1">Now watching:</p>
              <p className="text-sm text-white font-medium">{video.title}</p>
              <p className="text-xs text-white/50 mt-1">
                {video.categoryLabel}
              </p>
            </div>

            {maraResponse && (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-semibold text-cyan-400">
                    Mara says
                  </span>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">
                  {maraResponse}
                </p>
              </div>
            )}

            {!maraResponse && !maraLoading && (
              <button
                onClick={askMara}
                className="w-full py-3 bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition"
                data-testid="button-mara-explain"
              >
                <Sparkles className="w-4 h-4 inline mr-2" />
                Ask Mara to explain this video
              </button>
            )}

            {maraLoading && (
              <div className="flex items-center justify-center py-4">
                <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
                <span className="text-xs text-white/50 ml-2">
                  Mara is thinking...
                </span>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={maraNote}
                onChange={(e) => setMaraNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askMara()}
                placeholder="Ask Mara about this video..."
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                data-testid="input-mara-note"
              />
              <button
                onClick={askMara}
                disabled={maraLoading}
                className="px-3 py-2 bg-cyan-500 text-black rounded-lg text-sm font-medium hover:bg-cyan-400 transition disabled:opacity-50"
                data-testid="button-mara-send"
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReelsFeedProps {
  videos: any[];
  onSwitchToGrid?: () => void;
}

function AddReelModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!url.trim() || !title.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/creator/post-reel", {
        url: url.trim(),
        title: title.trim(),
        type: "creator",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mara-feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      onClose();
    } catch {
      alert("Failed to add reel. Make sure you're logged in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
      data-testid="add-reel-modal"
    >
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-cyan-400" /> Add Reel
          </h3>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white"
            data-testid="button-close-add-reel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">
              Video URL *
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/... or MP4 URL"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              data-testid="input-reel-url"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your reel a title"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              data-testid="input-reel-title"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!url.trim() || !title.trim() || submitting}
            className="w-full py-2.5 bg-cyan-500 text-black rounded-lg font-medium text-sm hover:bg-cyan-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-submit-reel"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {submitting ? "Adding..." : "Add Reel"}
          </button>
        </div>
        <p className="text-[10px] text-white/30 mt-3 text-center">
          Supports YouTube links and direct MP4 URLs
        </p>
      </div>
    </div>
  );
}

export function ReelsFeed({
  videos: _fallbackVideos,
  onSwitchToGrid,
}: ReelsFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<FeedVideo | null>(
    null,
  );
  const [interestFilter, setInterestFilter] = useState<InterestFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddReel, setShowAddReel] = useState(false);
  const [showMaraVoice, setShowMaraVoice] = useState(false);
  const [maraVoiceLoading, setMaraVoiceLoading] = useState(false);
  const [maraQuestion, setMaraQuestion] = useState("");
  const [maraVoice, setMaraVoice] = useState("classic");
  const { user } = useAuth();
  const { t } = useLanguage();
  const maraAudioRef = useRef<HTMLAudioElement | null>(null);

  const VOICES = MARA_VOICES;

  const askMaraVoice = useCallback(
    async (customText?: string) => {
      if (!user || maraVoiceLoading) return;
      setMaraVoiceLoading(true);
      try {
        const question = customText?.trim() || maraQuestion.trim();
        let textToSpeak: string;

        if (question) {
          const chatRes = await apiRequest("POST", "/api/chat", {
            message: `${question} — Answer as Mara AI in 2-3 sentences, keep it natural and engaging.`,
          });
          const chatData = await chatRes.json();
          textToSpeak =
            chatData.response || chatData.message || "I'm here to help!";
        } else {
          const chatRes = await apiRequest("POST", "/api/chat", {
            message:
              "Give a quick, energetic welcome to the Mara AI Reels Feed. Mention that users can scroll through videos, like, save, comment, and ask you questions. Keep it under 3 sentences.",
          });
          const chatData = await chatRes.json();
          textToSpeak =
            chatData.response || chatData.message || "Welcome to Mara Reels!";
        }

        const ttsRes = await apiRequest("POST", "/api/mara-speak", {
          text: textToSpeak,
          voice: maraVoice,
        });
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        if (maraAudioRef.current) {
          maraAudioRef.current.src = url;
          maraAudioRef.current.play();
        } else {
          const audio = new Audio(url);
          maraAudioRef.current = audio;
          audio.play();
        }
        setMaraQuestion("");
      } catch {
        // silently fail
      } finally {
        setMaraVoiceLoading(false);
      }
    },
    [user, maraVoiceLoading, maraQuestion, maraVoice],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["/api/mara-feed"],
      queryFn: async ({ pageParam = 1 }) => {
        const res = await fetch(`/api/mara-feed?page=${pageParam}&limit=10`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch feed");
        return res.json();
      },
      getNextPageParam: (lastPage: any) => {
        if (lastPage.hasMore) return lastPage.page + 1;
        return undefined;
      },
      initialPageParam: 1,
    });

  const allVideos: FeedVideo[] = data?.pages?.flatMap((p: any) => p.feed) || [];

  const filteredVideos =
    interestFilter === "all"
      ? allVideos
      : allVideos.filter((v) => {
          const filterDef = INTEREST_FILTERS.find(
            (f) => f.value === interestFilter,
          );
          return filterDef?.categories.includes(v.category);
        });

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-black/95">
        <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <SiYoutube className="w-5 h-5 text-red-500" />
            <h2 className="text-white font-bold text-lg">Mara Reels</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar">
          {[...Array(3)].map((_, i) => (
            <ReelCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (allVideos.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center">
          <Film className="w-12 h-12 text-primary/50 mx-auto mb-3 animate-pulse" />
          <p className="text-white/50 text-sm">No reels available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black/95">
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <SiYoutube className="w-5 h-5 text-red-500" />
            <h2 className="text-white font-bold text-lg">Mara Reels</h2>
            <span className="text-white/30 text-xs">
              {filteredVideos.length} loaded
            </span>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <button
                onClick={() => setShowMaraVoice(!showMaraVoice)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${showMaraVoice ? "bg-purple-500/20 text-purple-400" : "bg-white/5 text-white/60 hover:text-white"}`}
                data-testid="button-ask-mara"
              >
                <Mic className="w-3.5 h-3.5" />
                Ask Mara
              </button>
            )}
            {user && (
              <button
                onClick={() => setShowAddReel(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition"
                data-testid="button-add-reel"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Reel
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${showFilters ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-white/60 hover:text-white"}`}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-3.5 h-3.5" />
              {interestFilter !== "all" && (
                <span className="font-medium">
                  {
                    INTEREST_FILTERS.find((f) => f.value === interestFilter)
                      ?.label
                  }
                </span>
              )}
            </button>
            {onSwitchToGrid && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSwitchToGrid}
                className="text-white/60 hover:text-white rounded-lg"
                data-testid="button-view-grid"
              >
                <LayoutGrid className="w-4 h-4 mr-1.5" />
                {t("feed.viewMode.grid")}
              </Button>
            )}
          </div>
        </div>

        {showMaraVoice && user && (
          <div
            className="px-4 pb-3 border-b border-white/5"
            data-testid="mara-voice-panel"
          >
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              {VOICES.map((v) => (
                <button
                  key={v.value}
                  onClick={() => setMaraVoice(v.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    maraVoice === v.value
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                      : "bg-white/5 text-white/50 border border-white/10 hover:text-white"
                  }`}
                  data-testid={`button-voice-${v.value}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={maraQuestion}
                onChange={(e) => setMaraQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    askMaraVoice();
                  }
                }}
                placeholder="Ask Mara AI anything... (or leave empty for a welcome)"
                rows={2}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
                data-testid="input-mara-question"
              />
              <button
                onClick={() => askMaraVoice()}
                disabled={maraVoiceLoading}
                className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-500/30 transition disabled:opacity-50 flex items-center gap-1.5 self-end"
                data-testid="button-mara-speak"
              >
                {maraVoiceLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                Speak
              </button>
            </div>
          </div>
        )}

        {showFilters && (
          <div
            className="px-4 pb-3 flex gap-2 overflow-x-auto"
            data-testid="interest-filters"
          >
            {INTEREST_FILTERS.map((f) => {
              const Icon = f.icon;
              const isActive = interestFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => {
                    setInterestFilter(f.value);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "bg-white/5 text-white/50 border border-white/10 hover:text-white hover:bg-white/10"
                  }`}
                  data-testid={`button-filter-${f.value}`}
                >
                  <Icon className="w-3 h-3" />
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar"
        style={{ scrollSnapType: "y proximity" }}
        data-testid="reels-container"
      >
        {filteredVideos.map((video) => (
          <ReelCard
            key={`feed-${video.feedId}`}
            video={video}
            onFullscreen={setFullscreenVideo}
          />
        ))}

        <div ref={sentinelRef} className="h-4" />

        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Film className="w-6 h-6 text-primary/50 mx-auto mb-2 animate-spin" />
              <p className="text-white/40 text-xs">Loading more reels...</p>
            </div>
          </div>
        )}

        {filteredVideos.length === 0 && allVideos.length > 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Filter className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-white/40 text-sm">No reels match this filter</p>
            <button
              onClick={() => setInterestFilter("all")}
              className="mt-3 text-cyan-400 text-sm hover:underline"
              data-testid="button-clear-filter"
            >
              Show all reels
            </button>
          </div>
        )}
      </div>

      {fullscreenVideo && (
        <FullscreenView
          video={fullscreenVideo}
          onClose={() => setFullscreenVideo(null)}
        />
      )}

      {showAddReel && <AddReelModal onClose={() => setShowAddReel(false)} />}
    </div>
  );
}
