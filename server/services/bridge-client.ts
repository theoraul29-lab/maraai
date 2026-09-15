/**
 * Client for Mara's local execution bridge.
 *
 * Production has no git binary, no .git directory, and no GitHub credentials —
 * commits made inside the ephemeral container would be lost on the next deploy
 * anyway. The real, working repository checkout lives on the owner's laptop.
 * For the small set of task types that touch the filesystem or git, production
 * keeps 100% of the task-queue/approval/audit logic (nothing moves), but the
 * actual OS-level action (write a file, run tsc, git commit, git push) is
 * delegated to a small HTTP service on that laptop, reachable only through the
 * same Cloudflare Tunnel already used for Ollama.
 *
 * If the laptop is offline, this call fails like any other network error —
 * the caller (tool-runtime.ts, via control-task-engine's retry/backoff) treats
 * it as a normal retryable task failure. No bespoke resilience needed here.
 */

const BRIDGE_TIMEOUT_MS = 150_000;

export type BridgeAction =
  | 'repository.apply_changes'
  | 'project.typecheck'
  | 'server.build'
  | 'frontend.typecheck'
  | 'frontend.build'
  | 'git.create_branch'
  | 'git.stage_proposal'
  | 'git.commit_staged'
  | 'git.push';

export function isBridgeConfigured(): boolean {
  return Boolean(process.env.MARA_BRIDGE_URL && process.env.MARA_BRIDGE_TOKEN);
}

export async function callBridge(action: BridgeAction, payload: Record<string, unknown>): Promise<unknown> {
  const baseUrl = process.env.MARA_BRIDGE_URL;
  const token = process.env.MARA_BRIDGE_TOKEN;
  if (!baseUrl || !token) {
    throw new Error('Local execution bridge is not configured (MARA_BRIDGE_URL / MARA_BRIDGE_TOKEN missing).');
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, payload }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Local execution bridge unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const body = await response.json().catch(() => null) as { result?: unknown; error?: string } | null;
  if (!response.ok || !body) {
    throw new Error(`Local execution bridge rejected ${action}: HTTP ${response.status} ${body?.error ?? ''}`.trim());
  }
  if (body.error) throw new Error(`Local execution bridge failed ${action}: ${body.error}`);
  return body.result;
}
