import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMockIngest, snapshotToViewModel, validateIngest } from '@aindle/core';
import { createHubServer } from '../src/server.js';
import { renderEinkHtml } from '../src/eink.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONITOR = path.join(__dirname, '..', 'public', 'monitor.html');
const SENTINEL = 'A6-SECRET-/Users/sentinel/wait-input.md';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') reject(new Error('no port'));
      else resolve(addr.port);
    });
    server.once('error', reject);
  });
}

describe('A6 UI and v1 ingest', () => {
  it('desktop monitor source shows WAIT, three buckets, and the wait matrix', () => {
    const html = fs.readFileSync(MONITOR, 'utf8');
    assert.match(html, /WAIT: "WAIT"/);
    assert.match(html, /进行中 /);
    assert.match(html, /待确认 /);
    assert.match(html, /后台任务 /);
    assert.match(html, /wait 第一刀仅 Claude AskUserQuestion \+ Codex request_user_input/);
    assert.match(html, /function LP\(/);
    assert.match(html, /LP\(180\)/);
    // 窗口条用纯百分比列（任何宽度/缩放下条都不会被固定列挤没）
    assert.match(html, /width="52%"/);
    assert.doesNotMatch(html, /width="' \+ px\(64\)/);
    assert.doesNotMatch(html, /LP\(64\)/);
    assert.match(html, /href="favicon\.ico"/);
    assert.match(html, /src="brand\/icon-32\.png"/);
    assert.match(html, /href="brand\/icon-180\.png"/);
    assert.match(html, /window\.AINDLE_PRESET/);
    assert.match(html, /function preset\(/);
    assert.match(html, /isKindleUi\(\)\s*\n\s*\? ""/);
    assert.match(html, /if \(isKindleUi\(\)\) return;/);
    assert.match(html, /function isScribe\(/);
    assert.match(html, /function isWideBoard\(/);
    assert.match(html, /Kindle Build/);
    assert.match(html, /function einkUa\(/);
    assert.match(html, /function cssLong\(/);
    assert.match(html, /function rawScreenLong\(/);
    assert.match(html, /function isScribeCssCanvas\(/);
    assert.match(html, /if \(isWideBoard\(\)\) return false;/);
    assert.match(html, /function wantSplitBoard\(/);
    assert.match(html, /return isWideBoard\(\);/);
    assert.match(html, /function boardColumns\(/);
    assert.match(html, /section\("进行中"/);
    assert.match(html, /section\("已完成"/);
    assert.match(html, /width="50%" valign="top"/);
    assert.match(html, /function editionScribe\(/);
    assert.match(html, /function quotaLedger\(/);
    assert.match(html, /function runLedger\(/);
    assert.match(html, /Scribe · 1860×2480/);
    assert.match(html, /if \(isScribe\(\) && s > 1\.5\)/);
    assert.match(html, /function fitScribeCanvas\(/);
    assert.match(html, /MOCK · 非本机实时数据/);
    // Scribe 大屏版式：衬线报头、品牌图标、三档灰、细线账本、detail 不上屏
    assert.match(html, /function scribeMasthead\(/);
    assert.match(html, /function scribeQuotaRow\(/);
    assert.match(html, /function scribeRunRows\(/);
    assert.match(html, /function brandIcon\(/);
    assert.match(html, /function hairSoft\(/);
    assert.match(html, /Iowan Old Style/);
    assert.match(html, /#CFC8BA/);
    assert.match(html, /另有 ' \+\s*more \+ " 项/);
    // 小屏账本：单页滚动、锁屏语言的软斜纹胶囊条、车道选窗、钉底页脚
    assert.match(html, /function renderPocket\(/);
    assert.match(html, /function pocketBar\(/);
    assert.match(html, /function pocketQuotaRowWide\(/);
    assert.match(html, /function pocketQuotaRowNarrow\(/);
    assert.match(html, /function pickWindows\(/);
    assert.match(html, /repeating-linear-gradient/);
    assert.match(html, /function pocketEmpty\(/);
    assert.match(html, /function pinPocketFooter\(/);
    assert.match(html, /Kindle 档（含真机 Oasis 浏览器）优先小屏账本/);
    assert.doesNotMatch(html, /function showPanel\(/);
    assert.doesNotMatch(html, /function renderPager\(/);
    assert.doesNotMatch(html, /btn-prev/);
  });

  it('clone CLI entrypoints exist so npx aindle works without a prior bundle', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      bin?: { aindle?: string };
      scripts?: Record<string, string>;
    };
    assert.equal(pkg.bin?.aindle, 'scripts/aindle.mjs');
    assert.match(String(pkg.scripts?.hub), /ensure-built/);
    assert.match(String(pkg.scripts?.build), /build-cli\.mjs/);
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'aindle.mjs')), true);
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'ensure-built.mjs')), true);
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'link-local-bin.mjs')), true);
    assert.match(String(pkg.scripts?.postinstall), /link-local-bin/);
    const linker = fs.readFileSync(path.join(root, 'scripts', 'link-local-bin.mjs'), 'utf8');
    assert.match(linker, /aindle\.cmd/);
    assert.match(linker, /aindle\.ps1/);
    assert.match(linker, /copyFileSync/);
    assert.match(linker, /never fail postinstall/);
    const launcher = fs.readFileSync(path.join(root, 'scripts', 'aindle.mjs'), 'utf8');
    assert.match(launcher, /src\/cli\.ts/);
    assert.match(launcher, /existsSync\(src\) && fs\.existsSync\(tsx\)/);
    const buildCli = fs.readFileSync(path.join(root, 'scripts', 'build-cli.mjs'), 'utf8');
    assert.match(buildCli, /createRequire/);
    assert.match(buildCli, /dist', 'cli\.js'/);
  });

  it('hub serves the brand favicon and masthead PNG', async () => {
    const { server } = createHubServer({ seedMock: false });
    const port = await listen(server);
    try {
      const ico = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
      const mark = await fetch(`http://127.0.0.1:${port}/brand/icon-32.png`);
      assert.equal(ico.status, 200);
      assert.match(String(ico.headers.get('content-type')), /image\//);
      assert.equal(mark.status, 200);
      assert.equal(mark.headers.get('content-type'), 'image/png');
      const png = Buffer.from(await mark.arrayBuffer());
      assert.equal(png.toString('ascii', 1, 4), 'PNG');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('eink HTML and PNG input model show WAIT and three buckets without sentinels', () => {
    const snap = {
      ...buildMockIngest(),
    };
    snap.runs[1] = {
      ...snap.runs[1]!,
      detail: '等待提问',
      title: 'Windows agent 骨架',
    };
    const report = validateIngest(snap);
    const vm = snapshotToViewModel({
      schema: 'aindle.snapshot.v2',
      generatedAt: new Date().toISOString(),
      hub: { id: 'mini', label: 'Mac mini' },
      freshness: { oldestHostMs: 0, staleHosts: [] },
      hosts: [{ id: 'mbp', label: 'MacBook Pro', os: 'darwin', seenAt: report.reportedAt, status: 'ok' }],
      subscriptions: report.subscriptions,
      runs: report.runs,
      monitorPeriod: '1h',
    });
    const local = renderEinkHtml(vm, 'local');
    const now = renderEinkHtml(vm, 'now');
    const relay = renderEinkHtml(vm, 'relay');
    assert.match(local, />WAIT</);
    assert.match(now, />WAIT</);
    assert.match(local, /进行中 1 · 待确认 1/);
    assert.match(now, /进行中 1 · 待确认 1/);
    assert.doesNotMatch(local, /后台任务/);
    assert.doesNotMatch(now, /后台任务/);
    assert.match(local, /1\/3/);
    assert.match(now, /2\/3/);
    assert.match(relay, /3\/3/);
    assert.match(local, /1072px/);
    assert.match(local, /1448px/);
    assert.equal(local.includes(SENTINEL), false);
    assert.equal(now.includes(SENTINEL), false);
    assert.equal(JSON.stringify(vm).includes(SENTINEL), false);
  });

  it('hub returns a schema error for v1 ingest instead of defaulting zeros', async () => {
    const { server } = createHubServer({ seedMock: false });
    const port = await listen(server);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: 'aindle.ingest.v1',
          host: { id: 't', label: 't', os: 'darwin' },
          reportedAt: new Date().toISOString(),
          subscriptions: [],
          runs: [],
        }),
      });
      const body = (await res.json()) as { error?: string };
      assert.equal(res.status, 400);
      assert.match(String(body.error), /schema error: expected aindle\.ingest\.v2/);
      const view = await fetch(`http://127.0.0.1:${port}/view.json`);
      const vm = (await view.json()) as { hosts?: unknown[] };
      assert.equal((vm.hosts ?? []).length, 0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('onboarding defaults use port 8787 and do not ship an enabled mbp registry', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const rels = [
      'kindle/oasis1/hub.env.example',
      'kindle/oasis1/loop.sh',
      'kindle/oasis1/operate.sh',
      'kindle/oasis1/operate.html',
      'scripts/macos/com.aindle.hub.plist',
      'scripts/macos/com.aindle.agent.plist',
    ];
    for (const rel of rels) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.doesNotMatch(text, /:8790/, rel);
      assert.match(text, /8787/, rel);
    }
    const loop = fs.readFileSync(path.join(root, 'kindle/oasis1/loop.sh'), 'utf8');
    const common = fs.readFileSync(path.join(root, 'kindle/oasis1/common.sh'), 'utf8');
    assert.match(loop, /UNLOCK_RESTORE_RADIO/);
    assert.match(loop, /remember_radio/);
    assert.match(loop, /restore_radio/);
    assert.match(common, /radio_prev_write/);
    const example = fs.readFileSync(path.join(root, 'config', 'registry.example.yaml'), 'utf8');
    assert.match(example, /^host:\n  id: local\n  label: This computer$/m);
    assert.doesNotMatch(example, /^[ \t]*- id:/m);
    assert.match(example, /host "mbp"/);
    const hubCli = fs.readFileSync(path.join(root, 'packages/hub/src/cli.ts'), 'utf8');
    assert.match(hubCli, /Aindle Hub/);
    assert.doesNotMatch(hubCli, /Mac mini/);
    assert.match(hubCli, /AINDLE_HUB_ID \?\? 'hub'/);
  });
});
