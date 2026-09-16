/**
 * Sandboxed Python execution — lets Mara write, run, see the output of, and
 * iterate on a Python script (data analysis, one-off experiments) without
 * touching the live Node/TypeScript app or the git repository at all. This
 * is deliberately NOT the code-write pipeline (code-agent.ts /
 * autonomous-code-pipeline.ts) — nothing here is ever committed; a script's
 * only output is the text it prints, returned to whoever asked for it.
 *
 * Containment, honestly stated:
 *   - Runs in a fresh, empty scratch directory, deleted after every run.
 *   - Environment is reduced to PATH + HOME (the scratch dir) — no
 *     DATABASE_URL, no API keys, no session secrets reach the script.
 *   - No pip packages are installed in the runtime image — stdlib only.
 *   - Hard wall-clock timeout and stdout/stderr size caps.
 *   - Runs as the same already-unprivileged `nodejs` user the whole
 *     container runs as (see Dockerfile.nodejs) — no new privilege.
 *   - NOT network-isolated: standard Railway containers don't expose the
 *     privileged features (network namespaces / gVisor / Docker-in-Docker)
 *     that real network sandboxing needs, so a script CAN make outbound
 *     HTTP calls. Given Mara already has standing authority to write and
 *     ship real code to production (the code-write pipeline), this is a
 *     proportionate, not a novel, risk — but it is real, and worth knowing.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_OUTPUT_BYTES = 200_000;
const MAX_CODE_BYTES = 200_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

export interface PythonRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

function getPythonBin(): string {
  return process.env.PYTHON_BIN || 'python3';
}

/**
 * Runs `code` as a standalone Python script and returns its captured
 * output. Never throws for a script-side failure (bad syntax, a raised
 * exception, a timeout) — those all come back as `ok: false` with the
 * relevant detail in `stderr`/`timedOut`. Only throws for a setup problem
 * (e.g. the scratch directory couldn't be created).
 */
export async function runPythonScript(code: string, opts: { timeoutMs?: number; args?: string[] } = {}): Promise<PythonRunResult> {
  if (!code || !code.trim()) {
    return { ok: false, stdout: '', stderr: 'No script content provided.', exitCode: null, timedOut: false, truncated: false };
  }
  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    return { ok: false, stdout: '', stderr: `Script exceeds the ${MAX_CODE_BYTES}-byte limit.`, exitCode: null, timedOut: false, truncated: false };
  }
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);

  const dir = await mkdtemp(path.join(tmpdir(), 'mara-py-'));
  const scriptPath = path.join(dir, 'script.py');
  await writeFile(scriptPath, code, 'utf8');

  try {
    return await new Promise<PythonRunResult>((resolve) => {
      let child;
      try {
        child = spawn(getPythonBin(), [scriptPath, ...(opts.args ?? [])], {
          cwd: dir,
          env: { PATH: process.env.PATH ?? '', HOME: dir, PYTHONDONTWRITEBYTECODE: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (spawnErr) {
        resolve({ ok: false, stdout: '', stderr: `Failed to start python3: ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`, exitCode: null, timedOut: false, truncated: false });
        return;
      }

      let stdout = '';
      let stderr = '';
      let truncated = false;
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, stdout, stderr: stderr || err.message, exitCode: null, timedOut, truncated });
      });
      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString('utf8');
        else truncated = true;
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString('utf8');
        else truncated = true;
      });
      child.on('close', (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: exitCode === 0 && !timedOut,
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: timedOut ? `${stderr}\n[killed: exceeded ${timeoutMs}ms timeout]`.trim() : stderr.slice(0, MAX_OUTPUT_BYTES),
          exitCode,
          timedOut,
          truncated,
        });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}

/** Syntax-only check (no execution) — used by the code-agent validation gate for .py changes. */
export async function checkPythonSyntax(code: string): Promise<{ ok: boolean; error?: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mara-py-check-'));
  const scriptPath = path.join(dir, 'check.py');
  await writeFile(scriptPath, code, 'utf8');
  try {
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = spawn(getPythonBin(), ['-m', 'py_compile', scriptPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, error: err.message }); });
      child.on('close', (exitCode) => { clearTimeout(timer); resolve({ ok: exitCode === 0, error: exitCode === 0 ? undefined : stderr.slice(0, 4000) }); });
    });
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
