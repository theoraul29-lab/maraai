/**
 * Mara's local execution bridge — runs only on the owner's laptop, never in
 * production. Production keeps every bit of task-queue/approval/audit logic;
 * this process only performs the actual filesystem/git action for the task
 * types production cannot safely do itself (no git binary, no .git, no
 * GitHub credentials, ephemeral container filesystem). See
 * server/services/bridge-client.ts for the production-side caller and the
 * full rationale.
 *
 * Reachable only through the Cloudflare Tunnel hostname in MARA_BRIDGE_URL,
 * authenticated with a single shared bearer token (MARA_BRIDGE_TOKEN) — the
 * same secret is set on Railway and here. Anyone holding that token can
 * write files and push to this repository's `main`, so it is generated
 * once, stored like any other production secret, and never logged.
 *
 * Run with: npm run bridge:server
 */
import dotenv from 'dotenv';
dotenv.config();

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  commitApprovedStaged,
  createApprovedBranch,
  pushCurrentBranch,
  runControlledCommand,
  stageApprovedPaths,
  type ControlledCommand,
} from '../services/controlled-execution.js';
import { applyApprovedRepositoryChanges } from '../services/repository-modifier.js';

const PORT = Number(process.env.MARA_BRIDGE_PORT) || 4790;
const TOKEN = process.env.MARA_BRIDGE_TOKEN;

if (!TOKEN || TOKEN.length < 32) {
  console.error('[bridge] MARA_BRIDGE_TOKEN is missing or too short — refusing to start.');
  process.exit(1);
}

type BridgeHandler = (payload: Record<string, unknown>) => Promise<unknown>;

function controlledCommand(command: ControlledCommand): BridgeHandler {
  return (payload) => runControlledCommand(command, { taskId: typeof payload.taskId === 'number' ? payload.taskId : undefined });
}

const handlers: Record<string, BridgeHandler> = {
  'repository.apply_changes': (payload) => applyApprovedRepositoryChanges(Number(payload.taskId), payload.changes),
  'git.create_branch': (payload) => createApprovedBranch(String(payload.branch ?? '')),
  'git.stage_proposal': (payload) => stageApprovedPaths(payload.paths),
  'git.commit_staged': (payload) => commitApprovedStaged(String(payload.message ?? '')),
  'git.push': () => pushCurrentBranch(),
  'project.typecheck': controlledCommand('project.typecheck'),
  'server.build': controlledCommand('server.build'),
  'frontend.typecheck': controlledCommand('frontend.typecheck'),
  'frontend.build': controlledCommand('frontend.build'),
};

function safeTokenMatch(header: string | undefined): boolean {
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  const actual = Buffer.from(header);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    if (req.method !== 'POST' || req.url !== '/execute') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    if (!safeTokenMatch(req.headers.authorization)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    let action: string | undefined;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { action?: string; payload?: Record<string, unknown> };
      action = body.action;
      const handler = action ? handlers[action] : undefined;
      if (!handler) {
        sendJson(res, 400, { error: `unknown action: ${action}` });
        return;
      }
      console.info(`[bridge] executing ${action}`);
      const result = await handler(body.payload ?? {});
      sendJson(res, 200, { result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[bridge] ${action ?? 'request'} failed:`, message);
      // 200 + {error}: this is an expected outcome (a failed typecheck, a
      // conflicting git state), not a transport failure — the production
      // caller (bridge-client.ts) distinguishes the two by status code.
      sendJson(res, 200, { error: message });
    }
  })();
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[bridge] Mara local execution bridge listening on :${PORT} (repo: ${process.cwd()})`);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
