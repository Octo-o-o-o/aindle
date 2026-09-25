import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  markSharedClaudePools,
  readClaudeOrganizationId,
} from '../src/collectors/claude.js';
import type { RegistrySubscription } from '../src/registry.js';
import type { Subscription } from '@aindle/core';

function writeOrg(dir: string, uuid: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { organizationUuid: uuid } }));
}

function sub(id: string): Subscription {
  return {
    id,
    tool: 'Claude',
    label: id,
    windows: [{ key: '5h', pct: 10 }],
    confidence: 'live',
  };
}

describe('readClaudeOrganizationId', () => {
  it('reads oauthAccount.organizationUuid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-org-'));
    try {
      writeOrg(dir, 'AA-BB-CC');
      assert.equal(readClaudeOrganizationId(dir), 'aa-bb-cc');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('markSharedClaudePools', () => {
  it('marks two Claude homes that share an org and leaves a third alone', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-b-'));
    const c = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-c-'));
    try {
      writeOrg(a, 'org-shared');
      writeOrg(b, 'org-shared');
      writeOrg(c, 'org-other');
      const entries = [
        { id: 'claude-a', tool: 'claude', label: 'A', home: a },
        { id: 'claude-b', tool: 'claude', label: 'B', home: b },
        { id: 'claude-c', tool: 'claude', label: 'C', home: c },
      ] as RegistrySubscription[];
      const marked = markSharedClaudePools(entries, [sub('claude-a'), sub('claude-b'), sub('claude-c')]);
      assert.equal(marked[0]?.shared, true);
      assert.equal(marked[1]?.shared, true);
      assert.equal(marked[2]?.shared, undefined);
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
      fs.rmSync(c, { recursive: true, force: true });
    }
  });
});
