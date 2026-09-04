import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageBreakdown, UsageEvent, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';

interface UsageProgress {
  utilization?: number;
  used_percent?: number;
  resets_at?: string | null;
}

interface AccountRow {
  id?: number;
  name?: string;
  platform?: string;
  status?: string;
  schedulable?: boolean;
  notes?: string | null;
  quota?: number;
  quota_used?: number;
  last_used_at?: string | null;
  extra?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
}

interface PlatformQuota {
  platform?: string;
  daily_limit_usd?: number | null;
  weekly_limit_usd?: number | null;
  monthly_limit_usd?: number | null;
  daily_usage_usd?: number;
  weekly_usage_usd?: number;
  monthly_usage_usd?: number;
  daily_window_resets_at?: string | null;
  weekly_window_resets_at?: string | null;
  monthly_window_resets_at?: string | null;
}

function readSecretFile(filePath?: string): string | null {
  if (!filePath) return null;
  const p = expandHome(filePath);
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8').trim();
  return text || null;
}

function cacheDir(): string {
  const dir = path.join(os.homedir(), '.config', 'sub2api');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function jwtCachePath(entry: RegistrySubscription): string {
  const key = (entry.email ?? entry.id).replace(/[^a-zA-Z0-9.@_-]/g, '_');
  return path.join(cacheDir(), `.jwt-${key}.json`);
}

function loadCachedJwt(entry: RegistrySubscription): string | null {
  const p = jwtCachePath(entry);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as { token?: string; exp?: number };
    if (!raw.token || !raw.exp) return null;
    if (Date.now() > raw.exp - 60_000) return null;
    return raw.token;
  } catch {
    return null;
  }
}

function saveCachedJwt(entry: RegistrySubscription, token: string, expiresInSec: number): void {
  const exp = Date.now() + Math.max(60, expiresInSec) * 1000;
  fs.writeFileSync(jwtCachePath(entry), `${JSON.stringify({ token, exp })}\n`, { mode: 0o600 });
}

async function login(base: string, entry: RegistrySubscription): Promise<string | null> {
  const cached = loadCachedJwt(entry);
  if (cached) return cached;

  const email = entry.email?.trim() || process.env.AINDLE_SUB2API_EMAIL?.trim();
  const password =
    process.env.AINDLE_SUB2API_PASSWORD?.trim() || readSecretFile(entry.passwordFile);
  if (!email || !password) return null;

  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: { access_token?: string; expires_in?: number };
  };
  const token = body.data?.access_token?.trim();
  if (!token) return null;
  saveCachedJwt(entry, token, Number(body.data?.expires_in) || 3600);
  return token;
}

async function resolveAuth(
  base: string,
  entry: RegistrySubscription,
): Promise<Record<string, string> | null> {
  const admin = process.env.AINDLE_SUB2API_ADMIN_KEY?.trim() || readSecretFile(entry.adminKeyFile);
  if (admin) return { 'x-api-key': admin, Accept: 'application/json' };

  const jwt =
    process.env.AINDLE_SUB2API_JWT?.trim() ||
    readSecretFile(entry.jwtFile) ||
    (await login(base, entry));
  if (jwt) return { Authorization: `Bearer ${jwt}`, Accept: 'application/json' };
  return null;
}

function pushWindow(out: UsageWindow[], key: string, pctRaw: unknown, resetRaw?: unknown): void {
  const pct = clampPercent(pctRaw);
  if (pct === null) return;
  const w: UsageWindow = { key, pct };
  const reset = normalizeResetAt(resetRaw);
  if (reset) w.resetsAt = reset;
  out.push(w);
}

function progressPct(w: UsageProgress | null | undefined): number | null {
  if (!w) return null;
  const raw = w.utilization ?? w.used_percent;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n > 0 && n <= 1 ? n * 100 : n;
}

