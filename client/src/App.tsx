import { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Landing from "@/pages/landing";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import Premium from "@/pages/premium";
import Creator from "@/pages/creator";
import Trading from "@/pages/trading";
import Writers from "@/pages/writers";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import {
  LanguageContext,
  useLanguageProvider,
  useLanguage,
} from "@/hooks/use-language";
import { FloatingChat } from "@/components/FloatingChat";

type RuntimeInfo = {
  apiBaseUrl: string | null;
  boundPort: number | null;
};

function Router() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">
            {t("app.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/profile/:id" component={Profile} />
        <Route path="/premium" component={Premium} />
        <Route path="/creator" component={Creator} />
        <Route path="/trading" component={Trading} />
        <Route path="/writers" component={Writers} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
      <FloatingChat />
    </>
  );
}

function AppInner() {
  const languageValue = useLanguageProvider();
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadRuntimeInfo() {
      try {
        const response = await fetch("/api/runtime", { credentials: "include" });
        if (!response.ok) return;

        const data = (await response.json()) as RuntimeInfo;
        if (!mounted) return;
        setRuntimeInfo(data);

        if (data.apiBaseUrl) {
          console.info(`[MaraAI] Backend runtime detected at ${data.apiBaseUrl}`);
        }
      } catch {
        // Runtime endpoint is optional in some local setups.
      }
    }

    loadRuntimeInfo();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <LanguageContext.Provider value={languageValue}>
      <TooltipProvider>
        <Toaster />
        {runtimeInfo?.apiBaseUrl && (
          <div className="fixed bottom-3 right-3 z-50 rounded-md border border-border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            API: {runtimeInfo.apiBaseUrl}
          </div>
        )}
        <Router />
      </TooltipProvider>
    </LanguageContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
