#!/usr/bin/env node
// 从 packages/hub/public/monitor.html 生成 demo HTML：
// 注入 mock JSON 作为 window.AINDLE_MOCK，页面即进入 DEMO 模式
// （不再请求 /view.json，顶栏显示 DEMO 徽标）。
// 用法：node scripts/build-demo.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONITOR = path.join(ROOT, 'packages', 'hub', 'public', 'monitor.html');
const MARKER = '<!--DEMO-MOCK-->';

const TARGETS = [
  {
    mock: path.join(ROOT, 'demo', 'mock-view.json'),
    out: path.join(ROOT, 'demo', 'oasis-monitor.html'),
    title: 'Aindle · Oasis Monitor Demo',
    mockHint: 'demo/mock-view.json',
  },
  {
    mock: path.join(ROOT, 'demo', 'mock-view-simple.json'),
    out: path.join(ROOT, 'demo', 'oasis-monitor-simple.html'),
    title: 'Aindle · Simple Demo',
    mockHint: 'demo/mock-view-simple.json',
  },
];

const monitor = fs.readFileSync(MONITOR, 'utf8');
if (!monitor.includes(MARKER)) {
  console.error(`build-demo: ${MARKER} marker not found in monitor.html`);
  process.exit(1);
}

function render(target) {
  const mockRaw = fs.readFileSync(target.mock, 'utf8');
  JSON.parse(mockRaw);
  const banner =
    '<!-- 本文件由 scripts/build-demo.mjs 生成，请勿手改。\n' +
    '     改样式请编辑 packages/hub/public/monitor.html，改数据请编辑 ' +
    target.mockHint +
    '，\n     然后运行 node scripts/build-demo.mjs 重新生成。 -->\n';
  const inject =
    '<script type="text/javascript">\nwindow.AINDLE_MOCK = ' + mockRaw.trim() + ';\n</script>';
  return (
    banner +
    monitor
      .replace(MARKER, inject)
      .replace('<title>Aindle · Live Monitor</title>', `<title>${target.title}</title>`)
  );
}

const check = process.argv.includes('--check');
let failed = false;
for (const target of TARGETS) {
  const out = render(target);
  if (check) {
    const cur = fs.existsSync(target.out) ? fs.readFileSync(target.out, 'utf8') : '';
    if (cur !== out) {
      console.error(`build-demo: ${path.relative(ROOT, target.out)} 不是最新，请运行 node scripts/build-demo.mjs`);
      failed = true;
    } else {
      console.log(`build-demo: ${path.relative(ROOT, target.out)} up to date`);
    }
  } else {
    fs.writeFileSync(target.out, out);
    console.log(`build-demo: wrote ${path.relative(ROOT, target.out)}`);
  }
}
if (failed) process.exit(1);
