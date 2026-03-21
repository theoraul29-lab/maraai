// Python bridge module: invoke maraai_playwright_agent.py and return JSON.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '../../..');
const scriptPath = path.join(rootDir, 'maraai_playwright_agent.py');

function resolvePythonExecutable() {
  const winVenvPython = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
  const unixVenvPython = path.join(rootDir, '.venv', 'bin', 'python');

  if (process.platform === 'win32' && fs.existsSync(winVenvPython)) {
    return winVenvPython;
  }
  if (fs.existsSync(unixVenvPython)) {
    return unixVenvPython;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function extractLastJsonObject(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // continue scanning upward
    }
  }

  throw new Error('Unable to parse JSON output from Python process.');
}

function runPythonAgent({
  url,
  prompt,
  browser = 'chromium',
  selectors = {},
  timeoutMs = 120000,
}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found: ${scriptPath}`));
      return;
    }

    const pythonExec = resolvePythonExecutable();
    const args = [
      scriptPath,
      '--url',
      url,
      '--prompt',
      prompt,
      '--browser',
      browser,
      '--json-output',
      '--non-interactive',
    ];

    Object.entries(selectors || {}).forEach(([key, css]) => {
      if (typeof key === 'string' && typeof css === 'string' && key && css) {
        args.push('--selector', `${key}=${css}`);
      }
    });

    const child = spawn(pythonExec, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Python process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new Error(
            `Python process failed with code ${code}. stderr: ${stderr || '(empty)'}`,
          ),
        );
        return;
      }

      try {
        const parsed = extractLastJsonObject(stdout);
        resolve(parsed);
      } catch (err) {
        reject(
          new Error(
            `Failed to parse Python JSON output. stdout: ${stdout || '(empty)'} stderr: ${stderr || '(empty)'}. parseError: ${err.message}`,
          ),
        );
      }
    });
  });
}

async function fetchWithPython(req, res) {
  try {
    const { url, prompt, browser, selectors } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: "'url' is required and must be a string." });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ message: "'prompt' is required and must be a string." });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ message: 'Invalid URL format.' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ message: 'URL must start with http:// or https://' });
    }

    const result = await runPythonAgent({
      url: parsedUrl.toString(),
      prompt,
      browser: browser || 'chromium',
      selectors: selectors || {},
      timeoutMs: 180000,
    });

    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: 'Python bridge request failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = {
  fetchWithPython,
  runPythonAgent,
};
