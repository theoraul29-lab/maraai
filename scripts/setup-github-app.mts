import { readFile } from 'node:fs/promises';
import { storeGitHubAppCredential } from '../server/services/github/credentials.js';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const appId = arg('app-id');
const installationId = arg('installation-id');
const privateKeyFile = arg('private-key-file');

if (!appId || !installationId || !privateKeyFile) {
  console.error('Usage: npm run github:setup -- --app-id=<id> --installation-id=<id> --private-key-file=<path-to-pem>');
  process.exit(2);
}

const privateKey = await readFile(privateKeyFile, 'utf8');
await storeGitHubAppCredential({ appId, installationId, privateKey });
console.log('GitHub App credential stored securely with Windows DPAPI.');