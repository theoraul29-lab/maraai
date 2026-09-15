import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { REPO_ROOT, resolveSafePath } from '../mara-brain/agents/code-explorer.js';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 200_000;
const TIMEOUT_MS = 120_000;

function resolveArtifactRoot(): string {
  const envRoot = process.env.MARAAI_ARTIFACT_ROOT;
  if (envRoot && envRoot.trim()) return envRoot.trim();
  const base = process.env.LOCALAPPDATA ?? process.env.TEMP ?? os.tmpdir();
  return path.join(base, 'maraai', 'artifacts');
}

const ARTIFACT_DIR = resolveArtifactRoot();

export type ProcessState = 'NOT_STARTED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'FAILED_TO_START' | 'TIMED_OUT' | 'KILLED';

export interface ControlledProcessResult {
  command: string;
  state: ProcessState;
  started: boolean;
  pid: number | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killed: boolean;
  artifactPath: string | null;
  errorClass: 'none' | 'failed_to_start' | 'non_zero_exit' | 'timeout' | 'killed' | 'process_error';
  error?: string;
}

export type ControlledCommand = 'project.typecheck' | 'server.build' | 'frontend.typecheck' | 'frontend.build';

// Invoke each tool's actual Node entry script (its package's bin/*.js) with
// process.execPath rather than the node_modules/.bin/<name>.cmd shim. On
// Windows, spawn() with shell:false cannot launch a .cmd file at all — it
// throws EINVAL synchronously, before the process even starts — so the
// shim only works with shell:true, which this module deliberately avoids
// (no shell means no argv injection surface). Running the real .js entry
// point directly works identically on every platform without a shell.
function nodeBin(pkgRoot: string, relativeEntry: string): string {
  return path.join(pkgRoot, 'node_modules', ...relativeEntry.split('/'));
}

function commandSpec(command: ControlledCommand): { executable: string; args: string[]; cwd: string } {
  const frontendRoot = path.join(REPO_ROOT, 'frontend');
  switch (command) {
    case 'project.typecheck':
      return { executable: process.execPath, args: [nodeBin(REPO_ROOT, 'typescript/bin/tsc'), '--noEmit'], cwd: REPO_ROOT };
    case 'server.build':
      return { executable: process.execPath, args: ['scripts/build-server.mjs'], cwd: REPO_ROOT };
    case 'frontend.typecheck':
      return { executable: process.execPath, args: [nodeBin(frontendRoot, 'typescript/bin/tsc'), '-b'], cwd: frontendRoot };
    case 'frontend.build':
      return { executable: process.execPath, args: [nodeBin(frontendRoot, 'vite/bin/vite.js'), 'build'], cwd: frontendRoot };
  }
}

function appendBounded(current: string, chunk: Buffer, max = MAX_BUFFER): string {
  if (current.length >= max) return current;
  return `${current}${chunk.toString('utf8').slice(0, max - current.length)}`;
}

