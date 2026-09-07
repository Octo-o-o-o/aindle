import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';
import { readSqliteRows } from '../lib/sqlite.js';

// Kiro (kiro.dev) usage via the AWS CodeWhisperer endpoint its IDE calls
// (reverse-engineered, reference: CodexBar docs/kiro.md). The CLI owns the
// token and its refresh — we only read it; when it expires, run kiro-cli
// once so it renews the row we read.
const USAGE_URL = 'https://codewhisperer.us-east-1.amazonaws.com/';
const AMZ_TARGET = 'AmazonCodeWhispererService.GetUsageLimits';
// Key names differ across CLI versions.
const TOKEN_KEYS = ['kirocli:social:token', 'kirocli:odic:token'];

interface KiroAuthRow {
  access_token?: string;
  expires_at?: unknown;
  profile_arn?: string;
}

export function kiroDefaultDbCandidates(opts?: {
  platform?: NodeJS.Platform;
  home?: string;
  env?: NodeJS.ProcessEnv;
}): string[] {
  const platform = opts?.platform ?? process.platform;
  const home = opts?.home ?? os.homedir();
  const env = opts?.env ?? process.env;
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'kiro-cli', 'data.sqlite3')];
  }
  if (platform === 'win32') {
    const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return [
      path.join(roaming, 'kiro-cli', 'data.sqlite3'),
      path.join(local, 'kiro-cli', 'data.sqlite3'),
      path.join(home, '.kiro-cli', 'data.sqlite3'),
      path.join(home, '.local', 'share', 'kiro-cli', 'data.sqlite3'),
    ];
  }
  const xdg = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return [path.join(xdg, 'kiro-cli', 'data.sqlite3'), path.join(home, '.kiro-cli', 'data.sqlite3')];
}

export function kiroDbPath(entry: RegistrySubscription): string {
  if (entry.home) {
    const expanded = expandHome(entry.home);
    if (expanded.endsWith('.sqlite3') || expanded.endsWith('.db') || expanded.endsWith('.sqlite')) {
      return expanded;
    }
    try {
      if (fs.existsSync(expanded) && fs.statSync(expanded).isFile()) return expanded;
    } catch {
      /* treat as directory */
    }
    return path.join(expanded, 'data.sqlite3');
  }
  const candidates = kiroDefaultDbCandidates();
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]!;
}

function readKv(dbPath: string, keys: string[]): string | null {
  for (const kvKey of keys) {
    const rows = readSqliteRows(dbPath, 'SELECT value FROM auth_kv WHERE key = ?', [kvKey]);
    const value = rows[0]?.value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function readKiroAuth(dbPath: string): KiroAuthRow | null {
  const raw = readKv(dbPath, TOKEN_KEYS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KiroAuthRow;
    return parsed?.access_token ? parsed : null;
  } catch {
    return null;
  }
}

export function readKiroProfileArn(dbPath: string): string | null {
  const rows = readSqliteRows(dbPath, "SELECT value FROM state WHERE key = 'api.codewhisperer.profile'", []);
  const value = rows[0]?.value;
  if (typeof value !== 'string') return null;
  try {
    const arn = (JSON.parse(value) as { arn?: string }).arn;
    return typeof arn === 'string' && arn.trim() ? arn.trim() : null;
  } catch {
    return null;
  }
}

export interface KiroUsageLimits {
  currentUsage?: number;
  currentOverages?: number;
  overageCap?: number;
  planLimit?: number;
  nextDateReset?: unknown;
}

function numberOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// The plan limit field name is not documented; probe the usual suspects.
export function windowsFromKiroUsage(body: unknown): UsageWindow[] {
  if (!body || typeof body !== 'object') return [];
  const row = body as Record<string, unknown>;
  const usage = numberOrUndefined(row.currentUsage ?? row.currentUsageWithPrecision);
  const overages = numberOrUndefined(row.currentOverages) ?? 0;
  const limit = numberOrUndefined(
    row.planLimit ?? row.usageLimit ?? row.allowedUsage ?? row.limit ?? row.includedCredits ?? row.entitlement,
  );
  const out: UsageWindow[] = [];
  if (usage !== undefined && limit !== undefined && limit > 0) {
    const pct = clampPercent(((usage - overages) / limit) * 100);
    if (pct !== null) {
      const w: UsageWindow = { key: '月', pct };
      const reset = normalizeResetAt(row.nextDateReset);
      if (reset) w.resetsAt = reset;
      out.push(w);
    }
  }
  const cap = numberOrUndefined(row.overageCap ?? row.overageCapWithPrecision);
  if (overages > 0 && cap !== undefined && cap > 0) {
    const pct = clampPercent((overages / cap) * 100);
    if (pct !== null) out.push({ key: '超额', pct });
  }
  return out;
}

export function kiroUsageLabel(body: unknown): string {
  if (!body || typeof body !== 'object') return '解析失败';
  const row = body as Record<string, unknown>;
  const usage = numberOrUndefined(row.currentUsage ?? row.currentUsageWithPrecision);
  if (usage === undefined) return '解析失败';
  const bits = [`已用 ${usage % 1 === 0 ? usage : usage.toFixed(1)} credits`];
  const reset = normalizeResetAt(row.nextDateReset);
  if (reset) bits.push(`重置 ${new Date(reset).toLocaleDateString('zh-CN')}`);
  return bits.join(' · ');
}

function make(
  entry: RegistrySubscription,
  windows: UsageWindow[],
  label: string,
  confidence: Subscription['confidence'],
): Subscription {
  return {
    id: entry.id,
    tool: 'Kiro',
    label,
    plan: entry.plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectKiro(entry: RegistrySubscription): Promise<Subscription> {
  const key = `kiro:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const dbPath = kiroDbPath(entry);
  const auth = readKiroAuth(dbPath);
  if (!auth) {
    const empty = make(entry, [], '未登录或 kiro-cli 未运行', 'error');
    quotaRemember(key, empty, false);
    return empty;
  }
  const expired = Number(auth.expires_at);
  if (Number.isFinite(expired) && expired > 0 && Date.now() > expired) {
    const stale = cached ?? make(entry, [], 'token 过期，运行 kiro-cli 刷新', 'error');
    quotaRemember(key, stale, false);
    return stale;
  }
  const profileArn = auth.profile_arn ?? readKiroProfileArn(dbPath);
  if (!profileArn) {
    const empty = make(entry, [], '缺少 profileArn', 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  try {
    const res = await fetch(USAGE_URL, {
      method: 'POST',
      headers: {
        'X-Amz-Target': AMZ_TARGET,
        'Content-Type': 'application/x-amz-json-1.0',
        Authorization: `Bearer ${auth.access_token}`,
      },
      body: JSON.stringify({ profileArn }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Kiro token 无效');
    if (!res.ok) throw new Error(`Kiro HTTP ${res.status}`);
    const body = await res.json();
    const windows = windowsFromKiroUsage(body);
    const sub = make(entry, windows, kiroUsageLabel(body), windows.length ? 'live' : 'error');
    quotaRemember(key, sub, windows.length > 0);
    return sub;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = cached ?? make(entry, [], message.slice(0, 24), 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}
