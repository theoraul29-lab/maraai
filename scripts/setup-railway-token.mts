import { storeRailwayToken } from '../server/services/railway/credentials.js';

let token = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) token += chunk;
token = token.trim();
if (!token) {
  console.error('Railway token was not provided on stdin.');
  process.exit(2);
}
await storeRailwayToken(token);
console.log('Railway credential stored securely with Windows DPAPI.');