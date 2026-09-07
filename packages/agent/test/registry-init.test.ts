import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  applyHostToRegistryYaml,
  loadRegistry,
  suggestHostIdentity,
  yamlScalar,
} from '../src/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const examplePath = path.join(root, 'config', 'registry.example.yaml');

describe('suggestHostIdentity', () => {
  it('slugs the computer name and strips .local', () => {
    assert.deepEqual(suggestHostIdentity('Office-PC'), { id: 'office-pc', label: 'Office-PC' });
    assert.deepEqual(suggestHostIdentity('Johns-MacBook-Pro.local'), {
      id: 'johns-macbook-pro',
      label: 'Johns-MacBook-Pro',
    });
  });

  it('does not collide with the hub sample host id', () => {
    assert.equal(suggestHostIdentity('mbp').id, 'mbp-local');
    assert.equal(suggestHostIdentity('mini').id, 'mini-local');
    assert.equal(suggestHostIdentity('hub').id, 'hub-local');
    assert.equal(suggestHostIdentity('demo').id, 'demo-local');
  });

  it('falls back when the name has no latin letters', () => {
    const host = suggestHostIdentity('电脑');
    assert.equal(host.id, 'local');
    assert.equal(host.label, '电脑');
  });
});

describe('applyHostToRegistryYaml', () => {
  it('stamps host on the checked-in example without enabling tools', () => {
    const src = fs.readFileSync(examplePath, 'utf8');
    assert.match(src, /^host:\n  id: local\n  label: This computer$/m);
    assert.doesNotMatch(src, /^[ \t]*- id:/m);
    const stamped = applyHostToRegistryYaml(src, { id: 'office-pc', label: 'Office-PC' });
    const parsed = parseYaml(stamped) as { host: { id: string; label: string }; subscriptions: unknown[] | null };
    assert.deepEqual(parsed.host, { id: 'office-pc', label: 'Office-PC' });
    assert.ok(parsed.subscriptions == null || parsed.subscriptions.length === 0);
    assert.match(stamped, /id: office-pc/);
    assert.equal(yamlScalar('Office-PC'), 'Office-PC');
    assert.equal(yamlScalar('a: b'), '"a: b"');
  });

  it('loadRegistry treats a comment-only subscriptions block as empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-reg-'));
    const file = path.join(dir, 'registry.yaml');
    const stamped = applyHostToRegistryYaml(fs.readFileSync(examplePath, 'utf8'), {
      id: 'office-pc',
      label: 'Office-PC',
    });
    fs.writeFileSync(file, stamped);
    try {
      const reg = loadRegistry(file);
      assert.deepEqual(reg.host, { id: 'office-pc', label: 'Office-PC' });
      assert.deepEqual(reg.subscriptions, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
