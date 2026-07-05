import { describe, it, expect } from 'vitest';
import { getFeatureAccess, canAccess, getLockedMessage } from './featureAccess';

describe('getFeatureAccess', () => {
  it('grants only the basic surfaces to free users', () => {
    const access = getFeatureAccess('free');
    expect(access).toEqual({
      you: true,
      reels: true,
      chat: true,
      writers: false,
      creators: false,
      advanced_editing: false,
      monetization: false,
      analytics: false,
    });
  });

  it('grants everything to vip users', () => {
    const access = getFeatureAccess('vip');
    expect(Object.values(access).every(Boolean)).toBe(true);
  });

  it('free users cannot access paid surfaces', () => {
    const access = getFeatureAccess('free');
    expect(canAccess(access, 'writers')).toBe(false);
    expect(canAccess(access, 'monetization')).toBe(false);
    expect(canAccess(access, 'you')).toBe(true);
  });
});

describe('getLockedMessage', () => {
  it('nudges free users toward VIP (not the removed premium tier)', () => {
    const msg = getLockedMessage('Writers Hub', 'free');
    expect(msg).toContain('VIP');
    expect(msg).not.toContain('Premium');
  });

  it('reports the locking tier for non-free users', () => {
    expect(getLockedMessage('Analytics', 'vip')).toContain('vip');
  });
});
