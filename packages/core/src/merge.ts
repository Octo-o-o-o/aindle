import {
  IngestReport,
  Snapshot,
  assertNoSecrets,
  type Host,
  type Run,
  type Subscription,
} from './schema.js';
import { SNAPSHOT_SCHEMA } from './schema.js';

export interface HubConfig {
  id: string;
  label: string;
  staleAfterMs?: number;
  monitorPeriod?: string;
}

const DEFAULT_STALE_MS = 5 * 60 * 1000;

const CONF_RANK: Record<string, number> = {
  live: 5,
  cached: 4,
  stale: 3,
  error: 2,
  none: 1,
};

function pickBetterSub(a: Subscription, b: Subscription): Subscription {
  const ra = CONF_RANK[a.confidence] ?? 0;
  const rb = CONF_RANK[b.confidence] ?? 0;
  if (rb > ra) return b;
  if (ra > rb) return a;
  const aw = a.windows.length;
  const bw = b.windows.length;
  return bw > aw ? b : a;
}

function mergeSubscriptions(reports: IngestReport[]): Subscription[] {
  const byId = new Map<string, Subscription>();
  for (const report of reports) {
    for (const sub of report.subscriptions) {
      const prev = byId.get(sub.id);
      if (!prev) {
        byId.set(sub.id, { ...sub, hostIds: [report.host.id] });
        continue;
      }
      const merged = pickBetterSub(prev, sub);
      const hostIds = new Set([...(prev.hostIds ?? []), report.host.id]);
      byId.set(sub.id, { ...merged, hostIds: [...hostIds] });
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

function mergeRuns(reports: IngestReport[]): Run[] {
  const byId = new Map<string, Run>();
  for (const report of reports) {
    for (const run of report.runs) {
      const prev = byId.get(run.id);
      if (!prev) {
        byId.set(run.id, run);
        continue;
      }
      const prevAt = Date.parse(prev.lastActivityAt ?? prev.startedAt ?? '') || 0;
      const nextAt = Date.parse(run.lastActivityAt ?? run.startedAt ?? '') || 0;
      if (nextAt >= prevAt) byId.set(run.id, run);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.lastActivityAt ?? a.startedAt ?? '') || 0;
    const tb = Date.parse(b.lastActivityAt ?? b.startedAt ?? '') || 0;
    return tb - ta;
  });
}

export function mergeReports(
  reports: IngestReport[],
  hub: HubConfig,
  now = new Date(),
): Snapshot {
  const staleAfterMs = hub.staleAfterMs ?? DEFAULT_STALE_MS;
  const nowMs = now.getTime();

  const hosts: Host[] = reports.map((report) => {
    const seenMs = Date.parse(report.reportedAt) || nowMs;
    const ageMs = Math.max(0, nowMs - seenMs);
    const status = ageMs > staleAfterMs ? 'stale' : 'ok';
    return {
      id: report.host.id,
      label: report.host.label,
      os: report.host.os,
      seenAt: report.reportedAt,
      status,
      stats: report.stats,
    };
  });

  hosts.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));

  const staleHosts = hosts.filter((h) => h.status === 'stale').map((h) => h.id);
  const oldestHostMs =
    hosts.length === 0
      ? 0
      : Math.max(
          ...hosts.map((h) => Math.max(0, nowMs - (Date.parse(h.seenAt) || nowMs))),
        );

  const snapshot: Snapshot = {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: now.toISOString(),
    hub: { id: hub.id, label: hub.label },
    freshness: { oldestHostMs, staleHosts },
    hosts,
    subscriptions: mergeSubscriptions(reports),
    runs: mergeRuns(reports),
    monitorPeriod: hub.monitorPeriod ?? '1h',
  };

  assertNoSecrets(snapshot);
  return snapshot;
}

export function formatSeenAgo(iso: string, now = new Date()): string {
  const ms = now.getTime() - (Date.parse(iso) || now.getTime());
  if (ms < 0) return '刚刚';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  return `${hr} 小时前`;
}

