#!/usr/bin/env node
// 校验 dist/site：白名单、资源存在、metadata、不泄漏私网产物。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePagesHeaders, headersFor, headerValues, pathMatches } from './pages-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'site');
const ORIGIN = 'https://aindle.octoooo.com';
let failed = 0;

function fail(msg) {
  failed += 1;
  console.error('site:check FAIL:', msg);
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

const ALLOW = [
  /^index\.html$/,
  /^404\.html$/,
  /^oasis\.html$/,
  /^scribe\.html$/,
  /^robots\.txt$/,
  /^sitemap\.xml$/,
  /^_headers$/,
  /^manifest\.webmanifest$/,
  /^llms\.txt$/,
  /^favicon\.ico$/,
  /^styles\.css$/,
  /^site\.js$/,
  /^brand\/icon-(32|48|180|192|512)\.png$/,
  /^brand\/og\.png$/,
  /^images\/hero-desk\.jpg$/,
  /^images\/eink-local\.png$/,
  /^demo\/index\.html$/,
  /^demo\/oasis-monitor\.html$/,
  /^demo\/oasis-monitor-simple\.html$/,
  /^demo\/favicon\.ico$/,
  /^demo\/brand\/icon-(32|48|180)\.png$/,
];

const FORBIDDEN_BITS = [
  '.git/',
  'node_modules/',
  'config/registry.yaml',
  'packages/hub/src',
  'snapshot.json',
  '.env',
  'kindle/oasis1/hub.env',
];

const PERSONAL = /personai\.cc|107\.173\.168\.222|:52941|192\.168\.31\.132|friends-direct/;

if (!fs.existsSync(OUT)) {
  fail('dist/site missing; run npm run site:build');
  process.exit(1);
}

const files = walk(OUT).map((abs) => path.relative(OUT, abs).split(path.sep).join('/'));
if (files.length === 0) fail('dist/site is empty');

for (const rel of files) {
  if (!ALLOW.some((re) => re.test(rel))) fail(`not on allowlist: ${rel}`);
  for (const bit of FORBIDDEN_BITS) {
    if (rel.includes(bit)) fail(`forbidden path ${rel} contains ${bit}`);
  }
  const text = fs.readFileSync(path.join(OUT, rel));
  if (PERSONAL.test(text.toString('utf8'))) fail(`personal/secret marker in ${rel}`);
}

function mustExist(rel) {
  if (!files.includes(rel)) fail(`missing ${rel}`);
}

[
  'index.html',
  '404.html',
  'oasis.html',
  'scribe.html',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  'manifest.webmanifest',
  'llms.txt',
  'favicon.ico',
  'styles.css',
  'site.js',
  'brand/icon-32.png',
  'brand/icon-48.png',
  'brand/icon-180.png',
  'brand/icon-192.png',
  'brand/icon-512.png',
  'brand/og.png',
  'images/hero-desk.jpg',
  'images/eink-local.png',
  'demo/oasis-monitor.html',
  'demo/oasis-monitor-simple.html',
  'demo/favicon.ico',
  'demo/brand/icon-32.png',
].forEach(mustExist);

function pngSize(rel) {
  const buf = fs.readFileSync(path.join(OUT, rel));
  if (buf.toString('ascii', 1, 4) !== 'PNG') {
    fail(`${rel} is not a PNG`);
    return { w: 0, h: 0 };
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function jpegSize(rel) {
  const buf = fs.readFileSync(path.join(OUT, rel));
  if (buf[0] !== 0xff || buf[1] !== 0xd8) {
    fail(`${rel} is not a JPEG`);
    return { w: 0, h: 0 };
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      fail(`${rel} JPEG marker sync lost`);
      return { w: 0, h: 0 };
    }
    const marker = buf[offset + 1];
    const size = buf.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { w: buf.readUInt16BE(offset + 7), h: buf.readUInt16BE(offset + 5) };
    }
    offset += 2 + size;
  }
  fail(`${rel} JPEG size not found`);
  return { w: 0, h: 0 };
}

for (const size of [32, 48, 180, 192, 512]) {
  const dim = pngSize(`brand/icon-${size}.png`);
  if (dim.w !== size || dim.h !== size) fail(`brand/icon-${size}.png is ${dim.w}x${dim.h}`);
}
const og = pngSize('brand/og.png');
if (og.w !== 1200 || og.h !== 630) fail(`brand/og.png is ${og.w}x${og.h}, expected 1200x630`);
const eink = pngSize('images/eink-local.png');
if (eink.w !== 1072 || eink.h !== 1448) fail(`images/eink-local.png is ${eink.w}x${eink.h}, expected 1072x1448`);
const hero = jpegSize('images/hero-desk.jpg');
if (hero.w !== 1024 || hero.h !== 576) fail(`images/hero-desk.jpg is ${hero.w}x${hero.h}, expected 1024x576`);

const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const requiredMeta = [
  '<title>Aindle · 桌边的 AI 工作看板</title>',
  'name="description"',
  `rel="canonical" href="${ORIGIN}/"`,
  `property="og:image" content="${ORIGIN}/brand/og.png"`,
  `name="twitter:card" content="summary_large_image"`,
  'name="twitter:image"',
  '让 AI 忙碌',
  '桌边的',
  'AI 工作看板',
  '把分散在不同机器上的 AI 额度',
  '开源 · 自托管 · 为电子墨水屏而生',
  '额度一目了然',
  '进度心中有数',
  '读书照常继续',
  '屏上长这样',
  '克隆之后就能看见示例',
  'ZCode',
  'registry.yaml',
  'AINDLE_SEED_MOCK',
  '只取消注释你已登录的工具',
  'hub.env.example',
  '示例数据',
  '越狱',
  'npx aindle agent',
  'npx aindle init --local',
  '包没有发到 npm',
  '不需要数据库',
  'PowerShell',
  'Node.js 22',
  '/images/eink-local.png',
  '/llms.txt',
  '/images/hero-desk.jpg',
  'width="1024"',
  'height="576"',
  'width="1072"',
  'height="1448"',
  'id="hero-photo"',
  '场景示意',
  '锁屏 · 1072×1448 · Mock 数据',
  'Kindle Oasis',
  'https://github.com/Octo-o-o-o/aindle',
];
for (const needle of requiredMeta) {
  if (!index.includes(needle)) fail(`index.html missing ${needle}`);
}
for (const banned of [
  'JSONL',
  'AskUserQuestion',
  'request_user_input',
  'FBInk',
  '未文档化',
  '不要指望官方担保',
  '<h3>是</h3>',
  '<h3>不是</h3>',
  'oasis-shell',
  'oasis-screen',
  'oasis-keys',
  'hero-device-switch',
  '设备示意图',
  '在自己的 Kindle 上看模拟效果',
  '/demo/oasis-monitor-simple.html?mode=full',
  'https://aindle.octoooo.com/oasis',
  'https://aindle.octoooo.com/scribe',
  '/images/hero-scribe.png',
  '/images/website-eink-demo.png',
]) {
  if (index.includes(banned)) fail(`index.html still has internal copy ${banned}`);
}
const css = fs.readFileSync(path.join(OUT, 'styles.css'), 'utf8');
if (css.includes('oasis-shell') || css.includes('oasis-screen') || css.includes('oasis-keys')) {
  fail('styles.css still has CSS device shell');
}
if (css.includes('@keyframes rest')) fail('styles.css still has floating rest animation');
if (!css.includes('prefers-reduced-motion')) fail('styles.css missing reduced-motion');
if (!css.includes('Songti SC') || !css.includes('Georgia')) fail('styles.css missing required serif stack');
if (/fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/.test(index + css)) fail('external font/CDN reference');

const headersText = fs.readFileSync(path.join(OUT, '_headers'), 'utf8');
for (const h of ['X-Frame-Options', 'X-Content-Type-Options', 'Content-Security-Policy', 'Referrer-Policy']) {
  if (!headersText.includes(h)) fail(`_headers missing ${h}`);
}
if (!pathMatches('/*', '/demo/oasis-monitor-simple.html')) {
  fail('pages glob /* should match demo paths');
}
if (pathMatches('/', '/demo/oasis-monitor-simple.html')) {
  fail('pages glob / should not match demo paths');
}
const headerRules = parsePagesHeaders(headersText);
const starRule = headerRules.find((r) => r.path === '/*');
if (starRule && headerValues(starRule.headers, 'Content-Security-Policy').length) {
  fail('_headers /* must not set CSP; Pages would stack it onto /demo/*');
}
function cspFor(pathname) {
  return headerValues(headersFor(headerRules, pathname), 'Content-Security-Policy');
}
const homeCsp = cspFor('/');
const indexCsp = cspFor('/index.html');
const demoCsp = cspFor('/demo/oasis-monitor-simple.html');
const fourCsp = cspFor('/404.html');
const oasisCsp = cspFor('/oasis.html');
const oasisPrettyCsp = cspFor('/oasis');
const scribeCsp = cspFor('/scribe.html');
const scribePrettyCsp = cspFor('/scribe');
if (homeCsp.length !== 1) fail(`home CSP count ${homeCsp.length}, expected 1`);
if (indexCsp.length !== 1) fail(`index.html CSP count ${indexCsp.length}, expected 1`);
if (demoCsp.length !== 1) fail(`demo CSP count ${demoCsp.length}, expected 1 (no stacking)`);
if (fourCsp.length !== 1) fail(`404.html CSP count ${fourCsp.length}, expected 1`);
if (oasisCsp.length !== 1) fail(`oasis.html CSP count ${oasisCsp.length}, expected 1`);
if (oasisPrettyCsp.length !== 1) fail(`/oasis CSP count ${oasisPrettyCsp.length}, expected 1`);
if (scribeCsp.length !== 1) fail(`scribe.html CSP count ${scribeCsp.length}, expected 1`);
if (scribePrettyCsp.length !== 1) fail(`/scribe CSP count ${scribePrettyCsp.length}, expected 1`);
if (/unsafe-inline/.test(homeCsp[0])) fail('home CSP should stay strict');
if (!/unsafe-inline/.test(demoCsp[0])) fail('demo CSP must allow inline script/style');
if (!/unsafe-inline/.test(oasisCsp[0])) fail('oasis CSP must allow inline script/style');
if (!/unsafe-inline/.test(scribeCsp[0])) fail('scribe CSP must allow inline script/style');
if (!/img-src 'none'/.test(oasisCsp[0] + scribeCsp[0])) fail('oasis/scribe CSP should block images');
const fourHtml = fs.readFileSync(path.join(OUT, '404.html'), 'utf8');
if (/<style[\s>]|style=|<script[\s>]/i.test(fourHtml)) {
  fail('404.html has inline style/script; keep using /styles.css so strict CSP still paints');
}
for (const [rel, device] of [
  ['oasis.html', 'oasis1'],
  ['scribe.html', 'scribe'],
]) {
  const html = fs.readFileSync(path.join(OUT, rel), 'utf8');
  if (html.includes('http-equiv="refresh"')) fail(`${rel} must not meta-refresh (Kindle treats it as a download)`);
  if (!html.includes('window.AINDLE_MOCK')) fail(`${rel} missing injected mock`);
  if (!html.includes('window.AINDLE_PRESET')) fail(`${rel} missing AINDLE_PRESET`);
  if (!html.includes(`"device":"${device}"`)) fail(`${rel} missing baked device ${device}`);
  if (/<link[^>]+(?:rel="(?:apple-touch-)?icon"|favicon|\.png|\.ico)/i.test(html)) {
    fail(`${rel} must not link icons; Kindle downloads PNG/ICO`);
  }
  if (/<img\b/i.test(html)) fail(`${rel} must not include img; Kindle downloads PNG`);
}

const robots = fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8');
if (!robots.includes(`${ORIGIN}/sitemap.xml`)) fail('robots.txt missing sitemap');

const sitemap = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
if (!sitemap.includes(`${ORIGIN}/`)) fail('sitemap missing canonical home');
if (!sitemap.includes(`${ORIGIN}/oasis`)) fail('sitemap missing /oasis');
if (!sitemap.includes(`${ORIGIN}/scribe`)) fail('sitemap missing /scribe');

const demo = fs.readFileSync(path.join(OUT, 'demo/oasis-monitor-simple.html'), 'utf8');
if (!demo.includes('brand/icon-32.png')) fail('demo HTML missing brand mark');
if (!demo.includes('href="favicon.ico"')) fail('demo HTML missing favicon');
if (!demo.includes('window.AINDLE_MOCK')) fail('demo HTML missing injected mock');

function siteFileExists(rel) {
  if (!rel) return true;
  return files.includes(rel) || files.includes(`${rel}.html`) || files.includes(`${rel}/index.html`);
}

const ATTR = /\b(?:href|src)=["']([^"']+)["']/gi;
const htmlFiles = files.filter((f) => f.endsWith('.html'));
for (const rel of htmlFiles) {
  const html = fs.readFileSync(path.join(OUT, rel), 'utf8');
  const dir = path.posix.dirname(rel);
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(html))) {
    const raw = m[1];
    if (raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('mailto:')) continue;
    if (raw.startsWith('https://github.com/Octo-o-o-o/aindle')) continue;
    if (raw.startsWith(ORIGIN + '/')) {
      const local = raw.slice(ORIGIN.length + 1).split('?')[0];
      if (local && local !== '' && !siteFileExists(local) && !siteFileExists(`${local}index.html`)) {
        fail(`${rel} points at missing ${raw}`);
      }
      continue;
    }
    if (/^https?:\/\//.test(raw) || raw.startsWith('//')) {
      fail(`${rel} unexpected external URL ${raw}`);
      continue;
    }
    const cleaned = raw.split('?')[0].split('#')[0];
    if (!cleaned) continue;
    const resolved = path.posix.normalize(
      cleaned.startsWith('/') ? cleaned.slice(1) : path.posix.join(dir === '.' ? '' : dir, cleaned),
    );
    if (resolved === '' || resolved === '.' || resolved === 'index.html') continue;
    if (!siteFileExists(resolved)) fail(`${rel} missing resource ${raw} -> ${resolved}`);
  }
}

if (index.includes('http://127.0.0.1:8787') && !index.includes('npm run hub')) {
  fail('index.html should not send visitors to a live private hub as the primary CTA');
}

if (failed) {
  console.error(`site:check: ${failed} issue(s)`);
  process.exit(1);
}
console.log(`site:check ok (${files.length} files)`);