export async function executeControlledProcess(spec: { command: string; executable: string; args: string[]; cwd: string; timeoutMs?: number; taskId?: number; onEvent?: (event: string, metadata?: Record<string, unknown>) => void }): Promise<ControlledProcessResult> {
  const startedAt = Date.now();
  const timeoutMs = spec.timeoutMs ?? TIMEOUT_MS;
  let child: ChildProcess;
  let stdout = '';
  let stderr = '';
  let state: ProcessState = 'NOT_STARTED';
  let timedOut = false;
  let killed = false;
  let processError: Error | null = null;
  let processErrorMessage: string | null = null;
  let signal: NodeJS.Signals | null = null;
  let exitCode: number | null = null;

  const persistArtifact = async (result: ControlledProcessResult): Promise<ControlledProcessResult> => {
    try {
      await mkdir(ARTIFACT_DIR, { recursive: true });
      const artifactPath = path.join(ARTIFACT_DIR, `${spec.taskId ?? 'adhoc'}-${startedAt}.json`);
      const payload = {
        ...result,
        startTimestamp: new Date(startedAt).toISOString(),
        endTimestamp: new Date().toISOString(),
        cwd: spec.cwd,
        args: spec.args,
        taskId: spec.taskId ?? null,
      };
      await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      result.artifactPath = artifactPath;
    } catch (error) {
      result.errorClass = 'process_error';
      result.error = `Artifact write failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    return result;
  };

  spec.onEvent?.('PROCESS_STARTING', { command: spec.command, cwd: spec.cwd });
  try {
    child = spawn(spec.executable, spec.args, { cwd: spec.cwd, shell: false, windowsHide: true });
    state = 'STARTED';
    spec.onEvent?.('PROCESS_STARTED', { pid: child.pid ?? null, command: spec.command });
  } catch (error) {
    processError = error instanceof Error ? error : new Error(String(error));
    state = 'FAILED_TO_START';
    spec.onEvent?.('PROCESS_FAILED', { error: processError.message, command: spec.command });
    return persistArtifact({ command: spec.command, state, started: false, pid: null, exitCode: null, signal: null, stdout, stderr, durationMs: Date.now() - startedAt, timedOut: false, killed: false, artifactPath: null, errorClass: 'failed_to_start', error: processError.message });
  }

  child.stdout?.on('data', (chunk: Buffer) => { stdout = appendBounded(stdout, chunk); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr = appendBounded(stderr, chunk); });
  child.on('error', (error) => {
    processError = error;
    processErrorMessage = error.message;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    killed = child.kill();
    if (killed) spec.onEvent?.('PROCESS_TIMEOUT', { pid: child.pid ?? null, command: spec.command });
  }, timeoutMs);

  await new Promise<void>((resolve) => child.once('close', (code, closeSignal) => {
    clearTimeout(timer);
    exitCode = code;
    signal = closeSignal;
    resolve();
  }));

  // A spawn that never actually launched a process (e.g. ENOENT) is the
  // authoritative "failed to start" signal. exitCode alone can't be used for
  // this: on POSIX a failed spawn closes with code=null, but on Windows it
  // closes with a negative errno-like code instead of null, so checking
  // `exitCode === null` misclassifies Windows spawn failures as a normal
  // non-zero-exit FAILED run. child.pid is unset in both cases.
  const neverStarted = processError !== null && child.pid == null;
  // On Windows a failed-to-spawn "close" reports a negative libuv errno
  // (e.g. -4058) in place of an exit code; normalize it away so the public
  // contract's exitCode is always null when the process never actually ran,
  // matching POSIX behavior instead of leaking a platform-specific number.
  if (neverStarted) exitCode = null;
  if (timedOut) state = 'TIMED_OUT';
  else if (killed) state = 'KILLED';
  else if (neverStarted) state = 'FAILED_TO_START';
  else state = exitCode === 0 ? 'COMPLETED' : 'FAILED';
  const errorClass = timedOut ? 'timeout' : killed ? 'killed' : neverStarted ? 'failed_to_start' : processError ? 'process_error' : exitCode !== 0 ? 'non_zero_exit' : 'none';
  if (state === 'COMPLETED' || state === 'FAILED') spec.onEvent?.(state === 'COMPLETED' ? 'PROCESS_COMPLETED' : 'PROCESS_FAILED', { exitCode, command: spec.command });

  const result: ControlledProcessResult = {
    command: spec.command, state, started: !neverStarted, pid: child.pid ?? null, exitCode, signal, stdout, stderr,
    durationMs: Date.now() - startedAt, timedOut, killed, artifactPath: null, errorClass,
    ...(processErrorMessage ? { error: processErrorMessage } : {}),
  };
  return persistArtifact(result);
}

/** Execute only fixed local validation commands. No shell or user-supplied argv. */
export async function runControlledCommand(command: ControlledCommand, options: { taskId?: number; onEvent?: (event: string, metadata?: Record<string, unknown>) => void } = {}): Promise<ControlledProcessResult> {
  const spec = commandSpec(command);
  const result = await executeControlledProcess({ ...spec, command, taskId: options.taskId, onEvent: options.onEvent });
  return result;
}

function validateBranchName(branch: string): string {
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.includes('..') || branch.startsWith('-') || branch.endsWith('/')) {
    throw new Error('Invalid branch name.');
  }
  return branch;
}

function validateGitPath(relativePath: string): string {
  const safe = resolveSafePath(relativePath);
  if (!safe) throw new Error(`Git path is not allowed: ${relativePath}`);
  return safe.relative;
}

function validateCommitMessage(message: string): string {
  const clean = message.trim();
  if (!clean || clean.length > 200) throw new Error('Commit message must be 1-200 characters.');
  return clean;
}

async function runGit(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: REPO_ROOT,
      shell: false,
      windowsHide: true,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    return { exitCode: 0, stdout: result.stdout.slice(0, MAX_BUFFER), stderr: result.stderr.slice(0, MAX_BUFFER) };
  } catch (error: any) {
    return { exitCode: typeof error.code === 'number' ? error.code : 1, stdout: String(error.stdout ?? '').slice(0, MAX_BUFFER), stderr: String(error.stderr ?? error.message ?? '').slice(0, MAX_BUFFER) };
  }
}

async function gitPreflight(): Promise<void> {
  const status = await runGit(['status', '--porcelain=v1']);
  if (status.exitCode !== 0) throw new Error(`Git status failed: ${status.stderr}`);
  if (status.stdout.split(/\r?\n/).some((line) => ['UU ', 'AA ', 'DD '].some((prefix) => line.startsWith(prefix)))) {
    throw new Error('Git repository has unresolved merge conflicts.');
  }
}

export async function createApprovedBranch(branch: string) {
  await gitPreflight();
  return runGit(['switch', '-c', validateBranchName(branch)]);
}

export async function commitApprovedStaged(message: string) {
  await gitPreflight();
  const staged = await runGit(['diff', '--cached', '--quiet']);
  if (staged.exitCode === 0) throw new Error('No staged changes available for commit.');
  if (staged.exitCode !== 1) throw new Error(`Unable to inspect staged changes: ${staged.stderr}`);
  return runGit(['commit', '--no-verify', '-m', validateCommitMessage(message)]);
}

export async function stageApprovedPaths(paths: unknown) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 20 || paths.some((item) => typeof item !== 'string')) {
    throw new Error('git.stage_proposal requires 1-20 paths');
  }
  await gitPreflight();
  return runGit(['add', '--', ...paths.map((item) => validateGitPath(item))]);
}

/** Pushes whatever branch is currently checked out — always the branch the linked commit was just made on. */
export async function pushCurrentBranch() {
  await gitPreflight();
  const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.exitCode !== 0 || !branch.stdout.trim() || branch.stdout.trim() === 'HEAD') {
    throw new Error(`Unable to determine current branch: ${branch.stderr}`);
  }
  return runGit(['push', 'origin', `HEAD:${branch.stdout.trim()}`]);
}
