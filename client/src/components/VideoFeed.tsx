import { useVideos, useCreateVideo } from "@/hooks/use-videos";
import { VideoCard } from "./VideoCard";
import { ReelsFeed } from "./ReelsFeed";
import {
  Loader2,
  Video as VideoIcon,
  Sparkles,
  LayoutGrid,
  PlaySquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";

const DEMO_VIDEOS = [
  {
    title: "Neon Cyberpunk City Walk",
    type: "AI",
    url: "https://cdn.coverr.co/videos/coverr-a-person-walking-in-a-neon-lit-city-2745/1080p.mp4",
  },
  {
    title: "Abstract Fluid Dynamics",
    type: "AI",
    url: "https://cdn.coverr.co/videos/coverr-abstract-fluid-colors-mixing-8240/1080p.mp4",
  },
  {
    title: "Cinematic Space Nebula",
    type: "AI",
    url: "https://cdn.coverr.co/videos/coverr-space-nebula-and-stars-4680/1080p.mp4",
  },
  {
    title: "Drone Shot Over Forest",
    type: "real",
    url: "https://cdn.coverr.co/videos/coverr-flying-over-a-beautiful-forest-2736/1080p.mp4",
  },
];

type FilterType = "all" | "AI" | "real";

interface VideoFeedProps {
  viewMode: "grid" | "reels";
  onViewModeChange: (mode: "grid" | "reels") => void;
}

export function VideoFeed({ viewMode, onViewModeChange }: VideoFeedProps) {
  const { data: videos, isLoading, error } = useVideos();
  const createVideo = useCreateVideo();
  const [filter, setFilter] = useState<FilterType>("all");
  const setViewMode = onViewModeChange;
  const { t } = useLanguage();

  const handleSeedVideos = async () => {
    for (const v of DEMO_VIDEOS) {
      await createVideo.mutateAsync(v);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-10 h-10 animate-spin" />
          <p className="font-medium animate-pulse">{t("feed.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8 text-center bg-destructive/10 rounded-2xl border border-destructive/20 mx-4 lg:mx-8 my-8">
        <h3 className="text-xl font-bold text-destructive mb-2">
          {t("feed.error.title")}
        </h3>
        <p className="text-muted-foreground text-sm">{t("feed.error.desc")}</p>
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-3xl text-center max-w-md w-full relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <VideoIcon className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-3">{t("feed.empty.title")}</h2>
          <p className="text-muted-foreground mb-8">{t("feed.empty.desc")}</p>
          <Button
            onClick={handleSeedVideos}
            disabled={createVideo.isPending}
            className="w-full rounded-xl h-12"
            data-testid="button-seed"
          >
            {createVideo.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-5 h-5 mr-2" />
            )}
            {t("feed.seedButton")}
          </Button>
        </div>
      </div>
    );
  }

  const filteredVideos =
    filter === "all"
      ? videos
      : videos.filter((v) => v.type.toLowerCase() === filter.toLowerCase());

  if (viewMode === "reels") {
    return (
      <div className="flex-1 flex flex-col h-full">
        <ReelsFeed
          videos={filteredVideos}
          onSwitchToGrid={() => setViewMode("grid")}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
      <div className="mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1
              className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight flex items-center gap-3"
              data-testid="text-feed-title"
            >
              {t("feed.title")}{" "}
              <span className="text-gradient">{t("feed.titleHighlight")}</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              {t("feed.subtitle")}
            </p>
          </div>
          <div className="flex gap-1 bg-card rounded-lg p-1 border border-white/10">
            <Button
              variant="default"
              size="sm"
              className="rounded-md px-3"
              data-testid="button-view-grid"
            >
              <LayoutGrid className="w-4 h-4 mr-1.5" />{" "}
              {t("feed.viewMode.grid")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("reels")}
              className="rounded-md px-3"
              data-testid="button-view-reels"
            >
              <PlaySquare className="w-4 h-4 mr-1.5" />{" "}
              {t("feed.viewMode.reels")}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap" data-testid="filter-buttons">
          {(["all", "AI", "real"] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter(f)}
              className="rounded-full capitalize"
              data-testid={`button-filter-${f}`}
            >
              {f === "all"
                ? t("feed.filter.all")
                : f === "AI"
                  ? t("feed.filter.ai")
                  : t("feed.filter.real")}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredVideos.map((video, idx) => (
          <VideoCard
            key={video.id}
            id={video.id}
            index={idx}
            title={video.title}
            url={video.url}
            type={video.type}
            likes={video.likes}
            views={video.views}
          />
        ))}
      </div>
    </div>
  );
}
