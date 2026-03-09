import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowLeft,
  User,
  UserPlus,
  UserMinus,
  Heart,
  Eye,
  Video,
  Sparkles,
  Play,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { useState, useRef, useCallback } from "react";
function ProfileVideoCard({ video }) {
  const videoRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isAI = video.type.toLowerCase() === "ai";
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    videoRef.current?.play().catch(() => {});
  }, []);
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    videoRef.current?.pause();
  }, []);
  return (
    <div
      className="group relative rounded-md overflow-hidden aspect-[4/5] cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid={`card-profile-video-${video.id}`}
    >
      {!hasError ? (
        <video
          ref={videoRef}
          src={video.url}
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-secondary flex items-center justify-center">
          <div className="text-center p-4 opacity-50">
            <Play className="w-8 h-8 mx-auto mb-1" />
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="absolute inset-0 p-4 flex flex-col justify-between">
        <div className="flex justify-end">
          {isAI && (
            <Badge
              variant="secondary"
              className="bg-primary/20 text-primary border-primary/30 backdrop-blur-md"
            >
              <Sparkles className="w-3 h-3 mr-1" /> AI
            </Badge>
          )}
        </div>

        <div>
          <h3
            className="text-white font-semibold text-sm leading-tight line-clamp-2"
            data-testid={`text-profile-video-title-${video.id}`}
          >
            {video.title}
          </h3>
          <div className="mt-2 flex items-center gap-3 text-white/70 text-xs">
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" /> {video.likes}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> {video.views}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function ProfilePage() {
  const [, params] = useRoute("/profile/:id");
  const profileId = params?.id;
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profile", profileId],
    enabled: !!profileId,
  });
  const { data: creatorVideos, isLoading: videosLoading } = useQuery({
    queryKey: ["/api/profile", profileId, "videos"],
    enabled: !!profileId,
  });
  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/profile/${profileId}/follow`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile", profileId] });
    },
  });
  if (!profileId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("profile.notFound")}</p>
      </div>
    );
  }
  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <User className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-bold mb-2">{t("profile.notFound")}</h2>
          <Link href="/">
            <Button data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" /> {t("profile.back")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  const isOwnProfile = currentUser?.id === profileId;
  const displayName =
    [profile.user.firstName, profile.user.lastName].filter(Boolean).join(" ") ||
    profile.user.email ||
    "User";
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-background/60 border-b border-white/5">
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 lg:px-8 py-3 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <h1
              className="text-lg font-bold tracking-tight"
              data-testid="text-profile-header"
            >
              {displayName}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 md:px-6 lg:px-8 py-8">
        <Card className="p-6 md:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <Avatar className="w-24 h-24 border-2 border-primary/20">
              {profile.user.profileImageUrl ? (
                <AvatarImage
                  src={profile.user.profileImageUrl}
                  alt={displayName}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                <User className="w-10 h-10" />
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 text-center sm:text-left">
              <h2
                className="text-2xl font-bold mb-1"
                data-testid="text-profile-name"
              >
                {displayName}
              </h2>
              {profile.user.email && (
                <p
                  className="text-muted-foreground text-sm mb-4"
                  data-testid="text-profile-email"
                >
                  {profile.user.email}
                </p>
              )}

              <div className="flex items-center justify-center sm:justify-start gap-6 mb-4 flex-wrap">
                <div className="text-center" data-testid="stat-videos">
                  <p className="text-xl font-bold">{profile.videoCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.videos")}
                  </p>
                </div>
                <div className="text-center" data-testid="stat-followers">
                  <p className="text-xl font-bold">{profile.followerCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.followers")}
                  </p>
                </div>
                <div className="text-center" data-testid="stat-following">
                  <p className="text-xl font-bold">{profile.followingCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.following")}
                  </p>
                </div>
                <div className="text-center" data-testid="stat-total-likes">
                  <p className="text-xl font-bold">{profile.totalLikes}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.likes")}
                  </p>
                </div>
                <div className="text-center" data-testid="stat-total-views">
                  <p className="text-xl font-bold">{profile.totalViews}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.views")}
                  </p>
                </div>
              </div>

              {!isOwnProfile && currentUser && (
                <Button
                  variant={profile.isFollowing ? "secondary" : "default"}
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                  data-testid="button-follow"
                >
                  {followMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : profile.isFollowing ? (
                    <UserMinus className="w-4 h-4 mr-2" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  {profile.isFollowing
                    ? t("profile.unfollow")
                    : t("profile.follow")}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="mb-6">
          <h3
            className="text-xl font-bold flex items-center gap-2"
            data-testid="text-videos-heading"
          >
            <Video className="w-5 h-5" /> {t("profile.videos")}
          </h3>
        </div>

        {videosLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : creatorVideos && creatorVideos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {creatorVideos.map((video) => (
              <ProfileVideoCard key={video.id} video={video} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Video className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground" data-testid="text-no-videos">
              {t("profile.noVideos")}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
