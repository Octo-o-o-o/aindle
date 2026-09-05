#!/usr/bin/env node
// Capture README screenshots from the static demo (mock data only).
// Uses the same local Chrome binary as `dash.png`.
// Prerequisite: python3 demo/serve.py  (default :8765)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const BASE = process.env.AINDLE_DEMO_URL ?? 'http://127.0.0.1:8765';

const CHROME_CANDIDATES = [
  process.env.AINDLE_CHROME,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findChrome() {
  return CHROME_CANDIDATES.find((p) => fs.existsSync(p));
}

const SHOTS = [
  {
    file: 'simple-phone.png',
    url: `${BASE}/oasis-monitor-simple.html?mode=panels&page=quota`,
    width: 390,
    height: 1800,
  },
  {
    file: 'simple-desktop.png',
    url: `${BASE}/oasis-monitor-simple.html?mode=full`,
    width: 1600,
    height: 1400,
  },
  {
    file: 'complex-phone.png',
    url: `${BASE}/oasis-monitor.html?mode=panels&page=quota`,
    width: 390,
    height: 3200,
  },
  {
    file: 'complex-desktop.png',
    url: `${BASE}/oasis-monitor.html?mode=full`,
    width: 1680,
    height: 2600,
  },
  {
    file: 'kindle-oasis1.png',
    url: `${BASE}/oasis-monitor.html?device=oasis1&kindle=1&mode=panels&page=quota`,
    width: 1072,
    height: 1448,
  },
];

function runChrome(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('chrome screenshot timed out'));
    }, 25_000);
    child.stderr.on('data', (c) => {
      err += c.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`chrome exited ${code}${err ? `: ${err.slice(-400)}` : ''}`));
    });
  });
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('chrome not found; install Google Chrome or set AINDLE_CHROME');
  fs.mkdirSync(OUT, { recursive: true });
  for (const shot of SHOTS) {
    const dest = path.join(OUT, shot.file);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-shot-'));
    try {
      await runChrome(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--no-sandbox',
        `--user-data-dir=${profile}`,
        '--force-device-scale-factor=1',
        `--window-size=${shot.width},${shot.height}`,
        '--default-background-color=FFF4EFE4',
        '--virtual-time-budget=4000',
        `--screenshot=${dest}`,
        shot.url,
      ]);
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
    if (!fs.existsSync(dest)) throw new Error(`no screenshot: ${shot.file}`);
    console.log('wrote %s (%d bytes)', path.relative(ROOT, dest), fs.statSync(dest).size);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
