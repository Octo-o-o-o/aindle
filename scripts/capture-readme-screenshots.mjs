#!/usr/bin/env node
// Capture README / website screenshots from mock data only.
// Run: node --import tsx scripts/capture-readme-screenshots.mjs
// Optional: AINDLE_DEMO_URL if demo/serve.py is already up.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEinkHtml } from '../packages/hub/src/eink.ts';
import { htmlToPng } from '../packages/hub/src/png.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const DEMO_PORT = Number(process.env.AINDLE_DEMO_PORT ?? '8765');
const BASE = process.env.AINDLE_DEMO_URL ?? `http://127.0.0.1:${DEMO_PORT}`;

const CHROME_CANDIDATES = [
  process.env.AINDLE_CHROME,
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
    file: 'simple-oasis.png',
    url: `${BASE}/oasis-monitor-simple.html?device=oasis1&kindle=1&page=quota`,
    width: 1072,
    height: 1448,
  },
  {
    file: 'simple-scribe.png',
    url: `${BASE}/oasis-monitor-simple.html?device=scribe&mode=full`,
    width: 1860,
    height: 2480,
  },
  {
    file: 'complex-oasis.png',
    url: `${BASE}/oasis-monitor.html?device=oasis1&kindle=1&page=quota`,
    width: 1072,
    height: 1448,
  },
  {
    file: 'complex-scribe.png',
    url: `${BASE}/oasis-monitor.html?device=scribe&mode=full`,
    width: 1860,
    height: 2480,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshotOnce(chrome, dest, shot) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-shot-'));
  const child = spawn(
    chrome,
    [
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
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const deadline = Date.now() + 20_000;
  try {
    while (Date.now() < deadline) {
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
        await sleep(400);
        return;
      }
      await sleep(150);
    }
    throw new Error(`screenshot timed out: ${shot.file}`);
  } finally {
    child.kill('SIGKILL');
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      setTimeout(() => {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* leftover tmp */ }
      }, 500);
    }
  }
}

async function waitForDemo(url) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`demo server did not start: ${url}`);
}

async function captureEink() {
  const vm = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo', 'mock-view.json'), 'utf8'));
  const html = renderEinkHtml(vm, 'local', { lockScreen: true, battery: 93 });
  const buf = await htmlToPng(html);
  const dest = path.join(OUT, 'eink-local.png');
  fs.writeFileSync(dest, buf);
  fs.copyFileSync(dest, path.join(OUT, 'kindle-oasis1.png'));
  console.log('wrote %s (%d bytes)', path.relative(ROOT, dest), buf.length);
}

async function captureMonitor(chrome) {
  let server;
  if (!process.env.AINDLE_DEMO_URL) {
    server = spawn('python3', [path.join(ROOT, 'demo', 'serve.py'), '--port', String(DEMO_PORT)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForDemo(`${BASE}/oasis-monitor-simple.html`);
  }
  try {
    for (const shot of SHOTS) {
      const dest = path.join(OUT, shot.file);
      if (fs.existsSync(dest)) fs.rmSync(dest);
      await screenshotOnce(chrome, dest, shot);
      console.log('wrote %s (%d bytes)', path.relative(ROOT, dest), fs.statSync(dest).size);
    }
  } finally {
    if (server) {
      server.kill('SIGTERM');
    }
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('chrome not found; install Google Chrome or set AINDLE_CHROME');
  fs.mkdirSync(OUT, { recursive: true });
  await captureEink();
  await captureMonitor(chrome);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
