const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MARA_DESKTOP_PORT || '5000');
const HOST = process.env.MARA_DESKTOP_HOST || '127.0.0.1';
const DESKTOP_TARGET_URL = `http://${HOST}:${PORT}/control-center`;
const HEALTH_URL = `http://${HOST}:${PORT}/api/health`;
const RUNTIME_URL = `http://${HOST}:${PORT}/api/runtime`;
const LOG_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'MaraAI', 'desktop');
const LOG_FILE = path.join(LOG_DIR, 'mara-runtime.log');
const ICON_PATH = path.join(REPO_ROOT, 'frontend', 'public', 'favicon.ico');

let mainWindow = null;
let serverProcess = null;
let startedServer = false;
let shuttingDown = false;

function appendLog(line) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
}

function requestJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, json: JSON.parse(body) });
        } catch {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, json: null });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, json: null });
    });
    req.on('error', () => resolve({ ok: false, statusCode: 0, json: null }));
  });
}

async function isMaraHealthy() {
  const health = await requestJson(HEALTH_URL);
  appendLog(`Runtime health probe: ${HEALTH_URL} -> status=${health.statusCode} ok=${health.ok}`);
  if (!health.ok || health.json?.status !== 'ok') return false;
  const runtime = await requestJson(RUNTIME_URL);
  const ok = runtime.ok && Number(runtime.json?.boundPort || runtime.json?.requestedPort) === PORT;
  appendLog(`Runtime state probe: ${RUNTIME_URL} -> status=${runtime.statusCode} ok=${ok} boundPort=${runtime.json?.boundPort ?? 'null'}`);
  return ok;
}

async function waitForMara(timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isMaraHealthy()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function startMaraRuntime() {
  appendLog('Starting Mara runtime with npm.cmd run dev');
  serverProcess = spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run dev'], {
    cwd: REPO_ROOT,
    windowsHide: true,
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
      CONTROL_TASK_WORKER_ENABLED: process.env.CONTROL_TASK_WORKER_ENABLED || 'true',
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    },
  });
  startedServer = true;

  serverProcess.stdout?.on('data', (chunk) => appendLog(chunk.toString().trimEnd()));
  serverProcess.stderr?.on('data', (chunk) => appendLog(chunk.toString().trimEnd()));
  serverProcess.on('exit', (code, signal) => {
    appendLog(`Mara runtime exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    serverProcess = null;
    if (!shuttingDown && mainWindow) {
      mainWindow.webContents.send('mara-runtime-exited');
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: 'Mara',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#071014',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) appendLog(`BrowserWindow navigation started: ${url}`);
  });
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    appendLog(`BrowserWindow loaded: ${url}`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) appendLog(`BrowserWindow load failed: ${validatedURL} code=${errorCode} error=${errorDescription}`);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://${HOST}:${PORT}`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function boot() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  appendLog('Desktop startup');
  appendLog(`Desktop target URL: ${DESKTOP_TARGET_URL}`);
  app.setName('Mara');
  app.setPath('userData', path.join(LOG_DIR, 'profile'));

  createWindow();
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>Mara</title><body style="margin:0;background:#071014;color:#e6f0ed;font:16px Segoe UI,sans-serif;display:grid;place-items:center;height:100vh"><main><h1 style="margin:0 0 10px;font-size:32px">Starting Mara</h1><p style="opacity:.75;margin:0">Checking the local runtime on port ${PORT}...</p></main></body>`)}`);

  if (!(await isMaraHealthy())) {
    startMaraRuntime();
  } else {
    appendLog('Mara runtime already healthy; reusing existing server');
  }

  const ready = await waitForMara();
  if (!ready) {
    dialog.showErrorBox('Mara failed to start', `Mara did not become healthy at ${HEALTH_URL}.\n\nRuntime log:\n${LOG_FILE}`);
    app.quit();
    return;
  }

  appendLog('Runtime health: OK');
  appendLog(`Opening Control Center: ${DESKTOP_TARGET_URL}`);
  await mainWindow.loadURL(DESKTOP_TARGET_URL);
}

function stopRuntimeIfOwned() {
  shuttingDown = true;
  if (!startedServer || !serverProcess?.pid) return;
  appendLog(`Stopping Mara runtime pid=${serverProcess.pid}`);
  try {
    spawn('taskkill.exe', ['/pid', String(serverProcess.pid), '/t'], { windowsHide: true });
  } catch (error) {
    appendLog(`Failed to stop runtime cleanly: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(boot).catch((error) => {
    appendLog(`Desktop boot failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    dialog.showErrorBox('Mara desktop error', `${error instanceof Error ? error.message : String(error)}\n\nRuntime log:\n${LOG_FILE}`);
    app.quit();
  });
  app.on('before-quit', stopRuntimeIfOwned);
  app.on('window-all-closed', () => app.quit());
}