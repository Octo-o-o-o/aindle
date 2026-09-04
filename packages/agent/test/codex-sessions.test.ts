import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectRuns } from '../src/collectors/sessions.js';
import { finalizeCodexWindows, formatChatgptPlan, listCodexRollouts } from '../src/collectors/codex.js';
import { isNoiseUserText, parseCursorClock } from '../src/collectors/user-ask.js';

describe('user ask clock', () => {
  it('drops injected context and parses Cursor clocks', () => {
    assert.equal(isNoiseUserText('# Files mentioned by the user:\n## a.ts'), true);
    assert.equal(isNoiseUserText('# Files pasted by the user:\n## a.ts'), true);
    assert.equal(isNoiseUserText('<in-app-browser-context source="ambient-ui-state">x'), true);
    assert.equal(isNoiseUserText('<task-notification>done'), true);
    assert.equal(isNoiseUserText('最新一次用户提问'), false);
    const ms = parseCursorClock('Thursday, Sep 3, 2026, 9:38 PM (UTC+8)');
    assert.ok(ms > 0);
  });
});

describe('formatChatgptPlan', () => {
  it('maps chatgpt_plan_type to display names', () => {
    assert.equal(formatChatgptPlan('pro'), 'Pro');
    assert.equal(formatChatgptPlan('plus'), 'Plus');
    assert.equal(formatChatgptPlan('chatgpt_pro'), 'Pro');
    assert.equal(formatChatgptPlan(''), undefined);
  });
});

describe('finalizeCodexWindows', () => {
  it('keeps both 5h and 7d for Plus', () => {
    const windows = [
      { key: '5h', pct: 20 },
      { key: '7d', pct: 40 },
    ];
    assert.deepEqual(finalizeCodexWindows(windows, 'Plus'), windows);
  });

  it('drops 5h for Pro and keeps weekly', () => {
    const windows = [
      { key: '5h', pct: 20 },
      { key: '7d', pct: 5 },
    ];
    assert.deepEqual(finalizeCodexWindows(windows, 'Pro'), [{ key: '7d', pct: 5 }]);
  });

  it('relabels a lone Pro 5h bar as weekly', () => {
    assert.deepEqual(finalizeCodexWindows([{ key: '5h', pct: 5 }], 'Pro'), [{ key: '7d', pct: 5 }]);
  });
});

