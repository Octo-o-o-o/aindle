import { INGEST_SCHEMA, type IngestReport, type Snapshot } from './schema.js';
import { mergeReports } from './merge.js';

export function buildMockIngest(hostId = 'mbp'): IngestReport {
  const now = new Date();
  const iso = (offsetMin: number) => new Date(now.getTime() - offsetMin * 60_000).toISOString();

  return {
    schema: INGEST_SCHEMA,
    host: { id: hostId, label: 'MacBook Pro', os: 'darwin' },
    reportedAt: now.toISOString(),
    stats: {
      liveRuns: 2,
      waitRuns: 1,
      sessionsToday: 7,
      tokensToday: '41.8M',
    },
    subscriptions: [
      {
        id: 'claude-home',
        tool: 'Claude',
        plan: 'Max',
        label: 'Claude · Home',
        shared: true,
        source: 'local',
        kind: 'quota',
        confidence: 'live',
        windows: [
          { key: '5h', pct: 62, resetsAt: new Date(now.getTime() + 2 * 3600_000).toISOString() },
          { key: '7d', pct: 41, resetsAt: new Date(now.getTime() + 3 * 86400_000).toISOString() },
        ],
      },
      {
        id: 'codex-personal',
        tool: 'Codex',
        plan: 'Plus',
        label: '个人 · MBP',
        source: 'local',
        kind: 'quota',
        confidence: 'live',
        windows: [
          { key: '5h', pct: 81, resetsAt: new Date(now.getTime() + 3600_000).toISOString() },
          { key: '7d', pct: 55, resetsAt: new Date(now.getTime() + 2 * 86400_000).toISOString() },
        ],
      },
      {
        id: 'glm-relay',
        tool: 'GLM',
        label: '第三方 · 无限额条',
        source: 'local',
        kind: 'quota',
        confidence: 'none',
        windows: [],
      },
      {
        id: 'sub2api-site',
        tool: 'Sub2API',
        plan: 'admin',
        label: '全站 · 8 账号 · 累计 $1280 · 今日 $12',
        source: 'relay',
        scope: 'admin',
        kind: 'site',
        shared: true,
        confidence: 'none',
        windows: [],
      },
      {
        id: 'sub2api-anthropic',
        tool: 'Sub2API',
        plan: 'anthropic',
        label: 'anthropic · account-a',
        source: 'relay',
        scope: 'admin',
        kind: 'account',
        shared: true,
        confidence: 'live',
        windows: [
          { key: '5h', pct: 12, resetsAt: new Date(now.getTime() + 4 * 3600_000).toISOString() },
          { key: '7d', pct: 44, resetsAt: new Date(now.getTime() + 4 * 86400_000).toISOString() },
        ],
      },
      {
        id: 'sub2api-me',
        tool: 'Sub2API',
        plan: 'user',
        label: 'demo-user · 累计 $86 · 今日 $1.20 · 2 keys',
        source: 'relay',
        scope: 'user',
        kind: 'member',
        confidence: 'none',
        windows: [],
      },
      {
        id: 'sub2api-user-a',
        tool: 'Sub2API',
        plan: 'alice',
        label: '累计 $40 · 今日 $0 · 上次昨天',
        source: 'relay',
        scope: 'people',
        kind: 'member',
        confidence: 'none',
        windows: [],
        breakdown: {
          userId: 9,
          todayCount: 0,
          days: [
            { date: '2026-09-03', cost: 12.4, requests: 18 },
            { date: '2026-09-04', cost: 0, requests: 0 },
          ],
          today: [],
        },
      },
    ],
    runs: [
      {
        id: 'r-active-1',
        hostId,
        subscriptionId: 'claude-home',
        tool: 'Claude',
        title: 'Aindle Stage 1',
        project: 'Aindle',
        state: 'active',
        startedAt: iso(16),
        lastActivityAt: iso(0),
        detail: 'Claude · Home · MBP · 16 min',
        initiator: 'human',
        initiatorConfidence: 'direct',
        stateConfidence: 'derived',
      },
      {
        id: 'r-wait-1',
        hostId,
        tool: 'Codex',
        title: 'Windows agent 骨架',
        state: 'wait',
        lastActivityAt: iso(3),
        detail: '等待提问',
        initiator: 'human',
        initiatorConfidence: 'direct',
        stateConfidence: 'direct',
        waitReason: 'needs_input',
      },
      {
        id: 'r-done-1',
        hostId,
        tool: 'Claude',
        title: '生成实施 prompt',
        state: 'done',
        lastActivityAt: iso(8),
        detail: 'Claude · Home · MBP · 8 min ago',
        initiator: 'human',
        initiatorConfidence: 'direct',
        stateConfidence: 'derived',
      },
    ],
  };
}

export function buildMockSnapshot(): Snapshot {
  return mergeReports([buildMockIngest()], { id: 'mini', label: 'Mac mini' });
}
