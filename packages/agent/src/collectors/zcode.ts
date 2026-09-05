import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

// ZCode (z.ai GLM Coding Plan) keeps its login state under ~/.zcode.
// Tokens in v2/credentials.json are AES-256-GCM sealed with a machine-derived
// key (same scheme as the ZCode app), so the local logged-in account can be
// read without another login. The key derivation mirrors the app's
// `defaultCredentialSecret`: `zcode-credential-fallback:<platform>:<homedir>:<user>`,
// overridable via ZCODE_CREDENTIAL_SECRET.
const DEFAULT_BASE_URL = 'https://api.z.ai';
const QUOTA_PATH = '/api/monitor/usage/quota/limit';
const CREDENTIAL_TOKEN_KEYS = ['oauth:zai:access_token', 'zcodejwttoken'];
const ENC_PREFIX = 'enc:v1:';

// Limit window semantics observed in the ZCode app renderer:
// TOKENS_LIMIT unit=3 number=5 → 5-hour window; unit=6 → weekly;
// TIME_LIMIT unit=5 → monthly (MCP usage).
const UNIT_HOUR = 3;
const UNIT_MONTH = 5;
const UNIT_WEEK = 6;

const PLAN_LEVELS: Record<string, string> = {
  lite: 'Lite',
  pro: 'Pro',
  max: 'Max',
  free: 'Free',
};

export function zcodeHome(entry: RegistrySubscription): string {
  return expandHome(entry.home ?? '~/.zcode');
}

export function zcodeDbPath(entry: RegistrySubscription): string {
  return path.join(zcodeHome(entry), 'cli', 'db', 'db.sqlite');
}

export function zcodeCredentialsPath(entry: RegistrySubscription): string {
  return path.join(zcodeHome(entry), 'v2', 'credentials.json');
}

export function zcodeCredentialSecret(env: NodeJS.ProcessEnv = process.env): string {
  const hinted = env.ZCODE_CREDENTIAL_SECRET;
  if (hinted && hinted.trim()) return hinted;
  let user = 'unknown';
  try {
    user = os.userInfo().username;
  } catch {
    /* keep fallback */
  }
  return `zcode-credential-fallback:${os.platform()}:${os.homedir()}:${user}`;
}

// `enc:v1:<iv>.<authtag>.<ciphertext>`, all base64url, key = sha256(secret).
export function decryptZcodeCredential(value: unknown, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (!value.startsWith(ENC_PREFIX)) return value;
  try {
    const key = crypto.createHash('sha256').update(zcodeCredentialSecret(env)).digest();
    const [iv, tag, data] = value.slice(ENC_PREFIX.length).split('.');
    if (!iv || !tag || !data) return undefined;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    return plain.trim() || undefined;
  } catch {
    return undefined;
  }
}

function readLoginToken(entry: RegistrySubscription): string | undefined {
  const file = zcodeCredentialsPath(entry);
  if (!fs.existsSync(file)) return undefined;
  try {
    const creds = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const name of CREDENTIAL_TOKEN_KEYS) {
      const token = decryptZcodeCredential(creds[name]);
      if (token) return token;
    }
  } catch {
    /* not logged in */
  }
  return undefined;
}

export function zcodePlanLabel(level: unknown): string | undefined {
  if (typeof level !== 'string') return undefined;
  const key = level.trim().toLowerCase();
  if (!key) return undefined;
  return PLAN_LEVELS[key] ?? level.trim();
}

interface ZcodeLimit {
  type?: unknown;
  unit?: unknown;
  number?: unknown;
  usage?: unknown;
  currentValue?: unknown;
  remaining?: unknown;
  percentage?: unknown;
  nextResetTime?: unknown;
}

function limitPct(row: ZcodeLimit): number | null {
  if (row.percentage !== null && row.percentage !== undefined) {
    const direct = clampPercent(row.percentage);
    if (direct !== null) return direct;
  }
  const total = Number(row.usage);
  const used = Number(row.currentValue);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(used)) {
    return clampPercent((used / total) * 100);
  }
  return null;
}

function limitKey(row: ZcodeLimit): string {
  const unit = Number(row.unit);
  const number = Number(row.number);
  const type = String(row.type ?? '').toUpperCase();
  if (type === 'TOKENS_LIMIT') {
    if (unit === UNIT_WEEK) return '7d';
    if (unit === UNIT_HOUR && Number.isFinite(number)) {
      return number === 5 ? '5h' : `${number}h`;
    }
  }
  if (type === 'TIME_LIMIT' && unit === UNIT_MONTH) return '月';
  if (type === 'TIME_LIMIT') return '月';
  return type ? type.toLowerCase() : 'quota';
}

export function windowsFromZcodeQuota(data: unknown): UsageWindow[] {
  if (!data || typeof data !== 'object') return [];
  const limits = (data as { limits?: unknown }).limits;
  if (!Array.isArray(limits)) return [];
  const out: UsageWindow[] = [];
  const seen = new Set<string>();
  for (const raw of limits) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as ZcodeLimit;
    const pct = limitPct(row);
    if (pct === null) continue;
    const key = limitKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    const window: UsageWindow = { key, pct };
    const reset = normalizeResetAt(row.nextResetTime);
    if (reset) window.resetsAt = reset;
    out.push(window);
  }
  const rank: Record<string, number> = { '5h': 0, '7d': 1 };
  return out.sort((a, b) => (rank[a.key] ?? 10) - (rank[b.key] ?? 10) || a.key.localeCompare(b.key));
}

function zcodeBase(
  entry: RegistrySubscription,
  confidence: Subscription['confidence'],
  windows: UsageWindow[] = [],
  plan?: string,
): Subscription {
  return {
    id: entry.id,
    tool: 'ZCode',
    label: entry.label,
    plan: plan ?? entry.plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectZcode(entry: RegistrySubscription): Promise<Subscription> {
  const key = `zcode:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const token = readLoginToken(entry);
  if (!token) {
    const empty = zcodeBase(entry, 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  const base = (entry.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}${QUOTA_PATH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) {
      const fallback = cached ?? zcodeBase(entry, 'stale');
      quotaRemember(key, fallback, false, 15 * 60_000);
      return { ...fallback, confidence: 'stale' };
    }
    if (!res.ok) throw new Error(`ZCode quota HTTP ${res.status}`);
    const body = (await res.json()) as { code?: number; success?: boolean; data?: unknown };
    if (body.code !== 200 || body.success === false || !body.data) {
      throw new Error(`ZCode quota rejected (code ${body.code ?? '?'})`);
    }
    const windows = windowsFromZcodeQuota(body.data);
    const level = (body.data as { level?: unknown }).level;
    const plan = entry.plan ?? zcodePlanLabel(level);
    const sub = zcodeBase(entry, windows.length ? 'live' : 'error', windows, plan);
    quotaRemember(key, sub, windows.length > 0);
    return sub;
  } catch {
    const fallback = cached ?? zcodeBase(entry, 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}
