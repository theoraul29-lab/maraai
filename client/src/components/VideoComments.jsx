import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
function getRelativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
export function VideoComments({ videoId, isOpen, onClose }) {
  const [content, setContent] = useState("");
  const scrollRef = useRef(null);
  const queryClient = useQueryClient();
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["/api/videos", videoId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${videoId}/comments`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: isOpen ? 10000 : false,
  });
  const postMutation = useMutation({
    mutationFn: async (text) => {
      const res = await apiRequest("POST", `/api/videos/${videoId}/comments`, {
        content: text,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/videos", videoId, "comments"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/videos", videoId, "comment-count"],
      });
    },
  });
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);
  const handleSend = () => {
    const text = content.trim();
    if (!text || postMutation.isPending) return;
    setContent("");
    postMutation.mutate(text);
  };
  if (!isOpen) return null;
  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-[60vh] bg-card rounded-t-2xl z-50 flex flex-col shadow-2xl"
      data-testid="video-comments-panel"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <span
            className="text-sm font-semibold"
            data-testid="comments-count-header"
          >
            {comments.length} Comments
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-close-comments"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-3"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">
              Loading comments...
            </span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">
              No comments yet. Be the first!
            </span>
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="flex gap-2"
              data-testid={`comment-item-${c.id}`}
            >
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {c.userId.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-semibold"
                    data-testid={`comment-user-${c.id}`}
                  >
                    {c.userId.length > 12
                      ? c.userId.slice(0, 12) + "..."
                      : c.userId}
                  </span>
                  <span
                    className="text-[10px] text-muted-foreground"
                    data-testid={`comment-time-${c.id}`}
                  >
                    {getRelativeTime(c.createdAt)}
                  </span>
                </div>
                <p
                  className="text-sm text-foreground/80 break-words"
                  data-testid={`comment-content-${c.id}`}
                >
                  {c.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Add a comment..."
          className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="input-video-comment"
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || postMutation.isPending}
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
          data-testid="button-send-comment"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
export function CommentCount({ videoId }) {
  const { data } = useQuery({
    queryKey: ["/api/videos", videoId, "comment-count"],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${videoId}/comment-count`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch count");
      return res.json();
    },
  });
  return (
    <span
      className="text-[10px] mt-0.5"
      data-testid={`comment-count-${videoId}`}
    >
      {data?.count ?? 0}
    </span>
  );
}
