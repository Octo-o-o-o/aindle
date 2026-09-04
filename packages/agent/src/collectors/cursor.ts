import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import type { RegistrySubscription } from '../registry.js';
import { readSqliteValue } from '../lib/sqlite.js';
import { clampPercent, decodeJwtPayload } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

const SUMMARY_URL = 'https://cursor.com/api/usage-summary';
const TIMEOUT_MS = 20_000;

const WORKOS_SUBJECT_RE = /^(google-oauth2|github|oidc|auth0)\|[^|]+$/;

function resolveCursorPaths(home = os.homedir()) {
  const appDir =
    process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Cursor')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Cursor')
        : path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'Cursor');
  return {
    stateDbPath: path.join(appDir, 'User', 'globalStorage', 'state.vscdb'),
    cliConfigPath: path.join(home, '.cursor', 'cli-config.json'),
  };
}

function normalizeSubject(subject: string): string | null {
  if (!subject) return null;
  const native = subject.match(/\|(user_[A-Za-z0-9_]+)$/);
  if (native) return native[1];
  if (WORKOS_SUBJECT_RE.test(subject)) return subject;
  return null;
}

function extractUserIdFromCliConfig(configPath: string): string | null {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      authInfo?: { authId?: string };
    };
    return normalizeSubject(config.authInfo?.authId ?? '');
  } catch {
    return null;
  }
}

function extractUserIdFromJwt(jwt: string): string | null {
  const payload = decodeJwtPayload(jwt);
  return normalizeSubject(typeof payload?.sub === 'string' ? payload.sub : '');
}

export function extractCursorSessionCookie(home = os.homedir()): string | null {
  const { stateDbPath, cliConfigPath } = resolveCursorPaths(home);
  const jwt = readSqliteValue(
    stateDbPath,
    "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1;",
    'value',
  );
  if (!jwt || jwt.length < 10) return null;

  let userId = extractUserIdFromCliConfig(cliConfigPath);
  if (!userId) userId = extractUserIdFromJwt(jwt);
  if (!userId) return null;

  return `WorkosCursorSessionToken=${userId}%3A%3A${jwt}`;
}

interface CursorSummary {
  membershipType?: string;
  billingCycleEnd?: string;
  limitType?: string;
  individualUsage?: {
    plan?: {
      totalPercentUsed?: number;
      autoPercentUsed?: number;
      apiPercentUsed?: number;
      used?: number;
      limit?: number;
    };
    onDemand?: { used?: number; limit?: number };
  };
  teamUsage?: { onDemand?: { used?: number; limit?: number } };
}

function percentFromCents(usedRaw: unknown, limitRaw: unknown): number | null {
  const used = Number(usedRaw);
  const limit = Number(limitRaw);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  return clampPercent((used / limit) * 100);
}

function normalizeCursorSummary(body: CursorSummary): UsageWindow[] {
  const plan = body.individualUsage?.plan;
  const billingCycleEnd = typeof body.billingCycleEnd === 'string' ? body.billingCycleEnd : undefined;
  const autoPct = clampPercent(plan?.autoPercentUsed);
  const apiPct = clampPercent(plan?.apiPercentUsed);

  let totalPct = clampPercent(plan?.totalPercentUsed);
  if (totalPct === null) {
    if (autoPct !== null && apiPct !== null) totalPct = clampPercent((autoPct + apiPct) / 2);
    else if (apiPct !== null) totalPct = apiPct;
    else if (autoPct !== null) totalPct = autoPct;
    else totalPct = percentFromCents(plan?.used, plan?.limit);
  }

  const windows: UsageWindow[] = [];
  if (apiPct !== null) {
    windows.push({ key: '三方', pct: apiPct, resetsAt: billingCycleEnd });
  }
  if (autoPct !== null) {
    windows.push({ key: '自有', pct: autoPct, resetsAt: billingCycleEnd });
  }
  if (!windows.length && totalPct !== null) {
    windows.push({ key: '三方', pct: totalPct, resetsAt: billingCycleEnd });
  }
  return windows;
}

function cursorBase(
  entry: RegistrySubscription,
  confidence: Subscription['confidence'],
  windows: UsageWindow[] = [],
  plan?: string,
): Subscription {
  return {
    id: entry.id,
    tool: 'Cursor',
    label: entry.label,
    plan: plan ?? entry.plan ?? 'Ultra',
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectCursor(entry: RegistrySubscription): Promise<Subscription> {
  const key = `cursor:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const cookie = extractCursorSessionCookie();
  if (!cookie) {
    const empty = cached ?? cursorBase(entry, 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  try {
    const res = await fetch(SUMMARY_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        Cookie: cookie,
        Referer: 'https://www.cursor.com/settings',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (res.status === 429) {
      const fallback = cached ?? cursorBase(entry, 'stale');
      quotaRemember(key, fallback, false, 15 * 60_000);
      return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'stale' };
    }
    if (res.status === 401 || res.status === 403) {
      const empty = cursorBase(entry, 'error');
      quotaRemember(key, cached ?? empty, false);
      return cached ?? empty;
    }
    if (!res.ok) throw new Error(`Cursor HTTP ${res.status}`);
    const body = (await res.json()) as CursorSummary;
    const windows = normalizeCursorSummary(body);
    const sub = cursorBase(entry, windows.length ? 'live' : 'error', windows, entry.plan ?? body.membershipType ?? 'Ultra');
    quotaRemember(key, sub, windows.length > 0);
    return sub;
  } catch {
    const fallback = cached ?? cursorBase(entry, 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}

export function cursorChatsDir(): string {
  return path.join(os.homedir(), '.cursor', 'chats');
}
