import { useEffect } from "react";

export function useUserMemory(event, data) {
  useEffect(() => {
    if (!event) return;
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
  }, [event, data]);
}
