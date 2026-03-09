import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserHeader } from "@/components/UserHeader";
import {
  ArrowLeft,
  FolderPlus,
  Trash2,
  Play,
  ChevronLeft,
  X,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import type { Collection, Video } from "@shared/schema";

export default function Collections() {
  const [selectedCollection, setSelectedCollection] =
    useState<Collection | null>(null);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: collections = [], isLoading } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const { data: collectionVideos = [], isLoading: videosLoading } = useQuery<
    Video[]
  >({
    queryKey: ["/api/collections", selectedCollection?.id, "videos"],
    enabled: !!selectedCollection,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", "/api/collections", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setNewName("");
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      if (selectedCollection) setSelectedCollection(null);
    },
  });

  if (selectedCollection) {
    return (
      <div className="min-h-screen bg-red">
        <UserHeader />
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedCollection(null)}
              data-testid="button-back-collections"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2
              className="text-xl font-bold"
              data-testid="text-collection-name"
            >
              {selectedCollection.name}
            </h2>
          </div>

          {videosLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : collectionVideos.length === 0 ? (
            <p
              className="text-muted-foreground text-center py-12"
              data-testid="text-no-videos"
            >
              No videos in this collection yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collectionVideos.map((video) => (
                <Card
                  key={video.id}
                  className="p-4"
                  data-testid={`card-video-${video.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Play className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p
                        className="font-medium truncate"
                        data-testid={`text-video-title-${video.id}`}
                      >
                        {video.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {video.views} views
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red">
      <UserHeader />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-back-home"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1
              className="text-2xl font-bold"
              data-testid="text-collections-title"
            >
              Collections
            </h1>
          </div>

          <Button
            className="gap-2"
            onClick={() => setShowForm(!showForm)}
            data-testid="button-new-collection"
          >
            {showForm ? (
              <X className="w-4 h-4" />
            ) : (
              <FolderPlus className="w-4 h-4" />
            )}
            {showForm ? "Cancel" : "New Collection"}
          </Button>
        </div>

        {showForm && (
          <Card className="p-4 mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                placeholder="Collection name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    createMutation.mutate(newName);
                  }
                }}
                className="flex-1"
                data-testid="input-collection-name"
              />
              <Button
                onClick={() => createMutation.mutate(newName)}
                disabled={!newName.trim() || createMutation.isPending}
                data-testid="button-create-collection"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : collections.length === 0 ? (
          <p
            className="text-muted-foreground text-center py-12"
            data-testid="text-no-collections"
          >
            No collections yet. Create your first one!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {collections.map((col) => (
              <Card
                key={col.id}
                className="p-4 cursor-pointer hover-elevate"
                onClick={() => setSelectedCollection(col)}
                data-testid={`card-collection-${col.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="font-semibold truncate"
                      data-testid={`text-collection-name-${col.id}`}
                    >
                      {col.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(col.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(col.id);
                    }}
                    data-testid={`button-delete-collection-${col.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
