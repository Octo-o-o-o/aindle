import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INGEST_SCHEMA,
  buildMockIngest,
  buildMockSnapshot,
  countAttention,
  folderLabel,
  formatAttention,
  formatDurationAgo,
  mergeReports,
  snapshotToViewModel,
  subscriptionLane,
  validateIngest,
  validateSnapshot,
  assertNoSecrets,
} from '../src/index.js';

describe('snapshot schema', () => {
  it('validates mock snapshot', () => {
    const snap = buildMockSnapshot();
    assert.equal(snap.schema, 'aindle.snapshot.v2');
    validateSnapshot(snap);
  });

  it('rejects forbidden secret keys', () => {
    assert.throws(() => assertNoSecrets({ token: 'nope' }));
    assert.throws(() => assertNoSecrets({ runs: [{ accessToken: 'x' }] }));
  });
});

describe('mergeReports', () => {
  it('marks stale hosts after threshold', () => {
    const old = buildMockIngest('mbp');
    old.reportedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const snap = mergeReports([old], { id: 'hub', label: 'Hub' }, new Date());
    assert.equal(snap.hosts[0]?.status, 'stale');
    assert.deepEqual(snap.freshness.staleHosts, ['mbp']);
  });

  it('dedupes subscriptions by id', () => {
    const a = buildMockIngest('mbp');
    const b = buildMockIngest('mini');
    b.host.id = 'mini';
    b.host.label = 'Mac mini';
    b.subscriptions[0]!.confidence = 'cached';
    b.subscriptions[0]!.windows = [{ key: '5h', pct: 10 }];
    const snap = mergeReports([a, b], { id: 'mini', label: 'Mac mini' });
    const claude = snap.subscriptions.find((s) => s.id === 'claude-home');
    assert.ok(claude);
    assert.equal(claude!.confidence, 'live');
  });
});

describe('ingest schema', () => {
  it('validates mock ingest', () => {
    validateIngest(buildMockIngest());
  });
});

describe('view lanes', () => {
  it('keeps official quotas on local and Sub2API on relay', () => {
    const snap = buildMockSnapshot();
    const claude = snap.subscriptions.find((s) => s.id === 'claude-home');
    const site = snap.subscriptions.find((s) => s.id === 'sub2api-site');
    const me = snap.subscriptions.find((s) => s.id === 'sub2api-me');
    assert.ok(claude);
    assert.ok(site);
    assert.ok(me);
    assert.deepEqual(subscriptionLane(claude!), { source: 'local', kind: 'quota' });
    assert.deepEqual(subscriptionLane(site!), { source: 'relay', scope: 'admin', kind: 'site' });
    assert.deepEqual(subscriptionLane(me!), { source: 'relay', scope: 'user', kind: 'member' });

    const vm = snapshotToViewModel(snap);
    assert.ok(vm.lanes.local >= 1);
    assert.ok(vm.lanes.relayAdmin >= 1);
    assert.ok(vm.lanes.relayUser >= 1);
    assert.ok(vm.lanes.relayPeople >= 1);
    assert.equal(vm.subs.find((s) => s.kind === 'site')?.tool, '全站');
    assert.equal(vm.subs.find((s) => s.kind === 'member' && s.scope === 'user')?.tool, '我的');
    assert.equal(vm.subs.find((s) => s.scope === 'people')?.tool, 'alice');
    assert.ok(vm.subs.every((s) => s.source === 'local' || s.source === 'relay'));
    const alice = vm.subs.find((s) => s.id === 'sub2api-user-a');
    assert.equal(alice?.breakdown?.days?.length, 2);
    assert.equal(alice?.breakdown?.todayCount, 0);
  });

  it('pretty-prints leftover LEVEL plan codes', () => {
    const snap = buildMockSnapshot();
    const first = snap.subscriptions[0]!;
    snap.subscriptions[0] = { ...first, tool: 'Kimi', plan: 'LEVEL_INTERMEDIATE' };
    const vm = snapshotToViewModel(snap);
    assert.equal(vm.subs.find((s) => s.id === first.id)?.tool, 'Kimi 进阶');
  });

  it('exposes a folder label for eink task rows', () => {
    assert.equal(folderLabel(undefined), 'No Folder');
    assert.equal(folderLabel(''), 'No Folder');
    assert.equal(folderLabel('Aindle'), 'Aindle');
    assert.equal(folderLabel('/Users/example/WorkSpace/OctoDesk'), 'OctoDesk');
    assert.equal(folderLabel('-Users-example-WorkSpace-Aindle'), 'Aindle');
    const vm = snapshotToViewModel(buildMockSnapshot());
    assert.equal(vm.now.find((r) => r.title === 'Aindle Stage 1')?.folder, 'Aindle');
    assert.equal(vm.now.find((r) => r.title === 'Windows agent 骨架')?.folder, 'No Folder');
    assert.equal(formatDurationAgo(45), '45秒前');
    assert.equal(formatDurationAgo(60), '1分前');
    assert.equal(formatDurationAgo(15 * 60 + 41), '15分41秒前');
    assert.equal(formatDurationAgo(10 * 3600 + 39 * 60), '10小时39分前');
    assert.match(vm.now.find((r) => r.title === 'Aindle Stage 1')?.elapsed ?? '', /^1[5-7]分(\d{1,2}秒)?前$/);
    assert.equal(vm.now.find((r) => r.title === 'Aindle Stage 1')?.tool, 'Claude');
    assert.match(
      vm.recent.find((r) => r.title === '生成实施 prompt')?.ended ?? '',
      /^(?:周[一二三四五六日] )?\d{2}:\d{2}$/,
    );
  });

  it('counts main tasks separately from spawned sub-agents', () => {
    const snap = buildMockSnapshot();
    snap.runs.push({
      id: 'r-sub-1',
      hostId: snap.hosts[0]!.id,
      tool: 'Codex',
      title: 'Task: fold spawned',
      project: 'Aindle',
      state: 'active',
      lastActivityAt: new Date().toISOString(),
      spawned: true,
      initiator: 'agent',
      initiatorConfidence: 'direct',
      stateConfidence: 'derived',
    });
    snap.runs.push({
      id: 'r-cli-orphan',
      hostId: snap.hosts[0]!.id,
      tool: 'Grok',
      title: 'headless only project',
      project: 'OtherRepo',
      state: 'active',
      lastActivityAt: new Date().toISOString(),
      spawned: true,
      initiator: 'agent',
      initiatorConfidence: 'direct',
      stateConfidence: 'derived',
    });
    const vm = snapshotToViewModel(snap);
    assert.equal(vm.nowMain, 2);
    assert.equal(vm.nowTotal, 4);
    assert.deepEqual(vm.attention, { waiting: 1, human: 1, background: 2 });
    assert.equal(vm.now.some((r) => r.title === 'Task: fold spawned'), false);
    assert.equal(vm.now.some((r) => r.title === 'headless only project'), false);
    assert.equal(vm.now.some((r) => r.title === '后台 · 2'), true);
    assert.equal(vm.now.some((r) => r.title === 'Aindle Stage 1'), true);
  });
});

