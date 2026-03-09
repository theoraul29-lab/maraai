import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Video {
  id: number;
  url: string;
  type: string;
  title: string;
  description: string | null;
  creatorId: string | null;
  likes: number;
  views: number;
  createdAt: string;
}

export function useVideos() {
  return useQuery<Video[]>({
    queryKey: ["/api/videos"],
    queryFn: async () => {
      const res = await fetch("/api/videos", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch videos");
      return res.json();
    },
  });
}

export function useCreateVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { url: string; type: string; title: string }) => {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ message: "Failed to create video" }));
        throw new Error(err.message || "Failed to create video");
      }
      return res.json() as Promise<Video>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
  });
}
