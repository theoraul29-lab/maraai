import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCsrfToken } from '../csrf';
import './ShareButton.css';

// Universal share button. Used from missions, reels, posts, articles, and the
// profile header. Two visual modes:
//   - compact: tiny 28px icon button + a 4-column grid popover (used inline
//     in feed cards where vertical space is tight).
//   - full: text-labelled "Share" button + a vertical dropdown list (used on
//     pages where the button has room to breathe, e.g. an article header).
//
// All translation keys live under `share.*` in the locale JSON files. The
// component never assumes a specific module name; it just posts the
// (sourceModule, sourceId, targetPlatform) tuple to the universal `/api/share`
// endpoint which the backend then attributes + awards XP for.

export type ShareModule = 'mission' | 'reel' | 'post' | 'profile' | 'article';

export type SharePlatform =
  | 'hellomara'
  | 'you'
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'whatsapp'
  | 'telegram'
  | 'link';

export interface ShareButtonProps {
  sourceModule: ShareModule;
  sourceId: string | number;
  sourceType?: string;
  title?: string;
  caption?: string;
  compact?: boolean;
  className?: string;
}

interface PlatformDef {
  id: SharePlatform;
  color: string;
  icon: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: 'hellomara', color: '#9d4edd', icon: '✨' },
  { id: 'you',       color: '#7b2cbf', icon: '🧑' },
  { id: 'instagram', color: '#e1306c', icon: '📸' },
  { id: 'tiktok',    color: '#000000', icon: '🎵' },
  { id: 'x',         color: '#0f1419', icon: '𝕏'  },
  { id: 'whatsapp',  color: '#25d366', icon: '💬' },
  { id: 'telegram',  color: '#0088cc', icon: '✈️' },
  { id: 'link',      color: '#6c757d', icon: '🔗' },
];

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

type ShareResponse = {
  ok?: boolean;
  shareUrl?: string;
  externalLink?: string | null;
  xpAwarded?: number;
  message?: string;
  recentlyShared?: boolean;
};

export default function ShareButton(props: ShareButtonProps) {
  const { t } = useTranslation();
  const {
    sourceModule, sourceId, sourceType, title, caption,
    compact = false, className = '',
  } = props;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<SharePlatform | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click. We attach the listener only while open so we
  // don't add a no-op global handler on every card in the feed.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Auto-dismiss feedback after 3 s.
  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for non-HTTPS dev hosts.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }

  async function handleShare(platform: SharePlatform) {
    if (busy) return;
    setBusy(platform);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${API}/api/share`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({
          sourceModule,
          sourceId: String(sourceId),
          sourceType: sourceType ?? null,
          targetPlatform: platform,
          caption: caption ?? title ?? null,
          origin: window.location.origin,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ShareResponse;

      if (res.status === 429 && data.recentlyShared) {
        setFeedback(t('share.recentlyShared', 'Already shared recently.'));
        return;
      }
      if (!res.ok || !data.shareUrl) {
        setFeedback(t('share.errorMsg', 'Share failed. Try again.'));
        return;
      }

      const link = data.externalLink ?? data.shareUrl;

      if (platform === 'instagram' || platform === 'tiktok') {
        await copyToClipboard(data.shareUrl);
        const msg = platform === 'instagram'
          ? t('share.instagramMsg', 'Link copied! Open Instagram and paste. 📸')
          : t('share.tiktokMsg', 'Link copied! Open TikTok and paste. 🎵');
        setFeedback(msg);
        if (link) window.open(link, '_blank', 'noopener,noreferrer');
      } else if (platform === 'link') {
        await copyToClipboard(data.shareUrl);
        setFeedback(t('share.copied', 'Link copied! 🔗'));
      } else if (platform === 'hellomara' || platform === 'you') {
        setFeedback(t('share.successMsg', 'Shared! +25 XP 🎉'));
      } else if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
        setFeedback(t('share.successMsg', 'Shared! +25 XP 🎉'));
      } else {
        setFeedback(t('share.successMsg', 'Shared! +25 XP 🎉'));
      }
      setOpen(false);
    } catch (err) {
      console.error('[ShareButton] failed:', err);
      setFeedback(t('share.errorMsg', 'Share failed. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  function platformLabel(id: SharePlatform): string {
    return t(`share.platforms.${id}`, defaultPlatformLabel(id));
  }

  return (
    <div
      ref={popRef}
      className={`share-btn share-btn--${compact ? 'compact' : 'full'} ${className}`}
    >
      <button
        type="button"
        className="share-btn__trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('share.title', 'Share')}
      >
        {compact ? '↗' : `↗ ${t('share.trigger', 'Share')}`}
      </button>

      {open && (
        <div
          className={`share-btn__popover share-btn__popover--${compact ? 'grid' : 'list'}`}
          role="menu"
        >
          {!compact && (
            <div className="share-btn__header">
              <span>{t('share.title', 'Share')}</span>
              <button
                type="button"
                className="share-btn__close"
                onClick={() => setOpen(false)}
                aria-label={t('share.close', 'Close')}
              >×</button>
            </div>
          )}
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className="share-btn__option"
              style={{ borderColor: p.color }}
              disabled={busy !== null}
              onClick={() => handleShare(p.id)}
            >
              <span className="share-btn__icon" style={{ background: p.color }}>{p.icon}</span>
              <span className="share-btn__label">{platformLabel(p.id)}</span>
              {p.id === 'instagram' && !compact && (
                <span className="share-btn__hint">{t('share.instagramHint', 'copy + open')}</span>
              )}
              {p.id === 'tiktok' && !compact && (
                <span className="share-btn__hint">{t('share.tiktokHint', 'copy + open')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <div className="share-btn__toast" role="status">{feedback}</div>
      )}
    </div>
  );
}

function defaultPlatformLabel(id: SharePlatform): string {
  switch (id) {
    case 'hellomara': return 'Mara Feed';
    case 'you':       return 'My Profile';
    case 'instagram': return 'Instagram';
    case 'tiktok':    return 'TikTok';
    case 'x':         return 'X';
    case 'whatsapp':  return 'WhatsApp';
    case 'telegram':  return 'Telegram';
    case 'link':      return 'Copy Link';
  }
}
