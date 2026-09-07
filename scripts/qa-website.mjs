#!/usr/bin/env node
// 官网浏览器 QA：按 Pages 规则套 _headers，桌面 / 手机 / 320px，复制、Demo、dash.png。
// 普通运行只写 .tmp/website-branding/；--update-screenshots 才更新 docs/screenshots。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExtra } from './load-extra-module.mjs';
import { parsePagesHeaders, headersFor, headerValues, toNodeHeaders } from './pages-headers.mjs';
import { createHubServer } from '../packages/hub/src/server.ts';
import { renderEinkHtml } from '../packages/hub/src/eink.ts';
import { buildMockSnapshot, snapshotToViewModel } from '@aindle/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'site');
const SHOT = path.join(ROOT, '.tmp', 'website-branding');
const UPDATE_SHOTS = process.argv.includes('--update-screenshots');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function contentType(filePath) {
  return TYPES[path.extname(filePath)] || 'application/octet-stream';
}

function pngMeta(buf) {
  const magic = buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
  if (!magic || buf.length < 24) return { magic: false, w: 0, h: 0 };
  return { magic: true, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function serve(dir, rules) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pageHeaders = headersFor(rules, url.pathname);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const filePath = path.normalize(path.join(dir, rel));
      if (!filePath.startsWith(dir)) {
        res.writeHead(403, toNodeHeaders(pageHeaders));
        res.end();
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const four = path.join(dir, '404.html');
        res.writeHead(404, toNodeHeaders(pageHeaders, { 'Content-Type': 'text/html; charset=utf-8' }));
        res.end(fs.existsSync(four) ? fs.readFileSync(four) : 'not found');
        return;
      }
      res.writeHead(200, toNodeHeaders(pageHeaders, { 'Content-Type': contentType(filePath) }));
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.once('error', reject);
  });
}

function listenHub() {
  const { server } = createHubServer({ seedMock: true, host: '127.0.0.1' });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.once('error', reject);
  });
}

