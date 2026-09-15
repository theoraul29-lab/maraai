import { createGitHubAppJwt, getGitHubAppInstallationIdentity, getGitHubInstallationToken } from '../server/services/github/auth.js';
import { readGitHubFile, readGitHubStatus } from '../server/services/github/operations.js';

const EXPECTED_ACCOUNT = 'theoraul29-lab';
const EXPECTED_REPOSITORY = 'theoraul29-lab/maraai';

const report: Record<string, unknown> = {};

try {
  await createGitHubAppJwt();
  report.jwt = 'PASS';
} catch (error) {
  report.jwt = 'FAIL';
  report.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

try {
  const identity = await getGitHubAppInstallationIdentity();
  report.githubApp = identity.appName ?? identity.appSlug ?? 'UNKNOWN';
  report.account = identity.accountLogin;
  report.accountVerification = identity.accountLogin === EXPECTED_ACCOUNT ? 'PASS' : 'FAIL';
  report.repositorySelection = identity.repositorySelection;
  if (identity.accountLogin !== EXPECTED_ACCOUNT) {
    report.error = `GitHub App installation account mismatch. Expected ${EXPECTED_ACCOUNT}.`;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
} catch (error) {
  report.accountVerification = 'FAIL';
  report.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

try {
  const token = await getGitHubInstallationToken(true);
  report.installationToken = 'PASS';
  report.writeCapability = token.permissions.contents === 'write' && token.permissions.pull_requests === 'write' && token.permissions.issues === 'write' ? 'AVAILABLE' : 'NOT_AVAILABLE';
  report.permissions = Object.fromEntries(Object.entries(token.permissions).map(([key, value]) => [key, value]));
} catch (error) {
  report.installationToken = 'FAIL';
  report.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const status = await readGitHubStatus();
report.connected = status.connected ? 'PASS' : 'FAIL';
report.repository = status.repository;
report.repositoryVerification = status.repository === EXPECTED_REPOSITORY ? 'PASS' : 'FAIL';
report.defaultBranch = status.defaultBranch;
report.latestCommit = status.latestCommit?.sha.slice(0, 12) ?? null;
report.branches = status.branches.length;
report.commits = status.latestCommit ? 'PASS' : 'FAIL';
report.issues = status.issues.length;
report.pullRequests = status.pullRequests.length;
report.workflowRuns = status.workflowRuns.length;
report.actions = status.workflowRuns.length >= 0 ? 'PASS' : 'FAIL';

try {
  await readGitHubFile('README.md', status.defaultBranch ?? 'main');
  report.fileRead = 'PASS';
} catch (error) {
  report.fileRead = 'FAIL';
  report.fileReadError = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify(report, null, 2));