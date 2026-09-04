import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

const AUTH_URL = 'https://auth.kimi.com/api/oauth/token';
const USAGE_URL = 'https://api.kimi.com/coding/v1/usages';
const CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';

interface KimiCreds {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

function kimiHome(entry: RegistrySubscription): string {
  if (entry.home) return expandHome(entry.home);
  const code = path.join(os.homedir(), '.kimi-code');
  if (fs.existsSync(path.join(code, 'credentials', 'kimi-code.json'))) return code;
  return path.join(os.homedir(), '.kimi');
}

function credsPath(home: string): string {
  return path.join(home, 'credentials', 'kimi-code.json');
}

function loadCreds(home: string): KimiCreds | null {
  const p = credsPath(home);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as KimiCreds;
  } catch {
    return null;
  }
}

function expired(creds: KimiCreds, now = Date.now()): boolean {
  const exp = Number(creds.expires_at);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp * 1000 <= now + 30_000;
}

async function refresh(creds: KimiCreds, home: string): Promise<string> {
  const refreshToken = creds.refresh_token?.trim();
  if (!refreshToken) throw new Error('Kimi refresh missing');
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Msh-Platform': 'kimi_cli',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Kimi refresh HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  const access = json.access_token?.trim();
  if (!access) throw new Error('Kimi refresh missing access_token');
  const expiresIn = Number(json.expires_in);
  const next: KimiCreds = {
    ...creds,
    access_token: access,
    refresh_token: json.refresh_token?.trim() || refreshToken,
    expires_at: Date.now() / 1000 + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 900),
  };
  const p = credsPath(home);
  const tmp = `${p}.tmp.${process.pid}`;
  await fs.promises.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.promises.rename(tmp, p);
  return access;
}

const KIMI_PLAN_NAMES: Record<string, string> = {
  TYPE_PURCHASE: '订阅',
  TYPE_PRO: 'Pro',
  TYPE_FREE: 'Free',
  TYPE_ENTERPRISE: '企业',
  TYPE_TEAM: 'Team',
  LEVEL_FREE: 'Free',
  LEVEL_BASIC: '基础',
  LEVEL_INTERMEDIATE: '进阶',
  LEVEL_PRO: 'Pro',
  LEVEL_PREMIUM: 'Premium',
};

export function kimiPlanLabel(subType?: unknown, membership?: unknown): string | undefined {
  const clean = (raw?: unknown): string | undefined => {
    if (typeof raw !== 'string' || !raw.trim()) return undefined;
    if (KIMI_PLAN_NAMES[raw]) return KIMI_PLAN_NAMES[raw];
    if (raw.startsWith('TYPE_') || raw.startsWith('LEVEL_')) return undefined;
    return raw.trim();
  };
  return clean(membership) ?? clean(subType);
}

export function kimiWindowKey(
  window: { duration?: unknown; timeUnit?: unknown } | undefined,
  fallback: string,
): string {
  const duration = Number(window?.duration);
  const unit = String(window?.timeUnit ?? '').toUpperCase();
  if (!Number.isFinite(duration) || duration <= 0) return fallback;
  const minutes = unit.includes('HOUR') ? duration * 60 : unit.includes('DAY') ? duration * 24 * 60 : duration;
  if (minutes >= 24 * 60) return '7d';
  if (minutes >= 60) return '5h';
  return fallback;
}

function windowFrom(data: Record<string, unknown> | undefined, key: string): UsageWindow | null {
  if (!data) return null;
  const limit = Number(data.limit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  let used = Number(data.used);
  if (!Number.isFinite(used)) {
    const remaining = Number(data.remaining);
    used = Number.isFinite(remaining) ? limit - remaining : NaN;
  }
  const pct = clampPercent((used / limit) * 100);
  if (pct === null) return null;
  return {
    key,
    pct,
    resetsAt: normalizeResetAt(data.resetTime ?? data.reset_at ?? data.resetAt),
  };
}

function kimiBase(
  entry: RegistrySubscription,
  confidence: Subscription['confidence'],
  windows: UsageWindow[] = [],
  plan?: string,
): Subscription {
  return {
    id: entry.id,
    tool: 'Kimi',
    label: entry.label,
    plan: plan ?? entry.plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectKimi(entry: RegistrySubscription): Promise<Subscription> {
  const key = `kimi:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const home = kimiHome(entry);
  const creds = loadCreds(home);
  if (!creds?.access_token && !creds?.refresh_token) {
    const empty = kimiBase(entry, 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  try {
    let token = creds.access_token?.trim() ?? '';
    if (!token || expired(creds)) token = await refresh(creds, home);
    let res = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 && creds.refresh_token) {
      token = await refresh(creds, home);
      res = await fetch(USAGE_URL, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    }
    if (res.status === 429) {
      const fallback = cached ?? kimiBase(entry, 'stale');
      quotaRemember(key, fallback, false, 15 * 60_000);
      return { ...fallback, confidence: 'stale' };
    }
    if (!res.ok) throw new Error(`Kimi usages HTTP ${res.status}`);
    const body = (await res.json()) as {
      usage?: Record<string, unknown>;
      totalQuota?: Record<string, unknown>;
      limits?: Array<{ detail?: Record<string, unknown>; window?: { duration?: unknown; timeUnit?: unknown } }>;
      subType?: string;
      user?: { membership?: { level?: string } };
    };
    const windows = [
      windowFrom(body.usage, '7d'),
      ...((body.limits ?? []).map((row) => windowFrom(row.detail, kimiWindowKey(row.window, '5h')))),
      windowFrom(body.totalQuota, '总量'),
    ].filter((w): w is UsageWindow => Boolean(w));
    const seen = new Set<string>();
    const unique = windows.filter((w) => (seen.has(w.key) ? false : (seen.add(w.key), true)));
    const plan = entry.plan ?? kimiPlanLabel(body.subType, body.user?.membership?.level) ?? 'Code';
    const sub = kimiBase(entry, unique.length ? 'live' : 'error', unique, plan);
    quotaRemember(key, sub, unique.length > 0);
    return sub;
  } catch {
    const fallback = cached ?? kimiBase(entry, 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}

export function kimiProjectsDir(entry: RegistrySubscription): string {
  return expandHome(entry.projectsDir ?? '~/.claude-kimi/projects');
}