function findBrowserBin() {
  const home = process.env.HOME || '';
  const candidates = [
    process.env.AINDLE_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(home, 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    path.join(home, 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function withBrowser(fn) {
  const { chromium } = loadExtra('playwright');
  const executablePath = findBrowserBin();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

const MAIN_DOC_404_CONSOLE =
  'Failed to load resource: the server responded with a status of 404 (Not Found)';

function documentUrlsMatch(a, b) {
  if (!a || !b) return false;
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.origin === right.origin && left.pathname === right.pathname && left.search === right.search;
  } catch {
    return a === b;
  }
}

function isExpectedMainDocument404Console(rec, pageUrl, response, allow404) {
  if (!allow404 || !response || response.status() !== 404) return false;
  if (!rec.url || rec.text !== MAIN_DOC_404_CONSOLE) return false;
  return documentUrlsMatch(rec.url, pageUrl) || documentUrlsMatch(rec.url, response.url());
}

async function checkCopy(page, errors) {
  const btn = page.locator('[data-copy]').first();
  await btn.scrollIntoViewIfNeeded();
  const expected = await page.evaluate(() => {
    const b = document.querySelector('[data-copy]');
    const sel = b && b.getAttribute('data-copy');
    const el = sel ? document.querySelector(sel) : null;
    return el ? String(el.textContent || '').replace(/^\n+|\n+$/g, '') : '';
  });
  await btn.click();
  try {
    await page.locator('[data-copy]').first().filter({ hasText: '已复制' }).waitFor({ timeout: 5000 });
  } catch {
    const label = String(await btn.textContent() || '').trim();
    errors.push(`copy label ${label}`);
    return { label, expected, clipboard: null, ok: false };
  }
  const label = String(await btn.textContent() || '').trim();
  if (label !== '已复制') {
    errors.push(`copy label ${label}`);
    return { label, expected, clipboard: null, ok: false };
  }
  let clipboard = '';
  try {
    clipboard = await page.evaluate(() => navigator.clipboard.readText());
  } catch (err) {
    errors.push(`clipboard read ${err && err.message ? err.message : err}`);
    return { label, expected, clipboard: null, ok: false };
  }
  if (clipboard !== expected) {
    errors.push(`clipboard mismatch: ${JSON.stringify(clipboard).slice(0, 120)}`);
  }
  return { label, expected, clipboard, ok: clipboard === expected };
}

async function heroState(page) {
  return page.evaluate(() => {
    const photo = document.getElementById('hero-device-photo');
    const cap = document.getElementById('hero-device-caption');
    const group = document.querySelector('.hero-device-switch');
    const oasis = document.querySelector('.hero-device-switch [data-device="oasis"]');
    const scribe = document.querySelector('.hero-device-switch [data-device="scribe"]');
    const frame = document.querySelector('.hero-device-frame');
    const figure = document.querySelector('figure.hero-device');
    return {
      src: photo ? photo.getAttribute('src') : '',
      alt: photo ? photo.getAttribute('alt') : '',
      nw: photo ? photo.naturalWidth : 0,
      nh: photo ? photo.naturalHeight : 0,
      complete: photo ? photo.complete : false,
      caption: cap ? String(cap.textContent || '').replace(/\s+/g, ' ').trim() : '',
      groupLabel: group ? group.getAttribute('aria-label') : '',
      oasisPressed: oasis ? oasis.getAttribute('aria-pressed') : null,
      scribePressed: scribe ? scribe.getAttribute('aria-pressed') : null,
      oasisTag: oasis ? oasis.tagName : '',
      scribeTag: scribe ? scribe.tagName : '',
      oasisLabel: oasis ? String(oasis.textContent || '').trim() : '',
      scribeLabel: scribe ? String(scribe.textContent || '').trim() : '',
      frameH: frame ? Math.round(frame.getBoundingClientRect().height) : 0,
      figureH: figure ? Math.round(figure.getBoundingClientRect().height) : 0,
    };
  });
}

async function waitHeroSrc(page, needle, errors, label) {
  try {
    await page.waitForFunction(
      (part) => {
        const photo = document.getElementById('hero-device-photo');
        return Boolean(
          photo &&
          String(photo.getAttribute('src') || '').includes(part) &&
          photo.complete &&
          photo.naturalWidth > 0,
        );
      },
      needle,
      { timeout: 8000 },
    );
  } catch {
    errors.push(`${label} image did not load`);
  }
}

async function checkHeroSwitch(page, errors, opts) {
  const initial = await heroState(page);
  if (initial.groupLabel !== '设备示意图') errors.push(`hero group label ${initial.groupLabel}`);
  if (initial.oasisTag !== 'BUTTON' || initial.scribeTag !== 'BUTTON') {
    errors.push(`hero controls are not buttons (${initial.oasisTag}/${initial.scribeTag})`);
  }
  if (initial.oasisLabel !== 'Kindle Oasis' || initial.scribeLabel !== 'Kindle Scribe') {
    errors.push(`hero button labels ${initial.oasisLabel}/${initial.scribeLabel}`);
  }
  if (!String(initial.src).includes('eink-local.png')) errors.push(`default hero src ${initial.src}`);
  if (initial.nw < 1 || initial.nh < 1) errors.push(`hero natural size ${initial.nw}x${initial.nh}`);
  if (initial.oasisPressed !== 'true' || initial.scribePressed !== 'false') {
    errors.push(`default pressed oasis=${initial.oasisPressed} scribe=${initial.scribePressed}`);
  }
  if (!/Oasis/.test(initial.caption) || !/锁屏/.test(initial.caption) || !/Mock/.test(initial.caption)) {
    errors.push(`default caption ${initial.caption}`);
  }

  await page.locator('.hero-device-switch [data-device="scribe"]').click();
  await waitHeroSrc(page, 'hero-scribe.png', errors, 'scribe');
  const afterScribe = await heroState(page);
  if (!String(afterScribe.src).includes('hero-scribe.png')) errors.push(`scribe src ${afterScribe.src}`);
  if (afterScribe.nw < 1 || afterScribe.nh < 1) errors.push(`scribe natural size ${afterScribe.nw}x${afterScribe.nh}`);
  if (afterScribe.scribePressed !== 'true' || afterScribe.oasisPressed !== 'false') {
    errors.push(`scribe pressed oasis=${afterScribe.oasisPressed} scribe=${afterScribe.scribePressed}`);
  }
  if (!/Scribe/.test(afterScribe.caption) || !/看板/.test(afterScribe.caption) || !/Mock/.test(afterScribe.caption)) {
    errors.push(`scribe caption ${afterScribe.caption}`);
  }
  if (!/Scribe/.test(afterScribe.alt) || !/Mock/.test(afterScribe.alt)) {
    errors.push(`scribe alt ${afterScribe.alt}`);
  }

  let scribeShot = null;
  if (opts.scribeShot) {
    fs.mkdirSync(path.dirname(opts.scribeShot), { recursive: true });
    await page.screenshot({ path: opts.scribeShot, fullPage: false });
    scribeShot = path.relative(ROOT, opts.scribeShot);
  }

  await page.locator('.hero-device-switch [data-device="oasis"]').click();
  await waitHeroSrc(page, 'eink-local.png', errors, 'oasis-roundtrip');
  const back = await heroState(page);
  if (!String(back.src).includes('eink-local.png')) errors.push(`roundtrip oasis src ${back.src}`);
  if (back.nw < 1 || back.nh < 1) errors.push(`roundtrip oasis natural size ${back.nw}x${back.nh}`);
  if (back.oasisPressed !== 'true' || back.scribePressed !== 'false') {
    errors.push(`roundtrip pressed oasis=${back.oasisPressed} scribe=${back.scribePressed}`);
  }
  if (!/Oasis/.test(back.caption) || !String(back.alt).includes('Oasis')) {
    errors.push(`roundtrip caption/alt ${back.caption} / ${back.alt}`);
  }
  const frameHeights = [initial.frameH, afterScribe.frameH, back.frameH];
  const figureHeights = [initial.figureH, afterScribe.figureH, back.figureH];
  if (Math.max(...frameHeights) - Math.min(...frameHeights) > 2) {
    errors.push(`hero frame height unstable ${frameHeights.join(',')}`);
  }
  if (Math.max(...figureHeights) - Math.min(...figureHeights) > 2) {
    errors.push(`hero figure height unstable ${figureHeights.join(',')}`);
  }

  return { initial, afterScribe, back, scribeShot };
}

async function checkPage(context, url, opts) {
  const errors = [];
  const consoleLines = [];
  const page = await context.newPage();
  await page.setViewportSize({ width: opts.width, height: opts.height });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    const loc = msg.location();
    consoleLines.push({
      type: msg.type(),
      text: msg.text(),
      url: loc && loc.url ? loc.url : '',
    });
  });
  const res = await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
  if (!res || res.status() >= 400 && !opts.allow404) errors.push(`status ${res && res.status()}`);
  if (opts.allow404 && res && res.status() !== 404) errors.push(`expected 404, got ${res.status()}`);
  await page.waitForFunction(
    () => Array.from(document.images).every((img) => img.complete),
    null,
    { timeout: 10_000 },
  ).catch(() => {});
  if (opts.expectDemoContent) {
    try {
      await page.waitForFunction(
        () => /Claude|Codex/.test(document.body.innerText),
        null,
        { timeout: 10_000 },
      );
    } catch {
      errors.push('demo content not visible (inline JS blocked or empty)');
    }
  }
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    title: document.title,
    h1: (document.querySelector('h1') && document.querySelector('h1').textContent) || '',
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    broken: Array.from(document.images)
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src')),
    copyBtn: Boolean(document.querySelector('[data-copy]')),
    demo: Boolean(document.querySelector('a[href*="oasis-monitor-simple.html"]')),
    github: Boolean(document.querySelector('a[href="https://github.com/Octo-o-o-o/aindle"]')),
    heroSize: (() => {
      const img = document.getElementById('hero-device-photo') || document.querySelector('.hero-device img');
      return img
        ? { w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute('src') }
        : null;
    })(),
    links: Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      text: (a.textContent || '').trim().slice(0, 40),
      href: a.getAttribute('href'),
    })),
  }));
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    errors.push(`overflow ${metrics.scrollWidth}>${metrics.clientWidth} at ${opts.width}px`);
  }
  if (metrics.broken.length) errors.push(`broken images: ${metrics.broken.join(', ')}`);
  if (opts.expectCopy && !metrics.copyBtn) errors.push('missing copy button');
  if (opts.expectDemo && !metrics.demo) errors.push('missing demo link');
  if (opts.expectGithub && !metrics.github) errors.push('missing github link');
  if (opts.expectHero && (!metrics.heroSize || metrics.heroSize.w < 1 || metrics.heroSize.h < 1)) {
    errors.push(`hero photo ${JSON.stringify(metrics.heroSize)}, expected loaded natural size`);
  }
  if (opts.shot) {
    fs.mkdirSync(path.dirname(opts.shot), { recursive: true });
    await page.screenshot({ path: opts.shot, fullPage: false });
  }
  let hero = null;
  if (opts.expectHero) {
    hero = await checkHeroSwitch(page, errors, { scribeShot: opts.scribeShot });
  }
  let copy = null;
  if (opts.clickCopy) copy = await checkCopy(page, errors);
  let navigated = null;
  if (opts.followDemo) {
    await page.locator('nav a[href*="oasis-monitor-simple.html"]').first().click();
    try {
      await page.waitForURL(/oasis-monitor-simple\.html/, { timeout: 10_000 });
      await page.waitForFunction(
        () => /Claude|Codex/.test(document.body.innerText),
        null,
        { timeout: 10_000 },
      );
      navigated = {
        url: page.url(),
        visible: await page.evaluate(() => /Claude|Codex/.test(document.body.innerText)),
      };
      if (!navigated.visible) errors.push('demo navigation content not visible');
    } catch (err) {
      errors.push(`demo navigation ${err && err.message ? err.message : err}`);
      navigated = { url: page.url(), visible: false };
    }
  }
  for (const rec of consoleLines) {
    if (rec.type !== 'error') continue;
    if (isExpectedMainDocument404Console(rec, url, res, opts.allow404)) continue;
    errors.push(rec.text);
  }
  await page.close();
  return {
    errors,
    metrics: {
      width: opts.width,
      height: opts.height,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      title: metrics.title,
      h1: metrics.h1,
      bodyText: metrics.bodyText,
      heroSize: metrics.heroSize,
    },
    links: metrics.links,
    console: consoleLines,
    shot: opts.shot ? path.relative(ROOT, opts.shot) : null,
    copy,
    navigated,
    hero,
  };
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('qa-website: dist/site missing, run npm run site:build');
  process.exit(1);
}

