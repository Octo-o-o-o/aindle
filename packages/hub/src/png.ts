import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ViewModel } from '@aindle/core';
import { OASIS1, renderEinkHtml, type EinkOpts, type EinkPage } from './eink.js';

const TTL_MS = 15_000;
const cache = new Map<string, { buf: Buffer; at: number }>();

export function findChrome(explicit?: string): string | undefined {
  const hinted = explicit || process.env.AINDLE_CHROME;
  if (hinted && fs.existsSync(hinted)) return hinted;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((p) => fs.existsSync(p));
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
    throw new Error('chrome not found; install Google Chrome or set AINDLE_CHROME');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-eink-'));
  const htmlPath = path.join(dir, 'eink.html');
  const pngPath = path.join(dir, 'dash.png');
  fs.writeFileSync(htmlPath, html, 'utf8');
  try {
    await runChrome(chrome, [
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
    ]);
    if (!fs.existsSync(pngPath)) throw new Error('chrome produced no screenshot');
    let buf = fs.readFileSync(pngPath);
    const size = pngSize(buf);
    if (size.w === width && size.h === height) return buf;
    if (size.w === width * 2 && size.h === height * 2 && process.platform === 'darwin') {
      await runCmd('sips', ['-z', String(height), String(width), pngPath]);
      buf = fs.readFileSync(pngPath);
      const resized = pngSize(buf);
      if (resized.w === width && resized.h === height) return buf;
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
