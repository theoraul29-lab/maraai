#!/usr/bin/env node
/**
 * Terminal CLI for chatting with Mara from the command line.
 *
 * Usage:
 *   node scripts/mara-cli.mjs                    # interactive REPL
 *   node scripts/mara-cli.mjs "salut Mara"       # one-shot
 *   node scripts/mara-cli.mjs --base-url=... --module=trading
 *
 * Authentication (first match wins):
 *   1. MARA_SESSION_COOKIE env var — raw "connect.sid=..." string from a
 *      browser session (useful when you already have a logged-in window).
 *   2. MARA_EMAIL + MARA_PASSWORD env vars — programmatic login. The CLI
 *      hits /api/auth/login and caches the resulting cookie so the env
 *      vars only need to be set on first run.
 *   3. ~/.config/mara/session.json — cached cookie from a previous run.
 *   4. Interactive prompt for email + password.
 *
 * Slash commands inside the REPL:
 *   /help               show commands
 *   /quit | /exit       leave the REPL (Ctrl-D also works)
 *   /clear              reset the local history list (server memory unchanged)
 *   /history            print the current local history
 *   /runtime            GET /api/runtime
 *   /health             GET /api/ai/health
 *   /whoami             GET /api/auth/me
 *   /module <name>      set the module context (default: 'general')
 *
 * Admin mode: handled entirely server-side. If the logged-in user is in
 * ADMIN_EMAILS or ADMIN_USER_IDS, Mara replies using the admin persona
 * (PR #103). The CLI does nothing different in that case.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing (lightweight — no extra dependency).
// ---------------------------------------------------------------------------

const positional = [];
const flags = {};
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    else flags[arg.slice(2)] = true;
  } else {
    positional.push(arg);
  }
}

const BASE_URL = (
  flags['base-url']
  ?? process.env.MARA_BASE_URL
  ?? process.env.MARAAI_BASE_URL
  ?? 'https://hellomara.net'
).replace(/\/$/, '');

let currentModule = String(flags['module'] ?? 'general');
const ONE_SHOT_MESSAGE = positional.join(' ').trim() || null;
const LANGUAGE = String(flags['language'] ?? 'ro');

const SESSION_DIR = path.join(homedir(), '.config', 'mara');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

// ---------------------------------------------------------------------------
// Cookie + CSRF state shared by all HTTP calls.
// ---------------------------------------------------------------------------

let cookieJar = '';
let csrfToken = '';

function recordCookies(setCookieHeader) {
  if (!setCookieHeader) return;
  const parts = setCookieHeader.split(/,(?=\s*\w+=)/);
  for (const part of parts) {
    const m = part.match(/^\s*([^=;\s]+)=([^;]+)/);
    if (!m) continue;
    if (m[1] === 'connect.sid') cookieJar = `${m[1]}=${m[2]}`;
  }
}

async function request(method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieJar) headers.Cookie = cookieJar;
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  recordCookies(res.headers.get('set-cookie'));
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; }
  catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Session persistence (~/.config/mara/session.json).
// Only the connect.sid cookie value is persisted; csrfToken is bound to the
// session and refreshed on /api/auth/csrf at every CLI start.
// ---------------------------------------------------------------------------

function loadSession() {
  try {
    if (!existsSync(SESSION_FILE)) return null;
    const raw = readFileSync(SESSION_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.baseUrl !== BASE_URL) return null; // session is tied to one host
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(extra = {}) {
  try {
    mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(
      SESSION_FILE,
      JSON.stringify({ baseUrl: BASE_URL, cookie: cookieJar, ...extra }, null, 2),
      { mode: 0o600 },
    );
  } catch (err) {
    console.warn(`[mara-cli] could not save session: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Auth bootstrap. Returns true if we end up with a logged-in session.
// ---------------------------------------------------------------------------

async function ensureCsrfToken() {
  const r = await request('GET', '/api/auth/csrf');
  if (r.status === 200 && r.body?.csrfToken) {
    csrfToken = r.body.csrfToken;
    return true;
  }
  return false;
}

async function whoami() {
  // /api/auth/me returns { user: { id, email, ... } } for logged-in
  // sessions and { user: null } for anonymous ones.
  const r = await request('GET', '/api/auth/me');
  const user = r.body?.user;
  if (r.status === 200 && user && (user.id || user.uid)) return user;
  return null;
}

async function loginWithCreds(email, password) {
  if (!csrfToken) await ensureCsrfToken();
  const r = await request('POST', '/api/auth/login', { email, password });
  if (r.status !== 200) {
    throw new Error(
      `Login failed (${r.status}): ${r.body?.message ?? r.body?._raw ?? 'unknown error'}`,
    );
  }
  // CSRF rotates per session on Express-session regenerate, so refresh it.
  await ensureCsrfToken();
  return r.body;
}

async function authenticate(rl) {
  // 1. MARA_SESSION_COOKIE wins. Useful when you already have a browser
  //    window open and just want to paste connect.sid into the env.
  if (process.env.MARA_SESSION_COOKIE) {
    cookieJar = process.env.MARA_SESSION_COOKIE.startsWith('connect.sid=')
      ? process.env.MARA_SESSION_COOKIE
      : `connect.sid=${process.env.MARA_SESSION_COOKIE}`;
    await ensureCsrfToken();
    const me = await whoami();
    if (me) {
      console.log(`[mara-cli] authenticated as ${me.email ?? me.uid ?? '(unknown)'} via MARA_SESSION_COOKIE`);
      return true;
    }
    console.warn('[mara-cli] MARA_SESSION_COOKIE rejected by server; falling through to other methods');
    cookieJar = '';
  }

  // 2. Cached session file.
  const cached = loadSession();
  if (cached?.cookie) {
    cookieJar = cached.cookie;
    await ensureCsrfToken();
    const me = await whoami();
    if (me) {
      console.log(`[mara-cli] authenticated as ${me.email ?? me.uid} via cached session`);
      return true;
    }
    cookieJar = '';
  }

  // 3. Env credentials.
  let email = process.env.MARA_EMAIL;
  let password = process.env.MARA_PASSWORD;

  // 4. Prompt the user.
  if (!email || !password) {
    if (!rl) {
      throw new Error(
        'Not authenticated. Set MARA_SESSION_COOKIE or MARA_EMAIL + MARA_PASSWORD ' +
        'env vars to run in one-shot mode without an interactive prompt.',
      );
    }
    if (!email) email = (await rl.question('Email: ')).trim();
    if (!password) {
      // Best-effort password masking: turn off echo via raw-mode for the
      // duration of the prompt. Falls back to plain input if the TTY does
      // not support raw mode (e.g. piped stdin in CI).
      password = await promptPassword(rl, 'Password: ');
    }
  }

  await loginWithCreds(email, password);
  saveSession();
  const me = await whoami();
  console.log(`[mara-cli] authenticated as ${me?.email ?? email}`);
  return true;
}

async function promptPassword(rl, prompt) {
  if (!stdin.isTTY) {
    return (await rl.question(prompt)).trim();
  }
  process.stdout.write(prompt);
  stdin.setRawMode(true);
  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk) => {
      const ch = chunk.toString('utf8');
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        process.exit(130);
      } else if (ch === '\u0008' || ch === '\u007f') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        buf += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// ---------------------------------------------------------------------------
// Chat / commands.
// ---------------------------------------------------------------------------

const history = [];

async function sendMessage(message) {
  const r = await request('POST', '/api/maraai/ai', {
    message,
    module: currentModule,
    language: LANGUAGE,
    history: history.slice(-20),
  });
  if (r.status !== 200) {
    return { error: true, status: r.status, body: r.body };
  }
  const reply = r.body?.response ?? r.body?.text ?? '';
  history.push({ role: 'user', content: message });
  if (reply) history.push({ role: 'assistant', content: reply });
  return {
    error: false,
    reply,
    route: r.body?.route ?? null,
    detectedMood: r.body?.detectedMood ?? null,
    fallback: r.body?.fallback ?? null,
    latencyMs: r.body?.latencyMs ?? null,
  };
}

async function runSlashCommand(input, rl) {
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  switch (cmd) {
    case 'help':
      console.log([
        '  /help                show this message',
        '  /quit | /exit        leave (Ctrl-D also works)',
        '  /clear               reset local history',
        '  /history             print current local history',
        '  /runtime             GET /api/runtime',
        '  /health              GET /api/ai/health',
        '  /whoami              GET /api/auth/me',
        '  /module <name>       set the module context (current: ' + currentModule + ')',
      ].join('\n'));
      return true;

    case 'quit':
    case 'exit':
      rl.close();
      return true;

    case 'clear':
      history.length = 0;
      console.log('[history cleared]');
      return true;

    case 'history':
      if (history.length === 0) console.log('[history empty]');
      else for (const m of history) console.log(`${m.role.padEnd(9)} ${m.content.slice(0, 120)}`);
      return true;

    case 'runtime': {
      const r = await request('GET', '/api/runtime');
      console.log(JSON.stringify(r.body, null, 2));
      return true;
    }

    case 'health': {
      const r = await request('GET', '/api/ai/health');
      console.log(JSON.stringify(r.body, null, 2));
      return true;
    }

    case 'whoami': {
      const me = await whoami();
      console.log(me ? JSON.stringify(me, null, 2) : '[anonymous]');
      return true;
    }

    case 'module':
      if (rest.length === 0) {
        console.log(`current module: ${currentModule}`);
      } else {
        currentModule = rest.join(' ');
        console.log(`module set to ${currentModule}`);
      }
      return true;

    default:
      console.log(`unknown command: /${cmd} (try /help)`);
      return true;
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[mara-cli] base ${BASE_URL}`);

  // Create the readline interface lazily — if we create it before
  // authenticate() finishes, readline starts draining stdin in the
  // background and, on piped input, fires 'close' before we attach
  // line handlers. Defer creation until we actually need to prompt.
  let authPromptRl = null;
  const needsInteractivePrompt =
    !process.env.MARA_SESSION_COOKIE &&
    !(process.env.MARA_EMAIL && process.env.MARA_PASSWORD) &&
    !loadSession()?.cookie;
  if (needsInteractivePrompt && !ONE_SHOT_MESSAGE) {
    authPromptRl = createInterface({ input: stdin, output: stdout });
  }

  await authenticate(authPromptRl);
  if (authPromptRl) authPromptRl.close();

  if (ONE_SHOT_MESSAGE) {
    const result = await sendMessage(ONE_SHOT_MESSAGE);
    if (result.error) {
      console.error(`error ${result.status}: ${JSON.stringify(result.body)}`);
      process.exit(1);
    }
    console.log(result.reply);
    return;
  }

  // Now we're ready for the REPL — create a fresh readline that will
  // receive stdin from this point onward.
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('Type a message to chat. Slash commands: /help, /quit. Ctrl-D to exit.\n');

  // We use a queue of incoming lines rather than `rl.question` in a loop
  // because `rl.question` does not interact well with piped stdin (the
  // prompt is suppressed and EOF can wedge the await indefinitely on
  // older Node versions). The line/close event API is well-behaved on
  // both TTY and pipe.
  const printPrompt = () => {
    if (stdin.isTTY) process.stdout.write(`mara (${currentModule})> `);
  };

  printPrompt();

  let processing = Promise.resolve();
  let closed = false;

  rl.on('line', (raw) => {
    processing = processing.then(async () => {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) { printPrompt(); return; }

      if (trimmed.startsWith('/')) {
        await runSlashCommand(trimmed, rl);
        if (!closed) printPrompt();
        return;
      }

      const result = await sendMessage(trimmed);
      if (result.error) {
        console.error(`[error ${result.status}] ${JSON.stringify(result.body)}`);
      } else {
        if (result.route) {
          console.log(`\n[${result.route}${result.fallback ? ' fallback' : ''}${result.latencyMs ? ` ${result.latencyMs}ms` : ''}]`);
        }
        console.log(result.reply || '(empty response)');
        console.log('');
      }
      if (!closed) printPrompt();
    }).catch((err) => {
      console.error(`[mara-cli] ${err?.message || err}`);
      if (!closed) printPrompt();
    });
  });

  await new Promise((resolve) => {
    rl.on('close', () => { closed = true; resolve(); });
  });
  // Wait for any in-flight line handler to finish before exiting.
  await processing;
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
