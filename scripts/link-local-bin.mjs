#!/usr/bin/env node
// npm does not always put the root package bin on node_modules/.bin in a clone.
// Without this, `npx aindle` in the repo is a 404 (the package is not on npm).
// Windows without Developer Mode cannot create symlinks — never fail postinstall.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'scripts', 'aindle.mjs');
const dir = path.join(root, 'node_modules', '.bin');
if (!fs.existsSync(target) || !fs.existsSync(path.join(root, 'node_modules'))) process.exit(0);
fs.mkdirSync(dir, { recursive: true });

function rm(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* missing */
  }
}

const unix = path.join(dir, 'aindle');
rm(unix);
try {
  fs.symlinkSync(path.relative(dir, target), unix, 'file');
} catch {
  try {
    fs.copyFileSync(target, unix);
  } catch {
    /* npx / npm on Windows use aindle.cmd */
  }
}
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(unix, 0o755);
  } catch {
    /* ignore */
  }
}

fs.writeFileSync(
  path.join(dir, 'aindle.cmd'),
  '@echo off\r\nnode "%~dp0\\..\\..\\scripts\\aindle.mjs" %*\r\n',
);
fs.writeFileSync(
  path.join(dir, 'aindle.ps1'),
  '#!/usr/bin/env pwsh\r\nnode (Join-Path $PSScriptRoot "..\\..\\scripts\\aindle.mjs") @args\r\n',
);
