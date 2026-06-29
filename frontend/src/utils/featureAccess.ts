import type { UserTier } from '../contexts/AuthContext';

export interface FeatureAccess {
  you: boolean;
  reels: boolean;
  writers: boolean;
  creators: boolean;
  chat: boolean;
  advanced_editing: boolean;
  monetization: boolean;
  analytics: boolean;
}

export const getFeatureAccess = (tier: UserTier): FeatureAccess => {
  const baseAccess: FeatureAccess = {
    you: false,
    reels: false,
    writers: false,
    creators: false,
    chat: false,
    advanced_editing: false,
    monetization: false,
    analytics: false,
  };

  switch (tier) {
    case 'free':
      // 10% access - basic features only
      return {
        ...baseAccess,
        you: true,
        reels: true,
        chat: true,
        // Everything else is locked
      };

    case 'vip':
      // Full access to everything
      return {
        you: true,
        reels: true,
            writers: true,
        creators: true,
        chat: true,
        advanced_editing: true,
        monetization: true,
        analytics: true,
      };

    default:
      return baseAccess;
  }
};

export const canAccess = (features: FeatureAccess, feature: keyof FeatureAccess): boolean => {
  return features[feature] === true;
};

export const getLockedMessage = (feature: string, tier: UserTier): string => {
  if (tier === 'free') {
    return `10% access only. Upgrade to VIP to unlock ${feature}`;
  }
  return `${feature} is locked for ${tier} members`;
};
