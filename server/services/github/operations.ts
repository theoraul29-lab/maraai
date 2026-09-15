import { getGitHubInstallationToken } from './auth.js';
import { GITHUB_OWNER, GITHUB_REPO, githubRequest, repoPath } from './client.js';
import { hasGitHubAppCredential } from './credentials.js';

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

interface RepoResponse { default_branch?: string; full_name?: string }
interface BranchResponse { name: string; commit: { sha: string } }
interface CommitResponse { sha: string; commit?: { message?: string; author?: { name?: string; date?: string } } }
interface IssueResponse { number: number; title: string; state: string; html_url: string; pull_request?: unknown }
interface PullResponse { number: number; title: string; state: string; html_url: string }
interface RunsResponse { workflow_runs?: Array<{ id: number; name?: string | null; status: string; conclusion?: string | null; html_url: string }> }

function writeCapability(permissions: Record<string, string>): 'AVAILABLE' | 'NOT_AVAILABLE' {
  return permissions.contents === 'write' && permissions.pull_requests === 'write' && permissions.issues === 'write' ? 'AVAILABLE' : 'NOT_AVAILABLE';
}

export async function readGitHubStatus(): Promise<GitHubStatusSnapshot> {
  const lastCheckedAt = new Date().toISOString();
  const configured = await hasGitHubAppCredential();
  if (!configured) {
    return { configured: false, connected: false, repository: `${GITHUB_OWNER}/${GITHUB_REPO}`, defaultBranch: null, latestCommit: null, branches: [], issues: [], pullRequests: [], workflowRuns: [], permissions: {}, writeCapability: 'NOT_AVAILABLE', lastCheckedAt, error: { code: 'github_app_not_configured', message: 'GitHub App credential is not configured.' } };
  }
  try {
    const token = await getGitHubInstallationToken();
    const [repo, branches, commits, issues, pulls, runs] = await Promise.all([
      githubRequest<RepoResponse>(repoPath()),
      githubRequest<BranchResponse[]>(repoPath('/branches?per_page=100')),
      githubRequest<CommitResponse[]>(repoPath('/commits?per_page=10')),
      githubRequest<IssueResponse[]>(repoPath('/issues?state=all&per_page=20')),
      githubRequest<PullResponse[]>(repoPath('/pulls?state=all&per_page=20')),
      githubRequest<RunsResponse>(repoPath('/actions/runs?per_page=10')),
    ]);
    const latest = commits.data[0];
    return {
      configured: true,
      connected: true,
      repository: repo.data.full_name ?? `${GITHUB_OWNER}/${GITHUB_REPO}`,
      defaultBranch: repo.data.default_branch ?? null,
      latestCommit: latest ? { sha: latest.sha, message: latest.commit?.message ?? '', author: latest.commit?.author?.name ?? null, date: latest.commit?.author?.date ?? null } : null,
      branches: branches.data.map((branch) => ({ name: branch.name, sha: branch.commit.sha })),
      issues: issues.data.filter((issue) => !issue.pull_request).map((issue) => ({ number: issue.number, title: issue.title, state: issue.state, url: issue.html_url })),
      pullRequests: pulls.data.map((pull) => ({ number: pull.number, title: pull.title, state: pull.state, url: pull.html_url })),
      workflowRuns: (runs.data.workflow_runs ?? []).map((run) => ({ id: run.id, name: run.name ?? null, status: run.status, conclusion: run.conclusion ?? null, htmlUrl: run.html_url })),
      permissions: token.permissions,
      writeCapability: writeCapability(token.permissions),
      lastCheckedAt,
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : 'github_error';
    return { configured: true, connected: false, repository: `${GITHUB_OWNER}/${GITHUB_REPO}`, defaultBranch: null, latestCommit: null, branches: [], issues: [], pullRequests: [], workflowRuns: [], permissions: {}, writeCapability: 'NOT_AVAILABLE', lastCheckedAt, error: { code, message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function readGitHubFile(filePath: string, ref = 'main') {
  const clean = filePath.replace(/^\/+/, '');
  return githubRequest(repoPath(`/contents/${encodeURIComponent(clean).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`));
}

export type GitHubWriteOperationType = 'create_branch' | 'write_file' | 'create_issue' | 'update_issue' | 'create_pull_request';

export interface GitHubWritePlan {
  service: 'github';
  operation: GitHubWriteOperationType;
  ownerConfirmationRequired: true;
  what: string;
  why: string;
  target: string;
  expectedEffect: string;
  payload: Record<string, unknown>;
}

export function prepareGitHubWriteOperation(operation: GitHubWriteOperationType, payload: Record<string, unknown>, reason: string): GitHubWritePlan {
  return {
    service: 'github',
    operation,
    ownerConfirmationRequired: true,
    what: operation,
    why: reason.slice(0, 1000),
    target: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    expectedEffect: 'No remote change is executed by this plan. Execution requires a separate owner-confirmed task.',
    payload,
  };
}