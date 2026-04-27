// Shared types for the MaraAI hybrid-platform UI surface.

export type MaraMode = 'centralized' | 'hybrid' | 'advanced';
export type AiRoute = 'local' | 'central' | 'p2p';

export type ConsentView = {
  userId: string;
  mode: MaraMode;
  p2pEnabled: boolean;
  bandwidthShareGbMonth: number;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  notificationsEnabled: boolean;
  killSwitch: boolean;
  consentVersion: number;
  acceptedTermsAt: number | null;
  needsOnboarding: boolean;
};

export type ConsentPatch = Partial<{
  mode: MaraMode;
  p2pEnabled: boolean;
  bandwidthShareGbMonth: number;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  notificationsEnabled: boolean;
  killSwitch: boolean;
  acceptTerms: boolean;
}>;

export type ActivityRow = {
  id: number;
  userId: string | null;
  kind: string;
  meta: Record<string, unknown>;
  createdAt: number | string;
};

export type TransparencyStatus = {
  consent: ConsentView;
  process: { cpuPercent: number; rssMb: number; uptimeSec: number };
  eventBus: { backend: 'kafka' | 'memory'; topics: number; connected: boolean };
  routeMix24h: Record<AiRoute, number>;
  nodes: Array<{
    nodeId: string;
    deviceLabel: string | null;
    status: string;
    score: number;
    bytesIn: number;
    bytesOut: number;
    uptimeSec: number;
  }>;
  warnings: string[];
};
