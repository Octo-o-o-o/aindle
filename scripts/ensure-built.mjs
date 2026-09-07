#!/usr/bin/env node
// After a fresh clone, @aindle/core only exists as TypeScript.
// Hub / agent / `npx aindle` import the compiled package — build it once.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function missing(rel) {
  return !fs.existsSync(path.join(root, rel));
}

function npmRun(args) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}

if (missing('packages/core/dist/index.js')) {
  console.error('aindle: compiling @aindle/core (first run after clone)…');
  npmRun(['run', 'build', '-w', '@aindle/core']);
}
