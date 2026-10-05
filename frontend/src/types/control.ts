export interface DashboardOverview {
  users: { total: number; newToday: number; active7d: number };
  languages: { language: string; cnt: number }[];
  revenue: { total: number; thisMonth: number; pendingOrders: number };
  notifications: { total: number; today: number };
  pwa: { installs: number };
  missions: { completed: number; totalXP: number };
  aiRoutes: { route: string; cnt: number; avg_latency: number; successes: number }[];
  system: { uptimeSeconds: number; memoryMB: number; totalMemoryMB: number; nodeVersion: string };
  brain: { lastLog: { message: string; level: string; created_at: number } | null; logsToday: number };
  eventBus: { backend: 'kafka' | 'memory'; topics: number; connected: boolean };
}

export interface BrainStatus {
  enabled: boolean;
  running: boolean;
  passive: boolean;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  nextRunAt: string | null;
  cycleIntervalMs: number;
}

export interface ProviderHealth {
  provider: string;
  configured: boolean;
  ok: boolean;
  model: string;
  fallback?: ProviderHealth;
}

export interface BrainControlSnapshot {
  brain: BrainStatus;
  ai: ProviderHealth;
}

export interface ControlLogSnapshot {
  brainLogs: Array<{ id: number; createdAt: string | Date; research: string }>;
  alerts: Array<{ id: number; severity: string; title: string; message: string }>;
  unreadAlerts: number;
  activity: Array<{ id: number; kind: string; createdAt: string | Date; meta: Record<string, unknown> }>;
}

export interface ExperimentSnapshot {
  experiments: Array<{ id: number; hypothesis: string; status: string; iceScore?: number }>;
  count: number;
}

export interface TaskSnapshot {
  counts: Record<string, number>;
  sources: Record<string, number>;
  tasks: Array<{
    id: string;
    source: string;
    title: string;
    status: string;
    priority: string;
    risk: string;
    permission: { level: string; approvalRequired: boolean; reason: string };
    metadata: { taskType?: string; reviewDecision?: string | null; moduleId?: string | null; moduleName?: string | null };
  }>;
}

export type ModuleHealthState = 'healthy' | 'warning' | 'error' | 'not_configured';

export interface HelloMaraModuleStatus {
  overall: ModuleHealthState;
  frontend: ModuleHealthState;
  backend: ModuleHealthState;
  database: ModuleHealthState;
  ai: ModuleHealthState;
  tasks: ModuleHealthState;
  tests: ModuleHealthState;
}

export interface HelloMaraModuleEntry {
  id: 'missions' | 'reels' | 'writers-hub' | 'you' | 'creators' | 'membership';
  displayName: string;
  icon: string;
  routes: string[];
  frontendFiles: string[];
  backendFiles: string[];
  databaseDependencies: string[];
  apiEndpoints: string[];
  sharedDependencies: string[];
  aiIntegrations: string[];
  assets: string[];
  tests: string[];
  healthStatus: HelloMaraModuleStatus;
  activeTasks: TaskSnapshot['tasks'];
  recentChanges: string[];
  errors: string[];
  warnings: string[];
  sharedWarnings: Array<{ file: string; sharedBy: string[] }>;
}

export interface RepositoryStatus {
  root: string;
  overview: { totalFiles: number; totalBytes: number; recentlyChanged: Array<{ path: string; mtime: number; size: number }> };
  indexedFiles: number;
  indexedAt: string;
}

export interface RepositorySearchResult {
  path: string;
  size: number;
  extension: string;
  mtime: number;
}

export interface RepositoryFilePreview {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface RepositoryGitStatus {
  branch: string;
  dirty: boolean;
  summary: string[];
  recentCommits: Array<{ hash: string; subject: string; author: string; date: string }>;
  diff: { files: string[]; stat: string };
}

export interface AgentCatalogEntry {
  id: string;
  label: string;
  role: string;
  capabilities: string[];
  risk: string;
  execution: string;
}

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  risk: string;
  available: boolean;
  execution: string;
}

export interface IntegrationStatus {
  id: string;
  state: 'NOT_CONFIGURED' | 'CONFIGURED' | 'ERROR';
  configured: boolean;
  available: boolean;
  reason: string;
}

export interface SecuritySnapshot {
  blacklistedIps: {
    total: number;
    recent: Array<{ ip: string; reason: string; hitCount: number; permanent: boolean; expiresAt: number }>;
  };
  honeypot: {
    eventsLast24h: number;
    recent: Array<{ ip: string; path: string; method: string; createdAt: number }>;
  };
  circuits: Array<{ provider: string; state: 'closed' | 'open' | 'half-open'; failures: number; lastFailureAt: number | null; openUntil: number | null }>;
  controlWorker: { enabled: boolean; running: boolean; workerId: string };
  generatedAt: string;
}

export interface GitHubStatusSnapshot {
  configured: boolean;
  connected: boolean;
  repository: string;
  defaultBranch: string | null;
  latestCommit: { sha: string; message: string; author: string | null; date: string | null } | null;
  branches: Array<{ name: string; sha: string }>;
  issues: Array<{ number: number; title: string; state: string; url: string }>;
  pullRequests: Array<{ number: number; title: string; state: string; url: string }>;
  workflowRuns: Array<{ id: number; name: string | null; status: string; conclusion: string | null; htmlUrl: string }>;
  permissions: Record<string, string>;
  writeCapability: 'AVAILABLE' | 'NOT_AVAILABLE';
  lastCheckedAt: string;
  error?: { code: string; message: string };
}

