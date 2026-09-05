import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketsFromAvailableModels,
  bucketsFromRetrieveUserQuota,
  findAntigravityEndpoint,
  parseLoadCodeAssist,
  windowsFromAntigravitySummary,
  windowsFromQuotaBuckets,
} from '../src/collectors/gemini.js';
import { copilotPlanLabel, windowsFromCopilotUser } from '../src/collectors/copilot.js';
import { windowsFromKiroUsage, kiroUsageLabel } from '../src/collectors/kiro.js';
import { deepSeekBalanceRows, deepSeekWindows } from '../src/collectors/deepseek.js';

describe('gemini: parseLoadCodeAssist', () => {
  it('maps tiers to plans and flags unsupported clients', () => {
    const free = parseLoadCodeAssist({
      currentTier: { id: 'free-tier', name: 'Antigravity' },
      allowedTiers: [{ id: 'free-tier' }],
      cloudaicompanionProject: 'aicode-consumers',
    });
    assert.equal(free.plan, 'Free');
    assert.equal(free.project, 'aicode-consumers');
    assert.equal(free.unsupportedClient, false);

    const unsupported = parseLoadCodeAssist({
      currentTier: { id: 'free-tier' },
      ineligibleTiers: [{ tierId: 'free-tier', reasonCode: 'UNSUPPORTED_CLIENT' }],
      paidTier: { id: 'g1-pro-tier' },
    });
    assert.equal(unsupported.unsupportedClient, true);
    assert.equal(unsupported.plan, 'Free');
  });
});

describe('gemini: quota buckets', () => {
  it('turns remainingFraction into a used% window with reset', () => {
    const windows = windowsFromQuotaBuckets([
      { remainingFraction: 0.87, resetTime: '2026-09-05T10:00:00Z' },
      { remainingFraction: 0.42, resetTime: '2026-09-05T12:00:00Z' },
    ]);
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.key, '5h');
    assert.equal(Math.round(windows[0]!.pct), 58);
    assert.equal(windows[0]?.resetsAt, '2026-09-05T12:00:00.000Z');
  });

  it('reads buckets from both remote shapes', () => {
    assert.equal(
      bucketsFromRetrieveUserQuota({ buckets: [{ remainingFraction: 0.5 }] }).length,
      1,
    );
    assert.equal(
      bucketsFromAvailableModels({ models: { 'gemini-2.5-pro': { quotaInfo: { remainingFraction: 0.9 } } } }).length,
      1,
    );
    assert.deepEqual(bucketsFromRetrieveUserQuota(null), []);
    assert.deepEqual(bucketsFromAvailableModels({}), []);
  });
});

describe('gemini: antigravity local probe', () => {
  it('finds the language server port and csrf from a command line', () => {
    const endpoint = findAntigravityEndpoint([
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity --extension_server_port=45731 --extension_server_csrf_token abc123',
    ]);
    assert.deepEqual(endpoint, { port: 45731, csrf: 'abc123' });
    assert.equal(findAntigravityEndpoint(['git status']), null);
  });

  it('parses 5h and weekly windows from the summary', () => {
    const windows = windowsFromAntigravitySummary({
      response: {
        groups: [
          {
            buckets: [
              { name: '5 hour window', remaining: { remainingFraction: 0.25, resetTime: 1788545797362 } },
              { name: 'weekly window', remaining: { remainingFraction: 0.8, resetTime: 1790482709997 } },
            ],
          },
        ],
      },
    });
    assert.deepEqual(
      windows.map((w) => w.key),
      ['5h', '7d'],
    );
    assert.equal(Math.round(windows[0]!.pct), 75);
  });
});

describe('copilot', () => {
  it('derives premium usage from percent_remaining', () => {
    const windows = windowsFromCopilotUser({
      copilot_plan: 'individual_pro',
      quota_reset_date_utc: '2026-10-01T00:00:00.000Z',
      quota_snapshots: {
        chat: { unlimited: true, percent_remaining: 100 },
        premium_interactions: { unlimited: false, percent_remaining: 88.5, entitlement: 1500 },
      },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.key, '月');
    assert.equal(Math.round(windows[0]!.pct), 12);
    assert.equal(windows[0]?.resetsAt, '2026-10-01T00:00:00.000Z');
  });

  it('skips unlimited plans and missing snapshots', () => {
    assert.deepEqual(
      windowsFromCopilotUser({ quota_snapshots: { premium_interactions: { unlimited: true } } }),
      [],
    );
    assert.deepEqual(windowsFromCopilotUser({}), []);
  });

  it('maps plan skus to display names', () => {
    assert.equal(copilotPlanLabel('individual_pro'), 'Pro');
    assert.equal(copilotPlanLabel('individual_pro_plus'), 'Pro+');
    assert.equal(copilotPlanLabel('unknown_tier'), 'unknown_tier');
    assert.equal(copilotPlanLabel(undefined), undefined);
  });
});

describe('kiro', () => {
  it('computes plan usage minus overages against the limit', () => {
    const windows = windowsFromKiroUsage({
      currentUsage: 62.5,
      currentOverages: 12.5,
      planLimit: 50,
      overageCap: 200,
      nextDateReset: '2026-10-01T00:00:00Z',
    });
    assert.equal(windows.length, 2);
    assert.equal(windows[0]?.key, '月');
    assert.equal(Math.round(windows[0]!.pct), 100); // 50/50 in-plan
    assert.equal(windows[1]?.key, '超额');
    assert.equal(Math.round(windows[1]!.pct), 6);
  });

  it('degrades to a label-only read when no limit field exists', () => {
    const windows = windowsFromKiroUsage({ currentUsage: 3, currentOverages: 0 });
    assert.deepEqual(windows, []);
    assert.match(kiroUsageLabel({ currentUsage: 3, currentOverages: 0 }), /已用 3 credits/);
  });
});

describe('deepseek', () => {
  it('parses balance rows and computes the budget window', () => {
    const rows = deepSeekBalanceRows({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '487.21', granted_balance: '0.00', topped_up_balance: '487.21' },
      ],
    });
    assert.deepEqual(rows, [{ currency: 'CNY', total: 487.21 }]);
    const windows = deepSeekWindows(rows, 600);
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.key, '预算');
    assert.equal(Math.round(windows[0]!.pct), 19); // (600-487.21)/600
    assert.deepEqual(deepSeekWindows(rows), []); // no budget → no fake bar
    assert.deepEqual(deepSeekBalanceRows({}), []);
  });
});