function windowsFromUsage(usage: AccountRow['usage'] | undefined): UsageWindow[] {
  const out: UsageWindow[] = [];
  const u = usage ?? {};
  const map: Array<[string, string]> = [
    ['five_hour', '5h'],
    ['seven_day', '7d'],
    ['seven_day_fable', 'Fable'],
    ['seven_day_sonnet', 'Sonnet'],
    ['seven_day_opus', 'Opus'],
  ];
  for (const [src, key] of map) {
    const w = asRecord(u[src]);
    pushWindow(out, key, progressPct(w as UsageProgress), w?.resets_at);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extraHasWindowHints(extra: Record<string, unknown> | null | undefined): boolean {
  if (!extra) return false;
  return Object.keys(extra).some((k) =>
    /used_percent|utilization|billing_snapshot/i.test(k),
  );
}

function windowsFromExtra(extra: Record<string, unknown> | null | undefined): UsageWindow[] {
  const out: UsageWindow[] = [];
  if (!extra) return out;
  const pairs: Array<[string, string, string]> = [
    ['kimi_5h_used_percent', 'kimi_5h_reset_at', '5h'],
    ['kimi_weekly_used_percent', 'kimi_weekly_reset_at', '7d'],
    ['zhipu_5h_used_percent', 'zhipu_5h_reset_at', '5h'],
    ['zhipu_weekly_used_percent', 'zhipu_weekly_reset_at', '7d'],
    ['codex_5h_used_percent', 'codex_5h_reset_at', '5h'],
    ['codex_7d_used_percent', 'codex_7d_reset_at', '7d'],
  ];
  for (const [pctKey, resetKey, label] of pairs) {
    if (extra[pctKey] == null) continue;
    pushWindow(out, label, extra[pctKey], extra[resetKey]);
  }
  const grok = asRecord(extra.grok_billing_snapshot);
  if (grok && extra.kimi_weekly_used_percent == null) {
    if (!out.some((w) => w.key === '7d') && grok.usage_percent != null) {
      pushWindow(out, '7d', grok.usage_percent, grok.period_end ?? grok.weekly_updated_at);
    }
  }
  if (!out.some((w) => w.key === '5h') && extra.session_window_utilization != null) {
    const raw = Number(extra.session_window_utilization);
    pushWindow(out, '5h', raw > 0 && raw <= 1 ? raw * 100 : raw);
  }
  if (!out.some((w) => w.key === '7d') && extra.passive_usage_7d_utilization != null) {
    const raw = Number(extra.passive_usage_7d_utilization);
    pushWindow(out, '7d', raw > 0 && raw <= 1 ? raw * 100 : raw, extra.passive_usage_7d_reset);
  }
  return out;
}

function mergeWindows(primary: UsageWindow[], fallback: UsageWindow[]): UsageWindow[] {
  const seen = new Set(primary.map((w) => w.key));
  return [...primary, ...fallback.filter((w) => !seen.has(w.key))];
}

function windowsFromAccount(acc: AccountRow): UsageWindow[] {
  const fromUsage = windowsFromUsage(acc.usage);
  const fromExtra = windowsFromExtra(acc.extra);
  const out = mergeWindows(fromUsage, fromExtra);
  const quota = Number(acc.quota);
  const used = Number(acc.quota_used);
  if (Number.isFinite(quota) && quota > 0 && Number.isFinite(used)) {
    pushWindow(out, 'Key额度', (used / quota) * 100);
  }
  const models = asRecord(acc.usage?.antigravity_quota);
  if (models) {
    const aliases: Array<[RegExp, string]> = [
      [/gemini-3-flash(?!-)/i, 'G3F'],
      [/gemini-3\.1-pro-high/i, 'G31R'],
      [/claude-sonnet/i, 'Sonnet'],
      [/claude-opus/i, 'Opus'],
    ];
    for (const [re, label] of aliases) {
      for (const [name, raw] of Object.entries(models)) {
        if (!re.test(name)) continue;
        const row = asRecord(raw);
        const pct = progressPct(row as UsageProgress);
        if (pct == null || pct <= 0) continue;
        pushWindow(out, label, pct, row?.reset_time);
      }
    }
  }
  return out;
}

function compact(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function formatWhen(raw: unknown): string {
  const iso = normalizeResetAt(raw);
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `今日 ${hh}:${mm}`;
  const yesterday = new Date(now.getTime() - 86400_000);
  const isY =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isY) return `昨天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function shanghaiDate(offsetDays = 0): string {
  const ms = Date.now() + offsetDays * 86400_000;
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function accountState(acc: AccountRow): string {
  if (acc.schedulable === false) return '暂停';
  if (acc.status && acc.status !== 'active') return acc.status;
  return '';
}

function accountLabel(acc: AccountRow): string {
  const bits = [String(acc.name ?? acc.id ?? 'account').trim() || 'account'];
  const state = accountState(acc);
  if (state) bits[0] += ` · ${state}`;
  const seven = asRecord(acc.usage?.seven_day as unknown);
  const stats = asRecord(seven?.window_stats);
  if (stats && (stats.requests || stats.cost)) {
    bits.push(`${compact(stats.requests)} 次 · ${money(stats.cost)}`);
  }
  if (acc.last_used_at) bits.push(`上次 ${formatWhen(acc.last_used_at)}`);
  return bits.join(' · ');
}

function recentlyUsed(raw: unknown, withinDays: number): boolean {
  const iso = normalizeResetAt(raw);
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t <= withinDays * 86400_000;
}

function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1000) return `$${Math.round(v)}`;
  if (v >= 10) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

function fail(entry: RegistrySubscription, message: string): Subscription[] {
  const scope = entry.mode === 'admin' ? 'admin' : 'user';
  return [
    {
      id: entry.id,
      tool: 'Sub2API',
      label: `${entry.label} · ${message}`,
      plan: scope,
      source: 'relay',
      scope,
      kind: scope === 'admin' ? 'site' : 'member',
      windows: [],
      confidence: 'error',
    },
  ];
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function unwrapData(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: unknown }).data;
  }
  return body;
}

function parseDays(trend: unknown): NonNullable<UsageBreakdown['days']> {
  if (!Array.isArray(trend)) return [];
  const out: NonNullable<UsageBreakdown['days']> = [];
  for (const row of trend.slice(-7)) {
    const d = asRecord(row);
    if (!d?.date) continue;
    out.push({
      date: String(d.date),
      cost: Number(d.actual_cost ?? d.cost) || 0,
      requests: Number(d.requests) || 0,
    });
  }
  return out;
}

function parseTodayEvents(items: unknown): UsageEvent[] {
  if (!Array.isArray(items)) return [];
  const groups = new Map<string, UsageEvent>();
  for (const raw of items) {
    const row = asRecord(raw);
    if (!row) continue;
    const acc = asRecord(row.account);
    const key = asRecord(row.api_key);
    const via = [acc?.name, typeof key?.name === 'string' ? key.name : '']
      .filter((x) => typeof x === 'string' && x)
      .join(' · ');
    const at = String(row.created_at ?? '');
    const model = String(row.model ?? '').trim() || 'model';
    if (!at) continue;
    const id = `${model}\n${via}`;
    const prev = groups.get(id);
    const cost = Number(row.actual_cost) || 0;
    if (!prev) {
      groups.set(id, { at, model, cost, via: via || undefined, count: 1 });
      continue;
    }
    prev.cost += cost;
    prev.count = (prev.count ?? 1) + 1;
    if (at > prev.at) prev.at = at;
  }
  return [...groups.values()].sort((a, b) => b.cost - a.cost).slice(0, 8);
}

async function fetchUserBreakdown(
  base: string,
  headers: Record<string, string>,
  userId: number,
  today: string,
): Promise<UsageBreakdown> {
  const start = shanghaiDate(-6);
  const [snapRes, todayRes] = await Promise.all([
    getJson(
      `${base}/api/v1/admin/dashboard/snapshot-v2?user_id=${userId}&start_date=${start}&end_date=${today}&granularity=day`,
      headers,
    ),
    getJson(
      `${base}/api/v1/admin/usage?user_id=${userId}&start_date=${today}&end_date=${today}&page=1&page_size=50`,
      headers,
    ),
  ]);
  const snap = snapRes.status === 200 ? asRecord(unwrapData(snapRes.body)) : null;
  const usage = todayRes.status === 200 ? asRecord(unwrapData(todayRes.body)) : null;
  const days = parseDays(snap?.trend);
  const events = parseTodayEvents(usage?.items);
  const todayCount = Number(usage?.total);
  return {
    userId,
    todayCount: Number.isFinite(todayCount) ? todayCount : events.length,
    days,
    today: events,
  };
}

async function collectUser(
  base: string,
  headers: Record<string, string>,
  entry: RegistrySubscription,
): Promise<Subscription[]> {
  const [profileRes, statsRes, quotaRes, keysRes, recentRes] = await Promise.all([
    getJson(`${base}/api/v1/user/profile`, headers),
    getJson(`${base}/api/v1/usage/dashboard/stats`, headers),
    getJson(`${base}/api/v1/user/platform-quotas`, headers),
    getJson(`${base}/api/v1/keys?page=1&page_size=50`, headers),
    getJson(`${base}/api/v1/usage?page=1&page_size=1`, headers),
  ]);
  if (profileRes.status !== 200) return fail(entry, `用户资料 HTTP ${profileRes.status}`);

  const profile = unwrapData(profileRes.body) as {
    id?: number;
    email?: string;
    username?: string;
    role?: string;
    balance?: number;
  };
  const stats = (unwrapData(statsRes.body) ?? {}) as {
    today_actual_cost?: number;
    total_actual_cost?: number;
    today_requests?: number;
    total_requests?: number;
    total_api_keys?: number;
    active_api_keys?: number;
    by_platform?: Array<{
      platform?: string;
      total_actual_cost?: number;
      total_requests?: number;
      today_actual_cost?: number;
    }>;
  };
  const quotas = ((unwrapData(quotaRes.body) as { platform_quotas?: PlatformQuota[] }) ?? {})
    .platform_quotas;
  const keysPayload = unwrapData(keysRes.body) as { items?: Array<Record<string, unknown>> };
  const keys = Array.isArray(keysPayload?.items) ? keysPayload.items : [];

  const recentPayload = unwrapData(recentRes.body) as { items?: Array<Record<string, unknown>> };
  const latest = recentRes.status === 200 && Array.isArray(recentPayload?.items)
    ? recentPayload.items[0]
    : undefined;
  const lastBill = normalizeResetAt(latest?.created_at);
  const todayCost = Number(stats.today_actual_cost) || 0;
  const todayReq = Number(stats.today_requests) || 0;
  const windows: UsageWindow[] = [];
  for (const q of quotas ?? []) {
    const plat = (q.platform ?? 'plat').slice(0, 8);
    if (q.daily_limit_usd && q.daily_limit_usd > 0) {
      pushWindow(windows, `${plat}日`, (Number(q.daily_usage_usd) / q.daily_limit_usd) * 100, q.daily_window_resets_at);
    }
    if (q.weekly_limit_usd && q.weekly_limit_usd > 0) {
      pushWindow(windows, `${plat}周`, (Number(q.weekly_usage_usd) / q.weekly_limit_usd) * 100, q.weekly_window_resets_at);
    }
    if (q.monthly_limit_usd && q.monthly_limit_usd > 0) {
      pushWindow(windows, `${plat}月`, (Number(q.monthly_usage_usd) / q.monthly_limit_usd) * 100, q.monthly_window_resets_at);
    }
  }

  const todayNote =
    todayCost > 0 || todayReq > 0
      ? `今日 ${money(todayCost)} / ${compact(todayReq)} 次`
      : '今日 $0';
  const lastNote = lastBill ? `上次 ${formatWhen(lastBill)}` : '';
  const uid = Number(profile.id);
  const breakdown =
    Number.isFinite(uid) && uid > 0
      ? await fetchUserBreakdown(base, headers, uid, shanghaiDate())
      : undefined;
  const meBits = [`累计 ${money(stats.total_actual_cost)}`, todayNote];
  if (lastNote) meBits.push(lastNote);
  const out: Subscription[] = [
    {
      id: `${entry.id}-me`,
      tool: 'Sub2API',
      label: meBits.join(' · '),
      plan: 'user',
      source: 'relay',
      scope: 'user',
      kind: 'member',
      windows,
      confidence: windows.length ? 'live' : 'none',
      breakdown,
    },
  ];

  const platforms = Array.isArray(stats.by_platform) ? stats.by_platform : [];
  for (const row of platforms) {
    const plat = String(row.platform ?? 'platform');
    const total = Number(row.total_actual_cost) || 0;
    const day = Number(row.today_actual_cost) || 0;
    if (total < 1 && day <= 0) continue;
    const bits = [`累计 ${money(row.total_actual_cost)}`];
    if (day > 0) bits.push(`今日 ${money(day)}`);
    out.push({
      id: `${entry.id}-plat-${plat}`,
      tool: 'Sub2API',
      label: bits.join(' · '),
      plan: plat,
      source: 'relay',
      scope: 'user',
      kind: 'spend',
      windows: [],
      confidence: 'none',
    });
  }

  for (const key of keys) {
    const quota = Number(key.quota);
    const used = Number(key.quota_used);
    const kw: UsageWindow[] = [];
    if (Number.isFinite(quota) && quota > 0 && Number.isFinite(used)) {
      pushWindow(kw, '额度', (used / quota) * 100);
    }
    if (!kw.length && !recentlyUsed(key.last_used_at, 14)) continue;
    const keyName = String(key.name ?? key.id ?? 'Key');
    out.push({
      id: `${entry.id}-key-${key.id}`,
      tool: 'Sub2API',
      label: `上次 ${formatWhen(key.last_used_at)}`,
      plan: keyName,
      source: 'relay',
      scope: 'user',
      kind: 'key',
      windows: kw,
      confidence: kw.length ? 'live' : 'none',
    });
  }
  return out;
}

async function collectAdmin(
  base: string,
  headers: Record<string, string>,
  entry: RegistrySubscription,
): Promise<Subscription[]> {
  const list = await getJson(`${base}/api/v1/admin/accounts?page=1&page_size=50`, headers);
  if (list.status === 403) return fail(entry, '无管理员权限');
  if (list.status !== 200) return fail(entry, `账号列表 HTTP ${list.status}`);

  const payload = unwrapData(list.body) as { items?: AccountRow[]; total?: number };
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const dash = await getJson(`${base}/api/v1/admin/dashboard/snapshot-v2`, headers);
  const stats = ((unwrapData(dash.body) as { stats?: Record<string, unknown> }) ?? {}).stats ?? {};
  const today = shanghaiDate();

  const out: Subscription[] = [
    {
      id: `${entry.id}-station`,
      tool: 'Sub2API',
      label: `${stats.total_accounts ?? rows.length} 账号 · 今日 ${money(stats.today_actual_cost)} / ${compact(stats.today_requests)} 次 · 累计 ${money(stats.total_actual_cost)}`,
      plan: 'admin',
      source: 'relay',
      scope: 'admin',
      kind: 'site',
      shared: true,
      windows: [],
      confidence: 'none',
    },
  ];

  const usages = await Promise.all(
    rows.slice(0, 24).map(async (acc) => {
      if (!acc.id) return acc;
      if (extraHasWindowHints(acc.extra) && /kimi|zhipu/i.test(String(acc.platform ?? ''))) {
        return acc;
      }
      const usage = await getJson(`${base}/api/v1/admin/accounts/${acc.id}/usage`, headers);
      if (usage.status !== 200) return acc;
      const u = unwrapData(usage.body) as AccountRow['usage'];
      return { ...acc, usage: u ?? acc.usage };
    }),
  );

  for (const acc of usages) {
    const windows = windowsFromAccount(acc);
    out.push({
      id: `${entry.id}-${acc.id ?? acc.name ?? out.length}`,
      tool: 'Sub2API',
      label: accountLabel(acc),
      plan: acc.platform,
      source: 'relay',
      scope: 'admin',
      kind: 'account',
      shared: true,
      windows,
      confidence: windows.length ? 'live' : 'none',
    });
  }

  const people = await collectPeople(base, headers, entry, today);
  out.push(...people);
  return out;
}

async function collectPeople(
  base: string,
  headers: Record<string, string>,
  entry: RegistrySubscription,
  today: string,
): Promise<Subscription[]> {
  const list = await getJson(`${base}/api/v1/admin/users?page=1&page_size=50`, headers);
  if (list.status !== 200) return [];
  const payload = unwrapData(list.body) as {
    items?: Array<{
      id?: number;
      email?: string;
      username?: string;
      role?: string;
      status?: string;
      last_used_at?: string | null;
      last_active_at?: string | null;
    }>;
  };
  const users = (payload.items ?? []).filter((u) => u.id && u.email !== 'admin@sub2api.local');

  const rows = await Promise.all(
    users.map(async (user) => {
      const [allRes, breakdown] = await Promise.all([
        getJson(
          `${base}/api/v1/admin/usage/stats?user_id=${user.id}&start_date=2026-01-01&end_date=2099-12-31`,
          headers,
        ),
        fetchUserBreakdown(base, headers, Number(user.id), today),
      ]);
      const all = unwrapData(allRes.body) as {
        total_actual_cost?: number;
        total_requests?: number;
      } | null;
      const day = (breakdown.days ?? []).find((d) => d.date === today);
      return {
        user,
        all: allRes.status === 200 ? all : null,
        day,
        breakdown,
      };
    }),
  );

  rows.sort((a, b) => {
    const ta = Date.parse(a.user.last_used_at ?? '') || 0;
    const tb = Date.parse(b.user.last_used_at ?? '') || 0;
    return tb - ta;
  });

  return rows.map(({ user, all, day, breakdown }) => {
    const name = user.username || user.email || `user-${user.id}`;
    const todayCost = Number(day?.cost) || 0;
    const total = Number(all?.total_actual_cost) || 0;
    if (todayCost <= 0 && total < 1) return null;
    const todayNote = todayCost > 0 ? `今日 ${money(todayCost)} / ${compact(day?.requests)} 次` : '今日 $0';
    return {
      id: `${entry.id}-user-${user.id}`,
      tool: 'Sub2API',
      label: `累计 ${money(all?.total_actual_cost)} · ${todayNote} · 上次 ${formatWhen(user.last_used_at)}`,
      plan: name,
      source: 'relay' as const,
      scope: 'people' as const,
      kind: 'member' as const,
      shared: true,
      windows: [],
      confidence: 'none' as const,
      breakdown,
    };
  }).filter((row): row is NonNullable<typeof row> => row != null);
}

export async function collectSub2Api(entry: RegistrySubscription): Promise<Subscription[]> {
  const raw = (entry.baseUrl ?? process.env.AINDLE_SUB2API_BASE_URL ?? '').trim();
  if (!raw) return fail(entry, '未配置 baseUrl');
  const base = raw.replace(/\/$/, '');
  const mode = (entry.mode ?? 'user').toLowerCase();
  const headers = await resolveAuth(base, entry);
  if (!headers) return fail(entry, '未配置邮箱密码 / JWT / admin key');

  try {
    if (mode === 'admin') return await collectAdmin(base, headers, entry);
    return await collectUser(base, headers, entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)) {
      return fail(entry, '连不上面板（需 SSH 隧道或内网）');
    }
    return fail(entry, msg.slice(0, 40));
  }
}