export interface RailwayStatusSnapshot {
  configured: boolean;
  connected: boolean;
  authentication: 'CLI' | 'TOKEN' | 'NOT_CONFIGURED';
  workspace: string | null;
  project: string | null;
  projectId: string | null;
  service: string | null;
  serviceId: string | null;
  environment: string | null;
  environmentId: string | null;
  serviceStatus: string | null;
  url: string | null;
  region: string | null;
  volume: string | null;
  latestDeploymentId: string | null;
  deployments: Array<{ id: string; status: string; createdAt?: string | null; commitHash?: string | null; skippedReason?: string | null }>;
  latestDeployment: { id: string; status: string; createdAt?: string | null; commitHash?: string | null; skippedReason?: string | null } | null;
  logs: string[];
  variableMetadata: Array<{ name: string; value: 'REDACTED' | 'NOT_READ' }>;
  writeCapability: 'PLAN_ONLY' | 'NOT_AVAILABLE';
  lastCheckedAt: string;
  error?: { code: string; message: string };
}

export interface WorkerStatus {
  enabled: boolean;
  running: boolean;
  workerId: string;
}

export interface CodeAgentPlan {
  id: number;
  requestId: number;
  analysis: { summary?: string; risks?: string[]; validationPlan?: string[]; affectedModules?: string[] };
  changes: Array<{ path?: string; type?: string; reason?: string }>;
  status: string;
  approvedBy: string | null;
  createdAt: number;
}

export interface ControlAuditAction {
  id: number;
  action_type: string;
  target_type: string;
  target_id: string;
  actor: string | null;
  created_at: number;
}

export interface MaraActivityEntry {
  id: number;
  topic: string;
  content: string;
  module: string | null;
  kind: 'insight' | 'auto_apply';
  outcome: string | null;
  planId: number | null;
  createdAt: string | null;
}

export interface LearningOverview {
  builtIn: { total: number; read: number };
  publicLibrary: { read: number; failed: number };
  webTopics: { read: number };
  ideasExtracted: number;
  byCategory: Record<string, number>;
  readRate: { last24h: number; last7d: number };
  publicLibraryHealth: {
    lastSuccessAt: string | null;
    recentAttempts: number;
    recentFailures: number;
  };
}

export interface RecentRead {
  title: string;
  source: 'built-in' | 'public' | 'web';
  category: string | null;
  failed: boolean;
  readAt: string;
}

export interface KnowledgeSample {
  id: number;
  topic: string;
  content: string;
  category: string;
  createdAt: string;
}

export interface KnowledgeSearchResult {
  id: number;
  topic: string;
  content: string;
  category: string;
  confidence: number;
  relevanceScore: number;
}

export interface UploadedDocument {
  id: number;
  title: string;
  category: string;
  totalChunks: number | null;
  createdAt: string;
}

export type GrowthExperimentStatus = 'proposed' | 'approved' | 'implemented' | 'measured' | 'rejected';

export interface GrowthExperiment {
  id: number;
  dropOffStage: string;
  baselineDropOffRate: number;
  hypothesis: string;
  framework: string;
  codeSketch: string;
  iceImpact: number;
  iceConfidence: number;
  iceEase: number;
  iceScore: number;
  expectedImpactPct: number;
  status: GrowthExperimentStatus;
  decidedBy: string | null;
  decidedAt: string | number | null;
  decisionNote: string | null;
  implementedAt: string | number | null;
  measureAfterAt: string | number | null;
  actualImpactPct: number | null;
  succeeded: number | null;
  learnings: string | null;
  measuredAt: string | number | null;
  createdAt: string | number | null;
}

export interface GrowthFunnelStage {
  stage: string;
  count: number;
  dropOffRateFromPrev: number;
}

export interface GrowthFunnelSnapshot {
  windowDays: number;
  totalSignups: number;
  stages: GrowthFunnelStage[];
  hasMeaningfulData: boolean;
}

export interface GrowthDashboardStage {
  stage: string;
  label: string;
  count: number;
  dropOffRate: number;
}

export interface GrowthDashboardCohort {
  week: string;
  signups: number;
  day7: number;
  day30: number;
}

export interface GrowthDashboardReferrer {
  userId: string;
  referralCount: number;
}

export interface ExecutiveStatus {
  state: {
    lastUpdated: number;
    funnelSummary: string | null;
    activeExperiments: string[];
    recentOutcomes: string[];
    topUserTopics: string[];
    currentPriority: string;
    focusModules: string[];
  };
  signalCount: number;
}

export interface ModuleInsight {
  id: number;
  module: string;
  insightType: string;
  title: string;
  description: string;
  priority: string;
  estimatedImpact: string;
  source: string;
  status: string;
  createdAt: string | number | null;
}

export interface ReadingQueueItem {
  id: number;
  topic: string;
  reason: string;
  priority: string;
  status: string;
  source: string;
  createdAt: string | number | null;
}

export interface GrowthDashboardData {
  gateActive: boolean;
  userCount: number;
  threshold: number;
  funnel: { current: GrowthDashboardStage[]; previous: GrowthDashboardStage[] };
  cohorts: GrowthDashboardCohort[];
  topReferrers: GrowthDashboardReferrer[];
  qualitativeSignals: Array<{ type: string; count: number }>;
}
