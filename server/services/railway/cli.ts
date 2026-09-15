import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 250_000;
const TIMEOUT_MS = 60_000;
const REPO_ROOT = path.resolve(process.env.MARAAI_REPO_ROOT || process.env.INIT_CWD || process.cwd());

export interface RailwayCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runRailwayCli(args: string[]): Promise<RailwayCliResult> {
  try {
    const executable = process.platform === 'win32' ? 'cmd.exe' : 'railway';
    const finalArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', ['railway.cmd', ...args].join(' ')]
      : args;
    const result = await execFileAsync(executable, finalArgs, {
      cwd: REPO_ROOT,
      windowsHide: true,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    return { exitCode: 0, stdout: result.stdout.slice(0, MAX_BUFFER), stderr: result.stderr.slice(0, MAX_BUFFER) };
  } catch (error: any) {
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: String(error.stdout ?? '').slice(0, MAX_BUFFER),
      stderr: String(error.stderr ?? error.message ?? '').slice(0, MAX_BUFFER),
    };
  }
}

function matchValue(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*${escaped}:\\s*(.+)$`, 'mi'));
  return match?.[1]?.trim() ?? null;
}

export function parseRailwayStatus(text: string) {
  const serviceBlock = text.match(/Linked service[\s\S]*?\n\s*([^\s\n]+)\n\s+status:\s+(.+?)\n[\s\S]*?deployment ID:\s+([^\s\n]+)\n\s+service ID:\s+([^\s\n]+)/i);
  const serviceStatus = serviceBlock?.[2]?.replace(/^●\s*/, '').trim() ?? null;
  return {
    workspace: matchValue(text, 'Workspace'),
    project: matchValue(text, 'Project'),
    projectId: matchValue(text, 'Project ID'),
    environment: matchValue(text, 'Environment'),
    environmentId: matchValue(text, 'Environment ID'),
    service: serviceBlock?.[1]?.trim() ?? null,
    serviceStatus,
    url: matchValue(text, 'url'),
    volume: matchValue(text, 'volume'),
    region: matchValue(text, 'region'),
    latestDeploymentId: serviceBlock?.[3]?.trim() ?? null,
    serviceId: serviceBlock?.[4]?.trim() ?? null,
  };
}

export function redactRailwayLogLine(line: string): string {
  return line
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(token|secret|password|api[_-]?key)(=|:\s*)[^\s,;]+/gi, '$1$2[REDACTED]');
}