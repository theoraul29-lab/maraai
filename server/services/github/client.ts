import { getGitHubInstallationToken, GitHubIntegrationError } from './auth.js';

export const GITHUB_OWNER = 'theoraul29-lab';
export const GITHUB_REPO = 'maraai';

export interface GitHubApiResponse<T> {
  status: number;
  data: T;
  rateLimitRemaining: string | null;
}

export async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<GitHubApiResponse<T>> {
  const token = await getGitHubInstallationToken();
  const method = init.method ?? 'GET';
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.token}`,
      'User-Agent': 'MaraAI-Desktop',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  console.info(`[GitHub API] ${method} ${path} status=${response.status}`);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data && typeof data.message === 'string' ? data.message : `GitHub returned ${response.status}`;
    throw new GitHubIntegrationError(response.status === 403 ? 'permission_denied' : response.status === 404 ? 'repository_not_found' : 'github_api_error', message);
  }
  return { status: response.status, data: data as T, rateLimitRemaining: response.headers.get('x-ratelimit-remaining') };
}

export function repoPath(suffix = ''): string {
  return `/repos/${GITHUB_OWNER}/${GITHUB_REPO}${suffix}`;
}