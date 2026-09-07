#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src', 'cli.ts');
const bundled = [path.join(root, 'dist', 'cli.cjs'), path.join(root, 'dist', 'cli.js')].find((p) =>
  fs.existsSync(p),
);
const args = process.argv.slice(2);

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: process.cwd() });
  process.exit(r.status ?? 1);
}

const ensure = spawnSync(process.execPath, [path.join(root, 'scripts', 'ensure-built.mjs')], {
  stdio: 'inherit',
});
if ((ensure.status ?? 1) !== 0) process.exit(ensure.status ?? 1);

const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs');
if (fs.existsSync(src) && fs.existsSync(tsx)) {
  run(process.execPath, ['--import', pathToFileURL(tsx).href, src, ...args]);
}

if (bundled) {
  run(process.execPath, [bundled, ...args]);
}

if (!fs.existsSync(tsx)) {
  console.error('aindle: tsx missing. From the repo root run: npm install');
  process.exit(1);
}
console.error('aindle: src/cli.ts missing. Run this from a git clone, not a bare npm package.');
process.exit(1);
