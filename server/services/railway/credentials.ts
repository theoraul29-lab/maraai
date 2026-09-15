import { deleteSecureCredential, getSecureCredential, hasSecureCredential, setSecureCredential } from '../secure-credential-store.js';

const CREDENTIAL_NAME = 'railway-api-token';

export async function storeRailwayToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length < 20) throw new Error('Railway token is invalid or missing');
  await setSecureCredential(CREDENTIAL_NAME, trimmed);
}

export async function readRailwayToken(): Promise<string | null> {
  return getSecureCredential(CREDENTIAL_NAME);
}

export async function deleteRailwayToken(): Promise<void> {
  await deleteSecureCredential(CREDENTIAL_NAME);
}

export async function hasRailwayToken(): Promise<boolean> {
  return hasSecureCredential(CREDENTIAL_NAME);
}