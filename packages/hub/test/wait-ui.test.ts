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
});
