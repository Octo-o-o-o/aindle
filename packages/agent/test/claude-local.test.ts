import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectClaude } from '../src/collectors/claude.js';
import { readLocalClaudeUsage, windowsFromClaudeUsage } from '../src/collectors/claude-local.js';

const ENTRY = { id: 'claude-default', tool: 'claude', label: 'Claude Max', plan: 'Max' } as const;

describe('windowsFromClaudeUsage', () => {
  it('reads statusline rate_limits with used_percentage', () => {
    const windows = windowsFromClaudeUsage({
      rate_limits: {
        five_hour: { used_percentage: 8, resets_at: 1788525600 },
        seven_day: { used_percentage: 56, resets_at: 1788793200 },
      },
    });
    assert.deepEqual(
      windows.map((w) => w.key),
      ['5h', '7d'],
    );
    assert.equal(windows[0]?.pct, 8);
    assert.equal(windows[1]?.pct, 56);
    assert.match(windows[0]?.resetsAt ?? '', /T/);
  });

  it('reads vibe-island oauth snapshot including Fable', () => {
    const windows = windowsFromClaudeUsage({
      _vibe_usage: {
        five_hour: { utilization: 0, resets_at: '2026-09-04T19:19:59.753458+00:00' },
        seven_day: { utilization: 64, resets_at: '2026-09-07T13:59:59.753481+00:00' },
        limits: [
          {
            kind: 'weekly_scoped',
            percent: 100,
            resets_at: '2026-09-07T13:59:59.753665+00:00',
            scope: { model: { display_name: 'Fable' } },
          },
        ],
      },
    });
    assert.deepEqual(
      windows.map((w) => [w.key, w.pct]),
      [
        ['5h', 0],
        ['7d', 64],
        ['Fable', 100],
      ],
    );
  });
});

describe('readLocalClaudeUsage', () => {
  it('keeps conversation headers over a newer oauth snapshot and only fills missing keys', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-home-'));
    try {
      const vibe = path.join(home, '.vibe-island', 'cache');
      fs.mkdirSync(vibe, { recursive: true });
      const rl = path.join(vibe, 'rl.json');
      fs.writeFileSync(
        rl,
        JSON.stringify({
          five_hour: { used_percentage: 8, resets_at: 1788525600 },
          seven_day: { used_percentage: 10, resets_at: 1788793200 },
        }),
      );
      const old = (Date.now() - 20 * 60_000) / 1000;
      fs.utimesSync(rl, old, old);
      fs.writeFileSync(
        path.join(vibe, 'anthropic-oauth-usage.json'),
        JSON.stringify({
          _vibe_usage: {
            five_hour: { utilization: 0, resets_at: '2026-09-04T19:19:59Z' },
            seven_day: { utilization: 64, resets_at: '2026-09-07T13:59:59Z' },
            limits: [
              {
                kind: 'weekly_scoped',
                percent: 100,
                resets_at: '2026-09-07T13:59:59Z',
                scope: { model: { display_name: 'Fable' } },
              },
            ],
          },
        }),
      );
      const got = readLocalClaudeUsage(Date.now(), home);
      assert.equal(got.fresh, false);
      assert.deepEqual(
        got.windows.map((w) => [w.key, w.pct]),
        [
          ['5h', 8],
          ['7d', 10],
          ['Fable', 100],
        ],
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('collectClaude local headers', () => {
  let home = '';
  let lastFile = '';
  const prev = {
    home: process.env.AINDLE_CLAUDE_RATE_HOME,
    api: process.env.AINDLE_CLAUDE_USAGE_API,
    last: process.env.AINDLE_QUOTA_LAST_FILE,
  };
  let fetchImpl: typeof fetch | undefined;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-collect-'));
    lastFile = path.join(home, 'quota-last.json');
    process.env.AINDLE_CLAUDE_RATE_HOME = home;
    process.env.AINDLE_QUOTA_LAST_FILE = lastFile;
    delete process.env.AINDLE_CLAUDE_USAGE_API;
    fetchImpl = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('network should not be used');
    }) as typeof fetch;
  });

  afterEach(() => {
    if (prev.home === undefined) delete process.env.AINDLE_CLAUDE_RATE_HOME;
    else process.env.AINDLE_CLAUDE_RATE_HOME = prev.home;
    if (prev.api === undefined) delete process.env.AINDLE_CLAUDE_USAGE_API;
    else process.env.AINDLE_CLAUDE_USAGE_API = prev.api;
    if (prev.last === undefined) delete process.env.AINDLE_QUOTA_LAST_FILE;
    else process.env.AINDLE_QUOTA_LAST_FILE = prev.last;
    if (fetchImpl) globalThis.fetch = fetchImpl;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('returns header windows without calling oauth/usage', async () => {
    const vibe = path.join(home, '.vibe-island', 'cache');
    fs.mkdirSync(vibe, { recursive: true });
    fs.writeFileSync(
      path.join(vibe, 'rl.json'),
      JSON.stringify({
        five_hour: { used_percentage: 8, resets_at: 1788525600 },
        seven_day: { used_percentage: 56, resets_at: 1788793200 },
      }),
    );
    const sub = await collectClaude({ ...ENTRY });
    assert.equal(sub.confidence, 'live');
    assert.deepEqual(
      sub.windows.map((w) => [w.key, w.pct]),
      [
        ['5h', 8],
        ['7d', 56],
      ],
    );
  });

  it('does not hit the network when there is no local snapshot', async () => {
    const sub = await collectClaude({ ...ENTRY });
    assert.equal(sub.confidence, 'error');
    assert.deepEqual(sub.windows, []);
  });
});
