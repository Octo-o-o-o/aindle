import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INGEST_SCHEMA,
  Subscription,
  assertNoSecrets,
  buildMockSnapshot,
  formatTokens,
  formatUsageCost,
  mergeReports,
  snapshotToViewModel,
  validateSnapshot,
  type IngestReport,
  type SourceUsage,
  type Subscription as SubscriptionT,
} from '../src/index.js';

describe('billing/usage schema', () => {
  it('accepts a subscription with billing and usage', () => {
    const sub = Subscription.parse({
      id: 'claude-home',
      tool: 'Claude',
      label: 'Claude · Home',
      source: 'local',
      kind: 'quota',
      billing: 'subscription',
      usage: {
        h24: { tokens: 12000, cost: 3.5 },
        d7: { tokens: 2500000 },
        lastUsedAt: '2026-09-05T08:00:00+08:00',
      },
      windows: [{ key: '5h', pct: 10 }],
      confidence: 'live',
    });
    assert.equal(sub.billing, 'subscription');
    assert.equal(sub.usage?.d7?.tokens, 2500000);
    assert.equal(sub.usage?.h24?.cost, 3.5);
  });

  it('rejects a bad billing mode or negative usage', () => {
    const base = {
      id: 'x',
      tool: 'T',
      label: 'L',
      windows: [],
      confidence: 'none' as const,
    };
    assert.throws(() => Subscription.parse({ ...base, billing: 'free' }));
    assert.throws(() => Subscription.parse({ ...base, usage: { h24: { tokens: -1 } } }));
  });

  it('does not treat the tokens field as a secret', () => {
    assertNoSecrets({ usage: { h24: { tokens: 42 }, d7: { tokens: 7, cost: 1 } } });
    const snap = buildMockSnapshot();
    snap.subscriptions[0]!.billing = 'subscription';
    snap.subscriptions[0]!.usage = { h24: { tokens: 42 }, d7: { tokens: 1000, cost: 0.5 } };
    validateSnapshot(snap);
  });
});

describe('formatTokens / formatUsageCost', () => {
  it('formats token counts', () => {
    assert.equal(formatTokens(0), '0');
    assert.equal(formatTokens(999), '999');
    assert.equal(formatTokens(12345), '12.3K');
    assert.equal(formatTokens(1000), '1K');
    assert.equal(formatTokens(1_234_567), '1.2M');
    assert.equal(formatTokens(1_000_000), '1M');
  });

  it('formats usage cost', () => {
    assert.equal(formatUsageCost(undefined), '—');
    assert.equal(formatUsageCost(1280), '$1280');
    assert.equal(formatUsageCost(18.3), '$18.3');
    assert.equal(formatUsageCost(0.42), '$0.42');
  });
});

function usageReport(
  hostId: string,
  usage: SourceUsage,
  billing?: 'subscription' | 'metered',
): IngestReport {
  const sub: SubscriptionT = {
    id: 'claude-home',
    tool: 'Claude',
    label: 'Claude · Home',
    source: 'local',
    kind: 'quota',
    confidence: 'live',
    windows: [{ key: '5h', pct: 10 }],
    usage,
    ...(billing ? { billing } : {}),
  };
  return {
    schema: INGEST_SCHEMA,
    host: { id: hostId, label: hostId, os: 'darwin' },
    reportedAt: new Date().toISOString(),
    subscriptions: [sub],
    runs: [],
  };
}

describe('mergeSubscriptions usage', () => {
  it('sums usage across hosts and keeps the latest lastUsedAt', () => {
    const older = '2026-09-03T10:00:00+08:00';
    const newer = '2026-09-04T10:00:00+08:00';
    const a = usageReport('mbp', {
      h24: { tokens: 1000, cost: 1.5 },
      d7: { tokens: 5000, cost: 10 },
      lastUsedAt: older,
    }, 'subscription');
    const b = usageReport('mini', {
      h24: { tokens: 500 },
      d7: { tokens: 2500, cost: 5 },
      lastUsedAt: newer,
    });
    const snap = mergeReports([a, b], { id: 'hub', label: 'Hub' });
    const sub = snap.subscriptions.find((s) => s.id === 'claude-home');
    assert.ok(sub);
    assert.deepEqual(sub!.usage, {
      h24: { tokens: 1500, cost: 1.5 },
      d7: { tokens: 7500, cost: 15 },
      lastUsedAt: newer,
    });
    assert.equal(sub!.billing, 'subscription');
    assert.deepEqual(sub!.hostIds?.sort(), ['mbp', 'mini']);
  });

  it('fills billing from any report when the picked body lacks it', () => {
    const a = usageReport('mbp', { d7: { tokens: 10 } });
    const b = usageReport('mini', { d7: { tokens: 20 } }, 'metered');
    const snap = mergeReports([a, b], { id: 'hub', label: 'Hub' });
    const sub = snap.subscriptions.find((s) => s.id === 'claude-home');
    assert.equal(sub!.billing, 'metered');
    assert.equal(sub!.usage?.d7?.tokens, 30);
  });
});

