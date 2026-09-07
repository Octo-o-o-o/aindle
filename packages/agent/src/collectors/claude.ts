import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import {
  readClaudeCreds,
  writeClaudeCreds,
  type ClaudeCredsBundle,
  type ClaudeCredsFile,
  type ClaudeOauth,
} from '../lib/keychain.js';
import { quotaDue, quotaIntervalMs, quotaPeek, quotaRemember } from '../lib/quota-gate.js';
import { loadQuotaLast, saveQuotaLast } from '../lib/quota-last.js';
import { hasLiveLocalSession } from '../lib/session-activity.js';
import { readLocalClaudeUsage, writeLocalClaudeUsage, windowsFromClaudeUsage } from './claude-local.js';

const URL = 'https://api.anthropic.com/api/oauth/usage';
const TOKEN_URLS = [
  'https://platform.claude.com/v1/oauth/token',
  'https://console.anthropic.com/v1/oauth/token',
];
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const FALLBACK_VERSION = '2.1.259';
const TIMEOUT_MS = 10_000;
const EXPIRY_SKEW_MS = 2 * 60_000;
const CACHE_KEY = (id: string) => `claude:${id}`;

interface ClaudeWindow {
  utilization?: number;
  resets_at?: string | null;
}

interface ClaudeScopedLimit {
  kind?: string;
  percent?: number;
  resets_at?: string | null;
  scope?: { model?: { id?: string | null; display_name?: string | null } };
}

interface ClaudeUsage {
  five_hour?: ClaudeWindow;
  seven_day?: ClaudeWindow;
  seven_day_opus?: ClaudeWindow | null;
  seven_day_sonnet?: ClaudeWindow | null;
  limits?: ClaudeScopedLimit[];
}

function detectClaudeVersion(): string {
  try {
    const out = execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const match = out.match(/(\d+\.\d+\.\d+)/);
    if (match?.[1]) return match[1];
  } catch {
    /* keep fallback */
  }
  return process.env.CLAUDE_VERSION?.trim() || FALLBACK_VERSION;
}

function claudeUserAgent(): string {
  const override = process.env.CLAUDE_UA?.trim();
  if (override) return override;
  return `claude-code/${detectClaudeVersion()}`;
}

function shapeWindows(u: ClaudeUsage): UsageWindow[] {
  return windowsFromClaudeUsage(u);
}

function baseSub(entry: RegistrySubscription, confidence: Subscription['confidence']): Subscription {
  return {
    id: entry.id,
    tool: 'Claude',
    label: entry.label,
    plan: entry.plan ?? 'Max',
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows: [],
    confidence,
  };
}

function expiresAtMs(oauth: ClaudeOauth | undefined): number | null {
  const raw = Number(oauth?.expiresAt);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 1e12 ? raw * 1000 : raw;
}

function accessExpired(oauth: ClaudeOauth | undefined, now = Date.now()): boolean {
  const exp = expiresAtMs(oauth);
  if (exp == null) return !oauth?.accessToken?.trim();
  return exp <= now + EXPIRY_SKEW_MS;
}

async function refreshClaudeOauth(bundle: ClaudeCredsBundle): Promise<ClaudeOauth> {
  const current = bundle.creds.claudeAiOauth ?? {};
  const refreshToken = current.refreshToken?.trim();
  if (!refreshToken) throw new Error('Claude refresh token missing');

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  };
  if (current.scopes?.length) body.scope = current.scopes.join(' ');

  let lastStatus = 0;
  for (const url of TOKEN_URLS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': claudeUserAgent(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    lastStatus = res.status;
    if (res.status === 404 || res.status === 405 || res.status === 429) continue;
    if (!res.ok) throw new Error(`Claude refresh HTTP ${res.status}`);
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const access = json.access_token?.trim();
    if (!access) throw new Error('Claude refresh missing access_token');
    const expiresIn = Number(json.expires_in);
    const next: ClaudeOauth = {
      ...current,
      accessToken: access,
      refreshToken: json.refresh_token?.trim() || refreshToken,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 8 * 3600_000),
    };
    if (json.scope?.trim()) next.scopes = json.scope.trim().split(/\s+/);
    const nextFile: ClaudeCredsFile = { ...bundle.creds, claudeAiOauth: next };
    writeClaudeCreds(bundle, nextFile);
    bundle.creds = nextFile;
    return next;
  }
  const err = new Error(`Claude refresh HTTP ${lastStatus || 'failed'}`) as Error & { status?: number };
  err.status = lastStatus || undefined;
  throw err;
}

