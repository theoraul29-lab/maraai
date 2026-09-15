import path from 'node:path';

process.env.MARAAI_REPO_ROOT = path.resolve(process.cwd());

const { readRailwayStatus } = await import('../server/services/railway/operations.js');
const { verifyRailwayApiAuthentication } = await import('../server/services/railway/api.js');

const status = await readRailwayStatus();
let apiAuthentication = 'FAIL';
let railwayApiError: string | undefined;
try {
  const api = await verifyRailwayApiAuthentication();
  apiAuthentication = api.ok ? 'PASS' : 'FAIL';
} catch (error) {
  apiAuthentication = 'FAIL';
  railwayApiError = error instanceof Error ? error.message : String(error);
}
const report = {
  credentialConfigured: status.authentication === 'TOKEN' ? 'PASS' : 'FAIL',
  secureCredentialStorage: status.authentication === 'TOKEN' ? 'PASS' : 'NOT_USED_CLI_AUTH',
  railwayApiAuthentication: apiAuthentication,
  railwayApiError,
  railwayAuthentication: status.connected ? 'PASS' : 'FAIL',
  accountVerification: status.workspace ? 'PASS' : 'FAIL',
  projectVerification: status.project === 'MaraAi' && status.projectId === '0eaed5d8-8621-46c6-88a1-d37771016b57' ? 'PASS' : 'FAIL',
  serviceVerification: status.service === 'maraai' && status.serviceId === '72ae52ed-40b1-40cb-bf71-01d60f12ec55' ? 'PASS' : 'FAIL',
  environmentVerification: status.environment === 'production' && status.environmentId === 'db1888bc-d46b-4455-b623-b8d632a822bf' ? 'PASS' : 'FAIL',
  serviceStatus: status.serviceStatus ? 'PASS' : 'FAIL',
  deploymentList: status.deployments.length > 0 ? 'PASS' : 'PARTIAL',
  latestDeployment: status.latestDeploymentId ? 'PASS' : 'FAIL',
  deploymentStatus: status.serviceStatus ?? 'unknown',
  deploymentLogs: status.logs.length > 0 ? 'PASS' : 'PARTIAL',
  authenticationMode: status.authentication,
  project: status.project,
  projectId: status.projectId,
  service: status.service,
  serviceId: status.serviceId,
  environment: status.environment,
  environmentId: status.environmentId,
  latestDeploymentId: status.latestDeploymentId,
  url: status.url,
  region: status.region,
  logLines: status.logs.length,
  error: status.error,
};
console.log(JSON.stringify(report, null, 2));
if (!status.connected) process.exit(1);