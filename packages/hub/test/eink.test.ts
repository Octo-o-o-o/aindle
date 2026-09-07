import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMockSnapshot, formatAttention, snapshotToViewModel } from '@aindle/core';
import { AINDLE_MARK_DATA_URI } from '../src/brand-mark.js';
import { einkMeta, fitEinkTaskLists, parseEinkBattery, parseEinkPage, pickWindows, prettyTool, quotaSourceName, renderEinkHtml } from '../src/eink.js';
import { findChrome, htmlToPng, pngSize } from '../src/png.js';

describe('eink pages', () => {
  it('keeps the lock-screen masthead text-only', () => {
    assert.match(AINDLE_MARK_DATA_URI, /^data:image\/png;base64,/);
    const vm = snapshotToViewModel(buildMockSnapshot());
    const html = renderEinkHtml(vm, 'local');
    assert.equal(html.includes(AINDLE_MARK_DATA_URI), false);
    assert.doesNotMatch(html, /class="mark"/);
    assert.doesNotMatch(html, /src="\.?\/?brand\//);
  });

  it('parses page aliases', () => {
    assert.equal(parseEinkPage('local'), 'local');
    assert.equal(parseEinkPage('now'), 'now');
    assert.equal(parseEinkPage('tasks'), 'now');
    assert.equal(parseEinkPage('1'), 'now');
    assert.equal(parseEinkPage('relay'), 'relay');
    assert.equal(parseEinkPage('2'), 'relay');
    assert.equal(parseEinkPage(''), 'local');
  });

  it('pretty-prints leftover Kimi plan codes', () => {
    assert.equal(prettyTool('Kimi LEVEL_INTERMEDIATE'), 'Kimi 进阶');
    assert.equal(quotaSourceName('Claude Max'), 'Claude');
    assert.equal(quotaSourceName('Codex Pro'), 'Codex');
    assert.equal(quotaSourceName('Cursor Ultra'), 'Cursor');
    assert.equal(quotaSourceName('Kimi 进阶'), 'Kimi');
    assert.equal(quotaSourceName('Grok Build'), 'Grok');
    assert.equal(quotaSourceName('Grok Builder'), 'Grok');
    assert.equal(quotaSourceName('ZCode Lite'), 'ZCode');
    assert.equal(quotaSourceName('ZCode Pro'), 'ZCode');
    assert.equal(quotaSourceName('DeepSeek API'), 'DeepSeek');
    assert.equal(quotaSourceName('Kimi 订阅'), 'Kimi');
  });

  it('parses lock-screen battery from the pull query', () => {
    assert.equal(parseEinkBattery('87'), 87);
    assert.equal(parseEinkBattery('0'), 0);
    assert.equal(parseEinkBattery('101'), undefined);
    assert.equal(parseEinkBattery(''), undefined);
    const vm = snapshotToViewModel(buildMockSnapshot());
    const html = renderEinkHtml(vm, 'local', { battery: 87 });
    assert.match(html, /87%/);
    assert.match(html, /class="side"/);
    assert.match(html, /font-size:48px/);
    assert.doesNotMatch(html, /font-size:88px/);
    assert.doesNotMatch(html, /class="time"/);
  });

  it('renders three oasis1 wallpapers from the view model', () => {
    const vm = snapshotToViewModel(buildMockSnapshot());
    const local = renderEinkHtml(vm, 'local');
    const now = renderEinkHtml(vm, 'now');
    const relay = renderEinkHtml(vm, 'relay');
    const lock = renderEinkHtml(vm, 'local', { lockScreen: true, battery: 95 });
    assert.match(local, /1072px/);
    assert.match(local, /1448px/);
    assert.match(local, /1\/3/);
    assert.match(local, /翻页键看任务/);
    assert.match(local, /数据 /);
    assert.doesNotMatch(local, /出图/);
    assert.match(local, /本机/);
    assert.match(local, /Claude/);
    assert.doesNotMatch(local, /Claude Max/);
    assert.doesNotMatch(local, /Codex Pro/);
    assert.doesNotMatch(local, /限额/);
    assert.match(local, /flex-direction:row/);
    const attentionLabel = formatAttention(vm.attention ?? { waiting: 0, human: 0, background: 0 });
    assert.match(local, new RegExp(attentionLabel));
    assert.match(now, new RegExp(attentionLabel));
    assert.match(now, />WAIT</);
    assert.match(local, />WAIT</);
    assert.match(local, /已完成/);
    assert.match(local, /class="telapsed"/);
    assert.match(local, /1[5-7]分(\d{1,2}秒)?前/);
    assert.doesNotMatch(local, /0:\d{2}:\d{2}/);
    assert.doesNotMatch(local, /class="tdot"/);
    assert.match(local, /\.tsource \{ width:8em;/);
    assert.doesNotMatch(local, /\bago\b/);
    assert.match(local, /data-brand="claude"/);
    assert.match(local, /data-brand="codex"/);
    assert.match(now, /2\/3/);
    assert.match(now, /Aindle Stage 1/);
    assert.match(now, /—/);
    assert.match(local, /Aindle Stage 1/);
    assert.match(local, /class="when"/);
    assert.match(local, /align-items:flex-start/);
    assert.doesNotMatch(local, /class="mark"/);
    assert.doesNotMatch(local, /data:image\/png;base64,/);
    assert.doesNotMatch(local, /src="brand\//);
    assert.doesNotMatch(now, /src="brand\//);
    assert.doesNotMatch(local, /过热/);
    // 默认 mock 只有 2 份本地限额 → 宽松大卡模式
    assert.match(local, /class="qbig"/);
    assert.match(local, /重置 /);
    assert.doesNotMatch(local, /class="qrow"/);
    assert.match(relay, /3\/3/);
    assert.match(relay, /全站|上游/);
    assert.doesNotMatch(lock, /翻页/);
    assert.doesNotMatch(lock, /1\/3/);
    assert.match(lock, /数据 /);
    assert.match(lock, /Mac mini/);
    const meta = einkMeta(vm, 'local');
    assert.equal(meta.width, 1072);
    assert.equal(meta.height, 1448);
    assert.equal(meta.pages.length, 3);
    assert.ok(meta.intervalSec >= 300);
  });

  it('keeps account notes and drops overheat plus duplicate resets', () => {
    const vm = snapshotToViewModel(buildMockSnapshot());
    const claude = vm.subs.find((s) => String(s.tool).includes('Claude'));
    assert.ok(claude);
    claude.label = 'Claude · 一笑 · 过热';
    if (Array.isArray(claude.windows) && claude.windows.length >= 2) {
      claude.windows[0]!.reset = '周一 21:59';
      claude.windows[1]!.reset = '周一 21:59';
    }
    vm.subs.push({
      id: 'kimi-code',
      tool: 'Kimi 进阶',
      label: 'Kimi Code',
      source: 'local',
      scope: '',
      kind: 'quota',
      windows: [
        { key: '7d', pct: 98, reset: '23:34' },
        { key: '5h', pct: 0, reset: '16:34' },
      ],
    });
    vm.subs.push({
      id: 'zcode-main',
      tool: 'ZCode Lite',
      label: 'ZCode · GLM Coding',
      source: 'local',
      scope: '',
      kind: 'quota',
      windows: [{ key: '5h', pct: 10, reset: '04:00' }],
    });
    const html = renderEinkHtml(vm, 'local', { battery: 81 });
    assert.match(html, />ZCode</);
    assert.doesNotMatch(html, /ZCode Lite/);
    assert.doesNotMatch(html, /一笑/);
    assert.doesNotMatch(html, /个人/);
    assert.doesNotMatch(html, /过热/);
    assert.doesNotMatch(html, /Kimi Code/);
    assert.match(html, />Kimi</);
    assert.doesNotMatch(html, /Kimi 进阶/);
    assert.match(html, />5h</);
    assert.match(html, />7d</);
    // 4 份本地限额 → 回到紧凑行模式
    assert.match(html, /class="qrow"/);
    assert.doesNotMatch(html, /class="qbig"/);
    assert.doesNotMatch(html, /周一 21:59/);
    assert.match(html, /AINDLE · 本机/);
  });

  it('pairs burst and week windows instead of dropping the low one', () => {
    const pair = pickWindows([
      { key: '7d', pct: 98, reset: '23:34' },
      { key: '5h', pct: 0, reset: '16:34' },
    ]);
    assert.deepEqual(
      pair.map((w) => w.key),
      ['5h', '7d'],
    );
    const claude = pickWindows([
      { key: '5h', pct: 3, reset: '20:39' },
      { key: '7d', pct: 64, reset: '周一 21:59' },
      { key: 'Fable', pct: 100, reset: '周一 21:59' },
    ]);
    assert.deepEqual(
      claude.map((w) => w.key),
      ['Fable', '7d'],
    );
    const cursor = pickWindows([
      { key: '账期', pct: 31, reset: '周六 10:49' },
      { key: 'Auto', pct: 19, reset: '周六 10:49' },
      { key: 'API', pct: 100, reset: '周六 10:49' },
    ]);
    assert.deepEqual(
      cursor.map((w) => w.key),
      ['API', 'Auto'],
    );
    const vm = snapshotToViewModel(buildMockSnapshot());
    vm.subs.push({
      id: 'cursor-ultra',
      tool: 'Cursor Ultra',
      label: 'Cursor Ultra',
      source: 'local',
      scope: '',
      kind: 'quota',
      windows: [
        { key: '账期', pct: 31, reset: '周六 10:49' },
        { key: 'Auto', pct: 19, reset: '周六 10:49' },
        { key: 'API', pct: 100, reset: '周六 10:49' },
      ],
    });
    const html = renderEinkHtml(vm, 'local');
    assert.match(html, /三方/);
    assert.match(html, /自有/);
    assert.doesNotMatch(html, /自由/);
    assert.doesNotMatch(html, /账期/);
  });

  it('shows three-bucket counts and folds background rows', () => {
    const snap = buildMockSnapshot();
    snap.runs.push({
      id: 'r-cli-1',
      hostId: snap.hosts[0]!.id,
      tool: 'Grok',
      title: 'headless repair',
      project: 'Aindle',
      state: 'active',
      lastActivityAt: new Date().toISOString(),
      spawned: true,
      initiator: 'agent',
      initiatorConfidence: 'direct',
      stateConfidence: 'derived',
    });
    const vm = snapshotToViewModel(snap);
    const html = renderEinkHtml(vm, 'local');
    assert.match(html, new RegExp(formatAttention(vm.attention ?? { waiting: 0, human: 0, background: 0 })));
    assert.match(html, /Aindle Stage 1/);
    assert.match(html, /后台 · 1/);
    assert.doesNotMatch(html, /headless repair/);
  });

  it('drops completed rows and shortens live list when the canvas is too short', () => {
    const oasis = fitEinkTaskLists(
      Array.from({ length: 12 }, (_, i) => ({ id: `l${i}` })),
      Array.from({ length: 3 }, (_, i) => ({ id: `d${i}` })),
      6,
      { w: 1072, h: 1448 },
    );
    assert.equal(oasis.done.length, 0);
    assert.ok(oasis.live.length >= 1);
    assert.ok(oasis.live.length <= 11);

    const short = fitEinkTaskLists(
      Array.from({ length: 12 }, (_, i) => ({ id: `l${i}` })),
      Array.from({ length: 3 }, (_, i) => ({ id: `d${i}` })),
      6,
      { w: 1072, h: 900 },
    );
    assert.equal(short.done.length, 0);
    assert.ok(short.live.length < oasis.live.length);

    const vm = snapshotToViewModel(buildMockSnapshot());
    for (let i = 0; i < 10; i += 1) {
      vm.now.push({
        ...vm.now[0]!,
        title: `extra task ${i}`,
        folder: 'Aindle',
      });
    }
    const html = renderEinkHtml(vm, 'local', { height: 900 });
    assert.match(html, new RegExp(formatAttention(vm.attention ?? { waiting: 0, human: 0, background: 0 })));
    assert.doesNotMatch(html, /已完成/);
    assert.match(html, /class="foot"/);
  });

  it('hides unread local quotas and does not mark subscriptions', () => {
    const vm = snapshotToViewModel(buildMockSnapshot());
    vm.subs.unshift({
      id: 'claude-default',
      tool: 'Claude Max',
      label: 'Claude · 一笑',
      source: 'local',
      scope: '',
      kind: 'quota',
      none: 1,
      error: 1,
    });
    const html = renderEinkHtml(vm, 'local');
    assert.doesNotMatch(html, /暂时读不到/);
    assert.doesNotMatch(html, /还没有读数/);
    assert.doesNotMatch(html, />订</);
    assert.doesNotMatch(html, />量</);
  });

  it('shows 24h/7d usage on expanded quota cards without a subscription mark', () => {
    const vm = snapshotToViewModel(buildMockSnapshot());
    const claude = vm.subs.find((s) => String(s.tool).includes('Claude'));
    assert.ok(claude);
    claude.billing = 'subscription';
    claude.usage = { h24Tokens: '1.2M', h24Cost: '$3.20', d7Tokens: '8.4M', d7Cost: '$21' };
    const html = renderEinkHtml(vm, 'local');
    assert.match(html, /class="qbig"/);
    assert.match(html, /24h 1\.2M tok ≈\$3\.20 · 7d 8\.4M tok ≈\$21/);
    assert.doesNotMatch(html, />订</);
  });

  it('labels metered spend as tokens/money instead of a percent bar', () => {
    const vm = snapshotToViewModel(buildMockSnapshot());
    vm.subs.push({
      id: 'deepseek-api',
      tool: 'DeepSeek API',
      label: '余额 ¥12.00',
      source: 'local',
      scope: '',
      kind: 'spend',
      billing: 'metered',
      windows: [{ key: '预算', pct: 3, reset: '—' }],
    });
    vm.subs.push({
      id: 'paid-tokens',
      tool: 'Paid',
      label: 'Paid',
      source: 'local',
      scope: '',
      kind: 'spend',
      billing: 'metered',
      usage: { h24Tokens: '1.2M', h24Cost: '$3.20', d7Tokens: '8.4M', d7Cost: '$21' },
    });
    const html = renderEinkHtml(vm, 'local');
    assert.match(html, /DeepSeek/);
    assert.doesNotMatch(html, /DeepSeek API/);
    assert.match(html, /按量/);
    assert.match(html, /余额 ¥12\.00/);
    assert.match(html, /24h 1\.2M tok ≈\$3\.20 · 7d 8\.4M tok ≈\$21/);
    assert.doesNotMatch(html, />预算</);
    assert.doesNotMatch(html, /3%/);
    assert.doesNotMatch(html, />订</);
    assert.doesNotMatch(html, />量</);
  });
});

describe('dash png', () => {
  it('chrome captures exactly 1072x1448', async (t) => {
    if (!findChrome()) {
      t.skip('Google Chrome is not installed');
      return;
    }
    const vm = snapshotToViewModel(buildMockSnapshot());
    const buf = await htmlToPng(renderEinkHtml(vm, 'local'));
    const size = pngSize(buf);
    assert.equal(size.w, 1072);
    assert.equal(size.h, 1448);
    assert.doesNotMatch(renderEinkHtml(vm, 'local'), /data:image\/png;base64,/);
  });
});
