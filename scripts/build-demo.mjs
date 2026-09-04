#!/usr/bin/env node
// 从 packages/hub/public/monitor.html 生成 demo/oasis-monitor.html：
// 注入 demo/mock-view.json 作为 window.AINDLE_MOCK，页面即进入 DEMO 模式
// （不再请求 /view.json，顶栏显示 DEMO 徽标）。
// 用法：node scripts/build-demo.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONITOR = path.join(ROOT, 'packages', 'hub', 'public', 'monitor.html');
const MOCK = path.join(ROOT, 'demo', 'mock-view.json');
const OUT = path.join(ROOT, 'demo', 'oasis-monitor.html');
const MARKER = '<!--DEMO-MOCK-->';

const monitor = fs.readFileSync(MONITOR, 'utf8');
if (!monitor.includes(MARKER)) {
  console.error(`build-demo: ${MARKER} marker not found in monitor.html`);
  process.exit(1);
}

const mockRaw = fs.readFileSync(MOCK, 'utf8');
JSON.parse(mockRaw); // 提前暴露 JSON 语法错误

const banner =
  '<!-- 本文件由 scripts/build-demo.mjs 生成，请勿手改。\n' +
  '     改样式请编辑 packages/hub/public/monitor.html，改数据请编辑 demo/mock-view.json，\n' +
  '     然后运行 node scripts/build-demo.mjs 重新生成。 -->\n';

const inject =
  '<script type="text/javascript">\nwindow.AINDLE_MOCK = ' + mockRaw.trim() + ';\n</script>';

const out = banner +
  monitor
    .replace(MARKER, inject)
    .replace('<title>Aindle · Live Monitor</title>', '<title>Aindle · Oasis Monitor Demo</title>');

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error('build-demo: demo/oasis-monitor.html 不是最新，请运行 node scripts/build-demo.mjs');
    process.exit(1);
  }
  console.log('build-demo: demo up to date');
} else {
  fs.writeFileSync(OUT, out);
  console.log('build-demo: wrote demo/oasis-monitor.html');
}
