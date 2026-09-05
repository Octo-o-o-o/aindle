import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { costOf, priceFor } from '../src/lib/pricing.js';
import { collectSourceUsage } from '../src/collectors/usage.js';
import type { RegistryFile } from '../src/registry.js';

function withTempCache(root: string): void {
  process.env.AINDLE_USAGE_CACHE_FILE = path.join(root, 'usage-cache.json');
}

function claudeLine(model: string, ts: string, usage: Record<string, number>): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: { model, usage },
  });
}

describe('pricing', () => {
  it('matches model prefixes case-insensitively', () => {
    assert.deepEqual(priceFor('claude-sonnet-4-20250514'), { input: 3, output: 15 });
    assert.deepEqual(priceFor('Claude-Opus-4-1'), { input: 15, output: 75 });
    assert.deepEqual(priceFor('gpt-5-codex'), { input: 1.25, output: 10 });
    assert.deepEqual(priceFor('kimi-k2-0905-preview'), { input: 0.6, output: 2.5 });
    assert.equal(priceFor('mystery-model'), undefined);
    assert.equal(priceFor(''), undefined);
  });

  it('prices cache reads at 0.1x and writes at 1.25x input', () => {
    const cost = costOf('claude-sonnet-4', { input: 1000, output: 500, cacheRead: 2000, cacheWrite: 4000 });
    assert.ok(cost !== undefined);
    assert.ok(Math.abs(cost - 0.0261) < 1e-9, `cost ${cost}`);
  });

  it('returns undefined cost for unknown models', () => {
    assert.equal(costOf('mystery-model', { input: 1, output: 1 }), undefined);
  });
});

