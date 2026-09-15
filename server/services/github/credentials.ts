import { deleteSecureCredential, getSecureCredential, hasSecureCredential, setSecureCredential } from '../secure-credential-store.js';

const CREDENTIAL_NAME = 'github-app';

export interface GitHubAppCredential {
  appId: string;
  installationId: string;
  privateKey: string;
}

function parseCredential(raw: string): GitHubAppCredential {
  const parsed = JSON.parse(raw) as Partial<GitHubAppCredential>;
  if (!parsed.appId || !/^\d+$/.test(String(parsed.appId))) throw new Error('GitHub App ID is invalid or missing');
  if (!parsed.installationId || !/^\d+$/.test(String(parsed.installationId))) throw new Error('GitHub Installation ID is invalid or missing');
  if (!parsed.privateKey || !String(parsed.privateKey).includes('BEGIN')) throw new Error('GitHub private key is invalid or missing');
  return { appId: String(parsed.appId), installationId: String(parsed.installationId), privateKey: String(parsed.privateKey) };
}

export async function storeGitHubAppCredential(credential: GitHubAppCredential): Promise<void> {
  parseCredential(JSON.stringify(credential));
  await setSecureCredential(CREDENTIAL_NAME, JSON.stringify(credential));
}

export async function readGitHubAppCredential(): Promise<GitHubAppCredential | null> {
  const raw = await getSecureCredential(CREDENTIAL_NAME);
  if (!raw) return null;
  return parseCredential(raw);
}

export async function deleteGitHubAppCredential(): Promise<void> {
  await deleteSecureCredential(CREDENTIAL_NAME);
}

export async function hasGitHubAppCredential(): Promise<boolean> {
  return hasSecureCredential(CREDENTIAL_NAME);
}