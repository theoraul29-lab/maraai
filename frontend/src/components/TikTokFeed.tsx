import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export interface TikTokReel {
  id: number;
  creator: string;
  creatorId?: string | null;
  avatar: string;
  title: string;
  url: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  isLiked: boolean;
  isSaved: boolean;
  music?: string;
  description: string;
  tags: string[];
  duration: string;
  externalPlatform?: string | null;
}

interface Props {
  reels: TikTokReel[];
  onLike: (id: number) => void;
  onSave: (id: number) => void;
  onView: (id: number) => void;
  onComment?: (id: number) => void;
  onShare?: (id: number) => void;
  onFollow?: (creatorId: string) => void;
  followingIds?: Set<string>;
  onLoadMore?: () => void;
  loading?: boolean;
  hasMore?: boolean;
}

function extractYouTubeId(url: string): string {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : '';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

// Post a YouTube IFrame-API command to an embedded player without reloading
// the iframe. Requires the iframe src to include `enablejsapi=1`.
function postYouTubeCommand(
  iframe: HTMLIFrameElement | null,
  func: 'playVideo' | 'pauseVideo' | 'mute' | 'unMute'
) {
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      '*'
    );
  } catch {
    // ignore — player not ready yet
  }
}

// Renders an externally-hosted Spark via the source platform's own
// sanctioned oEmbed widget (blockquote + their embed.js), never a
// downloaded/rehosted copy. embed.js scans the document for unconverted
// `.tiktok-embed` blockquotes and swaps in its own iframe whenever it runs —
// re-appending a fresh <script> on each mount (instead of loading it once
// globally) is what makes that rescan happen for tiles that mount after the
// first one, since a virtualized feed keeps mounting new cards. The browser
// caches the script fetch itself, so this is cheap after the first load.
// If nothing converts the blockquote within a few seconds (slow network, ad
// blocker, embed.js API drift) fall back to a plain outbound link rather
// than leaving a dead tile.
const ExternalEmbed: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    setRendered(false);
    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    document.body.appendChild(script);

    const check = setInterval(() => {
      if (containerRef.current?.querySelector('iframe')) {
        setRendered(true);
        clearInterval(check);
      }
    }, 400);
    const giveUp = setTimeout(() => clearInterval(check), 6000);

    return () => {
      clearInterval(check);
      clearTimeout(giveUp);
      script.remove();
    };
  }, [url]);

  return (
    <div className="tiktok-external-embed" ref={containerRef}>
      <blockquote className="tiktok-embed" cite={url} data-embed-from="mara-sparks">
        <a href={url} target="_blank" rel="noopener noreferrer" />
      </blockquote>
      {!rendered && (
        <a
          className="tiktok-external-fallback"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {t('reels.openLink', 'Open')} — {title}
        </a>
      )}
    </div>
  );
};

const TikTokFeed: React.FC<Props> = ({
  reels,
  onLike,
  onSave,
  onView,
  onComment,
  onShare,
  onFollow,
  followingIds,
  onLoadMore,
  loading,
  hasMore,
}) => {
  const { t } = useTranslation();
  const [muted, setMuted] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const viewedRef = useRef<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Track which reel is most visible -> autoplay it, record view once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idAttr = entry.target.getAttribute('data-reel-id');
          if (!idAttr) return;
          const id = Number(idAttr);
          if (entry.intersectionRatio >= 0.7) {
            setActiveId(id);
            if (!viewedRef.current.has(id)) {
              viewedRef.current.add(id);
              onView(id);
            }
          }
        });
      },
      { root: container, threshold: [0, 0.3, 0.7, 1] }
    );

    const cards = container.querySelectorAll('[data-reel-id]');
    cards.forEach((c) => observer.observe(c));

    return () => observer.disconnect();
  }, [reels, onView]);

  // Infinite scroll: trigger load more when near bottom.
  // Use refs (not props directly) to avoid firing duplicate fetches while a
  // request is in flight — React state updates are batched and lag behind
  // rapid scroll events.
  const loadingRef = useRef<boolean>(Boolean(loading));
  const fetchingRef = useRef<boolean>(false);
  useEffect(() => {
    loadingRef.current = Boolean(loading);
    // Reset the local guard once the parent confirms its fetch finished.
    if (!loading) fetchingRef.current = false;
  }, [loading]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onLoadMore || !hasMore) return;
    const onScroll = () => {
      if (loadingRef.current || fetchingRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - (scrollTop + clientHeight) < clientHeight * 0.5) {
        fetchingRef.current = true;
        onLoadMore();
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [onLoadMore, hasMore]);

  if (reels.length === 0 && !loading) {
    return (
      <div className="tiktok-empty">
        <p>{t('reels.noReels')}</p>
      </div>
    );
  }

  return (
    <div className="tiktok-feed" ref={containerRef}>
      {/* Global mute toggle in top-right */}
      <button
        className="tiktok-mute-btn"
        aria-label={muted ? t('reels.unmute', 'Unmute') : t('reels.mute', 'Mute')}
        onClick={() => setMuted((m) => !m)}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {reels.map((reel) => (
        <ReelCard
          key={reel.id}
          reel={reel}
          isActive={activeId === reel.id}
          muted={muted}
          onLike={onLike}
          onSave={onSave}
          onComment={onComment}
          onShare={onShare}
          onFollow={onFollow}
          isFollowing={!!(reel.creatorId && followingIds?.has(reel.creatorId))}
        />
      ))}

      {loading && (
        <div className="tiktok-loading" aria-live="polite">
          {t('reels.loadingFeed')}
        </div>
      )}
    </div>
  );
};

