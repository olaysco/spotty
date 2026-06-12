#!/usr/bin/env node
/**
 * Global `spotty` launcher (installed via the package.json bin field +
 * `npm link`). Runs the built app, rebuilding first when sources are
 * newer than the build output, so plain `spotty` always starts fast and
 * up to date without a dev server.
 *
 *   spotty               launch (rebuilds only if out/ is stale)
 *   spotty --dev / -d    hot-reload development mode (electron-vite dev)
 *   spotty --build / -b  force a rebuild before launching
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

const args = process.argv.slice(2);
const dev = args.includes('--dev') || args.includes('-d');
const forceBuild = args.includes('--build') || args.includes('-b');
const passthrough = args.filter((a) => !['--dev', '-d', '--build', '-b'].includes(a));

if (!existsSync(join(root, 'node_modules'))) {
  console.error(`Dependencies missing — run \`npm install\` in ${root} first.`);
  process.exit(1);
}

function run(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(err.message);
      resolve(1);
    });
  });
}

function electronViteBin() {
  const pkgPath = require.resolve('electron-vite/package.json');
  const pkg = require('electron-vite/package.json');
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['electron-vite'];
  return join(dirname(pkgPath), bin);
}

/** Newest mtime under a path (recursive), 0 if missing. */
function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(path)) {
    newest = Math.max(newest, newestMtime(join(path, entry)));
  }
  return newest;
}

if (dev) {
  process.exit(await run(process.execPath, [electronViteBin(), 'dev', ...passthrough]));
}

const built = join(root, 'out', 'main', 'index.js');
const sources = ['src', 'electron.vite.config.ts', 'package.json'].map((p) => join(root, p));
const stale =
  forceBuild ||
  !existsSync(built) ||
  Math.max(...sources.map(newestMtime)) > statSync(built).mtimeMs;

if (stale) {
  console.log('Building…');
  const code = await run(process.execPath, [electronViteBin(), 'build']);
  if (code !== 0) process.exit(code);
}

// In Node (not Electron), require('electron') returns the executable path.
const electron = require('electron');
process.exit(await run(electron, ['.', ...passthrough]));