describe('v2 ingest and attention', () => {
  it('rejects v1 ingest with an explicit schema error', () => {
    const v1 = { ...buildMockIngest(), schema: 'aindle.ingest.v1' };
    assert.throws(() => validateIngest(v1), /schema error: expected aindle\.ingest\.v2, got aindle\.ingest\.v1/);
  });

  it('does not default missing initiator fields to human or 0', () => {
    const raw = buildMockIngest();
    const broken = {
      ...raw,
      schema: INGEST_SCHEMA,
      runs: raw.runs.map(({ initiator: _i, initiatorConfidence: _c, stateConfidence: _s, waitReason: _w, ...rest }) => rest),
    };
    assert.throws(() => validateIngest(broken));
  });

  it('counts three buckets on the full run set before list slice and ignores stale hosts', () => {
    const now = new Date();
    const iso = now.toISOString();
    const snap = buildMockSnapshot();
    snap.hosts.push({
      id: 'mini',
      label: 'Mac mini',
      os: 'darwin',
      seenAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
      status: 'stale',
    });
    snap.freshness.staleHosts = ['mini'];
    snap.runs = [
      {
        id: 'human-wait',
        hostId: 'mbp',
        tool: 'Claude',
        title: 'Ask',
        project: 'Aindle',
        state: 'wait',
        lastActivityAt: iso,
        initiator: 'human',
        initiatorConfidence: 'direct',
        stateConfidence: 'direct',
        waitReason: 'needs_input',
      },
      {
        id: 'human-active',
        hostId: 'mbp',
        tool: 'Claude',
        title: 'Main',
        project: 'Aindle',
        state: 'active',
        lastActivityAt: iso,
        initiator: 'human',
        initiatorConfidence: 'direct',
        stateConfidence: 'derived',
      },
      ...[1, 2, 3].map((n) => ({
        id: `bg-${n}`,
        hostId: 'mbp',
        tool: 'Claude',
        title: `Side ${n}`,
        project: 'Aindle',
        state: 'active' as const,
        lastActivityAt: iso,
        initiator: 'agent' as const,
        initiatorConfidence: 'direct' as const,
        stateConfidence: 'derived' as const,
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `old-${i}`,
        hostId: 'mbp',
        tool: 'Claude',
        title: `Old ${i}`,
        project: 'Aindle',
        state: 'done' as const,
        lastActivityAt: new Date(now.getTime() - 20 * 60_000).toISOString(),
        initiator: 'human' as const,
        initiatorConfidence: 'derived' as const,
        stateConfidence: 'derived' as const,
      })),
      {
        id: 'stale-wait',
        hostId: 'mini',
        tool: 'Codex',
        title: 'Stale wait',
        state: 'wait',
        lastActivityAt: iso,
        initiator: 'human',
        initiatorConfidence: 'direct',
        stateConfidence: 'direct',
        waitReason: 'needs_input' as const,
      },
    ];
    const before = countAttention(snap.runs.filter((r) => r.hostId === 'mbp'));
    const vm = snapshotToViewModel(snap, now);
    assert.deepEqual(before, { waiting: 1, human: 1, background: 3 });
    assert.deepEqual(vm.attention, { waiting: 1, human: 1, background: 3 });
    assert.equal(formatAttention(vm.attention), '等你 1 · 人手 1 · 后台 3');
    assert.equal(vm.now.length <= 12, true);
    assert.equal(vm.now.some((r) => r.title.startsWith('Old ')), false);
    assert.equal(vm.now.some((r) => r.title === 'Side 1'), false);
    assert.equal(vm.now.some((r) => r.title === '后台 · 3'), true);
    const staleHost = vm.hosts.find((h) => h.id === 'mini');
    assert.equal(staleHost?.ok, 0);
    assert.deepEqual(staleHost?.attention, { waiting: 1, human: 0, background: 0 });
    assert.equal(formatAttention(staleHost!.attention, true), '上次 等你 1 · 人手 0 · 后台 0');
  });
});
