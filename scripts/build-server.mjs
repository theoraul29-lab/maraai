/**
 * Compile the backend (server/ + shared/) to plain JS in dist/ so production
 * runs `node dist/server/index.js` instead of `tsx server/index.ts`.
 *
 * We intentionally run esbuild in *non-bundle* mode with one entry point per
 * source file and `outbase: '.'`, so the output mirrors the source tree
 * (dist/server/..., dist/shared/...). This keeps:
 *   - every module's `import.meta.url` pointing at its own file, and
 *   - the explicit `.js` import specifiers the codebase already uses
 *     (NodeNext) resolving correctly at runtime against node_modules.
 *
 * Type checking is handled separately by `npm run typecheck` (tsc --noEmit);
 * esbuild only transpiles.
 */
import { build } from 'esbuild';
import { readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function collect(dir, exts, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, exts, acc);
    } else if (exts.some((e) => entry.name.endsWith(e)) && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const entryPoints = [
  ...collect('server', ['.ts', '.js']),
  ...collect('shared', ['.ts']),
];

await build({
  entryPoints,
  outdir: 'dist',
  outbase: '.',
  bundle: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
});

console.log(`[build-server] compiled ${entryPoints.length} files to dist/`);

// esbuild non-bundle only emits .ts/.js; copy runtime-read JSON assets so the
// compiled modules can fs.readFileSync them next to dist/... at runtime.
const jsonAssets = collect('server', ['.json']);
for (const src of jsonAssets) {
  const dest = path.join('dist', src);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log(`[build-server] copied ${jsonAssets.length} JSON asset(s) to dist/`);

// The production runtime image has neither the `git` binary nor the `.git`
// directory (Dockerfile.nodejs's runtime stage only copies dist/server/shared),
// so the Repository panel's git-status feature can't shell out to git there.
// Snapshot the commit info here instead, while git IS available (this script
// runs in the Docker builder stage, right after `COPY . .`) — the runtime
// falls back to this file when live git commands aren't possible.
try {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const buildInfo = {
    commit: git('rev-parse', 'HEAD'),
    branch: git('branch', '--show-current') || 'detached',
    subject: git('log', '-1', '--pretty=format:%s'),
    author: git('log', '-1', '--pretty=format:%an'),
    date: git('log', '-1', '--pretty=format:%aI'),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(path.join('dist', 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
  console.log(`[build-server] wrote dist/build-info.json (${buildInfo.commit.slice(0, 12)})`);
} catch (err) {
  console.warn('[build-server] could not snapshot git info (not a git checkout?):', err.message);
}
