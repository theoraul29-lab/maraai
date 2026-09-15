import crypto from 'node:crypto';
import { readGitHubAppCredential } from './credentials.js';

export class GitHubIntegrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GitHubIntegrationError';
    this.code = code;
  }
}

export interface GitHubInstallationToken {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
  repositorySelection?: string;
}

export interface GitHubAppInstallationIdentity {
  appName: string | null;
  appSlug: string | null;
  accountLogin: string | null;
  accountType: string | null;
  repositorySelection: string | null;
}

let cachedToken: GitHubInstallationToken | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export async function createGitHubAppJwt(): Promise<string> {
  const credential = await readGitHubAppCredential();
  if (!credential) throw new GitHubIntegrationError('github_app_not_configured', 'GitHub App credential is not configured.');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: credential.appId };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  try {
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), credential.privateKey);
    return `${signingInput}.${signature.toString('base64url')}`;
  } catch {
    throw new GitHubIntegrationError('invalid_private_key', 'GitHub private key could not sign an app JWT.');
  }
}

export async function getGitHubInstallationToken(forceRefresh = false): Promise<GitHubInstallationToken> {
  if (!forceRefresh && cachedToken && Date.parse(cachedToken.expiresAt) - Date.now() > 60_000) return cachedToken;
  const credential = await readGitHubAppCredential();
  if (!credential) throw new GitHubIntegrationError('github_app_not_configured', 'GitHub App credential is not configured.');
  const jwt = await createGitHubAppJwt();
  const response = await fetch(`https://api.github.com/app/installations/${credential.installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'User-Agent': 'MaraAI-Desktop',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : `GitHub returned ${response.status}`;
    throw new GitHubIntegrationError(response.status === 404 ? 'installation_not_found' : 'installation_token_failed', message);
  }
  if (typeof body.token !== 'string' || typeof body.expires_at !== 'string') {
    throw new GitHubIntegrationError('installation_token_invalid', 'GitHub installation token response was invalid.');
  }
  cachedToken = {
    token: body.token,
    expiresAt: body.expires_at,
    permissions: body.permissions && typeof body.permissions === 'object' ? body.permissions as Record<string, string> : {},
    repositorySelection: typeof body.repository_selection === 'string' ? body.repository_selection : undefined,
  };
  return cachedToken;
}

export function clearGitHubTokenCache(): void {
  cachedToken = null;
}

export async function getGitHubAppInstallationIdentity(): Promise<GitHubAppInstallationIdentity> {
  const credential = await readGitHubAppCredential();
  if (!credential) throw new GitHubIntegrationError('github_app_not_configured', 'GitHub App credential is not configured.');
  const jwt = await createGitHubAppJwt();
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${jwt}`,
    'User-Agent': 'MaraAI-Desktop',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const [appResponse, installationResponse] = await Promise.all([
    fetch('https://api.github.com/app', { headers }),
    fetch(`https://api.github.com/app/installations/${credential.installationId}`, { headers }),
  ]);
  const app = await appResponse.json().catch(() => ({})) as Record<string, unknown>;
  const installation = await installationResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!appResponse.ok) throw new GitHubIntegrationError('github_app_identity_failed', typeof app.message === 'string' ? app.message : `GitHub returned ${appResponse.status}`);
  if (!installationResponse.ok) throw new GitHubIntegrationError('installation_not_found', typeof installation.message === 'string' ? installation.message : `GitHub returned ${installationResponse.status}`);
  const account = installation.account && typeof installation.account === 'object' ? installation.account as Record<string, unknown> : {};
  return {
    appName: typeof app.name === 'string' ? app.name : null,
    appSlug: typeof app.slug === 'string' ? app.slug : null,
    accountLogin: typeof account.login === 'string' ? account.login : null,
    accountType: typeof account.type === 'string' ? account.type : null,
    repositorySelection: typeof installation.repository_selection === 'string' ? installation.repository_selection : null,
  };
}