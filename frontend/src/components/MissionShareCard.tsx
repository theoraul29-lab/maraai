// Mission completion share card — generates a shareable image-like card
// that users can screenshot and post on social media.
// Shown after a mission is completed when viral loop is active (>= 70 users).

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './MissionShareCard.css';

interface Props {
  missionTitle: string;
  pillar: string;
  xpEarned: number;
  referralCode?: string;
  onClose: () => void;
}

const PILLAR_EMOJI: Record<string, string> = {
  discipline: '⚡',
  creativity: '🎨',
  life: '🌿',
  acceptance: '🧘',
  helping: '🤝',
  self: '🔮',
  hobby: '🎯',
};

const PILLAR_COLOR: Record<string, string> = {
  discipline: '#7b2ff7',
  creativity: '#ff6b35',
  life: '#22c55e',
  acceptance: '#06b6d4',
  helping: '#f59e0b',
  self: '#c77dff',
  hobby: '#ec4899',
};

export default function MissionShareCard({ missionTitle, pillar, xpEarned, referralCode, onClose }: Props) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const color = PILLAR_COLOR[pillar] ?? '#c77dff';
  const emoji = PILLAR_EMOJI[pillar] ?? '🌟';

  const handleShare = async () => {
    const url = referralCode
      ? `${window.location.origin}/?ref=${referralCode}`
      : window.location.origin;

    const text = t('missionShare.shareText', { title: missionTitle, xp: xpEarned, emoji, url });

    if (navigator.share) {
      try {
        await navigator.share({ title: t('missionShare.shareTitle'), text });
        return;
      } catch {
        // fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      alert(t('missionShare.copied'));
    } catch {
      // silent
    }
  };

  return (
    <div className="msc-overlay" onClick={onClose}>
      <div className="msc-wrapper" onClick={e => e.stopPropagation()}>
        {/* The visual card */}
        <div className="msc-card" ref={cardRef} style={{ '--pillar-color': color } as React.CSSProperties}>
          <div className="msc-card-bg" />
          <div className="msc-card-content">
            <div className="msc-emoji">{emoji}</div>
            <div className="msc-label">{t('missionShare.cardLabel')}</div>
            <div className="msc-mission-title">{missionTitle}</div>
            <div className="msc-xp">+{xpEarned} XP</div>
            <div className="msc-brand">hellomara.net</div>
          </div>
        </div>

        <div className="msc-actions">
          <button className="msc-btn msc-btn--share" onClick={handleShare}>
            {t('missionShare.share')}
          </button>
          {referralCode && (
            <div className="msc-referral">
              {t('missionShare.referralLabel')} <strong>{referralCode}</strong>
            </div>
          )}
          <button className="msc-btn msc-btn--close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
