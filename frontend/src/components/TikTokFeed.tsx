import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export interface TikTokReel {
  id: number;
  creator: string;
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
}

interface Props {
  reels: TikTokReel[];
  onLike: (id: number) => void;
  onSave: (id: number) => void;
  onView: (id: number) => void;
  onComment?: (id: number) => void;
  onShare?: (id: number) => void;
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

const TikTokFeed: React.FC<Props> = ({
  reels,
  onLike,
  onSave,
  onView,
  onComment,
  onShare,
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
        aria-label={muted ? 'Unmute' : 'Mute'}
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
}

const ReelCard: React.FC<ReelCardProps> = ({
  reel,
  isActive,
  muted,
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

  const youTubeId = (reel.url.includes('youtube') || reel.url.includes('youtu.be'))
    ? extractYouTubeId(reel.url)
    : '';
  const isNativeVideo = !youTubeId && reel.url !== '#';

  // Stable iframe src — only depends on youTubeId, so the iframe never
  // reloads when the `muted` or `isActive` props change. Playback and
  // mute state are controlled post-mount via the YouTube IFrame API
  // (postMessage). `enablejsapi=1` + `origin=...` is required for the
  // player to accept those commands.
  const iframeSrc = useMemo(() => {
    if (!youTubeId) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      enablejsapi: '1',
      autoplay: '1',
      mute: '1', // start muted to satisfy browser autoplay policy
      loop: '1',
      playlist: youTubeId,
      controls: '0',
      modestbranding: '1',
      playsinline: '1',
      rel: '0',
    });
    if (origin) params.set('origin', origin);
    return `https://www.youtube.com/embed/${youTubeId}?${params.toString()}`;
  }, [youTubeId]);

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
  // already binds `muted` via the attribute, so React handles it.
  useEffect(() => {
    if (!youTubeId) return;
    postYouTubeCommand(iframeRef.current, muted ? 'mute' : 'unMute');
  }, [muted, youTubeId]);

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
        {youTubeId && (
          <iframe
            ref={iframeRef}
            className="tiktok-reel-iframe"
            src={iframeSrc}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={reel.title}
          />
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
        {!youTubeId && !isNativeVideo && (
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
          aria-label="Like"
        >
          <span className="tiktok-action-icon">{reel.isLiked ? '❤️' : '🤍'}</span>
          <span className="tiktok-action-count">{formatNumber(reel.likes)}</span>
        </button>
        <button
          className="tiktok-action"
          onClick={() => onComment?.(reel.id)}
          aria-label="Comment"
        >
          <span className="tiktok-action-icon">💬</span>
          <span className="tiktok-action-count">{formatNumber(reel.comments)}</span>
        </button>
        <button
          className="tiktok-action"
          onClick={() => onShare?.(reel.id)}
          aria-label="Share"
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
        <div className="tiktok-creator-row">
          <span className="tiktok-creator-avatar">{reel.avatar}</span>
          <span className="tiktok-creator-name">@{reel.creator}</span>
        </div>
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
