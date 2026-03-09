import { Button } from "@/components/ui/button";
import { Bot, Sparkles, Video, Users, Shield, Mic } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

export default function Landing() {
  const { t } = useLanguage();
  const { authMode, login, register, isAuthActionPending } = useAuth();
  const [formMode, setFormMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const features = [
    {
      icon: Bot,
      title: t("landing.feature.aiCompanion"),
      desc: t("landing.feature.aiCompanionDesc"),
    },
    {
      icon: Video,
      title: t("landing.feature.videoFeed"),
      desc: t("landing.feature.videoFeedDesc"),
    },
    {
      icon: Users,
      title: t("landing.feature.creatorSystem"),
      desc: t("landing.feature.creatorSystemDesc"),
    },
    {
      icon: Mic,
      title: t("landing.feature.voiceAi"),
      desc: t("landing.feature.voiceAiDesc"),
    },
    {
      icon: Shield,
      title: t("landing.feature.secure"),
      desc: t("landing.feature.secureDesc"),
    },
    {
      icon: Sparkles,
      title: t("landing.feature.personalized"),
      desc: t("landing.feature.personalizedDesc"),
    },
  ];

  async function submitLocalAuth() {
    setAuthError(null);
    try {
      if (formMode === "login") {
        await login({ email, password });
      } else {
        await register({ email, password, firstName, lastName });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      setAuthError(message.replace(/^\d+:\s*/, ""));
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[20%] w-[30%] h-[30%] bg-accent/15 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />

      <div className="absolute top-4 right-4 z-20">
        <LanguageSelector />
      </div>

      <div className="z-10 text-center max-w-2xl mx-auto px-6">
        <div className="w-20 h-20 bg-gradient-to-tr from-primary to-accent rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-primary/25">
          <Bot className="w-10 h-10 text-white" />
        </div>

        <h1
          className="text-5xl md:text-7xl font-bold tracking-tight mb-4"
          data-testid="text-title"
        >
          {t("landing.title.name")}{" "}
          <span className="text-gradient">{t("landing.title.ai")}</span>
        </h1>
        <p
          className="text-xl text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed"
          data-testid="text-subtitle"
        >
          {t("landing.subtitle")}
        </p>

        {authMode === "local" ? (
          <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-card/70 p-5 backdrop-blur">
            <div className="mb-4 flex rounded-lg bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setFormMode("login")}
                className={`flex-1 rounded-md px-3 py-2 text-sm ${formMode === "login" ? "bg-white text-black" : "text-white/70"}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setFormMode("register")}
                className={`flex-1 rounded-md px-3 py-2 text-sm ${formMode === "register" ? "bg-white text-black" : "text-white/70"}`}
              >
                Create account
              </button>
            </div>

            {formMode === "register" && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm"
                />
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="space-y-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                type="password"
                className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm"
              />
            </div>

            {authError && (
              <p className="mt-3 text-sm text-red-300" data-testid="text-auth-error">
                {authError}
              </p>
            )}

            <Button
              size="lg"
              onClick={submitLocalAuth}
              disabled={isAuthActionPending}
              className="mt-4 h-12 w-full rounded-xl text-base"
              data-testid="button-login"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {formMode === "login" ? "Login" : "Create account"}
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={() => (window.location.href = "/api/login")}
            className="rounded-xl h-14 px-10 text-lg shadow-lg shadow-primary/25"
            data-testid="button-login"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            {t("landing.getStarted")}
          </Button>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-16 text-left">
          {features.map((feature, i) => (
            <div key={i} className="glass-card p-5 rounded-xl">
              <feature.icon className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
              <p className="text-xs text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
