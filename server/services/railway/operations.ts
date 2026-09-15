import { hasRailwayToken } from './credentials.js';
import { parseRailwayStatus, redactRailwayLogLine, runRailwayCli } from './cli.js';

const RAILWAY_PROJECT_ID = '0eaed5d8-8621-46c6-88a1-d37771016b57';
const RAILWAY_SERVICE_ID = '72ae52ed-40b1-40cb-bf71-01d60f12ec55';
const RAILWAY_ENVIRONMENT = 'production';
const RAILWAY_ENVIRONMENT_ID = 'db1888bc-d46b-4455-b623-b8d632a822bf';

export interface RailwayDeploymentSummary {
  id: string;
  status: string;
  service?: string | null;
  environment?: string | null;
  createdAt?: string | null;
  commitHash?: string | null;
  skippedReason?: string | null;
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
  deployments: RailwayDeploymentSummary[];
  latestDeployment: RailwayDeploymentSummary | null;
  logs: string[];
  variableMetadata: Array<{ name: string; value: 'REDACTED' | 'NOT_READ' }>;
  writeCapability: 'PLAN_ONLY' | 'NOT_AVAILABLE';
  lastCheckedAt: string;
  error?: { code: string; message: string };
}

export type RailwayWriteOperationType = 'deploy' | 'redeploy' | 'restart' | 'update_variables';

export interface RailwayWritePlan {
  service: 'railway';
  operation: RailwayWriteOperationType;
  ownerConfirmationRequired: true;
  what: string;
  why: string;
  target: string;
  expectedEffect: string;
  payload: Record<string, unknown>;
}

function parseJson<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}

function parseStatusJson(text: string) {
  const project = parseJson<any>(text);
  if (!project) return null;
  const environment = project.environments?.edges?.[0]?.node ?? null;
  const serviceInstance = environment?.serviceInstances?.edges?.find((edge: any) => edge?.node?.serviceId === RAILWAY_SERVICE_ID)?.node ?? environment?.serviceInstances?.edges?.[0]?.node ?? null;
  const service = project.services?.edges?.find((edge: any) => edge?.node?.id === RAILWAY_SERVICE_ID)?.node ?? project.services?.edges?.[0]?.node ?? null;
  const latest = serviceInstance?.latestDeployment ?? null;
  const customDomain = serviceInstance?.domains?.customDomains?.[0]?.domain ?? null;
  const serviceDomain = serviceInstance?.domains?.serviceDomains?.[0]?.domain ?? null;
  const volume = environment?.volumeInstances?.edges?.find((edge: any) => edge?.node?.serviceId === RAILWAY_SERVICE_ID)?.node ?? null;
  const regionConfig = latest?.meta?.serviceManifest?.deploy?.multiRegionConfig ?? latest?.meta?.fileServiceManifest?.deploy?.multiRegionConfig ?? null;
  return {
    workspace: project.workspace?.name ?? null,
    project: project.name ?? null,
    projectId: project.id ?? null,
    environment: environment?.name ?? null,
    environmentId: environment?.id ?? null,
    service: service?.name ?? serviceInstance?.serviceName ?? null,
    serviceStatus: latest?.status ?? null,
    url: customDomain ? `https://${customDomain}` : serviceDomain ? `https://${serviceDomain}` : null,
    volume: volume?.volume?.name ? `${volume.volume.name} · ${volume.mountPath} · ${Math.round(Number(volume.currentSizeMB ?? 0))} MB / ${Math.round(Number(volume.sizeMB ?? 0))} MB` : null,
    region: regionConfig ? Object.keys(regionConfig)[0] ?? null : null,
    latestDeploymentId: latest?.id ?? null,
    serviceId: service?.id ?? serviceInstance?.serviceId ?? null,
  };
}

