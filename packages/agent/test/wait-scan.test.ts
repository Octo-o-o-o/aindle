import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countAttention, formatAttention, mergeReports, snapshotToViewModel } from '@aindle/core';
import { createRequire } from 'node:module';
import { collectRuns } from '../src/collectors/sessions.js';
import { cursorStateDbPath } from '../src/collectors/cursor.js';
import { resetWaitScanCache, scanSessionWait, structuralEventsFromRow } from '../src/collectors/wait-scan.js';

const require = createRequire(import.meta.url);

const A1 = 'A1-SECRET-/Users/sentinel/ask.md';
const A2 = 'A2-SECRET-sk-ant-request-user-input';
const A3_CURSOR = 'A3-CURSOR-AskQuestion-/etc/passwd';
const A5_CLAUDE_PROMPT = 'A5-CLAUDE-PROMPT-sentinel';
const A5_CLAUDE_INPUT = 'A5-CLAUDE-INPUT-sentinel';
const A5_CODEX_ARGS = 'A5-CODEX-ARGS-sentinel';
const A5_CODEX_PROMPT = 'A5-CODEX-PROMPT-sentinel';
const A5_GROK_SUMMARY = 'A5-GROK-SUMMARY-sentinel';
const A5_KIMI_PROMPT = 'A5-KIMI-PROMPT-sentinel';
const A5_GLM_PROMPT = 'A5-GLM-PROMPT-sentinel';
const A5_CURSOR_PROMPT = 'A5-CURSOR-PROMPT-sentinel';

const SENTINELS = [
  A1,
  A2,
  A3_CURSOR,
  A5_CLAUDE_PROMPT,
  A5_CLAUDE_INPUT,
  A5_CODEX_ARGS,
  A5_CODEX_PROMPT,
  A5_GROK_SUMMARY,
  A5_KIMI_PROMPT,
  A5_GLM_PROMPT,
  A5_CURSOR_PROMPT,
];

function assertNoSentinel(value: unknown, extra: string[] = []): void {
  const blob = typeof value === 'string' ? value : JSON.stringify(value);
  for (const token of [...SENTINELS, ...extra]) {
    assert.equal(blob.includes(token), false, `sentinel leaked: ${token}`);
  }
}

function captureLogs(fn: () => void): string[] {
  const lines: string[] = [];
  const wrap =
    (orig: typeof console.log) =>
    (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(' '));
      return orig(...args);
    };
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.log = wrap(orig.log);
  console.info = wrap(orig.info);
  console.warn = wrap(orig.warn);
  console.error = wrap(orig.error);
  try {
    fn();
  } finally {
    console.log = orig.log;
    console.info = orig.info;
    console.warn = orig.warn;
    console.error = orig.error;
  }
  return lines;
}

function writeJsonl(file: string, lines: string[], when = new Date()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.utimesSync(file, when, when);
}

function claudeAsk(id: string, ts: string, sentinel: string): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id,
          name: 'AskUserQuestion',
          input: { questions: [{ prompt: sentinel }] },
        },
      ],
    },
  });
}

function claudeResult(id: string, ts: string, sentinel: string): string {
  return JSON.stringify({
    type: 'user',
    timestamp: ts,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, content: sentinel }],
    },
  });
}

function claudeHuman(ts: string, text: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'user',
    timestamp: ts,
    origin: { kind: 'human' },
    message: { role: 'user', content: text },
    ...extra,
  });
}

function claudeSide(ts: string): string {
  return JSON.stringify({
    type: 'user',
    timestamp: ts,
    isSidechain: true,
    origin: { kind: 'agent' },
    message: { role: 'user', content: 'side' },
  });
}

function padLines(n: number, ts: string): string[] {
  return Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: `pad-${i}` }] },
    }),
  );
}

function collectClaude(root: string) {
  return collectRuns({
    host: { id: 't', label: 't' },
    subscriptions: [{ id: 'claude-default', tool: 'claude', label: 'Claude', home: root }],
  });
}

