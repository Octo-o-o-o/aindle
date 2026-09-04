import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

const BILLING_BASE = 'https://cli-chat-proxy.grok.com';
const TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token';
const TIMEOUT_MS = 15_000;
const SKEW_MS = 60_000;

interface GrokAuthEntry {
  key?: string;
  refresh_token?: string;
  expires_at?: string;
  oidc_client_id?: string;
  oidc_issuer?: string;
}

function grokHome(entry: RegistrySubscription): string {
  if (entry.home) return expandHome(entry.home);
  return path.join(os.homedir(), '.grok');
}

function loadAuthEntry(home: string): { entry: GrokAuthEntry; scopeKey: string; authPath: string; authFile: Record<string, GrokAuthEntry> } | null {
  const authPath = path.join(home, 'auth.json');
  if (!fs.existsSync(authPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8')) as Record<string, GrokAuthEntry>;
    let fallback: ReturnType<typeof loadAuthEntry> = null;
    for (const [scopeKey, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const key = value.key?.trim();
      const refresh = value.refresh_token?.trim();
      if (key) return { entry: value, scopeKey, authPath, authFile: parsed };
      if (refresh && !fallback) {
        const clientId = resolveClientId(value, scopeKey);
        if (clientId) fallback = { entry: value, scopeKey, authPath, authFile: parsed };
      }
    }
    return fallback;
  } catch {
    return null;
  }
}

function resolveClientId(entry: GrokAuthEntry, scopeKey: string): string | null {
  if (entry.oidc_client_id?.trim()) return entry.oidc_client_id.trim();
  if (scopeKey.includes('::')) {
    const suffix = scopeKey.slice(scopeKey.lastIndexOf('::') + 2).trim();
    if (suffix) return suffix;
  }
  return null;
}

function isExpired(expiresAt: string | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (!Number.isFinite(ts)) return false;
  return ts <= now + SKEW_MS;
}

async function refreshTokens(entry: GrokAuthEntry, scopeKey: string): Promise<{ access_token: string; refresh_token: string; expires_at?: string }> {
  const refreshToken = entry.refresh_token?.trim();
  const clientId = resolveClientId(entry, scopeKey);
  if (!refreshToken || !clientId) throw new Error('Grok refresh unavailable');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 400 || res.status === 401) throw new Error('Grok reauth required');
  if (!res.ok) throw new Error(`Grok refresh HTTP ${res.status}`);
  const payload = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  const access = payload.access_token?.trim();
  if (!access) throw new Error('Grok refresh missing access_token');
  let expires_at: string | undefined;
  const expiresIn = Number(payload.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  return {
    access_token: access,
    refresh_token: payload.refresh_token?.trim() || refreshToken,
    expires_at,
  };
}

async function persistAuth(
  authPath: string,
  authFile: Record<string, GrokAuthEntry>,
  scopeKey: string,
  entry: GrokAuthEntry,
  tokens: { access_token: string; refresh_token: string; expires_at?: string },
): Promise<void> {
  const nextEntry: GrokAuthEntry = {
    ...entry,
    key: tokens.access_token,
    refresh_token: tokens.refresh_token,
  };
  if (tokens.expires_at) nextEntry.expires_at = tokens.expires_at;
  else delete nextEntry.expires_at;
  const merged = { ...authFile, [scopeKey]: nextEntry };
  const tmp = `${authPath}.tmp.${process.pid}.${Date.now()}`;
  await fs.promises.writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  await fs.promises.rename(tmp, authPath);
}

async function resolveAccessToken(home: string): Promise<string | null> {
  const loaded = loadAuthEntry(home);
  if (!loaded) return null;
  let { entry } = loaded;
  const access = entry.key?.trim();
  if (access && !isExpired(entry.expires_at)) return access;

  if (!entry.refresh_token?.trim()) return access ?? null;

  try {
    const tokens = await refreshTokens(entry, loaded.scopeKey);
    await persistAuth(loaded.authPath, loaded.authFile, loaded.scopeKey, entry, tokens);
    return tokens.access_token;
  } catch {
    return access ?? null;
  }
}

function normalizePeriodType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  if (upper.includes('WEEK')) return 'weekly';
  if (upper.includes('MONTH')) return 'monthly';
  if (upper.includes('DAILY') || upper.includes('DAY')) return 'daily';
  return null;
}

function periodLabel(periodType: string | null, index: number): string {
  if (periodType === 'daily') return '今日';
  if (periodType === 'weekly') return '本周';
  if (periodType === 'monthly') return '本月';
  return index === 0 ? '主额度' : '副额度';
}

function normalizeBilling(body: Record<string, unknown>): UsageWindow[] {
  const config = body.config as Record<string, unknown> | undefined;
  if (!config) throw new Error('Grok billing missing config');

  const currentPeriod = config.currentPeriod as Record<string, unknown> | undefined;
  const resetAt = normalizeResetAt(currentPeriod?.end) ?? normalizeResetAt(config.billingPeriodEnd);
  const periodType = normalizePeriodType(currentPeriod?.type);

  let usedPercent = clampPercent(config.creditUsagePercent);
  if (usedPercent === null) {
    const productUsage = config.productUsage as Array<{ usagePercent?: number }> | undefined;
    if (Array.isArray(productUsage)) {
      let sum = 0;
      let any = false;
      for (const p of productUsage) {
        const pct = clampPercent(p.usagePercent);
        if (pct !== null) {
          any = true;
          sum += pct;
        }
      }
      if (any) usedPercent = clampPercent(sum);
    }
  }

  const monthlyLimit = Number(config.monthlyLimit);
  const used = Number(config.used);
  if (usedPercent === null && Number.isFinite(monthlyLimit) && monthlyLimit > 0 && Number.isFinite(used)) {
    usedPercent = clampPercent((used / monthlyLimit) * 100);
  }

  if (usedPercent === null && currentPeriod && config.creditUsagePercent === undefined) {
    usedPercent = 0;
  }

  const windows: UsageWindow[] = [];
  if (usedPercent !== null) {
    windows.push({ key: periodLabel(periodType, 0), pct: usedPercent, resetsAt: resetAt });
  }

  const onDemandCap = Number(config.onDemandCap);
  const onDemandUsed = Number(config.onDemandUsed);
  if (Number.isFinite(onDemandCap) && onDemandCap > 0 && Number.isFinite(onDemandUsed)) {
    const pct = clampPercent((onDemandUsed / onDemandCap) * 100);
    if (pct !== null) windows.push({ key: '按需', pct, resetsAt: resetAt });
  }

  if (!windows.length) throw new Error('Grok billing has no windows');
  return windows;
}

async function fetchBilling(accessToken: string): Promise<UsageWindow[]> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  const root = (process.env.GROK_CLI_CHAT_PROXY_BASE_URL ?? BILLING_BASE).replace(/\/$/, '');

  for (const suffix of ['?format=credits', '']) {
    const res = await fetch(`${root}/v1/billing${suffix}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Grok auth required');
    if (!res.ok) continue;
    const body = (await res.json()) as Record<string, unknown>;
    return normalizeBilling(body);
  }
  throw new Error('Grok billing failed');
}

function grokBase(
  entry: RegistrySubscription,
  confidence: Subscription['confidence'],
  windows: UsageWindow[] = [],
): Subscription {
  return {
    id: entry.id,
    tool: 'Grok',
    label: entry.label,
    plan: entry.plan ?? 'Build',
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectGrok(entry: RegistrySubscription): Promise<Subscription> {
  const key = `grok:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const home = grokHome(entry);
  if (!fs.existsSync(home)) {
    const empty = grokBase(entry, 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  const token = await resolveAccessToken(home);
  if (!token) {
    const fallback = cached ?? grokBase(entry, 'error');
    quotaRemember(key, fallback, false);
    return fallback;
  }

  try {
    const windows = await fetchBilling(token);
    const sub = grokBase(entry, 'live', windows);
    quotaRemember(key, sub, true);
    return sub;
  } catch {
    const fallback = cached ?? grokBase(entry, 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}

export function grokSessionsDir(entry: RegistrySubscription): string {
  return path.join(grokHome(entry), 'sessions');
}
