import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User, Crown, Share2, Film, ArrowLeft } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { ShareMenu } from "@/components/ShareMenu";
import { useState } from "react";

interface UserHeaderProps {
  compact?: boolean;
  showBackToHub?: boolean;
  onBackToHub?: () => void;
}

export function UserHeader({
  compact,
  showBackToHub,
  onBackToHub,
}: UserHeaderProps) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [shareOpen, setShareOpen] = useState(false);

  if (!user) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <ThemeCustomizer triggerMode="inline" />
        <LanguageSelector />
        <div className="flex items-center gap-2" data-testid="user-info">
          <Link href={`/profile/${user.id}`}>
            <Avatar className="w-8 h-8 border border-primary/20 cursor-pointer">
              {user.profileImageUrl ? (
                <AvatarImage
                  src={user.profileImageUrl}
                  alt={user.firstName || "User"}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout()}
          className="rounded-full"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 backdrop-blur-xl bg-background/60 border-b border-white/5">
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 lg:px-8 py-3 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3">
          {showBackToHub && onBackToHub ? (
            <button
              onClick={onBackToHub}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
              data-testid="button-back-to-hub"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Hub</span>
            </button>
          ) : null}
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-logo"
          >
            {t("header.logo")}{" "}
            <span className="text-gradient">{t("header.logoHighlight")}</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <ThemeCustomizer triggerMode="inline" />
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setShareOpen(!shareOpen)}
              data-testid="button-share-app"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">
                {t("share.title")}
              </span>
            </Button>
            {shareOpen && (
              <ShareMenu
                url={window.location.origin}
                title="Mara AI - Video & Chat Platform"
                onClose={() => setShareOpen(false)}
              />
            )}
          </div>
          <Link href="/creator">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-primary hover:text-primary/80"
              data-testid="button-creator-studio"
            >
              <Film className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">
                Creator
              </span>
            </Button>
          </Link>
          <Link href="/premium">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-yellow-500 hover:text-yellow-400"
              data-testid="button-premium"
            >
              <Crown className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">
                Premium
              </span>
            </Button>
          </Link>
          <LanguageSelector />
          <div className="flex items-center gap-2" data-testid="user-info">
            <Avatar className="w-8 h-8 border border-primary/20">
              {user.profileImageUrl ? (
                <AvatarImage
                  src={user.profileImageUrl}
                  alt={user.firstName || "User"}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
            <span
              className="text-sm font-medium hidden sm:inline"
              data-testid="text-username"
            >
              {user.firstName || user.email || "User"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            className="rounded-full"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
