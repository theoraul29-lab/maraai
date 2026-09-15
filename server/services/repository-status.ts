import { getCodeOverview, listIndexedFiles, readSourceFile, searchIndexedFiles, REPO_ROOT } from '../mara-brain/agents/code-explorer.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RepositoryStatus {
  root: string;
  overview: ReturnType<typeof getCodeOverview>;
  indexedFiles: number;
  indexedAt: string;
}

/** Read-only repository visibility backed by the existing code explorer index. */
export function readRepositoryStatus(): RepositoryStatus {
  const overview = getCodeOverview();
  return {
    root: REPO_ROOT,
    overview,
    indexedFiles: listIndexedFiles({ limit: 1_000_000 }).length,
    indexedAt: new Date().toISOString(),
  };
}

export function readRepositorySearch(query: string, limit = 20) {
  const needle = query.trim();
  if (!needle) return [];
  return searchIndexedFiles(needle, Math.min(Math.max(limit, 1), 50));
}

export async function readRepositoryFile(path: string, maxBytes = 6_000) {
  const result = await readSourceFile(path, {
    accessedBy: 'control-task-worker',
    reason: 'approved read-only repository task',
    maxBytes: Math.min(Math.max(maxBytes, 1), 6_000),
  });
  if (!result) throw new Error('Path not allowed or not found');
  return result;
}

export async function readRepositoryGitStatus(): Promise<{
  branch: string;
  dirty: boolean;
  summary: string[];
  recentCommits: Array<{ hash: string; subject: string; author: string; date: string }>;
  diff: { files: string[]; stat: string };
}> {
  const { stdout: branchOutput } = await execFileAsync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, windowsHide: true });
  const { stdout: statusOutput } = await execFileAsync('git', ['status', '--short'], { cwd: REPO_ROOT, windowsHide: true });
  const { stdout: logOutput } = await execFileAsync(
    'git',
    ['log', '-10', '--date=iso-strict', '--pretty=format:%H%x09%s%x09%an%x09%aI'],
    { cwd: REPO_ROOT, windowsHide: true },
  );
  const { stdout: diffNames } = await execFileAsync('git', ['diff', '--name-only'], { cwd: REPO_ROOT, windowsHide: true });
  const { stdout: diffStat } = await execFileAsync('git', ['diff', '--stat'], { cwd: REPO_ROOT, windowsHide: true });
  const summary = statusOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 100);
  const recentCommits = logOutput.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash = '', subject = '', author = '', date = ''] = line.split('\t');
    return { hash, subject, author, date };
  });
  return {
    branch: branchOutput.trim() || 'detached',
    dirty: summary.length > 0,
    summary,
    recentCommits,
    diff: {
      files: diffNames.split(/\r?\n/).filter(Boolean).slice(0, 100),
      stat: diffStat.trim(),
    },
  };
}