async function resolveClaudeAccess(configDir: string): Promise<string | null> {
  const bundle = readClaudeCreds(configDir);
  if (!bundle) return null;
  let oauth = bundle.creds.claudeAiOauth;
  if (accessExpired(oauth) && oauth?.refreshToken) {
    oauth = await refreshClaudeOauth(bundle);
  }
  return oauth?.accessToken?.trim() || null;
}

async function fetchUsage(token: string): Promise<{ status: number; body?: ClaudeUsage }> {
  const res = await fetch(URL, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'anthropic-version': '2023-06-01',
      'User-Agent': claudeUserAgent(),
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { status: res.status };
  return { status: res.status, body: (await res.json()) as ClaudeUsage };
}

function lastKnown(entry: RegistrySubscription, cached?: Subscription): Subscription {
  if (cached?.windows.length) return { ...cached, confidence: cached.windows.length ? 'stale' : cached.confidence };
  const disk = loadQuotaLast(entry.id);
  if (disk?.windows.length) return { ...disk, id: entry.id, label: entry.label, confidence: 'stale' };
  return baseSub(entry, 'error');
}

export function claudeProjectsDir(entry: RegistrySubscription): string {
  if (entry.projectsDir) return expandHome(entry.projectsDir);
  return path.join(expandHome(entry.home ?? '~/.claude'), 'projects');
}

export function claudeSessionBusy(entry: RegistrySubscription): boolean {
  return hasLiveLocalSession(claudeProjectsDir(entry));
}

function fromLocal(entry: RegistrySubscription): Subscription | undefined {
  const local = readLocalClaudeUsage();
  if (!local.windows.length) return undefined;
  const sub: Subscription = {
    ...baseSub(entry, local.fresh ? 'live' : 'stale'),
    windows: local.windows,
  };
  if (local.fresh) saveQuotaLast(sub);
  return sub;
}

export async function collectClaude(entry: RegistrySubscription): Promise<Subscription> {
  const local = fromLocal(entry);
  if (local?.confidence === 'live') return local;

  const key = CACHE_KEY(entry.id);
  const cached = quotaPeek<Subscription>(key);
  const known = local?.windows.length ? local : lastKnown(entry, cached);
  if (process.env.AINDLE_CLAUDE_USAGE_API !== '1') {
    return known;
  }

  const busy = claudeSessionBusy(entry);
  const intervalMs = quotaIntervalMs(busy);
  if (!quotaDue(key)) {
    return { ...known, confidence: known.windows.length ? 'cached' : known.confidence };
  }

  const configDir = expandHome(entry.home ?? '~/.claude');
  try {
    let token = await resolveClaudeAccess(configDir);
    if (!token) {
      const fallback = lastKnown(entry, cached);
      quotaRemember(key, fallback, false);
      return fallback;
    }

    let fetched = await fetchUsage(token);
    if (fetched.status === 401) {
      const bundle = readClaudeCreds(configDir);
      if (bundle?.creds.claudeAiOauth?.refreshToken) {
        const oauth = await refreshClaudeOauth(bundle);
        token = oauth.accessToken?.trim() || token;
        fetched = await fetchUsage(token);
      }
    }
    if (fetched.status === 429) {
      const fallback = lastKnown(entry, cached);
      quotaRemember(key, fallback, false);
      return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
    }
    if (!fetched.body) throw new Error(`HTTP ${fetched.status}`);

    const sub: Subscription = {
      ...baseSub(entry, 'live'),
      windows: shapeWindows(fetched.body),
    };
    quotaRemember(key, sub, sub.windows.length > 0, undefined, Date.now(), intervalMs);
    if (sub.windows.length) {
      saveQuotaLast(sub);
      writeLocalClaudeUsage(sub.windows);
    }
    return sub;
  } catch (err) {
    console.error(`[aindle] claude ${entry.id}: ${err instanceof Error ? err.message : 'failed'}`);
    const fallback = lastKnown(entry, cached);
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}
