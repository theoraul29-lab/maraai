import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CREDENTIAL_DIR = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'MaraAI', 'credentials');

function credentialPath(name: string): string {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Invalid credential name');
  return path.join(CREDENTIAL_DIR, `${name}.dpapi`);
}

function runPowerShell(script: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Windows credential operation failed: ${stderr.trim() || `exit ${code}`}`));
    });
    child.stdin.end(stdin, 'utf8');
  });
}

export async function setSecureCredential(name: string, value: string): Promise<void> {
  await mkdir(CREDENTIAL_DIR, { recursive: true });
  const encrypted = await runPowerShell("$plain = [Console]::In.ReadToEnd(); $secure = ConvertTo-SecureString -String $plain -AsPlainText -Force; $encrypted = ConvertFrom-SecureString -SecureString $secure; [Console]::Out.Write($encrypted)", value);
  await writeFile(credentialPath(name), `${encrypted}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function getSecureCredential(name: string): Promise<string | null> {
  let encrypted: string;
  try {
    encrypted = await readFile(credentialPath(name), 'utf8');
  } catch {
    return null;
  }
  encrypted = encrypted.replace(/\s+/g, '');
  const script = "$encrypted = ([Console]::In.ReadToEnd()) -replace '\\s+', ''; $secure = ConvertTo-SecureString -String $encrypted; $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) } finally { if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) } }";
  return runPowerShell(script, encrypted);
}

export async function deleteSecureCredential(name: string): Promise<void> {
  await rm(credentialPath(name), { force: true });
}

export async function hasSecureCredential(name: string): Promise<boolean> {
  return (await getSecureCredential(name)) !== null;
}