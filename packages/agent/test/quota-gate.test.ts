import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IDLE_INTERVAL_MS,
  quotaDue,
  quotaIntervalMs,
  quotaClearDiskForTests,
  quotaRemember,
  quotaResetForTests,
} from '../src/lib/quota-gate.js';
import { hasLiveLocalSession } from '../src/lib/session-activity.js';

describe('quota intervals', () => {
  let gateFile = '';

  beforeEach(() => {
    gateFile = path.join(os.tmpdir(), `aindle-gate-${process.pid}-${Date.now()}.json`);
    process.env.AINDLE_QUOTA_GATE_FILE = gateFile;
    delete process.env.AINDLE_QUOTA_INTERVAL_SEC;
    delete process.env.AINDLE_QUOTA_IDLE_INTERVAL_SEC;
    quotaResetForTests();
    quotaClearDiskForTests();
  });

  afterEach(() => {
    quotaResetForTests();
    quotaClearDiskForTests();
    delete process.env.AINDLE_QUOTA_GATE_FILE;
    delete process.env.AINDLE_QUOTA_INTERVAL_SEC;
    delete process.env.AINDLE_QUOTA_IDLE_INTERVAL_SEC;
  });

  it('uses a much longer interval when no local session is running', () => {
    assert.equal(quotaIntervalMs(true), 5 * 60_000);
    assert.equal(quotaIntervalMs(false), IDLE_INTERVAL_MS);
    assert.ok(quotaIntervalMs(false) >= 8 * quotaIntervalMs(true));
  });

  it('keeps nextAt across an in-memory reset by reading the gate file', () => {
    const now = 1_700_000_000_000;
    quotaRemember('claude:t', { ok: 1 }, false, undefined, now);
    quotaResetForTests();
    assert.equal(quotaDue('claude:t', now + 10_000), false);
    assert.equal(quotaDue('claude:t', now + 31 * 60_000), true);
  });
});

describe('local session activity', () => {
  it('treats a recent jsonl as live and an old one as idle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-sess-'));
    try {
      const proj = path.join(root, 'proj');
      fs.mkdirSync(proj);
      const file = path.join(proj, 'chat.jsonl');
      fs.writeFileSync(file, '{}\n');
      const now = Date.now();
      fs.utimesSync(file, new Date(now), new Date(now));
      assert.equal(hasLiveLocalSession(root, 10 * 60_000, now), true);
      const old = new Date(now - 40 * 60_000);
      fs.utimesSync(file, old, old);
      assert.equal(hasLiveLocalSession(root, 10 * 60_000, now), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