describe('snapshotToViewModel usage', () => {
  const now = new Date('2026-09-05T12:00:00+08:00');
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();

  function snapWith(subs: SubscriptionT[]) {
    const snap = buildMockSnapshot();
    snap.subscriptions = subs;
    return snap;
  }

  const baseSub = {
    tool: 'Claude',
    windows: [] as SubscriptionT['windows'],
    confidence: 'live' as const,
  };

  it('formats per-sub usage and aggregates usageTotal for local subscriptions only', () => {
    const snap = snapWith([
      {
        ...baseSub,
        id: 'claude-pro',
        label: 'Claude · Pro',
        source: 'local',
        kind: 'quota',
        billing: 'subscription',
        usage: {
          h24: { tokens: 999 },
          d7: { tokens: 12345, cost: 18.3 },
          lastUsedAt: iso(3600_000),
        },
      },
      {
        ...baseSub,
        id: 'claude-metered',
        label: 'Claude · Metered',
        source: 'local',
        kind: 'quota',
        billing: 'metered',
        usage: { h24: { tokens: 5000 }, lastUsedAt: iso(3600_000) },
      },
      {
        ...baseSub,
        id: 'relay-usage',
        label: 'Relay · Usage',
        source: 'relay',
        scope: 'admin',
        kind: 'site',
        billing: 'subscription',
        usage: { h24: { tokens: 7000 }, lastUsedAt: iso(3600_000) },
      },
    ]);
    const vm = snapshotToViewModel(snap, now);
    const pro = vm.subs.find((s) => s.id === 'claude-pro');
    assert.ok(pro);
    assert.equal(pro!.billing, 'subscription');
    assert.deepEqual(pro!.usage, {
      h24Tokens: '999',
      h24Cost: '—',
      d7Tokens: '12.3K',
      d7Cost: '$18.3',
    });
    const metered = vm.subs.find((s) => s.id === 'claude-metered');
    assert.equal(metered!.billing, 'metered');
    assert.deepEqual(vm.usageTotal, {
      h24Tokens: '999',
      h24Cost: '—',
      d7Tokens: '12.3K',
      d7Cost: '$18.3',
    });
  });

  it('omits usageTotal when no local subscription reports usage', () => {
    const vm = snapshotToViewModel(buildMockSnapshot(), now);
    assert.equal(vm.usageTotal, undefined);
    const sub = vm.subs.find((s) => s.id === 'claude-home');
    assert.equal(sub!.billing, '');
    assert.equal(sub!.usage, undefined);
  });

  it('hides subs inactive for 7d with structured evidence', () => {
    const snap = snapWith([
      {
        ...baseSub,
        id: 'old-quota',
        label: 'Old · Quota',
        source: 'local',
        kind: 'quota',
        windows: [{ key: '5h', pct: 0 }],
        usage: { d7: { tokens: 0 }, lastUsedAt: iso(8 * 86400_000) },
      },
      {
        ...baseSub,
        id: 'zero-breakdown',
        label: '累计 $0 · 今日 $0',
        source: 'relay',
        scope: 'people',
        kind: 'member',
        confidence: 'none',
        breakdown: {
          todayCount: 0,
          days: [{ date: '2026-09-04', cost: 0, requests: 0 }],
          today: [],
        },
      },
    ]);
    const vm = snapshotToViewModel(snap, now);
    assert.equal(vm.subs.some((s) => s.id === 'old-quota'), false);
    assert.equal(vm.subs.some((s) => s.id === 'zero-breakdown'), false);
  });

  it('keeps subs with recent usage, without evidence, or in error state', () => {
    const snap = snapWith([
      {
        ...baseSub,
        id: 'recent-d7',
        label: 'Recent · D7',
        source: 'local',
        kind: 'quota',
        windows: [{ key: '5h', pct: 0 }],
        usage: { d7: { tokens: 5 }, lastUsedAt: iso(9 * 86400_000) },
      },
      {
        ...baseSub,
        id: 'no-evidence',
        label: 'Grok · No Source',
        source: 'local',
        kind: 'quota',
        confidence: 'none',
        windows: [{ key: '5h', pct: 0 }],
      },
      {
        ...baseSub,
        id: 'error-sub',
        label: 'Err · Sub',
        source: 'local',
        kind: 'quota',
        confidence: 'error',
        usage: { d7: { tokens: 0 }, lastUsedAt: iso(30 * 86400_000) },
      },
      {
        ...baseSub,
        id: 'recent-last-used',
        label: 'Recent · LastUsed',
        source: 'local',
        kind: 'quota',
        windows: [{ key: '5h', pct: 0 }],
        usage: { d7: { tokens: 0 }, lastUsedAt: iso(86400_000) },
      },
    ]);
    const vm = snapshotToViewModel(snap, now);
    const ids = vm.subs.map((s) => s.id);
    assert.ok(ids.includes('recent-d7'));
    assert.ok(ids.includes('no-evidence'));
    assert.ok(ids.includes('error-sub'));
    assert.ok(ids.includes('recent-last-used'));
  });

  it('prefers structured lastUsedAt over label regex for people recency', () => {
    const snap = snapWith([
      {
        ...baseSub,
        id: 'p-label',
        label: '累计 $5 · 上次 昨天',
        plan: 'bob',
        source: 'relay',
        scope: 'people',
        kind: 'member',
        confidence: 'none',
      },
      {
        ...baseSub,
        id: 'p-struct',
        label: '累计 $9 · 上次 上周',
        plan: 'alice',
        source: 'relay',
        scope: 'people',
        kind: 'member',
        confidence: 'none',
        usage: { d7: { tokens: 100 }, lastUsedAt: iso(3600_000) },
      },
    ]);
    const vm = snapshotToViewModel(snap, now);
    const people = vm.subs.filter((s) => s.scope === 'people');
    assert.deepEqual(people.map((s) => s.id), ['p-struct', 'p-label']);
  });
});
