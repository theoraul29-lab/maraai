import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Users,
  Video,
  MessageCircle,
  Heart,
  Trash2,
  ShieldAlert,
  Crown,
  Check,
  X,
} from "lucide-react";
import type { User } from "@shared/models/auth";
import type { Video as VideoType, PremiumOrder } from "@shared/schema";

interface AdminStats {
  totalUsers: number;
  totalVideos: number;
  totalMessages: number;
  totalLikes: number;
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!user,
    retry: false,
  });

  const { data: allUsers, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user && !statsError,
  });

  const { data: allVideos, isLoading: videosLoading } = useQuery<VideoType[]>({
    queryKey: ["/api/admin/videos"],
    enabled: !!user && !statsError,
  });

  const { data: allOrders, isLoading: ordersLoading } = useQuery<
    PremiumOrder[]
  >({
    queryKey: ["/api/admin/orders"],
    enabled: !!user && !statsError,
  });

  const confirmOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest("POST", `/api/admin/orders/${orderId}/confirm`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order confirmed" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const rejectOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest("POST", `/api/admin/orders/${orderId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order rejected" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      await apiRequest("DELETE", `/api/admin/videos/${videoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Video removed" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red">
        <Skeleton className="w-32 h-8" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  if (statsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red">
        <div className="text-center space-y-4">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto" />
          <h2
            className="text-xl font-semibold"
            data-testid="text-admin-forbidden"
          >
            {t("admin.notAdmin")}
          </h2>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            data-testid="button-admin-back-home"
          >
            {t("admin.back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red">
      <header className="sticky top-0 z-50 border-b bg-red/95 backdrop-blur">
        <div className="flex items-center gap-4 p-4 max-w-7xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-admin-back"
          >
            <ArrowLeft />
          </Button>
          <h1 className="text-xl font-semibold" data-testid="text-admin-title">
            {t("admin.title")}
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin.stats.users")}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div
                  className="text-2xl font-bold"
                  data-testid="text-stat-users"
                >
                  {stats?.totalUsers ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin.stats.videos")}
              </CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div
                  className="text-2xl font-bold"
                  data-testid="text-stat-videos"
                >
                  {stats?.totalVideos ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin.stats.messages")}
              </CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div
                  className="text-2xl font-bold"
                  data-testid="text-stat-messages"
                >
                  {stats?.totalMessages ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin.stats.likes")}
              </CardTitle>
              <Heart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div
                  className="text-2xl font-bold"
                  data-testid="text-stat-likes"
                >
                  {stats?.totalLikes ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-admin-users">
              {t("admin.tab.users")}
            </TabsTrigger>
            <TabsTrigger value="videos" data-testid="tab-admin-videos">
              {t("admin.tab.videos")}
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-admin-orders">
              <Crown className="w-3.5 h-3.5 mr-1" />
              {t("admin.tab.orders")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tab.users")}</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : !allUsers || allUsers.length === 0 ? (
                  <p
                    className="text-muted-foreground text-sm"
                    data-testid="text-no-users"
                  >
                    {t("admin.noUsers")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {allUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-3 p-3 rounded-md border"
                        data-testid={`row-user-${u.id}`}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {(
                              u.firstName?.[0] ||
                              u.email?.[0] ||
                              "U"
                            ).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            data-testid={`text-username-${u.id}`}
                          >
                            {u.firstName} {u.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {u.email || u.id}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString()
                            : "N/A"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="videos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tab.videos")}</CardTitle>
              </CardHeader>
              <CardContent>
                {videosLoading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : !allVideos || allVideos.length === 0 ? (
                  <p
                    className="text-muted-foreground text-sm"
                    data-testid="text-no-videos"
                  >
                    {t("admin.noVideos")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {allVideos.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 p-3 rounded-md border"
                        data-testid={`row-video-${v.id}`}
                      >
                        <Video className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            data-testid={`text-video-title-${v.id}`}
                          >
                            {v.title}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {v.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {v.views} {t("profile.views").toLowerCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {v.likes} {t("profile.likes").toLowerCase()}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteVideoMutation.mutate(v.id)}
                          disabled={deleteVideoMutation.isPending}
                          data-testid={`button-delete-video-${v.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-500" />
                  {t("admin.tab.orders")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : !allOrders || allOrders.length === 0 ? (
                  <p
                    className="text-muted-foreground text-sm"
                    data-testid="text-no-orders"
                  >
                    {t("admin.noOrders")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {allOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center gap-3 p-3 rounded-md border"
                        data-testid={`row-order-${order.id}`}
                      >
                        <Crown className="h-5 w-5 text-yellow-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            #{order.id} — {order.userId}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {order.amount} {order.currency}
                            </span>
                            {(order as any).orderType && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${(order as any).orderType === "trading" ? "bg-cyan-500/20 text-cyan-400" : "bg-yellow-500/20 text-yellow-400"}`}
                              >
                                {(order as any).orderType}
                                {(order as any).subscriptionPeriod &&
                                (order as any).subscriptionPeriod !== "once"
                                  ? ` (${(order as any).subscriptionPeriod})`
                                  : ""}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Ref: {order.transferReference || "—"}
                            </span>
                            {order.notes && (
                              <span className="text-xs text-muted-foreground">
                                Note: {order.notes}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString()
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant={
                            order.status === "confirmed"
                              ? "default"
                              : order.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                          className={
                            order.status === "confirmed"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : ""
                          }
                        >
                          {order.status}
                        </Badge>
                        {order.status === "pending" && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                confirmOrderMutation.mutate(order.id)
                              }
                              disabled={confirmOrderMutation.isPending}
                              data-testid={`button-confirm-order-${order.id}`}
                            >
                              <Check className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                rejectOrderMutation.mutate(order.id)
                              }
                              disabled={rejectOrderMutation.isPending}
                              data-testid={`button-reject-order-${order.id}`}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
