#!/usr/bin/env node
// 官网静态构建：只用 Node 标准库。不要在这里调用 sharp / Chrome。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'site');

function rmDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function must(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`site:build missing ${rel}`);
  }
  return abs;
}

rmDir(OUT);
fs.mkdirSync(OUT, { recursive: true });

const siteFiles = [
  'index.html',
  '404.html',
  'styles.css',
  'site.js',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  'manifest.webmanifest',
  'llms.txt',
];
for (const name of siteFiles) {
  copyFile(must(path.join('site', name)), path.join(OUT, name));
}

copyFile(must('assets/brand/favicon.ico'), path.join(OUT, 'favicon.ico'));
for (const size of [32, 48, 180, 192, 512]) {
  copyFile(must(`assets/brand/icon-${size}.png`), path.join(OUT, 'brand', `icon-${size}.png`));
}
copyFile(must('assets/brand/og.png'), path.join(OUT, 'brand', 'og.png'));
copyFile(must('docs/screenshots/eink-local.png'), path.join(OUT, 'images', 'eink-local.png'));
copyFile(must('assets/website/hero-desk.jpg'), path.join(OUT, 'images', 'hero-desk.jpg'));

const demoFiles = [
  'index.html',
  'oasis-monitor.html',
  'oasis-monitor-simple.html',
  'favicon.ico',
];
for (const name of demoFiles) {
  copyFile(must(path.join('demo', name)), path.join(OUT, 'demo', name));
}
for (const size of [32, 48, 180]) {
  copyFile(must(`demo/brand/icon-${size}.png`), path.join(OUT, 'demo', 'brand', `icon-${size}.png`));
}

// Kindle 实验浏览器会把 meta refresh、query string、PNG/ICO 当成下载。
// 短地址必须是完整 HTML，预设写进页面，且不引用任何图片。
function renderKindlePage(simpleHtml, title, preset) {
  let html = simpleHtml;
  html = html.replace(/<link rel="(?:apple-touch-)?icon"[^>]*>\s*/g, '');
  html = html.replace(/<img src="brand\/icon-32\.png"[^>]*>/g, '');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  if (!html.includes('window.AINDLE_MOCK')) {
    throw new Error('site:build kindle page missing AINDLE_MOCK');
  }
  const inject =
    '<script type="text/javascript">\nwindow.AINDLE_PRESET = ' +
    JSON.stringify(preset) +
    ';\n</script>\n';
  html = html.replace(
    '<script type="text/javascript">\nwindow.AINDLE_MOCK',
    `${inject}<script type="text/javascript">\nwindow.AINDLE_MOCK`,
  );
  if (!html.includes('window.AINDLE_PRESET')) {
    throw new Error('site:build kindle page missing AINDLE_PRESET');
  }
  return html;
}

const simpleDemo = fs.readFileSync(must('demo/oasis-monitor-simple.html'), 'utf8');
fs.writeFileSync(
  path.join(OUT, 'oasis.html'),
  renderKindlePage(simpleDemo, 'Aindle · Kindle Oasis 模拟看板', { device: 'oasis1', kindle: '1', mode: 'panels' }),
);
fs.writeFileSync(
  path.join(OUT, 'scribe.html'),
  renderKindlePage(simpleDemo, 'Aindle · Kindle Scribe 模拟看板', { device: 'scribe', mode: 'full' }),
);

console.log('site:build wrote', path.relative(ROOT, OUT));
