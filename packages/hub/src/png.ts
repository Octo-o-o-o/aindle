import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ViewModel } from '@aindle/core';
import { OASIS1, renderEinkHtml, type EinkOpts, type EinkPage } from './eink.js';
import { scalePngTo } from './png-scale.js';

const TTL_MS = 15_000;
const cache = new Map<string, { buf: Buffer; at: number }>();

export function chromeSearchPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = os.homedir(),
): string[] {
  const out: string[] = [];
  const hinted = env.AINDLE_CHROME?.trim();
  if (hinted) out.push(hinted);
  if (platform === 'darwin') {
    out.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    );
  } else if (platform === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    out.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(local, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    );
  } else {
    out.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
    );
  }
  return out;
}

function lookOnPath(names: string[]): string | undefined {
  const finder = process.platform === 'win32' ? lookupWhereBin() : 'which';
  for (const name of names) {
    try {
      const out = execFileSync(finder, [name], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const first = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && fs.existsSync(s));
      if (first) return first;
    } catch {
      /* try next name */
    }
  }
  return undefined;
}

function lookupWhereBin(): string {
  const root = process.env.SystemRoot;
  if (root) {
    const p = path.join(root, 'System32', 'where.exe');
    if (fs.existsSync(p)) return p;
  }
  return 'where.exe';
}

export function findChrome(explicit?: string): string | undefined {
  if (explicit && fs.existsSync(explicit)) return explicit;
  for (const p of chromeSearchPaths()) {
    if (fs.existsSync(p)) return p;
  }
  return lookOnPath(
    process.platform === 'win32'
      ? ['chrome.exe', 'msedge.exe', 'brave.exe', 'chromium.exe']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'],
  );
}

export function pngSize(buf: Buffer): { w: number; h: number } {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('not a png');
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

export async function htmlToPng(
  html: string,
  width = OASIS1.w,
  height = OASIS1.h,
): Promise<Buffer> {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      'chrome not found; install Chrome, Chromium, Edge, or Brave, or set AINDLE_CHROME to the browser path',
    );
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-eink-'));
  const htmlPath = path.join(dir, 'eink.html');
  const pngPath = path.join(dir, 'dash.png');
  fs.writeFileSync(htmlPath, html, 'utf8');
  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--no-sandbox',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      '--default-background-color=FFF4EFE4',
      '--virtual-time-budget=2000',
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ];
    // Isolated profile only on Windows: a running Chrome often locks the default
    // user-data dir. On macOS this flag made headless screenshot hang.
    if (process.platform === 'win32') {
      const userData = path.join(dir, 'chrome-user');
      fs.mkdirSync(userData);
      args.splice(args.length - 2, 0, `--user-data-dir=${userData}`);
    }
    await runChrome(chrome, args);
    if (!fs.existsSync(pngPath)) throw new Error('chrome produced no screenshot');
    let buf = fs.readFileSync(pngPath);
    const size = pngSize(buf);
    if (size.w === width && size.h === height) return buf;
    if (size.w === width * 2 && size.h === height * 2 && process.platform === 'darwin') {
      try {
        await runCmd('sips', ['-z', String(height), String(width), pngPath]);
        buf = fs.readFileSync(pngPath);
        const resized = pngSize(buf);
        if (resized.w === width && resized.h === height) return buf;
      } catch {
        /* JS scale below */
      }
    }
    if (size.w % width === 0 && size.h % height === 0 && size.w / width === size.h / height) {
      const scaled = scalePngTo(buf, width, height);
      const out = pngSize(scaled);
      if (out.w === width && out.h === height) return scaled;
    }
    throw new Error(`png size ${size.w}x${size.h}, expected ${width}x${height}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function renderDashPng(vm: ViewModel, page: EinkPage, opts?: EinkOpts): Promise<Buffer> {
  const key = `${page}:${vm.generatedAt}:${opts?.battery ?? ''}:lock`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.buf;
  const buf = await htmlToPng(renderEinkHtml(vm, page, { ...opts, lockScreen: true }));
  cache.set(key, { buf, at: Date.now() });
  return buf;
}

function runChrome(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('chrome screenshot timed out'));
    }, 20_000);
    child.stderr.on('data', (c: Buffer) => {
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

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}`));
    });
  });
}
