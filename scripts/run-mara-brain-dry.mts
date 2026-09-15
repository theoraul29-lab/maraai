const required: Record<string, string> = {
  PROCESS_AI_TASKS: 'false',
  BRAIN_DRY_RUN: 'true',
  AI_PROVIDER: 'ollama',
  OLLAMA_MODEL: 'llama3.1:8b',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  ANTHROPIC_FALLBACK_ENABLED: 'false',
};

import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrainRunContext } from '../server/mara-brain/run-context.js';

const reportPath = path.resolve(process.cwd(), 'data/mara-brain-dry-run-report.json');
const lifecycle: string[] = ['runner:start'];
const startedAt = Date.now();

function errorDetails(error: unknown): { message: string; stack?: string; name: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  }
  return { name: 'UnknownError', message: String(error) };
}

async function writeReport(report: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(report, null, 2);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${json}\n`, 'utf8');
  return json;
}

function baseReport(status: 'success' | 'failure'): Record<string, unknown> {
  return {
    executionStatus: status,
    lifecycleMarkers: [...lifecycle],
    brainPhases: [],
    agents: {},
    ollama: {
      provider: process.env.AI_PROVIDER ?? null,
      model: process.env.OLLAMA_MODEL ?? null,
      endpoint: process.env.OLLAMA_BASE_URL ?? null,
      requests: 0,
      success: false,
      calls: [],
      results: [],
      note: 'Per-call Ollama telemetry is not exposed by the current provider contract.',
    },
    provider: process.env.AI_PROVIDER ?? null,
    model: process.env.OLLAMA_MODEL ?? null,
    llm: {
      calls: 0,
      provider: process.env.AI_PROVIDER ?? null,
      model: process.env.OLLAMA_MODEL ?? null,
      success: false,
    },
    latencyMs: Date.now() - startedAt,
    phaseTrace: [],
    dryRunWriteCounters: {},
    network: {
      externalResearch: 'blocked',
      notifications: 'blocked',
    },
    error: null,
    finalBrainOutput: null,
    reportPath,
  };
}

async function main(): Promise<void> {
  dotenv.config();

  for (const [key, value] of Object.entries(required)) {
    if (process.env[key] !== value) {
      throw new Error(`[BrainDryRun] Refusing to run: ${key} must equal ${value}.`);
    }
  }
  lifecycle.push('env:validated');

  const { createDryRunContext } = await import('../server/mara-brain/run-context.js');
  const { runBrainCycle } = await import('../server/mara-brain/core.js');
  lifecycle.push('imports:loaded');

  const context = createDryRunContext() as BrainRunContext;
  lifecycle.push('cycle:before');
  const result = await runBrainCycle(context);
  lifecycle.push('cycle:after');

  const report = baseReport('success');
  report.latencyMs = Date.now() - startedAt;
  report.lifecycleMarkers = [...lifecycle];
  report.brainPhases = context.phaseTrace.filter((phase) => phase.startsWith('phase:'));
  report.agents = context.agents;
  report.ollama = {
    provider: process.env.AI_PROVIDER ?? null,
    model: process.env.OLLAMA_MODEL ?? null,
    endpoint: process.env.OLLAMA_BASE_URL ?? null,
    requests: context.llmCalls.filter((call) => call.provider === 'ollama').length,
    success: context.llmCalls.some((call) => call.provider === 'ollama' && call.success),
    calls: context.llmCalls,
    results: context.llmCalls.map((call) => ({
      provider: call.provider,
      model: call.model,
      success: call.success,
      latencyMs: call.latencyMs,
      ...(call.error ? { error: call.error } : {}),
    })),
  };
  report.llm = {
    calls: context.llmCalls.length,
    provider: process.env.AI_PROVIDER ?? null,
    model: process.env.OLLAMA_MODEL ?? null,
    success: context.llmCalls.some((call) => call.success),
  };
  report.persistent_writes = 0;
  report.phaseTrace = context.phaseTrace;
  report.dryRunWriteCounters = context.writeCounters;
  report.finalBrainOutput = result;
  report.sinkSizes = {
    knowledge: context.knowledge.length,
    learningQueue: context.learningQueue.length,
    growthExperiments: context.growthExperiments.length,
    platformInsights: context.platformInsights.length,
    session: context.session ? 1 : 0,
    researchUnavailable: context.researchUnavailable,
  };
  lifecycle.push('report:written');
  report.lifecycleMarkers = [...lifecycle];

  const json = await writeReport(report);
  console.log(json);
}

try {
  await main();
} catch (error) {
  const details = errorDetails(error);
  const report = baseReport('failure');
  lifecycle.push('report:written');
  report.lifecycleMarkers = [...lifecycle];
  report.latencyMs = Date.now() - startedAt;
  report.error = details;

  try {
    const json = await writeReport(report);
    console.log(json);
  } catch (reportError) {
    console.error('[BrainDryRun] Failed to write failure report:', errorDetails(reportError));
  }
  console.error('[BrainDryRun] Runner failed:', details.message);
  if (details.stack) console.error(details.stack);
  process.exitCode = 1;
}
