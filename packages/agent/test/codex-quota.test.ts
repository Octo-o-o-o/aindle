import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extraCodexWindowKey,
  shapeWhamWindows,
  windowsFromAppServerResult,
} from '../src/collectors/codex.js';

describe('extraCodexWindowKey', () => {
  it('keeps Spark 5h and weekly labels short', () => {
    assert.equal(extraCodexWindowKey('GPT-5.3-Codex-Spark', 300), 'Spark');
    assert.equal(extraCodexWindowKey('Codex Spark', 10080), 'Spark周');
  });
});

describe('shapeWhamWindows', () => {
  it('maps primary/secondary plus additional spark limits', () => {
    const windows = shapeWhamWindows({
      rate_limit: {
        primary_window: { used_percent: 22, reset_at: '2026-09-11T04:00:00Z', window_minutes: 300 },
        secondary_window: { used_percent: 41, reset_at: '2026-09-14T08:00:00Z', window_minutes: 10080 },
      },
      additional_rate_limits: [
        {
          limit_name: 'GPT-5.3-Codex-Spark',
          rate_limit: {
            primary_window: { used_percent: 70, reset_at: '2026-09-11T05:00:00Z', window_minutes: 300 },
            secondary_window: { used_percent: 15, reset_at: '2026-09-14T08:00:00Z', window_minutes: 10080 },
          },
        },
      ],
    });
    assert.deepEqual(
      windows.map((w) => [w.key, w.pct]),
      [
        ['5h', 22],
        ['7d', 41],
        ['Spark', 70],
        ['Spark周', 15],
      ],
    );
  });
});

describe('windowsFromAppServerResult', () => {
  it('reads modern primary/secondary snapshots', () => {
    const windows = windowsFromAppServerResult({
      rateLimits: {
        limitId: 'codex',
        primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_780_000_000 },
        secondary: { usedPercent: 18, windowDurationMins: 10080, resetsAt: 1_780_500_000 },
      },
    });
    assert.deepEqual(
      windows.map((w) => w.key),
      ['5h', '7d'],
    );
    assert.equal(windows[0]?.pct, 25);
    assert.equal(windows[1]?.pct, 18);
    assert.ok(windows[0]?.resetsAt);
  });

  it('still reads the legacy fiveHour/sevenDay shape', () => {
    const windows = windowsFromAppServerResult({
      rateLimits: {
        fiveHour: { usedPercent: 11, resetsAt: '2026-09-11T04:00:00.000Z' },
        sevenDay: { usedPercent: 33, resetsAt: '2026-09-14T08:00:00.000Z' },
      },
    });
    assert.deepEqual(
      windows.map((w) => [w.key, w.pct]),
      [
        ['5h', 11],
        ['7d', 33],
      ],
    );
  });

  it('adds non-codex rateLimitsByLimitId buckets', () => {
    const windows = windowsFromAppServerResult({
      rateLimits: {
        limitId: 'codex',
        primary: { usedPercent: 10, windowDurationMins: 300 },
        secondary: { usedPercent: 20, windowDurationMins: 10080 },
      },
      rateLimitsByLimitId: {
        codex: { primary: { usedPercent: 10, windowDurationMins: 300 } },
        spark: {
          primary: { usedPercent: 88, windowDurationMins: 300, resetsAt: 1_780_000_000 },
          secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1_780_500_000 },
        },
      },
    });
    assert.deepEqual(
      windows.map((w) => [w.key, w.pct]),
      [
        ['5h', 10],
        ['7d', 20],
        ['Spark', 88],
        ['Spark周', 12],
      ],
    );
  });
});