describe('collectSourceUsage', () => {
  it('aggregates claude JSONL into hour buckets with cost', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-usage-claude-'));
    try {
      withTempCache(root);
      const proj = path.join(root, 'claude', 'projects', '-Users-me-WorkSpace-Aindle');
      fs.mkdirSync(proj, { recursive: true });
      const recent = new Date(Date.now() - 2 * 3600_000).toISOString();
      const older = new Date(Date.now() - 30 * 3600_000).toISOString();
      const file = path.join(proj, 'sess.jsonl');
      fs.writeFileSync(
        file,
        [
          claudeLine('claude-sonnet-4-20250514', recent, {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_input_tokens: 2000,
            cache_creation_input_tokens: 4000,
          }),
          claudeLine('claude-sonnet-4-20250514', older, {
            input_tokens: 2000,
            output_tokens: 1000,
          }),
        ].join('\n') + '\n',
      );

      const usage = collectSourceUsage({
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'claude-default', tool: 'claude', label: 'Claude', projectsDir: path.join(root, 'claude', 'projects') },
        ],
      } satisfies RegistryFile);

      const row = usage.get('claude-default');
      assert.ok(row);
      // recent record: 7500 tokens (incl. cache), older: 3000 tokens
      assert.equal(row.h24?.tokens, 7500);
      assert.equal(row.d7?.tokens, 10500);
      // recent cost 0.0261, older cost (2000*3 + 1000*15)/1e6 = 0.021
      assert.ok(Math.abs((row.h24?.cost ?? 0) - 0.0261) < 1e-6, `h24 cost ${row.h24?.cost}`);
      assert.ok(Math.abs((row.d7?.cost ?? 0) - 0.0471) < 1e-6, `d7 cost ${row.d7?.cost}`);
      assert.ok(Math.abs(Date.parse(row.lastUsedAt ?? '') - Date.parse(recent)) < 1000);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses codex token_count records (input+output+reasoning) with model price', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-usage-codex-'));
    try {
      withTempCache(root);
      const day = path.join(root, 'sessions', '2026', '09', '05');
      fs.mkdirSync(day, { recursive: true });
      const id = '01a06a82-e249-7020-850f-3e33c738459b';
      const file = path.join(day, `rollout-2026-09-05T11-42-37-${id}.jsonl`);
      const ts = new Date(Date.now() - 3600_000).toISOString();
      fs.writeFileSync(
        file,
        [
          JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/tmp/x' } }),
          JSON.stringify({ timestamp: ts, type: 'turn_context', payload: { model: 'gpt-5.6-sol' } }),
          JSON.stringify({
            timestamp: ts,
            type: 'event_msg',
            payload: {
              type: 'token_count',
              info: {
                last_token_usage: {
                  input_tokens: 10000,
                  cached_input_tokens: 4000,
                  output_tokens: 500,
                  reasoning_output_tokens: 200,
                },
              },
            },
          }),
        ].join('\n') + '\n',
      );

      const usage = collectSourceUsage({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex', home: root }],
      } satisfies RegistryFile);

      const row = usage.get('codex-personal');
      assert.ok(row);
      assert.equal(row.d7?.tokens, 10700); // 10000 + 500 + 200
      // gpt-5: (6000*1.25 + 700*10 + 4000*0.125)/1e6 = (7500+7000+500)/1e6 = 0.015
      assert.ok(Math.abs((row.d7?.cost ?? 0) - 0.015) < 1e-6, `d7 cost ${row.d7?.cost}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('omits cost when every model is unknown', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-usage-unknown-'));
    try {
      withTempCache(root);
      const proj = path.join(root, 'kimi', 'projects', 'proj');
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(
        path.join(proj, 'sess.jsonl'),
        claudeLine('mystery-model', new Date().toISOString(), { input_tokens: 100, output_tokens: 50 }) + '\n',
      );

      const usage = collectSourceUsage({
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'kimi-code', tool: 'kimi', label: 'Kimi', projectsDir: path.join(root, 'kimi', 'projects') },
        ],
      } satisfies RegistryFile);

      const row = usage.get('kimi-code');
      assert.ok(row);
      assert.equal(row.d7?.tokens, 150);
      assert.equal(row.d7?.cost, undefined);
      assert.equal(row.h24?.cost, undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resumes from the cached offset without double counting', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-usage-incr-'));
    try {
      withTempCache(root);
      const proj = path.join(root, 'claude', 'projects', 'proj');
      fs.mkdirSync(proj, { recursive: true });
      const file = path.join(proj, 'sess.jsonl');
      const t1 = new Date(Date.now() - 3 * 3600_000).toISOString();
      const t2 = new Date(Date.now() - 3600_000).toISOString();
      const line1 = claudeLine('claude-haiku-4-5', t1, { input_tokens: 1000, output_tokens: 100 });
      const line2 = claudeLine('claude-haiku-4-5', t2, { input_tokens: 2000, output_tokens: 200 });

      const registry = {
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'claude-default', tool: 'claude', label: 'Claude', projectsDir: path.join(root, 'claude', 'projects') },
        ],
      } satisfies RegistryFile;

      fs.writeFileSync(file, `${line1}\n`);
      const first = collectSourceUsage(registry).get('claude-default');
      assert.equal(first?.d7?.tokens, 1100);

      fs.appendFileSync(file, `${line2}\n`);
      const second = collectSourceUsage(registry).get('claude-default');
      assert.equal(second?.d7?.tokens, 3300);
      assert.ok(Math.abs((second?.d7?.cost ?? 0) - ((3000 * 1 + 300 * 5) / 1e6)) < 1e-6);

      // third run: file unchanged, cache reused as-is
      const third = collectSourceUsage(registry).get('claude-default');
      assert.equal(third?.d7?.tokens, 3300);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports zero-token sources with mtime lastUsedAt, and skips fileless sources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-usage-zero-'));
    try {
      withTempCache(root);
      const proj = path.join(root, 'claude', 'projects', 'proj');
      fs.mkdirSync(proj, { recursive: true });
      const file = path.join(proj, 'sess.jsonl');
      fs.writeFileSync(file, `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`);
      const mtime = new Date(Date.now() - 60_000);
      fs.utimesSync(file, mtime, mtime);

      const usage = collectSourceUsage({
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'claude-default', tool: 'claude', label: 'Claude', projectsDir: path.join(root, 'claude', 'projects') },
          { id: 'glm-local', tool: 'glm', label: 'GLM', projectsDir: path.join(root, 'glm', 'projects') },
        ],
      } satisfies RegistryFile);

      const zero = usage.get('claude-default');
      assert.ok(zero, 'source with files but no usage records still reports');
      assert.equal(zero.d7?.tokens, 0);
      assert.equal(zero.d7?.cost, undefined);
      assert.ok(Math.abs(Date.parse(zero.lastUsedAt ?? '') - mtime.getTime()) < 1000);

      assert.equal(usage.has('glm-local'), false, 'source without recent files reports nothing');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
