import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MediaEditor } from "@/components/MediaEditor";
import {
  Plus,
  Upload,
  Film,
  Trash2,
  Eye,
  Heart,
  ArrowLeft,
  Crown,
  Sparkles,
  Video as VideoIcon,
  LayoutGrid,
  Palette,
  TrendingUp,
} from "lucide-react";
export default function CreatorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showUpload, setShowUpload] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoType, setVideoType] = useState("creator");
  const { data: postStatus } = useQuery({
    queryKey: ["/api/creator/post-status"],
  });
  const { data: myVideos = [], isLoading: videosLoading } = useQuery({
    queryKey: ["/api/creator/my-videos"],
  });
  const postMutation = useMutation({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/creator/post-reel", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Posted!", description: data.message });
      setShowUpload(false);
      setUrl("");
      setTitle("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/creator/my-videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/post-status"] });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (videoId) => {
      await apiRequest("DELETE", `/api/creator/videos/${videoId}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Video removed from feed" });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/my-videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/post-status"] });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim() || !title.trim()) return;
    postMutation.mutate({
      url: url.trim(),
      title: title.trim(),
      description: description.trim(),
      type: videoType,
    });
  };
  const isYoutube = (videoUrl) => videoUrl.startsWith("youtube:");
  const getYoutubeId = (videoUrl) => videoUrl.replace("youtube:", "");
  const isPremium = postStatus?.isPremium ?? false;
  return (
    <div className="min-h-screen bg-red">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <header className="sticky top-0 z-30 bg-red/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button
                className="p-2 rounded-lg hover:bg-muted transition"
                data-testid="link-back-home"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <Film className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-bold">Creator Studio</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isPremium && (
              <span
                className="flex items-center gap-1 text-yellow-500 text-sm font-medium"
                data-testid="text-premium-badge"
              >
                <Crown className="w-4 h-4" /> Creator Pro
              </span>
            )}
            <Link href="/trading">
              <button
                className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500/10 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/20 transition"
                data-testid="link-trading-academy"
              >
                <TrendingUp className="w-4 h-4" />
                Trading
              </button>
            </Link>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
              data-testid="button-new-post"
            >
              <Plus className="w-4 h-4" />
              New Post
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex border-b border-border/50 mt-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-5 py-3 text-sm font-medium transition flex items-center gap-2 ${activeTab === "dashboard" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-dashboard"
          >
            <LayoutGrid className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("editor")}
            className={`px-5 py-3 text-sm font-medium transition flex items-center gap-2 ${activeTab === "editor" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-editor"
          >
            <Palette className="w-4 h-4" />
            Media Editor
            {!isPremium && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                Basic
              </span>
            )}
            {isPremium && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                Full
              </span>
            )}
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === "dashboard" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div
                className="bg-card border border-border/50 rounded-xl p-4"
                data-testid="stat-total-posts"
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <VideoIcon className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">
                    My Reels
                  </span>
                </div>
                <p className="text-2xl font-bold">{myVideos.length}</p>
              </div>
              <div
                className="bg-card border border-border/50 rounded-xl p-4"
                data-testid="stat-total-views"
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Eye className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">
                    Total Views
                  </span>
                </div>
                <p className="text-2xl font-bold">
                  {myVideos.reduce((sum, v) => sum + v.views, 0)}
                </p>
              </div>
              <div
                className="bg-card border border-border/50 rounded-xl p-4"
                data-testid="stat-total-likes"
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Heart className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">
                    Total Likes
                  </span>
                </div>
                <p className="text-2xl font-bold">
                  {myVideos.reduce((sum, v) => sum + v.likes, 0)}
                </p>
              </div>
              <div
                className="bg-card border border-border/50 rounded-xl p-4"
                data-testid="stat-post-count"
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">
                    This Month
                  </span>
                </div>
                <p className="text-2xl font-bold">{postStatus?.used || 0}</p>
              </div>
            </div>

            {/* Premium upsell for editing */}
            {!isPremium && (
              <div
                className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between"
                data-testid="info-editing-tier"
              >
                <div className="flex items-center gap-3">
                  <Palette className="w-5 h-5 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    You have basic editing tools.
                    <Link href="/premium">
                      <span className="text-primary font-medium ml-1 cursor-pointer">
                        Go Premium
                      </span>
                    </Link>{" "}
                    for advanced filters, effects, HD export & premium music.
                  </p>
                </div>
              </div>
            )}

            {/* My Videos Grid */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <LayoutGrid className="w-5 h-5" />
                My Videos
              </h2>
            </div>

            {videosLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[9/16] bg-muted/50 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : myVideos.length === 0 ? (
              <div className="text-center py-20">
                <Film className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No videos yet</h3>
                <p className="text-muted-foreground mb-6">
                  Post your first reel to get started!
                </p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
                  data-testid="button-first-post"
                >
                  <Plus className="w-4 h-4 inline mr-2" />
                  Create First Post
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {myVideos.map((video) => (
                  <div
                    key={video.id}
                    className="group relative bg-card border border-border/50 rounded-xl overflow-hidden"
                    data-testid={`card-video-${video.id}`}
                  >
                    <div className="aspect-[9/16] bg-muted/30 relative">
                      {isYoutube(video.url) ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${getYoutubeId(video.url)}?controls=0&mute=1`}
                          className="w-full h-full"
                          allow="autoplay"
                          title={video.title}
                        />
                      ) : (
                        <video
                          src={video.url}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-sm font-medium truncate">
                          {video.title}
                        </p>
                        <div className="flex items-center gap-3 text-white/70 text-xs mt-1">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {video.views}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {video.likes}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium truncate">
                        {video.title}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {video.views}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {video.likes}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteMutation.mutate(video.id)}
                          className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 transition"
                          data-testid={`button-delete-video-${video.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Features Section */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card border border-border/50 rounded-xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-green-500" />
                  Everyone Gets
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    ✓ Unlimited posting
                  </li>
                  <li className="flex items-center gap-2">
                    ✓ YouTube video embedding
                  </li>
                  <li className="flex items-center gap-2">
                    ✓ Basic photo editor (crop, rotate, flip)
                  </li>
                  <li className="flex items-center gap-2">✓ 5 basic filters</li>
                  <li className="flex items-center gap-2">
                    ✓ Text overlay on photos
                  </li>
                  <li className="flex items-center gap-2">
                    ✓ Free music library (5 tracks)
                  </li>
                  <li className="flex items-center gap-2">
                    ✓ Basic analytics (views, likes)
                  </li>
                  <li className="flex items-center gap-2">
                    ✓ Feed autoplay & fullscreen
                  </li>
                </ul>
              </div>
              <div className="bg-card border border-yellow-500/20 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                  CREATOR PRO
                </div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-500" />
                  100% Editing Access
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    ★ 8 advanced premium filters
                  </li>
                  <li className="flex items-center gap-2">★ Full HD export</li>
                  <li className="flex items-center gap-2">
                    ★ Premium music library
                  </li>
                  <li className="flex items-center gap-2">
                    ★ Professional templates
                  </li>
                  <li className="flex items-center gap-2">
                    ★ Priority in Mara AI feed
                  </li>
                  <li className="flex items-center gap-2">
                    ★ Advanced analytics & export
                  </li>
                  <li className="flex items-center gap-2">
                    ★ Color grading & effects
                  </li>
                  <li className="flex items-center gap-2">
                    ★ Mara AI content suggestions
                  </li>
                </ul>
                <Link href="/premium">
                  <button
                    className="mt-4 w-full px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-400 transition"
                    data-testid="link-go-premium"
                  >
                    Get Creator Pro — €9.00
                  </button>
                </Link>
              </div>
            </div>
          </>
        )}

        {activeTab === "editor" && (
          <div className="max-w-xl mx-auto">
            <div className="bg-card border border-border/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Palette className="w-5 h-5 text-primary" />
                  Media Editor
                </h2>
                {isPremium ? (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Full Access
                  </span>
                ) : (
                  <span className="text-xs bg-muted px-2 py-1 rounded-full">
                    Basic Mode
                  </span>
                )}
              </div>
              <MediaEditor />
            </div>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowUpload(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
            data-testid="modal-upload"
          >
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Post a New Reel
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Video URL *
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="YouTube link or direct video URL"
                  className="w-full px-3 py-2 bg-red border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  data-testid="input-video-url"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports: YouTube, direct MP4/MOV URLs
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your reel a catchy title"
                  className="w-full px-3 py-2 bg-red border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  data-testid="input-video-title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this reel about?"
                  rows={3}
                  className="w-full px-3 py-2 bg-red border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  data-testid="input-video-description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Category
                </label>
                <select
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value)}
                  className="w-full px-3 py-2 bg-red border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="select-video-type"
                >
                  <option value="creator">Creator</option>
                  <option value="trending">Trending</option>
                  <option value="nature">Nature</option>
                  <option value="action">Action</option>
                  <option value="creative">Creative</option>
                  <option value="tech">Tech</option>
                  <option value="fun">Fun</option>
                  <option value="cinematic">Cinematic</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition"
                  data-testid="button-cancel-upload"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    postMutation.isPending || !url.trim() || !title.trim()
                  }
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                  data-testid="button-submit-post"
                >
                  {postMutation.isPending ? "Posting..." : "Post Reel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
