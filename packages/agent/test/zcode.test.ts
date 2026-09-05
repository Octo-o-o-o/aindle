import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  decryptZcodeCredential,
  zcodeCredentialSecret,
  zcodePlanLabel,
  windowsFromZcodeQuota,
} from '../src/collectors/zcode.js';
import { scanZcodeSessions } from '../src/collectors/sessions.js';

const require = createRequire(import.meta.url);

const SECRET_ENV = { ZCODE_CREDENTIAL_SECRET: 'unit-test-secret' };

function seal(plain: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

describe('zcode credential decryption', () => {
  it('derives the machine fallback secret like the app', () => {
    const secret = zcodeCredentialSecret({});
    assert.ok(secret.startsWith('zcode-credential-fallback:'));
    assert.ok(secret.includes(os.platform()));
    assert.ok(secret.includes(os.homedir()));
  });

  it('prefers ZCODE_CREDENTIAL_SECRET when set', () => {
    assert.equal(zcodeCredentialSecret(SECRET_ENV), 'unit-test-secret');
  });

  it('round-trips an enc:v1 value', () => {
    const sealed = seal('eyJhbGciOi.example.token', 'unit-test-secret');
    assert.equal(decryptZcodeCredential(sealed, SECRET_ENV), 'eyJhbGciOi.example.token');
  });

  it('returns plain values untouched and rejects garbage', () => {
    assert.equal(decryptZcodeCredential('plain-token'), 'plain-token');
    assert.equal(decryptZcodeCredential(undefined), undefined);
    const wrongKey = seal('x', 'other-secret');
    assert.equal(decryptZcodeCredential(wrongKey, SECRET_ENV), undefined);
  });
});

describe('windowsFromZcodeQuota', () => {
  it('maps unit semantics to 5h / 7d / monthly keys', () => {
    const windows = windowsFromZcodeQuota({
      limits: [
        { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 100, currentValue: 22, remaining: 78, percentage: 22, nextResetTime: 1790482709997 },
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 11, nextResetTime: 1788545797362 },
        { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 41 },
      ],
    });
    assert.deepEqual(
      windows.map((w) => w.key),
      ['5h', '7d', '月'],
    );
    assert.equal(windows[0]?.pct, 11);
    assert.equal(windows[0]?.resetsAt, new Date(1788545797362).toISOString());
    assert.equal(windows[1]?.pct, 41);
    assert.equal(windows[2]?.pct, 22);
  });

  it('computes pct from usage/currentValue when percentage is missing', () => {
    const windows = windowsFromZcodeQuota({
      limits: [{ type: 'TIME_LIMIT', unit: 5, number: 1, usage: 100, currentValue: 50 }],
    });
    assert.equal(windows[0]?.pct, 50);
  });

  it('keeps 0% windows and drops unusable rows', () => {
    const windows = windowsFromZcodeQuota({
      limits: [
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 0 },
        { type: 'UNKNOWN', unit: 99 },
      ],
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.pct, 0);
  });

  it('handles non-object payloads', () => {
    assert.deepEqual(windowsFromZcodeQuota(null), []);
    assert.deepEqual(windowsFromZcodeQuota({}), []);
  });
});

describe('zcodePlanLabel', () => {
  it('maps known levels and trims unknown ones', () => {
    assert.equal(zcodePlanLabel('lite'), 'Lite');
    assert.equal(zcodePlanLabel('PRO'), 'Pro');
    assert.equal(zcodePlanLabel('TeamLite'), 'TeamLite');
    assert.equal(zcodePlanLabel(undefined), undefined);
  });
});

describe('scanZcodeSessions', () => {
  it('reads recent sessions from the zcode sqlite db', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-zcode-'));
    try {
      const dbDir = path.join(root, 'cli', 'db');
      fs.mkdirSync(dbDir, { recursive: true });
      const dbPath = path.join(dbDir, 'db.sqlite');
      const { DatabaseSync } = require('node:sqlite') as {
        DatabaseSync: new (p: string) => { exec: (sql: string) => void; prepare: (sql: string) => { run: (...a: unknown[]) => unknown }; close: () => void };
      };
      const db = new DatabaseSync(dbPath);
      db.exec(`CREATE TABLE session (
        id text primary key, project_id text not null, workspace_id text, parent_id text,
        slug text not null, directory text not null, path text, title text not null, version text not null,
        share_url text, summary_additions integer, summary_deletions integer, summary_files integer,
        summary_diffs text, revert text, permission text, time_created integer not null,
        time_updated integer not null, time_compacting integer, time_archived integer,
        task_type text not null default 'interactive',
        title_source text not null default 'first_input', title_message_id text, time_title_updated integer, trace_id text)`);
      const now = Date.now();
      db.prepare(
        `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, task_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('sess-live', 'p1', 's1', '/Users/x/WorkSpace/Aindle', '支持zCode登录账号限额与会话获取', '3.11.2', now - 60_000, now - 60_000, 'interactive');
      db.prepare(
        `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, task_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('sess-spawn', 'p1', 's2', '/Users/x/WorkSpace/Aindle', 'child task', '3.11.2', now - 5 * 60_000, now - 5 * 60_000, 'subagent_child');
      db.prepare(
        `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, task_type, time_archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('sess-archived', 'p1', 's3', '/tmp', 'archived', '3.11.2', now - 60_000, now - 60_000, 'interactive', now);
      db.prepare(
        `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, task_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('sess-old', 'p1', 's4', '/tmp', 'too old', '3.11.2', now - 3 * 60 * 60_000, now - 3 * 60 * 60_000, 'interactive');
      db.close();

      const runs = scanZcodeSessions(
        { id: 'main', tool: 'zcode', label: 'ZCode · Home', home: root },
        'mbp',
        now,
      );
      assert.equal(runs.length, 2);
      const live = runs.find((r) => r.id === 'zcode-main-sess-live');
      assert.ok(live);
      assert.equal(live.tool, 'ZCode');
      assert.equal(live.state, 'active');
      assert.equal(live.project, 'Aindle');
      assert.equal(live.spawned, false);
      const spawned = runs.find((r) => r.id === 'zcode-main-sess-spawn');
      assert.ok(spawned);
      assert.equal(spawned.spawned, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns nothing without a db', () => {
    const runs = scanZcodeSessions(
      { id: 'main', tool: 'zcode', label: 'ZCode · Home', home: '/nonexistent-zcode' },
      'mbp',
    );
    assert.deepEqual(runs, []);
  });
});
