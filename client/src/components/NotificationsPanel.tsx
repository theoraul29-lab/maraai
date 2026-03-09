import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Heart, UserPlus, MessageCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Notification {
  id: number;
  type: "like" | "follow" | "comment" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "like":
      return (
        <Heart
          className="w-4 h-4 text-red-500"
          data-testid="icon-notification-like"
        />
      );
    case "follow":
      return (
        <UserPlus
          className="w-4 h-4 text-blue-500"
          data-testid="icon-notification-follow"
        />
      );
    case "comment":
      return (
        <MessageCircle
          className="w-4 h-4 text-green-500"
          data-testid="icon-notification-comment"
        />
      );
    default:
      return (
        <Bell
          className="w-4 h-4 text-yellow-500"
          data-testid="icon-notification-system"
        />
      );
  }
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/notifications/read/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={panelRef} data-testid="notifications-panel">
      <Button
        variant="ghost"
        size="icon"
        className="relative rounded-full"
        onClick={() => setOpen(!open)}
        data-testid="button-notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1"
            data-testid="badge-unread-count"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 max-h-96 rounded-md border bg-popover text-popover-foreground shadow-md z-50 flex flex-col"
          data-testid="notifications-dropdown"
        >
          <div className="flex items-center justify-between gap-2 p-3 border-b">
            <span
              className="text-sm font-semibold"
              data-testid="text-notifications-title"
            >
              Notifications
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <Check className="w-3 h-3" />
              Mark all read
            </Button>
          </div>

          <div
            className="overflow-y-auto flex-1"
            data-testid="notifications-list"
          >
            {isLoading ? (
              <div
                className="p-4 text-center text-sm text-muted-foreground"
                data-testid="notifications-loading"
              >
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div
                className="p-4 text-center text-sm text-muted-foreground"
                data-testid="notifications-empty"
              >
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 border-b last:border-b-0 cursor-pointer hover-elevate ${
                    notification.read ? "opacity-60" : "bg-accent/30"
                  }`}
                  onClick={() => {
                    if (!notification.read) {
                      markReadMutation.mutate(notification.id);
                    }
                  }}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="mt-0.5 shrink-0">
                    <NotificationIcon type={notification.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-tight ${notification.read ? "font-normal" : "font-semibold"}`}
                      data-testid={`notification-title-${notification.id}`}
                    >
                      {notification.title}
                    </p>
                    <p
                      className="text-xs text-muted-foreground mt-0.5 truncate"
                      data-testid={`notification-message-${notification.id}`}
                    >
                      {notification.message}
                    </p>
                    <p
                      className="text-[10px] text-muted-foreground mt-1"
                      data-testid={`notification-time-${notification.id}`}
                    >
                      {getRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.read && (
                    <div
                      className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"
                      data-testid={`notification-unread-dot-${notification.id}`}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
