import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
export function useVideos() {
  return useQuery({
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
    mutationFn: async (data) => {
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
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
  });
}
