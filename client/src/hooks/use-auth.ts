import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { apiRequest } from "@/lib/queryClient";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  const modeRes = await fetch("/api/auth/mode", { credentials: "include" });
  const mode = modeRes.ok ? ((await modeRes.json()) as { mode: string }).mode : "oauth";

  if (mode === "local") {
    await apiRequest("POST", "/api/auth/logout");
    return;
  }

  window.location.href = "/api/logout";
}

async function fetchAuthMode(): Promise<"local" | "oauth"> {
  const response = await fetch("/api/auth/mode", { credentials: "include" });
  if (!response.ok) return "oauth";
  const data = (await response.json()) as { mode?: "local" | "oauth" };
  return data.mode === "local" ? "local" : "oauth";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: authMode = "oauth" } = useQuery<"local" | "oauth">({
    queryKey: ["/api/auth/mode"],
    queryFn: fetchAuthMode,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", payload);
      return (await res.json()) as User;
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/auth/user"], userData);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) => {
      const res = await apiRequest("POST", "/api/auth/register", payload);
      return (await res.json()) as User;
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/auth/user"], userData);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    authMode,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    isAuthActionPending:
      loginMutation.isPending || registerMutation.isPending || logoutMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
