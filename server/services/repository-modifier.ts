import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, resolveSafePath } from '../mara-brain/agents/code-explorer.js';

interface ChangeRequest {
  path: string;
  content: string;
  expectedSha256: string;
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function validatePath(relativePath: string): string {
  const safe = resolveSafePath(relativePath);
  if (!safe) throw new Error(`Path is not allowed: ${relativePath}`);
  const normalized = safe.relative.toLowerCase();
  if (normalized.startsWith('.git/') || normalized.startsWith('node_modules/') || normalized.startsWith('scripts/') || normalized.startsWith('.github/') || normalized.startsWith('migrations/') || normalized === '.env' || normalized.startsWith('.env.') || normalized.startsWith('dockerfile') || normalized.includes('sqlite') || normalized.endsWith('.db')) {
    throw new Error(`Protected path cannot be modified: ${safe.relative}`);
  }
  return safe.absolute;
}

export async function applyApprovedRepositoryChanges(taskId: number, changes: unknown): Promise<{
  taskId: number;
  files: Array<{ path: string; previousSha256: string; nextSha256: string }>;
}> {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 20) {
    throw new Error('Repository change proposal must contain 1-20 files.');
  }
  const requests = changes as ChangeRequest[];
  const prepared: Array<{ request: ChangeRequest; absolute: string; previous: Buffer; existed: boolean }> = [];
  for (const request of requests) {
    if (!request || typeof request.path !== 'string' || typeof request.content !== 'string' || typeof request.expectedSha256 !== 'string') {
      throw new Error('Each repository change requires path, content, and expectedSha256.');
    }
    if (request.content.length > 200_000) throw new Error(`File change is too large: ${request.path}`);
    const absolute = validatePath(request.path);
    let existed = true;
    const previous = await readFile(absolute).catch(() => { existed = false; return Buffer.alloc(0); });
    if (sha256(previous) !== request.expectedSha256) {
      throw new Error(`File changed since proposal: ${request.path}`);
    }
    prepared.push({ request, absolute, previous, existed });
  }

  const backupDir = path.join(REPO_ROOT, 'data', 'control-task-backups', String(taskId));
  await mkdir(backupDir, { recursive: true });
  for (const item of prepared) {
    await writeFile(path.join(backupDir, `${sha256(item.request.path).slice(0, 16)}.bak`), item.previous);
  }

  const applied: Array<{ path: string; previousSha256: string; nextSha256: string }> = [];
  try {
    for (const item of prepared) {
      await writeFile(item.absolute, item.request.content, 'utf8');
      applied.push({ path: item.request.path, previousSha256: sha256(item.previous), nextSha256: sha256(item.request.content) });
    }
    return { taskId, files: applied };
  } catch (error) {
    for (const item of prepared) {
      try {
        if (item.existed) await writeFile(item.absolute, item.previous);
        else await unlink(item.absolute);
      } catch { /* preserve original error */ }
    }
    throw error;
  }
}
