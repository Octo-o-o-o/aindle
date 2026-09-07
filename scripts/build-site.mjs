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
copyFile(must('assets/website/hero-oasis.jpg'), path.join(OUT, 'images', 'hero-oasis.jpg'));
copyFile(must('assets/website/hero-scribe.jpg'), path.join(OUT, 'images', 'hero-scribe.jpg'));
copyFile(must('docs/screenshots/eink-local.png'), path.join(OUT, 'images', 'eink-local.png'));

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

console.log('site:build wrote', path.relative(ROOT, OUT));
