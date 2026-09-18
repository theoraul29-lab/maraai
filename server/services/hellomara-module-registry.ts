import fs from 'node:fs';
import path from 'node:path';
import { rawSqlite } from '../db.js';
import { getAIHealth } from '../llm.js';
import { readRepositoryGitStatus } from './repository-status.js';
import { readTaskStatus, type UnifiedTask } from './task-engine.js';
import { REPO_ROOT } from '../mara-brain/agents/code-explorer.js';

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

export interface HelloMaraModuleRegistryEntry {
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
  activeTasks: UnifiedTask[];
  recentChanges: string[];
  errors: string[];
  warnings: string[];
  sharedWarnings: Array<{ file: string; sharedBy: string[] }>;
}

type ModuleDefinition = Omit<HelloMaraModuleRegistryEntry, 'healthStatus' | 'activeTasks' | 'recentChanges' | 'errors' | 'warnings' | 'sharedWarnings'>;

const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  {
    id: 'missions',
    displayName: 'Missions',
    icon: '🎯',
    routes: ['/missions'],
    frontendFiles: ['frontend/src/Missions.tsx', 'frontend/src/styles/Missions.css', 'frontend/src/components/MissionShareCard.tsx', 'frontend/src/components/MissionShareCard.css'],
    backendFiles: ['server/missions/routes.ts', 'server/missions/engine.ts', 'server/missions/program-engine.ts', 'server/missions/seed.ts', 'server/missions/content.ts', 'server/missions/content-translations.ts'],
    databaseDependencies: ['missions', 'user_missions', 'mission_events', 'mission_shares', 'mission_programs', 'user_program_enrollments', 'mission_proofs', 'mission_generation_queue', 'mission_feedback', 'user_xp', 'user_personality', 'user_preferences'],
    apiEndpoints: ['/api/missions', '/api/missions/daily', '/api/missions/suggest', '/api/missions/generate', '/api/missions/:id/start', '/api/missions/:id/proof', '/api/missions/share', '/api/missions/:userMissionId/share-as-spark', '/api/missions/community', '/api/missions/stats', '/api/missions/leaderboard', '/api/missions/feedback', '/api/programs', '/api/programs/:slug', '/api/programs/:slug/enroll'],
    sharedDependencies: ['server/ai.ts', 'server/llm.ts', 'server/auth.ts', 'server/rate-limit.ts', 'shared/schema.ts', 'shared/models/maraai-platform.ts'],
    aiIntegrations: ['missionGeneration', 'server/missions/engine.ts', 'server/maraai/p2p-tasks.ts'],
    assets: [],
    tests: [],
  },
  {
    // Renamed Reels -> Sparks on the product side (short-video feed
    // reframed around the platform's own growth journey rather than
    // competing head-on with TikTok/Instagram — connected to Missions,
    // Writers Hub and You, plus optional YouTube/TikTok link posting via
    // oEmbed). `id` stays 'reels' — it's an internal key referenced by
    // routes/tasks/module context, not user- or Mara-facing text, and
    // renaming it would be a breaking change for no visible benefit.
    id: 'reels',
    displayName: 'Sparks',
    icon: '✨',
    routes: ['/reels'],
    frontendFiles: [
      'frontend/src/reels.tsx',
      'frontend/src/styles/Reels.css',
      'frontend/src/components/ReelsComponent.tsx',
      'frontend/src/components/TikTokFeed.tsx',
    ],
    backendFiles: ['server/modules/reels.ts', 'server/modules/video.ts', 'server/modules/uploads.ts'],
    databaseDependencies: ['videos', 'saved_videos', 'video_comments', 'likes', 'collection_videos', 'user_posts'],
    apiEndpoints: [
      '/api/mara-feed', '/api/reels/feed', '/api/reels/upload', '/api/reels/link',
      '/api/videos/:id/like', '/api/videos/:id/view', '/api/videos/:id/save', '/api/videos/saved',
      '/api/videos/:id/share', '/api/videos/:id/comments', '/api/videos/comments/:commentId',
    ],
    sharedDependencies: ['server/ai.ts', 'server/llm.ts', 'server/auth.ts', 'server/rate-limit.ts', 'shared/schema.ts', 'data/videos'],
    aiIntegrations: ['contentProcessing', 'server/ai.ts'],
    assets: ['data/videos'],
    tests: [],
  },
  {
    id: 'writers-hub',
    displayName: 'Writers Hub',
    icon: '✍️',
    routes: ['/writers-hub'],
    frontendFiles: ['frontend/src/WritersHub.tsx', 'frontend/src/styles/WritersHub.css'],
    backendFiles: ['server/modules/writers.ts', 'server/billing/features.ts'],
    databaseDependencies: ['writer_pages', 'writer_comments', 'writer_purchases', 'users', 'likes', 'creator_payouts'],
    apiEndpoints: ['/api/writers', '/api/writers/library', '/api/writers/mine', '/api/writers/purchases', '/api/writers/publish', '/api/writers/:idOrSlug', '/api/writers/:id/comments', '/api/writers/:id/access', '/api/writers/:id/purchase'],
    sharedDependencies: ['server/auth.ts', 'server/rate-limit.ts', 'server/billing/features.ts', 'shared/schema.ts'],
    aiIntegrations: ['server/ai.ts', 'server/llm.ts'],
    assets: [],
    tests: [],
  },
  {
    id: 'you',
    displayName: 'You',
    icon: '👤',
    // /profile/:id is a real route now (Creator Growth Path source
    // attribution) — UserProfile used to only open as a modal from inside
    // You itself, with no URL of its own, so a tap on a creator's name from
    // Sparks or Writers Hub had nowhere to go.
    routes: ['/you', '/profile/:id'],
    frontendFiles: [
      'frontend/src/you.tsx',
      'frontend/src/components/YouProfile.tsx',
      'frontend/src/components/UserProfile.tsx',
      'frontend/src/styles/You.css',
      'frontend/src/styles/YouProfile.css',
      'frontend/src/styles/UserProfile.css',
    ],
    backendFiles: ['server/modules/profile.ts', 'server/modules/userPrefs.ts', 'server/modules/auth-api.ts', 'server/modules/notifications.ts', 'server/modules/messenger.ts'],
    databaseDependencies: ['users', 'user_posts', 'user_preferences', 'direct_messages', 'notifications', 'push_subscriptions', 'likes'],
    apiEndpoints: ['/api/profile/me', '/api/profile/:id', '/api/profile/:id/videos', '/api/profile/:id/followers', '/api/profile/:id/following', '/api/profile/:id/activity', '/api/profile/:id/badges', '/api/profile/:id/posts', '/api/profile/posts', '/api/profile/:id/follow', '/api/user/theme', '/api/user/onboarding-status'],
    sharedDependencies: ['server/auth.ts', 'server/rate-limit.ts', 'shared/schema.ts', 'shared/models/auth.ts'],
    aiIntegrations: ['server/ai.ts', 'server/mara-brain/memory.ts'],
    assets: ['data/images'],
    tests: ['frontend/src/contexts/AuthContext.test.tsx'],
  },
  {
    id: 'creators',
    displayName: 'Creators',
    icon: '🎨',
    routes: ['/creator-panel'],
    frontendFiles: ['frontend/src/creator.tsx', 'frontend/src/styles/Creator.css'],
    backendFiles: ['server/modules/creators.ts', 'server/modules/video.ts', 'server/modules/uploads.ts', 'server/billing/features.ts'],
    databaseDependencies: ['creator_posts', 'creator_payouts', 'writer_purchases', 'videos', 'users', 'user_posts'],
    apiEndpoints: ['/api/creator/earnings', '/api/creator/earnings/history', '/api/creator/dashboard-analytics', '/api/creator/payouts', '/api/admin/creator/payouts', '/api/creator/post-status', '/api/creator/my-videos', '/api/creator/post-reel', '/api/creator/analytics', '/api/creator/videos/:id', '/api/creator/creator-xp', '/api/creator/share-to-you', '/api/creator/my-comments', '/api/creator/growth-path'],
    sharedDependencies: ['server/auth.ts', 'server/rate-limit.ts', 'server/billing/features.ts', 'shared/schema.ts'],
    aiIntegrations: ['server/ai.ts', 'server/mara-brain/agents/growth-engineer.ts'],
    assets: ['data/videos', 'data/images'],
    tests: [],
  },
  {
    id: 'membership',
    displayName: 'Membership',
    icon: '💎',
    routes: ['/membership', '/pricing'],
    frontendFiles: ['frontend/src/VIP.tsx', 'frontend/src/Pricing.tsx', 'frontend/src/styles/VIP.css', 'frontend/src/styles/Pricing.css', 'frontend/src/utils/featureAccess.test.ts'],
    backendFiles: ['server/billing/api.ts', 'server/billing/features.ts', 'server/billing/plans.ts', 'server/billing/seed.ts', 'server/billing/stripe.ts', 'server/billing/paypal.ts'],
    databaseDependencies: ['plans', 'subscriptions', 'premium_orders', 'users'],
    apiEndpoints: ['/api/billing/paypal/status', '/api/billing/plans', '/api/billing/me', '/api/billing/subscribe', '/api/billing/cancel', '/api/billing/stripe/webhook', '/api/billing/paypal/webhook'],
    sharedDependencies: ['server/auth.ts', 'server/rate-limit.ts', 'shared/models/billing.ts', 'shared/schema.ts'],
    aiIntegrations: [],
    assets: [],
    tests: ['frontend/src/utils/featureAccess.test.ts'],
  },
];