function parseDeployments(text: string): RailwayDeploymentSummary[] {
  const parsed = parseJson<any[]>(text);
  if (Array.isArray(parsed)) {
    return parsed.slice(0, 20).map((deployment) => ({
      id: String(deployment.id ?? 'unknown'),
      status: String(deployment.status ?? 'unknown'),
      createdAt: typeof deployment.createdAt === 'string' ? deployment.createdAt : null,
      commitHash: typeof deployment.meta?.commitHash === 'string' ? deployment.meta.commitHash : null,
      skippedReason: typeof deployment.meta?.skippedReason === 'string' ? deployment.meta.skippedReason : null,
    }));
  }
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /[0-9a-f]{8}-[0-9a-f-]{27}/i.test(line) || /\b(FAILED|SUCCESS|REMOVED|BUILDING|DEPLOYING|CRASHED|COMPLETE|SKIPPED)\b/i.test(line))
    .slice(0, 20)
    .map((line) => ({
      id: line.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0] ?? 'unknown',
      status: line.match(/\b(FAILED|SUCCESS|REMOVED|BUILDING|DEPLOYING|CRASHED|COMPLETE|SKIPPED|failed|success|building|deploying|crashed|complete|skipped)\b/)?.[0] ?? 'unknown',
    }));
}

export async function readRailwayStatus(): Promise<RailwayStatusSnapshot> {
  const lastCheckedAt = new Date().toISOString();
  const tokenConfigured = await hasRailwayToken().catch(() => false);
  const statusResult = await runRailwayCli(['status', '--project', RAILWAY_PROJECT_ID, '--environment', RAILWAY_ENVIRONMENT, '--json']);
  if (statusResult.exitCode !== 0) {
    return {
      configured: tokenConfigured,
      connected: false,
      authentication: tokenConfigured ? 'TOKEN' : 'NOT_CONFIGURED',
      workspace: null,
      project: null,
      projectId: null,
      service: null,
      serviceId: null,
      environment: null,
      environmentId: null,
      serviceStatus: null,
      url: null,
      region: null,
      volume: null,
      latestDeploymentId: null,
      deployments: [],
      latestDeployment: null,
      logs: [],
      variableMetadata: [],
      writeCapability: 'NOT_AVAILABLE',
      lastCheckedAt,
      error: { code: 'railway_cli_status_failed', message: statusResult.stderr || 'Railway CLI status failed.' },
    };
  }
  const status = parseStatusJson(statusResult.stdout) ?? parseRailwayStatus(statusResult.stdout);
  const deploymentsResult = await runRailwayCli(['deployment', 'list', '--project', RAILWAY_PROJECT_ID, '--environment', RAILWAY_ENVIRONMENT, '--service', RAILWAY_SERVICE_ID, '--limit', '20', '--json']);
  const deployments = deploymentsResult.exitCode === 0 ? parseDeployments(deploymentsResult.stdout) : [];
  const latestDeploymentId = status.latestDeploymentId ?? deployments[0]?.id ?? null;
  const logsResult = latestDeploymentId
    ? await runRailwayCli(['logs', latestDeploymentId, '--project', RAILWAY_PROJECT_ID, '--environment', RAILWAY_ENVIRONMENT, '--service', RAILWAY_SERVICE_ID, '--deployment', '--lines', '80'])
    : await runRailwayCli(['logs', '--latest', '--project', RAILWAY_PROJECT_ID, '--environment', RAILWAY_ENVIRONMENT, '--service', RAILWAY_SERVICE_ID, '--deployment', '--lines', '80']);
  const logs = logsResult.exitCode === 0
    ? logsResult.stdout.split(/\r?\n/).map(redactRailwayLogLine).filter(Boolean).slice(-80)
    : [];
  return {
    configured: true,
    connected: true,
    authentication: tokenConfigured ? 'TOKEN' : 'CLI',
    workspace: status.workspace,
    project: status.project,
    projectId: status.projectId,
    service: status.service,
    serviceId: status.serviceId,
    environment: status.environment,
    environmentId: status.environmentId ?? RAILWAY_ENVIRONMENT_ID,
    serviceStatus: status.serviceStatus,
    url: status.url,
    region: status.region,
    volume: status.volume,
    latestDeploymentId,
    deployments,
    latestDeployment: deployments.find((deployment) => deployment.id === latestDeploymentId) ?? deployments[0] ?? null,
    logs,
    variableMetadata: [],
    writeCapability: 'PLAN_ONLY',
    lastCheckedAt,
  };
}

export function prepareRailwayWriteOperation(operation: RailwayWriteOperationType, payload: Record<string, unknown>, reason: string): RailwayWritePlan {
  return {
    service: 'railway',
    operation,
    ownerConfirmationRequired: true,
    what: operation,
    why: reason.slice(0, 1000),
    target: 'MaraAi / maraai / production',
    expectedEffect: 'No Railway action is executed by this plan. Execution requires a separate owner-confirmed task.',
    payload,
  };
}