const rules = parsePagesHeaders(fs.readFileSync(path.join(DIST, '_headers'), 'utf8'));
const site = await serve(DIST, rules);
const hub = await listenHub();
fs.mkdirSync(SHOT, { recursive: true });
const failures = [];
const evidence = {
  headers: {},
  dashPng: null,
  operate: null,
  pages: {},
  copy: null,
  hero: {},
  updateScreenshots: UPDATE_SHOTS,
};

function fail(msg) {
  failures.push(msg);
}

try {
  const origin = `http://127.0.0.1:${site.port}`;
  const hubOrigin = `http://127.0.0.1:${hub.port}`;

  async function inspectPath(pathname) {
    const res = await fetch(origin + pathname);
    const body = await res.text();
    const reqPath = pathname.split('?')[0] || '/';
    const cspList = headerValues(headersFor(rules, reqPath), 'Content-Security-Policy');
    return {
      path: pathname,
      status: res.status,
      type: res.headers.get('content-type'),
      csp: res.headers.get('content-security-policy'),
      cspCount: cspList.length,
      cspList,
      xfo: res.headers.get('x-frame-options'),
      xcto: res.headers.get('x-content-type-options'),
      has404Heading: body.includes('这一页不在书里'),
      snippet: body.replace(/\s+/g, ' ').trim().slice(0, 180),
    };
  }

  evidence.headers.home = await inspectPath('/');
  evidence.headers.demo = await inspectPath('/demo/oasis-monitor-simple.html?mode=full');
  evidence.headers.notFound = await inspectPath('/no-such-page');
  if (evidence.headers.home.cspCount !== 1) fail(`home CSP count ${evidence.headers.home.cspCount}`);
  if (/unsafe-inline/.test(String(evidence.headers.home.csp || ''))) fail('home CSP allows inline');
  if (evidence.headers.demo.cspCount !== 1) fail(`demo CSP count ${evidence.headers.demo.cspCount} (stacking)`);
  if (!/unsafe-inline/.test(String(evidence.headers.demo.csp || ''))) fail('demo CSP missing unsafe-inline');
  if (evidence.headers.notFound.status !== 404) fail(`missing path status ${evidence.headers.notFound.status}`);
  if (!evidence.headers.notFound.has404Heading) fail('404 body missing');
  if (evidence.headers.home.xfo !== 'DENY' || evidence.headers.demo.xfo !== 'DENY') {
    fail('X-Frame-Options not applied');
  }

  evidence.headers.heroOasis = await inspectPath('/images/eink-local.png');
  evidence.headers.heroScribe = await inspectPath('/images/hero-scribe.png');
  if (evidence.headers.heroOasis.status !== 200) fail(`hero oasis png status ${evidence.headers.heroOasis.status}`);
  if (evidence.headers.heroScribe.status !== 200) fail(`hero scribe png status ${evidence.headers.heroScribe.status}`);
  if (!/image\/png/i.test(String(evidence.headers.heroOasis.type || ''))) {
    fail(`hero oasis type ${evidence.headers.heroOasis.type}`);
  }
  if (!/image\/png/i.test(String(evidence.headers.heroScribe.type || ''))) {
    fail(`hero scribe type ${evidence.headers.heroScribe.type}`);
  }

  const operateHtml = fs.readFileSync(path.join(ROOT, 'kindle/oasis1/operate.html'), 'utf8');
  const operateSh = fs.readFileSync(path.join(ROOT, 'kindle/oasis1/operate.sh'), 'utf8');
  evidence.operate = {
    htmlDataUri: operateHtml.includes('data:image/png;base64,'),
    shDataUri: operateSh.includes('data:image/png;base64,'),
    htmlRelative: operateHtml.includes('src="brand-icon.png"'),
    shRelative: operateSh.includes('src="brand-icon.png"'),
    writesDocuments: operateSh.includes('Aindle操作.html'),
  };
  if (!evidence.operate.htmlDataUri || !evidence.operate.shDataUri) fail('operate HTML/sh missing data URI icon');
  if (evidence.operate.htmlRelative || evidence.operate.shRelative) fail('operate still uses relative brand-icon.png');

  const einkHtml = await fetch(`${hubOrigin}/eink.html?page=local`).then((r) => r.text());
  if (!einkHtml.includes('data:image/png;base64,')) fail('eink.html missing data URI mark');
  if (/src="brand\//.test(einkHtml)) fail('eink.html uses relative brand URL');
  const vm = snapshotToViewModel(buildMockSnapshot());
  const local = renderEinkHtml(vm, 'local');
  if (!local.includes('class="mark"')) fail('renderEinkHtml missing mark');

  const mon = await fetch(`${hubOrigin}/monitor.html`).then((r) => r.text());
  if (!mon.includes('brand/icon-32.png')) fail('monitor.html missing brand img');
  const ico = await fetch(`${hubOrigin}/favicon.ico`);
  const mark = await fetch(`${hubOrigin}/brand/icon-32.png`);
  if (ico.status !== 200) fail(`hub favicon ${ico.status}`);
  if (mark.status !== 200) fail(`hub mark ${mark.status}`);
  const demoMark = await fetch(`${origin}/demo/brand/icon-32.png`);
  if (demoMark.status !== 200) fail(`site demo mark ${demoMark.status}`);

  const dashRes = await fetch(`${hubOrigin}/dash.png?page=local`);
  const dashBuf = Buffer.from(await dashRes.arrayBuffer());
  const dashType = dashRes.headers.get('content-type') || '';
  const dashPng = pngMeta(dashBuf);
  const dashFile = path.join(SHOT, 'eink-dash.png');
  evidence.dashPng = {
    status: dashRes.status,
    type: dashType,
    bytes: dashBuf.length,
    magic: dashPng.magic,
    width: dashPng.w,
    height: dashPng.h,
    file: path.relative(ROOT, dashFile),
    errorBody: dashPng.magic ? null : dashBuf.toString('utf8').slice(0, 300),
  };
  if (dashRes.status !== 200) fail(`dash.png status ${dashRes.status}`);
  if (!/image\/png/i.test(dashType)) fail(`dash.png type ${dashType}`);
  if (!dashPng.magic) fail('dash.png missing PNG magic');
  if (dashPng.w !== 1072 || dashPng.h !== 1448) fail(`dash.png size ${dashPng.w}x${dashPng.h}`);
  if (dashRes.status === 200 && dashPng.magic) fs.writeFileSync(dashFile, dashBuf);

  await withBrowser(async (browser) => {
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });

    const desktop = await checkPage(context, origin + '/', {
      width: 1440,
      height: 1000,
      shot: path.join(SHOT, 'desktop.png'),
      scribeShot: path.join(SHOT, 'desktop-scribe.png'),
      expectCopy: true,
      expectDemo: true,
      expectGithub: true,
      expectHero: true,
      clickCopy: true,
      followDemo: true,
    });
    const mobile = await checkPage(context, origin + '/', {
      width: 390,
      height: 844,
      shot: path.join(SHOT, 'mobile.png'),
      expectCopy: true,
      expectDemo: true,
      expectGithub: true,
      expectHero: true,
    });
    const narrow = await checkPage(context, origin + '/', {
      width: 320,
      height: 720,
      shot: path.join(SHOT, 'narrow-320.png'),
      expectCopy: true,
      expectDemo: true,
      expectHero: true,
    });
    const demo = await checkPage(context, origin + '/demo/oasis-monitor-simple.html?mode=full', {
      width: 1440,
      height: 1000,
      shot: path.join(SHOT, 'demo-desktop.png'),
      expectDemoContent: true,
    });
    const notFound = await checkPage(context, origin + '/no-such-page', {
      width: 1440,
      height: 1000,
      shot: path.join(SHOT, '404.png'),
      allow404: true,
    });
    const einkPage = await checkPage(context, hubOrigin + '/eink.html?page=local', {
      width: 1072,
      height: 1448,
      shot: path.join(SHOT, 'eink-html.png'),
    });

    evidence.pages = { desktop, mobile, narrow, demo, notFound, eink: einkPage };
    evidence.copy = desktop.copy;
    evidence.hero = {
      jpeg: {
        oasis: {
          status: evidence.headers.heroOasis.status,
          type: evidence.headers.heroOasis.type,
        },
        scribe: {
          status: evidence.headers.heroScribe.status,
          type: evidence.headers.heroScribe.type,
        },
      },
      desktop: desktop.hero,
      mobile: mobile.hero,
      narrow: narrow.hero,
    };
    for (const [name, result] of Object.entries(evidence.pages)) {
      for (const err of result.errors || []) fail(`${name}: ${err}`);
    }
    if (!desktop.navigated || !desktop.navigated.visible) fail('desktop did not navigate into a live demo');
    if (notFound.metrics && !/这一页不在书里/.test(notFound.metrics.h1 || '')) {
      fail('404 heading missing');
    }

    if (UPDATE_SHOTS) {
      fs.copyFileSync(path.join(SHOT, 'desktop.png'), path.join(ROOT, 'docs', 'screenshots', 'site-desktop.png'));
    }
    await context.close();
    console.log('qa-website screenshots', path.relative(ROOT, SHOT), UPDATE_SHOTS ? '(updated docs/screenshots)' : '(tmp only)');
  });
} catch (err) {
  fail(String(err && err.message ? err.message : err));
} finally {
  fs.mkdirSync(SHOT, { recursive: true });
  fs.writeFileSync(path.join(SHOT, 'qa-evidence.json'), JSON.stringify(evidence, null, 2));
  await new Promise((resolve) => site.server.close(resolve));
  await new Promise((resolve) => hub.server.close(resolve));
}

if (failures.length) {
  for (const f of failures) console.error('qa-website FAIL:', f);
  process.exit(1);
}
console.log('qa-website ok');