function existing(paths: readonly string[]): string[] {
  return paths.filter((file) => fs.existsSync(path.join(REPO_ROOT, file)));
}

function missing(paths: readonly string[]): string[] {
  return paths.filter((file) => !fs.existsSync(path.join(REPO_ROOT, file)));
}

function tableExists(table: string): boolean {
  try {
    const row = rawSqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").get(table) as { name: string } | undefined;
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

function moduleFromTask(task: UnifiedTask): string | null {
  const moduleId = task.metadata.moduleId;
  return typeof moduleId === 'string' ? moduleId : null;
}

// A module's health grid must reflect that module's own health, not Mara's
// unrelated background brain activity. Two bugs fixed here:
//
// 1. The fallback substring match (`task.title.includes(displayName)`) used
//    to run against EVERY task regardless of source. Only 'control' tasks
//    ever carry an explicit moduleId (see createCodeAgentRequestWithTask);
//    'learning' / 'growth_experiment' / 'p2p' tasks are whole-platform brain
//    cycles with no module of their own, so this matched them by accident —
//    a FAILED learning-cycle task (e.g. an LLM JSON-parsing hiccup, a real
//    bug fixed elsewhere this session) could mark a totally unrelated
//    module's `tasks` dimension 'error'. Now the fallback only considers
//    'control' tasks, same as the tasks that can actually carry a moduleId.
// 2. Plain `.includes()` on 'You' (the module with the shortest, most
//    common-word displayName) matched almost any task title containing the
//    word "you" ("notify you", "help you grow", …). Switched to a
//    word-boundary regex so only the whole word matches.
function taskBelongsToModule(task: UnifiedTask, definition: ModuleDefinition): boolean {
  if (moduleFromTask(task) === definition.id) return true;
  if (task.source !== 'control') return false;
  const nameWords = definition.displayName.toLowerCase().split(/\s+/).filter(Boolean);
  const pattern = new RegExp(`\\b${nameWords.map(escapeRegExp).join('\\s+')}\\b`, 'i');
  return pattern.test(task.title);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sharedWarnings(definition: ModuleDefinition, allDefinitions: readonly ModuleDefinition[]) {
  const warnings = new Map<string, string[]>();
  const files = [...new Set([...definition.frontendFiles, ...definition.backendFiles, ...definition.sharedDependencies])];
  for (const file of files) {
    const sharedBy = allDefinitions
      .filter((candidate) => candidate.id !== definition.id)
      .filter((candidate) => [...candidate.frontendFiles, ...candidate.backendFiles, ...candidate.sharedDependencies].includes(file))
      .map((candidate) => candidate.displayName);
    if (sharedBy.length) warnings.set(file, [definition.displayName, ...sharedBy]);
  }
  return [...warnings.entries()].map(([file, sharedBy]) => ({ file, sharedBy }));
}

function healthFromParts(parts: Omit<HelloMaraModuleStatus, 'overall'>): HelloMaraModuleStatus {
  const values = Object.values(parts);
  const overall: ModuleHealthState = values.includes('error') ? 'error' : values.includes('warning') ? 'warning' : values.every((value) => value === 'not_configured') ? 'not_configured' : 'healthy';
  return { overall, ...parts };
}

export async function readHelloMaraModules(): Promise<{ modules: HelloMaraModuleRegistryEntry[] }> {
  const [ai, git, tasksSnapshot] = await Promise.all([
    getAIHealth().catch(() => null),
    readRepositoryGitStatus().catch(() => ({ diff: { files: [] as string[], stat: '' } })),
    Promise.resolve(readTaskStatus(200)),
  ]);
  const changedFiles = new Set(git.diff.files);
  const modules = MODULE_DEFINITIONS.map((definition) => {
    const frontendFiles = existing(definition.frontendFiles);
    const backendFiles = existing(definition.backendFiles);
    const sharedDependencies = existing(definition.sharedDependencies);
    const tests = existing(definition.tests);
    const assets = existing(definition.assets);
    const missingFiles = [...missing(definition.frontendFiles), ...missing(definition.backendFiles), ...missing(definition.sharedDependencies)];
    const missingTables = definition.databaseDependencies.filter((table) => !tableExists(table));
    const moduleTasks = tasksSnapshot.tasks.filter((task) => taskBelongsToModule(task, definition));
    const activeTasks = moduleTasks.filter((task) => ['QUEUED', 'PLANNING', 'RUNNING', 'WAITING_APPROVAL'].includes(task.status));
    const recentChanges = [...definition.frontendFiles, ...definition.backendFiles, ...definition.sharedDependencies].filter((file) => changedFiles.has(file));
    const errors = moduleTasks.filter((task) => task.status === 'FAILED').map((task) => task.title).slice(0, 20);
    const warnings = [
      ...missingFiles.map((file) => `Expected module file is missing: ${file}`),
      ...missingTables.map((table) => `Database table not found in active SQLite runtime: ${table}`),
    ];
    const status = healthFromParts({
      frontend: frontendFiles.length === definition.frontendFiles.length ? 'healthy' : frontendFiles.length > 0 ? 'warning' : 'error',
      backend: backendFiles.length === definition.backendFiles.length ? 'healthy' : backendFiles.length > 0 ? 'warning' : 'error',
      database: missingTables.length === 0 ? 'healthy' : missingTables.length === definition.databaseDependencies.length ? 'error' : 'warning',
      ai: definition.aiIntegrations.length === 0 ? 'not_configured' : ai?.ok ? 'healthy' : ai?.configured ? 'warning' : 'not_configured',
      tasks: errors.length > 0 ? 'error' : activeTasks.length > 0 ? 'warning' : 'healthy',
      tests: definition.tests.length === 0 ? 'warning' : tests.length === definition.tests.length ? 'healthy' : 'warning',
    });
    return {
      ...definition,
      frontendFiles,
      backendFiles,
      sharedDependencies,
      assets,
      tests,
      healthStatus: status,
      activeTasks,
      recentChanges,
      errors,
      warnings,
      sharedWarnings: sharedWarnings(definition, MODULE_DEFINITIONS),
    };
  });
  return { modules };
}

export async function readHelloMaraModule(id: string): Promise<HelloMaraModuleRegistryEntry | null> {
  const { modules } = await readHelloMaraModules();
  return modules.find((module) => module.id === id) ?? null;
}

export function isHelloMaraModuleId(id: string): id is HelloMaraModuleRegistryEntry['id'] {
  return MODULE_DEFINITIONS.some((module) => module.id === id);
}