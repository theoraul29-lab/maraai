export const PRE_LAUNCH_OBJECTIVE = {
  primary: 'grow_waitlist_and_p2p',
  horizonDays: 19,
  revenueMode: false,
  shortTermMode: true,
  fastMode: false,
  tradeoffs: {
    preferGrowthOverRevenue: true,
    preferEngagementOverConversion: true,
    preferRetentionOverAcquisition: false,
  },
  growthTargets: {
    waitlistSignups: 1000,
    p2pAdoptionPct: 40,
    dailyActiveUsers: 50,
  },
  focusModules: ['onboarding', 'p2p', 'waitlist', 'landing'],
  researchTopics: [
    'waitlist growth tactics',
    'P2P network adoption strategies',
    'pre-launch community building',
    'viral onboarding loops',
    'landing page conversion optimization',
  ],
} as const;

export const POST_LAUNCH_OBJECTIVE = {
  primary: 'grow_platform',
  horizonDays: 90,
  revenueMode: true,
  shortTermMode: false,
  fastMode: false,
  tradeoffs: {
    preferGrowthOverRevenue: true,
    preferEngagementOverConversion: false,
    preferRetentionOverAcquisition: true,
  },
  growthTargets: {
    monthlyActiveUsers: 5000,
    p2pAdoptionPct: 30,
    revenueGrowthPct: 20,
    dayThirtyRetentionPct: 40,
  },
  focusModules: ['you', 'trading', 'creators', 'writers', 'reels', 'membership'],
  researchTopics: [
    'user retention strategies',
    'creator economy monetization',
    'AI platform engagement loops',
    'subscription conversion optimization',
    'community-driven growth flywheels',
  ],
} as const;