describe('structural whitelist', () => {
  it('returns only timestamps, enums, booleans-free ids and never copies input text', () => {
    const events = structuralEventsFromRow(
      {
        type: 'assistant',
        timestamp: '2026-09-04T12:00:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'AskUserQuestion', input: { q: A1 } }],
        },
      },
      'claude',
    );
    assert.equal(events.length, 1);
    assert.deepEqual(Object.keys(events[0]!).sort(), ['id', 'kind', 'ts']);
    assertNoSentinel(events);
  });
});

describe('A1 Claude wait', () => {
  it('opens on AskUserQuestion, closes on result, human turn, or 60 minutes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a1-'));
    try {
      const proj = path.join(root, 'projects', '-Users-me-WorkSpace-Aindle');
      const openFile = path.join(proj, 'open.jsonl');
      const now = new Date();
      const ts = now.toISOString();
      const logs = captureLogs(() => {
        writeJsonl(openFile, [claudeHuman(ts, A5_CLAUDE_PROMPT), claudeAsk('toolu_open', ts, A1)], now);
        resetWaitScanCache(openFile);
        const open = collectClaude(root);
        const waiting = open.find((r) => r.id.includes('open'));
        assert.equal(waiting?.state, 'wait');
        assert.equal(waiting?.stateConfidence, 'direct');
        assert.equal(waiting?.waitReason, 'needs_input');
        assert.equal(waiting?.initiator, 'human');
        assertNoSentinel(open);

        fs.appendFileSync(openFile, `${claudeResult('toolu_open', new Date().toISOString(), A1)}\n`);
        const closed = collectClaude(root).find((r) => r.id.includes('open'));
        assert.equal(closed?.state, 'active');
        assert.equal(closed?.waitReason, undefined);

        const humanFile = path.join(proj, 'human.jsonl');
        writeJsonl(
          humanFile,
          [claudeAsk('toolu_h', ts, A1), claudeHuman(new Date().toISOString(), 'ok')],
          now,
        );
        resetWaitScanCache(humanFile);
        const afterHuman = collectClaude(root).find((r) => r.id.includes('human'));
        assert.equal(afterHuman?.state, 'active');

        const expiredFile = path.join(proj, 'expired.jsonl');
        const old = new Date(Date.now() - 61 * 60_000).toISOString();
        writeJsonl(expiredFile, [claudeAsk('toolu_old', old, A1)], now);
        resetWaitScanCache(expiredFile);
        const expired = collectClaude(root).find((r) => r.id.includes('expired'));
        assert.ok(expired);
        assert.notEqual(expired?.state, 'wait');
      });
      assertNoSentinel(logs.join('\n'));
    } finally {
      resetWaitScanCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds an ask in the middle of a large file and rebuilds after inode/shrink', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a1-mid-'));
    try {
      const file = path.join(root, 'projects', '-Users-me-WorkSpace-Aindle', 'mid.jsonl');
      const ts = new Date().toISOString();
      const lines = [...padLines(900, ts), claudeAsk('toolu_mid', ts, A1), ...padLines(900, ts)];
      writeJsonl(file, lines);
      resetWaitScanCache(file);
      const first = scanSessionWait(file, 'claude');
      assert.equal(first.waiting, true);
      assert.equal(first.reliable, true);

      const smaller = [claudeHuman(ts, 'done')];
      fs.unlinkSync(file);
      writeJsonl(file, smaller);
      const rebuilt = scanSessionWait(file, 'claude');
      assert.equal(rebuilt.waiting, false);
    } finally {
      resetWaitScanCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not report wait when timestamps are missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a1-bad-'));
    try {
      const file = path.join(root, 'projects', '-Users-me-WorkSpace-Aindle', 'bad.jsonl');
      writeJsonl(file, [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'x', name: 'AskUserQuestion', input: { q: A1 } }] },
        }),
      ]);
      resetWaitScanCache(file);
      const got = scanSessionWait(file, 'claude');
      assert.equal(got.waiting, false);
      assert.equal(got.reliable, false);
    } finally {
      resetWaitScanCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('A2 Codex wait', () => {
  function collectCodex(root: string) {
    return collectRuns({
      host: { id: 't', label: 't' },
      subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex', home: root }],
    });
  }

  function rollout(root: string, id: string, lines: string[]): string {
    const day = path.join(root, 'sessions', '2026', '09', '04');
    const file = path.join(day, `rollout-2026-09-04T11-00-00-${id}.jsonl`);
    writeJsonl(file, lines);
    return file;
  }

  it('opens on request_user_input and ignores ordinary calls, rate limits, and unnamed approvals', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a2-'));
    try {
      const now = new Date().toISOString();
      const openId = '01a26a82-e249-7020-850f-3e33c738459b';
      const file = rollout(root, openId, [
        JSON.stringify({
          type: 'session_meta',
          payload: { id: openId, cwd: '/Users/me/WorkSpace/Aindle', thread_source: 'user' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'response_item',
          payload: { type: 'function_call', name: 'request_user_input', call_id: 'call_1', arguments: A2 },
        }),
      ]);
      resetWaitScanCache(file);
      const open = collectCodex(root)[0];
      assert.equal(open?.state, 'wait');
      assert.equal(open?.waitReason, 'needs_input');
      assertNoSentinel(open);

      fs.appendFileSync(
        file,
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          type: 'response_item',
          payload: { type: 'function_call_output', call_id: 'call_1', output: A2 },
        })}\n`,
      );
      assert.equal(collectCodex(root)[0]?.state, 'active');

      const noiseId = '01a36a82-e249-7020-850f-3e33c738459b';
      const noise = rollout(root, noiseId, [
        JSON.stringify({
          type: 'session_meta',
          payload: { id: noiseId, cwd: '/Users/me/WorkSpace/Aindle', thread_source: 'user' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'response_item',
          payload: { type: 'function_call', name: 'shell', call_id: 'call_bash', arguments: A2 },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'token_count',
          payload: { type: 'token_count', rate_limits: { primary: { used_percent: 10 } } },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'response_item',
          payload: { type: 'function_call', call_id: 'call_approval' },
        }),
      ]);
      resetWaitScanCache(noise);
      const noisy = collectCodex(root).find((r) => r.id.includes(noiseId));
      assert.ok(noisy);
      assert.notEqual(noisy?.state, 'wait');
    } finally {
      resetWaitScanCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('A3 unsupported tools stay age-only', () => {
  it('does not emit WAIT for Cursor AskQuestion or Kimi/GLM/Grok hot files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a3-'));
    try {
      const now = new Date();
      const ts = now.toISOString();
      const cursorDir = path.join(root, 'cursor', 'chats', 'proj', 'sess');
      fs.mkdirSync(cursorDir, { recursive: true });
      fs.writeFileSync(
        path.join(cursorDir, 'meta.json'),
        JSON.stringify({ title: 'Cursor meta', cwd: '/Users/me/WorkSpace/Aindle' }),
      );
      fs.writeFileSync(path.join(cursorDir, 'store.db'), `AskQuestion ${A3_CURSOR}`);
      fs.utimesSync(path.join(cursorDir, 'meta.json'), now, now);

      const kimi = path.join(root, 'kimi', 'projects', '-Users-me-WorkSpace-Aindle', 'k.jsonl');
      writeJsonl(kimi, [claudeAsk('toolu_k', ts, A1), claudeHuman(ts, A5_KIMI_PROMPT)], now);

      const glm = path.join(root, 'glm', 'projects', '-Users-me-WorkSpace-Aindle', 'g.jsonl');
      writeJsonl(glm, [claudeAsk('toolu_g', ts, A1), claudeHuman(ts, A5_GLM_PROMPT)], now);

      const grok = path.join(root, 'grok', 'sessions', '%2FUsers%2Fme%2FWorkSpace%2FAindle', 'sess-1');
      fs.mkdirSync(grok, { recursive: true });
      fs.writeFileSync(
        path.join(grok, 'summary.json'),
        JSON.stringify({ generated_title: 'Grok title', session_kind: 'interactive', session_summary: A5_GROK_SUMMARY }),
      );
      fs.writeFileSync(path.join(grok, 'updates.jsonl'), `${JSON.stringify({ timestamp: Date.now() / 1000 })}\n`);
      fs.utimesSync(path.join(grok, 'summary.json'), now, now);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'cursor-home', tool: 'cursor', label: 'Cursor', home: path.join(root, 'cursor') },
          { id: 'kimi-home', tool: 'kimi', label: 'Kimi', home: path.join(root, 'kimi'), projectsDir: path.join(root, 'kimi', 'projects') },
          { id: 'glm-home', tool: 'glm', label: 'GLM', projectsDir: path.join(root, 'glm', 'projects') },
          { id: 'grok-home', tool: 'grok', label: 'Grok', home: path.join(root, 'grok') },
        ],
      });
      assert.ok(runs.some((r) => r.tool === 'Cursor' && r.title === 'Cursor meta'));
      assert.ok(runs.some((r) => r.tool === 'Kimi'));
      assert.ok(runs.some((r) => r.tool === 'GLM'));
      assert.ok(runs.some((r) => r.tool === 'Grok'));
      assert.equal(runs.some((r) => r.state === 'wait'), false);
      assertNoSentinel(runs);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeComposerHeaders(appHome: string, rows: Array<{ id: string; name: string }>) {
  const dbPath = cursorStateDbPath(appHome);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => { run: (...args: string[]) => void };
      close: () => void;
    };
  };
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, value TEXT)');
  const ins = db.prepare('INSERT INTO composerHeaders (composerId, value) VALUES (?, ?)');
  for (const row of rows) {
    ins.run(row.id, JSON.stringify({ type: 'head', composerId: row.id, name: row.name }));
  }
  db.close();
}

describe('Cursor IDE agent-transcripts', () => {
  it('lists IDE transcripts as Cursor runs and folds subagents as spawned', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-cursor-tx-'));
    try {
      const id = 'aaaaaaaa-0000-0000-0000-000000000001';
      const sid = 'bbbbbbbb-0000-0000-0000-000000000002';
      const dir = path.join(root, 'cursor', 'projects', 'Users-me-WorkSpace-Aindle', 'agent-transcripts', id);
      fs.mkdirSync(path.join(dir, 'subagents'), { recursive: true });
      const now = new Date();
      const main = path.join(dir, `${id}.jsonl`);
      fs.writeFileSync(
        main,
        `${JSON.stringify({
          role: 'user',
          message: {
            content: [
              {
                type: 'text',
                text: `<timestamp>Monday, Sep 7, 2026, 8:58 AM (UTC+8)</timestamp>\n<user_query>\n${A5_CURSOR_PROMPT}\n</user_query>`,
              },
            ],
          },
        })}\n`,
      );
      fs.writeFileSync(path.join(dir, 'subagents', `${sid}.jsonl`), `${JSON.stringify({ role: 'assistant' })}\n`);
      fs.utimesSync(main, now, now);
      fs.utimesSync(path.join(dir, 'subagents', `${sid}.jsonl`), now, now);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'cursor-ultra', tool: 'cursor', label: 'Cursor Ultra', home: path.join(root, 'cursor') }],
      });
      const human = runs.find((r) => r.id.endsWith(id));
      const child = runs.find((r) => r.id.endsWith(sid));
      assert.ok(human);
      assert.equal(human?.tool, 'Cursor');
      assert.equal(human?.title, 'Cursor · Aindle');
      assert.equal(human?.initiator, 'human');
      assert.ok(child);
      assert.equal(child?.initiator, 'agent');
      assert.equal(runs.some((r) => JSON.stringify(r).includes(A5_CURSOR_PROMPT)), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses composerHeaders.name for IDE transcripts and never the user_query', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-cursor-name-'));
    const prev = process.env.AINDLE_CURSOR_APP_HOME;
    try {
      const id = 'cccccccc-0000-0000-0000-000000000003';
      const dir = path.join(root, 'cursor', 'projects', 'Users-me-WorkSpace-Aindle', 'agent-transcripts', id);
      fs.mkdirSync(dir, { recursive: true });
      const now = new Date();
      const main = path.join(dir, `${id}.jsonl`);
      fs.writeFileSync(
        main,
        `${JSON.stringify({
          role: 'user',
          message: { content: [{ type: 'text', text: `<user_query>\n${A5_CURSOR_PROMPT}\n</user_query>` }] },
        })}\n`,
      );
      fs.utimesSync(main, now, now);
      writeComposerHeaders(root, [{ id, name: 'Kindle Oasis data update issue' }]);
      process.env.AINDLE_CURSOR_APP_HOME = root;

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'cursor-ultra', tool: 'cursor', label: 'Cursor Ultra', home: path.join(root, 'cursor') }],
      });
      const human = runs.find((r) => r.id.endsWith(id));
      assert.equal(human?.title, 'Kindle Oasis data update issue');
      assert.equal(human?.project, 'Aindle');
      assert.equal(JSON.stringify(runs).includes(A5_CURSOR_PROMPT), false);
    } finally {
      if (prev === undefined) delete process.env.AINDLE_CURSOR_APP_HOME;
      else process.env.AINDLE_CURSOR_APP_HOME = prev;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('A4 three-bucket cardinality', () => {
  it('keeps same-project sessions and counts before any fold', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a4-'));
    try {
      const proj = path.join(root, 'projects', '-Users-me-WorkSpace-Aindle');
      const now = new Date();
      const ts = now.toISOString();
      writeJsonl(path.join(proj, 'human-active.jsonl'), [claudeHuman(ts, 'go')], now);
      writeJsonl(path.join(proj, 'human-wait.jsonl'), [claudeHuman(ts, 'ask'), claudeAsk('toolu_w', ts, A1)], now);
      for (const n of [1, 2, 3]) {
        writeJsonl(path.join(proj, `side-${n}.jsonl`), [claudeSide(ts)], now);
      }
      const old = new Date(Date.now() - 20 * 60_000);
      for (let i = 0; i < 30; i += 1) {
        writeJsonl(path.join(proj, `old-${i}.jsonl`), [claudeHuman(old.toISOString(), `old-${i}`)], old);
      }
      const runs = collectClaude(root);
      assert.equal(runs.length, 35);
      const att = countAttention(runs);
      assert.deepEqual(att, { waiting: 1, human: 1, background: 3 });
      const snap = mergeReports(
        [
          {
            schema: 'aindle.ingest.v2',
            host: { id: 't', label: 't', os: 'darwin' },
            reportedAt: new Date().toISOString(),
            subscriptions: [],
            runs,
          },
        ],
        { id: 'hub', label: 'Hub' },
      );
      const vm = snapshotToViewModel(snap);
      assert.equal(formatAttention(vm.attention), '进行中 1 · 待确认 1 · 后台任务 3');
      assert.equal(vm.now.length <= 12, true);
      assert.equal(vm.now.filter((r) => r.tag === 'WAIT' && r.title !== '后台 · 3').length, 1);
      assert.equal(vm.now.some((r) => r.title === '后台 · 3'), true);
      assertNoSentinel(snap);
      assertNoSentinel(vm);
    } finally {
      resetWaitScanCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('A5 titles drop prompt fallbacks', () => {
  it('uses official metadata or Tool · projectLeaf and never prompt or summary sentinels', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-a5-'));
    try {
      const now = new Date();
      const ts = now.toISOString();
      writeJsonl(
        path.join(root, 'claude', 'projects', '-Users-me-WorkSpace-Aindle', 'c.jsonl'),
        [
          claudeHuman(ts, A5_CLAUDE_PROMPT),
          JSON.stringify({ type: 'custom-title', customTitle: '正式 Claude 标题' }),
          claudeAsk('toolu_t', ts, A5_CLAUDE_INPUT),
        ],
        now,
      );
      const kimi = path.join(root, 'kimi', 'projects', '-Users-me-WorkSpace-KimiApp', 'k.jsonl');
      writeJsonl(kimi, [claudeHuman(ts, A5_KIMI_PROMPT)], now);
      const glm = path.join(root, 'glm', 'projects', '-Users-me-WorkSpace-GlmApp', 'g.jsonl');
      writeJsonl(glm, [claudeHuman(ts, A5_GLM_PROMPT)], now);

      const day = path.join(root, 'codex', 'sessions', '2026', '09', '04');
      const id = '01a46a82-e249-7020-850f-3e33c738459b';
      writeJsonl(path.join(day, `rollout-2026-09-04T11-00-00-${id}.jsonl`), [
        JSON.stringify({
          type: 'session_meta',
          payload: { id, cwd: '/Users/me/WorkSpace/CodexApp', thread_source: 'user' },
        }),
        JSON.stringify({
          timestamp: ts,
          type: 'event_msg',
          payload: { type: 'user_message', message: A5_CODEX_PROMPT },
        }),
        JSON.stringify({
          timestamp: ts,
          type: 'response_item',
          payload: { type: 'function_call', name: 'request_user_input', call_id: 'c1', arguments: A5_CODEX_ARGS },
        }),
      ]);
      fs.writeFileSync(
        path.join(root, 'codex', 'session_index.jsonl'),
        `${JSON.stringify({ id, thread_name: '正式 Codex 标题' })}\n`,
      );

      const grok = path.join(root, 'grok', 'sessions', '%2FUsers%2Fme%2FWorkSpace%2FGrokApp', 'g1');
      fs.mkdirSync(grok, { recursive: true });
      fs.writeFileSync(
        path.join(grok, 'summary.json'),
        JSON.stringify({ generated_title: '正式 Grok 标题', session_summary: A5_GROK_SUMMARY, session_kind: 'interactive' }),
      );
      fs.utimesSync(path.join(grok, 'summary.json'), now, now);

      const cursorDir = path.join(root, 'cursor', 'chats', 'c1');
      fs.mkdirSync(cursorDir, { recursive: true });
      fs.writeFileSync(
        path.join(cursorDir, 'meta.json'),
        JSON.stringify({ title: '正式 Cursor 标题', cwd: '/Users/me/WorkSpace/CursorApp', prompt: A5_CURSOR_PROMPT }),
      );
      fs.utimesSync(path.join(cursorDir, 'meta.json'), now, now);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'claude-default', tool: 'claude', label: 'Claude', home: path.join(root, 'claude') },
          { id: 'kimi-home', tool: 'kimi', label: 'Kimi', projectsDir: path.join(root, 'kimi', 'projects') },
          { id: 'glm-home', tool: 'glm', label: 'GLM', projectsDir: path.join(root, 'glm', 'projects') },
          { id: 'codex-personal', tool: 'codex', label: 'Codex', home: path.join(root, 'codex') },
          { id: 'grok-home', tool: 'grok', label: 'Grok', home: path.join(root, 'grok') },
          { id: 'cursor-home', tool: 'cursor', label: 'Cursor', home: path.join(root, 'cursor') },
        ],
      });
      assert.equal(runs.find((r) => r.tool === 'Claude')?.title, '正式 Claude 标题');
      assert.equal(runs.find((r) => r.tool === 'Kimi')?.title, 'Kimi · KimiApp');
      assert.equal(runs.find((r) => r.tool === 'GLM')?.title, 'GLM · GlmApp');
      assert.equal(runs.find((r) => r.tool === 'Codex')?.title, '正式 Codex 标题');
      assert.equal(runs.find((r) => r.tool === 'Grok')?.title, '正式 Grok 标题');
      assert.equal(runs.find((r) => r.tool === 'Cursor')?.title, '正式 Cursor 标题');
      assertNoSentinel(runs);
    } finally {
      resetWaitScanCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
