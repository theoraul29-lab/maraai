import { AsyncLocalStorage } from 'node:async_hooks';

export interface DryRunKnowledge {
  id: number;
  category: string;
  topic: string;
  content: string;
  source: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface BrainRunContext {
  dryRun: boolean;
  network: 'blocked' | 'allowed';
  notifications: 'blocked' | 'allowed';
  knowledge: DryRunKnowledge[];
  learningQueue: Array<Record<string, unknown>>;
  session: Record<string, unknown> | null;
  growthExperiments: Array<Record<string, unknown>>;
  platformInsights: Array<Record<string, unknown>>;
  phaseTrace: string[];
  agents: Record<string, 'executed' | 'skipped' | 'failed'>;
  llmCalls: Array<{
    provider: string;
    model: string;
    source?: string;
    success: boolean;
    latencyMs: number;
    error?: string;
  }>;
  writeCounters: Record<string, number>;
  researchUnavailable: number;
  nextId: () => number;
  recordWrite: (kind: string) => void;
  recordPhase: (phase: string) => void;
  recordAgent: (name: string, status: 'executed' | 'skipped' | 'failed') => void;
  recordLLMCall: (call: BrainRunContext['llmCalls'][number]) => void;
}

const contextStorage = new AsyncLocalStorage<BrainRunContext>();

export function getBrainRunContext(): BrainRunContext | undefined {
  return contextStorage.getStore();
}

export function withBrainRunContext<T>(context: BrainRunContext, task: () => Promise<T>): Promise<T> {
  return contextStorage.run(context, task);
}

export function createDryRunContext(): BrainRunContext {
  let id = -1;
  const context = {
    dryRun: true,
    network: 'blocked',
    notifications: 'blocked',
    knowledge: [],
    learningQueue: [],
    session: null,
    growthExperiments: [],
    platformInsights: [],
    phaseTrace: [],
    agents: {},
    llmCalls: [],
    writeCounters: {},
    researchUnavailable: 0,
    nextId: () => id--,
    recordWrite: (kind) => {
      // A write is recorded only after it has been redirected to memory.
      context.writeCounters[kind] = (context.writeCounters[kind] ?? 0) + 1;
    },
    recordPhase: (phase) => context.phaseTrace.push(phase),
    recordAgent: (name, status) => { context.agents[name] = status; },
    recordLLMCall: (call) => { context.llmCalls.push(call); },
  } as BrainRunContext;
  return context;
}

export function recordResearchUnavailable(): void {
  const context = getBrainRunContext();
  if (context?.dryRun) context.researchUnavailable++;
}

export function assertPersistentWriteAllowed(operation: string): void {
  const context = getBrainRunContext();
  if (context?.dryRun) {
    throw new Error(`[BrainDryRun] Persistent write not intercepted: ${operation}`);
  }
}