interface ReelCardProps {
  reel: TikTokReel;
  isActive: boolean;
  muted: boolean;
  onLike: (id: number) => void;
  onSave: (id: number) => void;
  onComment?: (id: number) => void;
  onShare?: (id: number) => void;
  onFollow?: (creatorId: string) => void;
  isFollowing?: boolean;
}

const ReelCard: React.FC<ReelCardProps> = ({
  reel,
  isActive,
  muted,
  onFollow,
  isFollowing,
  onLike,
  onSave,
  onComment,
  onShare,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [paused, setPaused] = useState(false);
  const [doubleTapHeart, setDoubleTapHeart] = useState(false);
  const lastTapRef = useRef<number>(0);

  const isExternalTikTok = reel.externalPlatform === 'tiktok';
  const youTubeId = !isExternalTikTok && (reel.url.includes('youtube') || reel.url.includes('youtu.be'))
    ? extractYouTubeId(reel.url)
    : '';
  const isNativeVideo = !youTubeId && !isExternalTikTok && reel.url !== '#';

  // All cards in the feed mount together up front (only the *iframe inside*
  // an active card is conditionally rendered — see the JSX below), so a
  // plain `useRef(muted)` here would capture whatever `muted` was back at
  // initial feed load for every card, not the preference at the moment each
  // one actually becomes active. Keep it synced on every render instead, so
  // iframeSrc (which only recomputes on isActive transitions, further down)
  // always reads the *current* value when a card is about to actually
  // create its iframe.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Recomputes only when this card's iframe is about to be (re)created —
  // i.e. on youTubeId/isActive changes — never while it's already mounted
  // and playing, so live mute toggling can't cause a mid-playback reload.
  // Baking the *current* mute preference into the URL at that moment means
  // a video the user has already unmuted once plays with sound immediately
  // on every later card, with no postMessage round-trip needed. Browsers
  // that already granted this page an autoplay-with-sound exception (which
  // they do once the user has interacted with a video here) honor mute=0
  // on subsequent embeds fine. `enablejsapi=1` + `origin=...` is required
  // for the player to accept postMessage commands (used for live toggling
  // and play/pause while active — see the effects below).
  const iframeSrc = useMemo(() => {
    if (!youTubeId || !isActive) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      enablejsapi: '1',
      autoplay: '1',
      mute: mutedRef.current ? '1' : '0',
      loop: '1',
      playlist: youTubeId,
      controls: '0',
      modestbranding: '1',
      playsinline: '1',
      rel: '0',
    });
    if (origin) params.set('origin', origin);
    return `https://www.youtube.com/embed/${youTubeId}?${params.toString()}`;
  }, [youTubeId, isActive]);

  // Drive play/pause via IFrame API for YouTube, and via <video> ref for
  // native video. Both respect isActive + local paused state, without
  // reloading the embed.
  useEffect(() => {
    if (youTubeId) {
      postYouTubeCommand(
        iframeRef.current,
        isActive && !paused ? 'playVideo' : 'pauseVideo'
      );
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (isActive && !paused) {
      v.play().catch(() => {
        // Autoplay may be blocked; user taps to play.
      });
    } else {
      v.pause();
    }
  }, [isActive, paused, youTubeId]);

  // Apply mute state to YouTube iframe without reloading. Native <video>
  // already binds `muted` via the attribute, so React handles it. This only
  // reaches a player that's already alive and listening — see the onReady
  // listener below for the moment right after a fresh mount, when the
  // player isn't listening yet and a command sent here would be silently
  // dropped.
  useEffect(() => {
    if (!youTubeId) return;
    postYouTubeCommand(iframeRef.current, muted ? 'mute' : 'unMute');
  }, [muted, youTubeId]);

  // Defensive backstop: the `mute` URL param (iframeSrc above) already
  // bakes in the right initial state for a freshly-mounted card, but if a
  // browser's autoplay policy silently forces it muted anyway, this
  // re-asserts the actual current mute preference the instant the YouTube
  // player confirms — via its own `onReady` postMessage — that it's
  // actually listening. Sending the same command earlier than this point
  // (e.g. immediately on mount) is exactly what caused every card after
  // the first to lose the user's unmute choice: the player's message
  // listener isn't registered yet on a just-created iframe, so the command
  // arrives and is dropped with nothing to receive it.
  useEffect(() => {
    if (!youTubeId || !isActive) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      let data: any;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.event === 'onReady') {
        postYouTubeCommand(iframeRef.current, muted ? 'mute' : 'unMute');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [youTubeId, isActive, muted]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap -> like with heart burst.
      if (!reel.isLiked) onLike(reel.id);
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 700);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current === now) {
          // Single tap -> toggle pause (native video only; YouTube embed
          // controls are hidden and handled by IFrame API above).
          setPaused((p) => !p);
          lastTapRef.current = 0;
        }
      }, 300);
    }
  }, [reel.id, reel.isLiked, onLike]);

  return (
    <div className="tiktok-reel" data-reel-id={reel.id}>
      <div className="tiktok-reel-media" onClick={handleTap}>
        {youTubeId && isActive && (
          // Only the currently active card gets a live YouTube iframe.
          // Every reel used to render its own autoplaying embed on mount —
          // a feed of ~20 videos meant ~20 simultaneous YouTube players
          // initializing at once, which YouTube's own embed surfaced back
          // as a generic player configuration error instead of actually
          // starting them. Inactive cards now render nothing here (falls
          // through to the placeholder below) until scrolled into view.
          <iframe
            ref={iframeRef}
            className="tiktok-reel-iframe"
            src={iframeSrc}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={reel.title}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
        {youTubeId && !isActive && (
          <div className="tiktok-reel-placeholder" aria-hidden>🎬</div>
        )}
        {isNativeVideo && (
          <video
            ref={videoRef}
            className="tiktok-reel-video"
            src={reel.url}
            loop
            playsInline
            muted={muted}
            preload="metadata"
          />
        )}
        {isExternalTikTok && <ExternalEmbed url={reel.url} title={reel.title} />}
        {!youTubeId && !isNativeVideo && !isExternalTikTok && (
          <div className="tiktok-reel-placeholder">🎬</div>
        )}

        {doubleTapHeart && <div className="tiktok-double-tap-heart" aria-hidden>❤️</div>}
        {paused && (isNativeVideo || youTubeId) && (
          <div className="tiktok-reel-paused" aria-hidden>▶️</div>
        )}
      </div>

      {/* Side action rail (vertical right) */}
      <div className="tiktok-side-rail">
        <button
          className={`tiktok-action ${reel.isLiked ? 'liked' : ''}`}
          onClick={() => onLike(reel.id)}
          aria-label={t('reels.like', 'Like')}
        >
          <span className="tiktok-action-icon">{reel.isLiked ? '❤️' : '🤍'}</span>
          <span className="tiktok-action-count">{formatNumber(reel.likes)}</span>
        </button>
        <button
          className="tiktok-action"
          onClick={() => onComment?.(reel.id)}
          aria-label={t('reels.comment', 'Comment')}
        >
          <span className="tiktok-action-icon">💬</span>
          <span className="tiktok-action-count">{formatNumber(reel.comments)}</span>
        </button>
        <button
          className="tiktok-action"
          onClick={() => onShare?.(reel.id)}
          aria-label={t('reels.share', 'Share')}
        >
          <span className="tiktok-action-icon">↗️</span>
          <span className="tiktok-action-count">{formatNumber(reel.shares)}</span>
        </button>
        <button
          className={`tiktok-action ${reel.isSaved ? 'saved' : ''}`}
          onClick={() => onSave(reel.id)}
          aria-label={reel.isSaved ? t('reels.saved') : t('reels.saveLabel')}
        >
          <span className="tiktok-action-icon">{reel.isSaved ? '🔖' : '🏷️'}</span>
        </button>
      </div>

      {/* Bottom info overlay (creator, title, music) */}
      <div className="tiktok-bottom-info">
        {reel.creatorId ? (
          <div className="tiktok-creator-row">
            <Link
              to={`/profile/${reel.creatorId}?from=spark&fromId=${reel.id}`}
              className="tiktok-creator-row--link"
            >
              <span className="tiktok-creator-avatar">{reel.avatar}</span>
              <span className="tiktok-creator-name">@{reel.creator}</span>
            </Link>
            {onFollow && !isFollowing && (
              <button
                type="button"
                className="tiktok-follow-btn"
                onClick={(e) => { e.stopPropagation(); onFollow(reel.creatorId!); }}
              >
                {t('reels.follow', 'Follow')}
              </button>
            )}
            {isFollowing && <span className="tiktok-following-badge">{t('reels.following', 'Following')}</span>}
          </div>
        ) : (
          <div className="tiktok-creator-row">
            <span className="tiktok-creator-avatar">{reel.avatar}</span>
            <span className="tiktok-creator-name">@{reel.creator}</span>
          </div>
        )}
        <div className="tiktok-title">{reel.title}</div>
        {reel.description && (
          <div className="tiktok-description">{reel.description}</div>
        )}
        {reel.tags.length > 0 && (
          <div className="tiktok-tags">
            {reel.tags.slice(0, 3).map((tg) => (
              <span key={tg}>#{tg}</span>
            ))}
          </div>
        )}
        <div className="tiktok-music">🎵 {reel.music || 'Original Audio'}</div>
      </div>
    </div>
  );
};

export default TikTokFeed;