export function folderLabel(project?: string): string {
  const raw = String(project ?? '').trim();
  if (!raw) return 'No Folder';
  let s = raw;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  s = s.replace(/\\/g, '/').replace(/\/+$/, '');
  const leaf = s.split('/').filter(Boolean).pop() ?? s;
  if (leaf.includes('-') && /Users|home|WorkSpace|workspace/i.test(leaf) && !leaf.includes('/')) {
    const parts = leaf.replace(/^-+/, '').split('-').filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return leaf || 'No Folder';
}

export function foldSpawnedRuns<T extends { spawned?: boolean }>(runs: T[]): T[] {
  return runs.filter((r) => !r.spawned);
}

export function formatResetAt(iso: string | undefined, now = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${weekdays[d.getDay()]} ${hh}:${mm}`;
}

export function formatDurationAgo(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}小时${m}分前` : `${h}小时前`;
  if (m > 0) return s > 0 ? `${m}分${s}秒前` : `${m}分前`;
  return `${s}秒前`;
}

export function formatRunElapsed(
  run: { startedAt?: string; lastActivityAt?: string; state?: string },
  now = new Date(),
): string {
  const start = Date.parse(run.startedAt ?? run.lastActivityAt ?? '');
  if (!Number.isFinite(start)) return '0秒前';
  const active = run.state === 'active' || run.state === 'wait' || run.state === 'idle';
  const end = active ? now.getTime() : Date.parse(run.lastActivityAt ?? run.startedAt ?? '') || now.getTime();
  return formatDurationAgo((end - start) / 1000);
}

export function formatRunEnded(
  run: { lastActivityAt?: string; startedAt?: string },
  now = new Date(),
): string {
  return formatResetAt(run.lastActivityAt ?? run.startedAt, now);
}

export function subscriptionLane(sub: Subscription): {
  source: 'local' | 'relay';
  scope?: 'admin' | 'user' | 'people';
  kind: 'quota' | 'site' | 'account' | 'member' | 'key' | 'spend';
} {
  const source: 'local' | 'relay' =
    sub.source ?? (sub.tool === 'Sub2API' || sub.tool === 'sub2api' ? 'relay' : 'local');
  if (source === 'local') {
    return { source, kind: sub.kind === 'quota' || !sub.kind ? 'quota' : sub.kind };
  }
  if (sub.scope === 'people' || sub.kind === 'member' && sub.scope !== 'user') {
    return { source, scope: 'people', kind: 'member' };
  }
  if (sub.scope === 'admin' || sub.kind === 'site' || sub.kind === 'account' || sub.plan === 'admin') {
    const kind = sub.kind === 'account' || (sub.kind !== 'site' && sub.plan && sub.plan !== 'admin')
      ? 'account'
      : 'site';
    return { source, scope: 'admin', kind };
  }
  if (sub.scope === 'user' || sub.kind === 'member' || sub.kind === 'key' || sub.kind === 'spend' || sub.plan === 'user') {
    const kind = sub.kind === 'key' || sub.kind === 'spend' ? sub.kind : 'member';
    return { source, scope: 'user', kind };
  }
  return { source, scope: 'admin', kind: sub.kind ?? 'account' };
}

function personName(sub: Subscription): string {
  if (sub.plan && sub.plan !== 'admin' && sub.plan !== 'user' && sub.plan !== 'Sub2API') {
    return sub.plan;
  }
  const head = (sub.label ?? '').split(' · ')[0]?.trim();
  return head || '';
}

const PLAN_NAMES: Record<string, string> = {
  LEVEL_INTERMEDIATE: '进阶',
  LEVEL_BASIC: '基础',
  LEVEL_FREE: 'Free',
  LEVEL_PRO: 'Pro',
  LEVEL_PREMIUM: 'Premium',
  TYPE_PURCHASE: '订阅',
  TYPE_PRO: 'Pro',
  TYPE_FREE: 'Free',
  TYPE_ENTERPRISE: '企业',
  TYPE_TEAM: 'Team',
};

function prettyPlan(plan?: string): string | undefined {
  if (!plan) return undefined;
  return PLAN_NAMES[plan] ?? plan;
}

function displayTool(sub: Subscription, lane: ReturnType<typeof subscriptionLane>): string {
  if (lane.source === 'relay') {
    if (lane.kind === 'site') return '全站';
    if (lane.kind === 'member') {
      const name = personName(sub);
      if (lane.scope === 'people') return name || '用户';
      return '我的';
    }
    if (lane.kind === 'key') return personName(sub) || prettyPlan(sub.plan) || 'Key';
    if (lane.kind === 'spend') return prettyPlan(sub.plan) || sub.tool || '平台';
    if (lane.kind === 'account') {
      const plan = prettyPlan(sub.plan);
      return plan && plan !== 'admin' ? plan : '账号';
    }
    return '中转';
  }
  const plan = prettyPlan(sub.plan);
  return plan ? `${sub.tool} ${plan}` : sub.tool;
}

export function snapshotToViewModel(snapshot: Snapshot, now = new Date()) {
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('zh-CN', { weekday: 'short', month: 'short', day: 'numeric' });

  const activeStates = new Set(['active', 'wait', 'idle']);
  const recentCutoff = now.getTime() - 60 * 60 * 1000;

  const hosts = snapshot.hosts.map((h) => {
    const hostRuns = snapshot.runs.filter((r) => r.hostId === h.id);
    const live = foldSpawnedRuns(hostRuns.filter((r) => activeStates.has(r.state))).length;
    const wait = hostRuns.filter((r) => r.state === 'wait').length;
    return {
      id: h.id,
      name: h.label,
      short: h.label.split(' ').pop()?.slice(0, 4) ?? h.id.slice(0, 4),
      role: h.id === snapshot.hub.id ? `HOST · HUB` : `HOST · ${h.id.toUpperCase()}`,
      ok: h.status === 'ok' ? 1 : 0,
      seen: formatSeenAgo(h.seenAt, now),
      live,
      wait,
      tokens: h.stats?.tokensToday ?? '—',
      sessions: h.stats?.sessionsToday ?? 0,
    };
  });

  const KIND_RANK: Record<string, number> = {
    site: 0,
    account: 1,
    member: 2,
    spend: 3,
    key: 4,
    quota: 5,
  };

  const subs = snapshot.subscriptions
    .map((s) => {
      const lane = subscriptionLane(s);
      const base = {
        id: s.id,
        tool: displayTool(s, lane),
        label: s.label,
        source: lane.source,
        scope: lane.scope ?? '',
        kind: lane.kind,
        breakdown: s.breakdown,
      };
      if (s.confidence === 'error') {
        return { ...base, none: 1 as const, error: 1 as const };
      }
      if (s.confidence === 'none' || s.windows.length === 0) {
        return { ...base, none: 1 as const };
      }
      return {
        ...base,
        windows: s.windows.map((w) => ({
          key: w.key,
          pct: Math.round(w.pct),
          reset: formatResetAt(w.resetsAt, now),
        })),
      };
    })
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === 'local' ? -1 : 1;
      if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
      const ra = KIND_RANK[a.kind] ?? 9;
      const rb = KIND_RANK[b.kind] ?? 9;
      if (ra !== rb) return ra - rb;
      if (a.scope === 'people' && b.scope === 'people') {
        const recency = (label: string) => {
          if (/今日 \$[1-9]|今日 \$\d+\.\d*[1-9]/.test(label)) return 0;
          if (/上次 今日/.test(label)) return 1;
          if (/上次 昨天/.test(label)) return 2;
          return 3;
        };
        const da = recency(a.label);
        const db = recency(b.label);
        if (da !== db) return da - db;
      }
      return a.label.localeCompare(b.label, 'zh-CN');
    });

  const lanes = {
    local: subs.filter((s) => s.source === 'local').length,
    relayAdmin: subs.filter((s) => s.source === 'relay' && s.scope === 'admin').length,
    relayUser: subs.filter((s) => s.source === 'relay' && s.scope === 'user').length,
    relayPeople: subs.filter((s) => s.source === 'relay' && s.scope === 'people').length,
  };

  const tagFor = (state: string) => {
    if (state === 'active') return 'ACTIVE';
    if (state === 'wait') return 'WAIT';
    if (state === 'idle') return 'IDLE';
    if (state === 'fail') return 'FAIL';
    return 'DONE';
  };

  const toViewRun = (r: (typeof snapshot.runs)[number]) => ({
    tag: tagFor(r.state),
    title: r.title,
    tool: r.tool,
    folder: folderLabel(r.project),
    detail: r.detail ?? `${r.tool} · ${r.hostId}`,
    elapsed: formatRunElapsed(r, now),
    ended: formatRunEnded(r, now),
  });

  const liveAll = snapshot.runs.filter((r) => activeStates.has(r.state));
  const liveMain = foldSpawnedRuns(liveAll);
  const nowRuns = liveMain.slice(0, 12).map(toViewRun);

  const recentAll = snapshot.runs.filter((r) => {
    if (activeStates.has(r.state)) return false;
    const t = Date.parse(r.lastActivityAt ?? r.startedAt ?? '') || 0;
    return t >= recentCutoff;
  });
  const recentRuns = foldSpawnedRuns(recentAll).slice(0, 12).map(toViewRun);

  return {
    time,
    date,
    hub: snapshot.hub.label,
    hosts,
    subs,
    lanes,
    now: nowRuns,
    recent: recentRuns,
    nowMain: liveMain.length,
    nowTotal: liveAll.length,
    generatedAt: snapshot.generatedAt,
    staleHosts: snapshot.freshness.staleHosts,
  };
}

export type ViewModel = ReturnType<typeof snapshotToViewModel>;
