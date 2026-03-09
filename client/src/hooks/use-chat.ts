import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ChatMessage {
  id: number;
  content: string;
  sender: string;
  userId: string | null;
  createdAt: string;
}

export function useChatMessages() {
  return useQuery<ChatMessage[]>({
    queryKey: ["/api/chat"],
    queryFn: async () => {
      const res = await fetch("/api/chat", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chat messages");
      return res.json();
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { message: string }) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ message: "Failed to send message" }));
        throw new Error(err.message || "Failed to send message");
      }
      return res.json() as Promise<{
        message: ChatMessage;
        aiResponse: ChatMessage;
        mood?: string;
        suggestedTheme?: string;
      }>;
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ["/api/chat"] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>([
        "/api/chat",
      ]);

      const optimisticMessage: ChatMessage = {
        id: Date.now(),
        content: newMessage.message,
        sender: "user",
        userId: null,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ChatMessage[]>(["/api/chat"], (old) => {
        return [...(old || []), optimisticMessage];
      });

      return { previousMessages };
    },
    onError: (_err, _newMessage, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/chat"], context.previousMessages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
    },
  });
}