describe('codex nested rollouts', () => {
  it('finds dated rollout files and uses thread titles', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-codex-'));
    try {
      const day = path.join(root, 'sessions', '2026', '09', '04');
      fs.mkdirSync(day, { recursive: true });
      const id = '01a06a82-e249-7020-850f-3e33c738459b';
      const file = path.join(day, `rollout-2026-09-04T11-42-37-${id}.jsonl`);
      fs.writeFileSync(
        file,
        `${JSON.stringify({
          type: 'session_meta',
          payload: { id, cwd: '/Users/me/WorkSpace/YoUsage' },
        })}\n`,
      );
      fs.writeFileSync(
        path.join(root, 'session_index.jsonl'),
        `${JSON.stringify({
          id,
          thread_name: '规划 AI 上下文管理工具',
          updated_at: new Date().toISOString(),
        })}\n`,
      );
      const now = new Date();
      fs.utimesSync(file, now, now);

      assert.equal(listCodexRollouts(path.join(root, 'sessions'), 15 * 60_000).length, 1);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex · 个人', home: root }],
      });
      assert.equal(runs.length, 1);
      assert.equal(runs[0]?.title, '规划 AI 上下文管理工具');
      assert.equal(runs[0]?.project, 'YoUsage');
      assert.equal(runs[0]?.state, 'active');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps sessions that finished in the last hour as done', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-codex-done-'));
    try {
      const day = path.join(root, 'sessions', '2026', '09', '04');
      fs.mkdirSync(day, { recursive: true });
      const id = '01b06a82-e249-7020-850f-3e33c738459b';
      const file = path.join(day, `rollout-2026-09-04T10-00-00-${id}.jsonl`);
      fs.writeFileSync(
        file,
        `${JSON.stringify({
          type: 'session_meta',
          payload: { id, cwd: '/Users/me/WorkSpace/Aindle' },
        })}\n`,
      );
      const ended = new Date(Date.now() - 20 * 60_000);
      fs.utimesSync(file, ended, ended);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex · 个人', home: root }],
      });
      assert.equal(runs.length, 1);
      assert.equal(runs[0]?.state, 'done');
      assert.equal(runs[0]?.project, 'Aindle');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('hides Codex subagents when the parent thread is live', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-codex-sub-'));
    try {
      const day = path.join(root, 'sessions', '2026', '09', '04');
      fs.mkdirSync(day, { recursive: true });
      const parent = '01c06a82-e249-7020-850f-3e33c738459b';
      const child = '01c16a82-e249-7020-850f-3e33c738459b';
      const parentFile = path.join(day, `rollout-2026-09-04T11-00-00-${parent}.jsonl`);
      const childFile = path.join(day, `rollout-2026-09-04T11-10-00-${child}.jsonl`);
      fs.writeFileSync(
        parentFile,
        `${JSON.stringify({
          type: 'session_meta',
          payload: { id: parent, cwd: '/Users/me/WorkSpace/YoUsage', thread_source: 'user' },
        })}\n`,
      );
      fs.writeFileSync(
        childFile,
        `${JSON.stringify({
          type: 'session_meta',
          payload: {
            id: child,
            cwd: '/Users/me/WorkSpace/YoUsage',
            thread_source: 'subagent',
            parent_thread_id: parent,
          },
        })}\n`,
      );
      fs.writeFileSync(
        path.join(root, 'session_index.jsonl'),
        `${JSON.stringify({ id: parent, thread_name: '实施工作轨迹与会话工作卡' })}\n`,
      );
      const now = new Date();
      fs.utimesSync(parentFile, now, now);
      fs.utimesSync(childFile, now, now);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex · 个人', home: root }],
      });
      assert.equal(runs.length, 2);
      const parentRun = runs.find((r) => r.id === `codex-codex-personal-${parent}`);
      const childRun = runs.find((r) => r.id === `codex-codex-personal-${child}`);
      assert.equal(parentRun?.title, '实施工作轨迹与会话工作卡');
      assert.equal(parentRun?.spawned, undefined);
      assert.equal(childRun?.spawned, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads Claude custom titles and hides headless Grok under the same repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-fold-'));
    try {
      const claudeProj = path.join(root, 'claude', 'projects', '-Users-me-WorkSpace-SayDo');
      fs.mkdirSync(claudeProj, { recursive: true });
      const claudeFile = path.join(claudeProj, 'sess.jsonl');
      fs.writeFileSync(
        claudeFile,
        `${JSON.stringify({ type: 'user', origin: { kind: 'human' }, message: { content: 'hello' } })}\n${JSON.stringify({ type: 'custom-title', customTitle: '项目优化完善 review' })}\n`,
      );
      const grokSess = path.join(
        root,
        'grok',
        'sessions',
        '%2FUsers%2Fme%2FWorkSpace%2FSayDo',
        '01a06ce0-6fa9-7e13-9a46-2041f5868b5e',
      );
      fs.mkdirSync(grokSess, { recursive: true });
      fs.writeFileSync(
        path.join(grokSess, 'summary.json'),
        JSON.stringify({
          generated_title: 'Local convergence evidence commit',
          session_kind: 'headless',
          info: { cwd: '/Users/me/WorkSpace/SayDo' },
        }),
      );
      const day = path.join(root, 'codex', 'sessions', '2026', '09', '04');
      fs.mkdirSync(day, { recursive: true });
      const parent = '01d06a82-e249-7020-850f-3e33c738459b';
      const parentFile = path.join(day, `rollout-2026-09-04T11-00-00-${parent}.jsonl`);
      fs.writeFileSync(
        parentFile,
        `${JSON.stringify({
          type: 'session_meta',
          payload: { id: parent, cwd: '/Users/me/WorkSpace/SayDo', thread_source: 'user' },
        })}\n`,
      );
      fs.writeFileSync(
        path.join(root, 'codex', 'session_index.jsonl'),
        `${JSON.stringify({ id: parent, thread_name: '继续路由呈现维度监督交付' })}\n`,
      );
      const now = new Date();
      fs.utimesSync(claudeFile, now, now);
      fs.utimesSync(path.join(grokSess, 'summary.json'), now, now);
      fs.utimesSync(parentFile, now, now);

      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [
          { id: 'claude-default', tool: 'claude', label: 'Claude', home: path.join(root, 'claude') },
          { id: 'grok-build', tool: 'grok', label: 'Grok', home: path.join(root, 'grok') },
          { id: 'codex-personal', tool: 'codex', label: 'Codex', home: path.join(root, 'codex') },
        ],
      });
      const grok = runs.find((r) => r.tool === 'Grok');
      assert.equal(runs.filter((r) => !r.spawned).map((r) => `${r.tool}:${r.title}`).sort().join(','), 'Claude:项目优化完善 review,Codex:继续路由呈现维度监督交付');
      assert.equal(grok?.spawned, true);
      assert.match(grok?.title ?? '', /Local convergence evidence comm/);
      assert.equal(runs.find((r) => r.tool === 'Claude')?.project, 'SayDo');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the latest human prompt time, not file birth or injected context', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-codex-ask-'));
    try {
      const day = path.join(root, 'sessions', '2026', '09', '04');
      fs.mkdirSync(day, { recursive: true });
      const id = '01f06a82-e249-7020-850f-3e33c738459b';
      const file = path.join(day, `rollout-2026-09-04T10-00-00-${id}.jsonl`);
      const firstAsk = new Date(Date.now() - 40 * 60_000).toISOString();
      const latestAsk = new Date(Date.now() - 3 * 60_000).toISOString();
      const injected = new Date(Date.now() - 30_000).toISOString();
      fs.writeFileSync(
        file,
        [
          JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/Users/me/WorkSpace/Aindle', thread_source: 'user' } }),
          JSON.stringify({
            timestamp: firstAsk,
            type: 'event_msg',
            payload: { type: 'user_message', message: '第一次提问，不要用这个时间' },
          }),
          JSON.stringify({
            timestamp: latestAsk,
            type: 'event_msg',
            payload: { type: 'user_message', message: '这是最新一次用户提问' },
          }),
          JSON.stringify({
            timestamp: injected,
            type: 'response_item',
            payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# Files mentioned by the user:\n## foo.ts' }] },
          }),
          JSON.stringify({
            timestamp: injected,
            type: 'response_item',
            payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<in-app-browser-context source="ambient-ui-state">x</in-app-browser-context>' }] },
          }),
        ].join('\n') + '\n',
      );
      const now = new Date();
      fs.utimesSync(file, now, now);
      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex', home: root }],
      });
      assert.equal(runs.length, 1);
      const started = Date.parse(runs[0]?.startedAt ?? '');
      const want = Date.parse(latestAsk);
      assert.ok(Number.isFinite(started));
      assert.ok(Math.abs(started - want) < 1000, `startedAt ${runs[0]?.startedAt} want ${latestAsk}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses Claude origin=human time and ignores task-notification', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-claude-ask-'));
    try {
      const proj = path.join(root, 'projects', '-Users-me-WorkSpace-Aindle');
      fs.mkdirSync(proj, { recursive: true });
      const file = path.join(proj, 'sess.jsonl');
      const latestAsk = new Date(Date.now() - 2 * 60_000).toISOString();
      fs.writeFileSync(
        file,
        [
          JSON.stringify({
            type: 'user',
            timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
            origin: { kind: 'human' },
            message: { content: '第一次提问' },
          }),
          JSON.stringify({
            type: 'user',
            timestamp: new Date(Date.now() - 20_000).toISOString(),
            origin: { kind: 'task-notification' },
            message: { content: '<task-notification>subagent done</task-notification>' },
          }),
          JSON.stringify({
            type: 'user',
            timestamp: latestAsk,
            origin: { kind: 'human' },
            message: { content: '最新一次用户提问' },
          }),
        ].join('\n') + '\n',
      );
      fs.utimesSync(file, new Date(), new Date());
      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'claude-default', tool: 'claude', label: 'Claude', home: root }],
      });
      assert.equal(runs.length, 1);
      const started = Date.parse(runs[0]?.startedAt ?? '');
      assert.ok(Math.abs(started - Date.parse(latestAsk)) < 1000);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses Grok user_message_chunk time and ignores CLI turn_started', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-grok-ask-'));
    try {
      const sess = path.join(
        root,
        'sessions',
        '%2FUsers%2Fme%2FWorkSpace%2FAindle',
        '01a06cf4-102a-7620-ada9-1b2a9e358962',
      );
      fs.mkdirSync(sess, { recursive: true });
      const firstAsk = Math.floor((Date.now() - 40 * 60_000) / 1000);
      const latestAsk = Math.floor((Date.now() - 3 * 60_000) / 1000);
      const cliAsk = Math.floor((Date.now() - 20_000) / 1000);
      fs.writeFileSync(
        path.join(sess, 'summary.json'),
        JSON.stringify({ generated_title: 'Repair B1 gate forgery', session_kind: 'interactive' }),
      );
      fs.writeFileSync(
        path.join(sess, 'events.jsonl'),
        `${JSON.stringify({ ts: new Date(cliAsk * 1000).toISOString(), type: 'turn_started', turn_number: 1 })}\n`,
      );
      fs.writeFileSync(
        path.join(sess, 'updates.jsonl'),
        [
          JSON.stringify({
            timestamp: firstAsk,
            method: 'session/update',
            params: {
              update: {
                sessionUpdate: 'user_message_chunk',
                content: { type: 'text', text: '第一次提问，不要用这个时间' },
              },
            },
          }),
          JSON.stringify({
            timestamp: latestAsk,
            method: 'session/update',
            params: {
              update: {
                sessionUpdate: 'user_message_chunk',
                content: { type: 'text', text: '这是最新一次用户提问' },
              },
            },
          }),
          JSON.stringify({
            timestamp: cliAsk,
            method: 'session/update',
            params: {
              update: {
                sessionUpdate: 'user_message_chunk',
                content: { type: 'text', text: '<system-reminder>\nBackground task completed\n</system-reminder>' },
              },
            },
          }),
          JSON.stringify({
            timestamp: cliAsk,
            method: '_x.ai/session/update',
            params: {
              update: { sessionUpdate: 'hook_execution', event_name: 'user_prompt_submit', prompt_id: 'task-completed-call-1' },
            },
          }),
        ].join('\n') + '\n',
      );
      const now = new Date();
      fs.utimesSync(path.join(sess, 'updates.jsonl'), now, now);
      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'grok-build', tool: 'grok', label: 'Grok', home: root }],
      });
      assert.equal(runs.length, 1);
      const started = Date.parse(runs[0]?.startedAt ?? '');
      assert.ok(Math.abs(started - latestAsk * 1000) < 2000, `startedAt ${runs[0]?.startedAt} want ${new Date(latestAsk * 1000).toISOString()}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the first user prompt when Codex has no thread name', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aindle-codex-prompt-'));
    try {
      const day = path.join(root, 'sessions', '2026', '09', '04');
      fs.mkdirSync(day, { recursive: true });
      const id = '01e06a82-e249-7020-850f-3e33c738459b';
      const file = path.join(day, `rollout-2026-09-04T11-00-00-${id}.jsonl`);
      fs.writeFileSync(
        file,
        `${JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/Users/me/WorkSpace/Octoooo', thread_source: 'user' } })}\n${JSON.stringify({
          type: 'event_msg',
          payload: { type: 'user_message', message: '# S2 c2 ordinal 1：零上下文独立 readback\n\n你是全新的零上下文 reviewer' },
        })}\n`,
      );
      const now = new Date();
      fs.utimesSync(file, now, now);
      const runs = collectRuns({
        host: { id: 't', label: 't' },
        subscriptions: [{ id: 'codex-personal', tool: 'codex', label: 'Codex', home: root }],
      });
      assert.equal(runs.length, 1);
      assert.match(runs[0]?.title ?? '', /零上下文独立 readback/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
