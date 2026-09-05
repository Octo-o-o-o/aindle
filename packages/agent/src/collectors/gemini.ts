import fs from 'node:fs';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

// Gemini CLI / Antigravity (Google). Consumer OAuth quota numbers were shut
// down mid-2026: for free-tier accounts the only live source is the local
// Antigravity language server; licensed (Code Assist Standard) accounts still
// answer retrieveUserQuota / fetchAvailableModels remotely. loadCodeAssist is
// the safe status call used to tell the tiers apart. Tokens are refreshed
// in-memory only (never written back to oauth_creds.json).
const CODE_ASSIST_BASE = 'https://cloudcode-pa.googleapis.com/v1internal';
// Public gemini-cli OAuth client (shipped in the open-source CLI).
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j@developer.gserviceaccount.com';
const OAUTH_CLIENT_SECRET = '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';
const REFRESH_MARGIN_MS = 60_000;

const TIER_PLANS: Record<string, string> = {
  'free-tier': 'Free',
  'g1-pro-tier': 'AI Pro',
  'standard-tier': 'Standard',
  'enterprise-tier': 'Enterprise',
};

interface GeminiOauth {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
}

export function geminiHome(entry: RegistrySubscription): string {
  return expandHome(entry.home ?? '~/.gemini');
}

export function readGeminiOauth(entry: RegistrySubscription): GeminiOauth | null {
  const file = `${geminiHome(entry)}/oauth_creds.json`;
  try {
    const creds = JSON.parse(fs.readFileSync(file, 'utf8')) as GeminiOauth;
    return creds?.access_token || creds?.refresh_token ? creds : null;
  } catch {
    return null;
  }
}

// Read-only refresh: the new access token lives only for this collection.
export async function ensureGeminiToken(creds: GeminiOauth): Promise<string | null> {
  const expiry = Number(creds.expiry_date);
  if (creds.access_token && !(Number.isFinite(expiry) && Date.now() > expiry - REFRESH_MARGIN_MS)) {
    return creds.access_token;
  }
  if (!creds.refresh_token) return creds.access_token ?? null;
  try {
    const body = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return creds.access_token ?? null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token?.trim() || creds.access_token || null;
  } catch {
    return creds.access_token ?? null;
  }
}

export interface LoadCodeAssistInfo {
  tierId?: string;
  plan?: string;
  project?: string;
  unsupportedClient?: boolean;
}

export function parseLoadCodeAssist(body: unknown): LoadCodeAssistInfo {
  if (!body || typeof body !== 'object') return {};
  const row = body as Record<string, unknown>;
  const currentTier = row.currentTier as { id?: string; name?: string } | undefined;
  const paidTier = row.paidTier as { id?: string } | undefined;
  const tierId = currentTier?.id?.trim() || undefined;
  const info: LoadCodeAssistInfo = {
    tierId,
    plan: TIER_PLANS[tierId ?? ''] ?? currentTier?.name,
    project:
      typeof row.cloudaicompanionProject === 'string' && row.cloudaicompanionProject.trim()
        ? row.cloudaicompanionProject.trim()
        : undefined,
  };
  const ineligible = Array.isArray(row.ineligibleTiers)
    ? (row.ineligibleTiers as Array<{ tierId?: string; reasonCode?: string }>)
    : [];
  info.unsupportedClient = ineligible.some((t) => t?.reasonCode === 'UNSUPPORTED_CLIENT');
  if (info.unsupportedClient && !info.plan) info.plan = paidTier?.id ? TIER_PLANS[paidTier.id] : undefined;
  return info;
}

async function postJson(url: string, token: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* keep null */
  }
  return { status: res.status, body };
}

export interface QuotaBucket {
  remainingFraction?: unknown;
  resetTime?: unknown;
}

// Licensed accounts: buckets carry remainingFraction per model/window; used% = 1 - fraction.
export function windowsFromQuotaBuckets(buckets: QuotaBucket[]): UsageWindow[] {
  let minFraction = Number.POSITIVE_INFINITY;
  let reset: unknown;
  for (const bucket of buckets) {
    const fraction = Number(bucket.remainingFraction);
    if (!Number.isFinite(fraction) || fraction < 0) continue;
    if (fraction < minFraction) {
      minFraction = fraction;
      reset = bucket.resetTime;
    }
  }
  if (!Number.isFinite(minFraction)) return [];
  const pct = clampPercent((1 - Math.min(minFraction, 1)) * 100);
  if (pct === null) return [];
  const w: UsageWindow = { key: '5h', pct };
  const iso = normalizeResetAt(reset);
  if (iso) w.resetsAt = iso;
  return [w];
}

export function bucketsFromRetrieveUserQuota(body: unknown): QuotaBucket[] {
  if (!body || typeof body !== 'object') return [];
  const buckets = (body as { buckets?: unknown }).buckets;
  return Array.isArray(buckets) ? (buckets as QuotaBucket[]) : [];
}

export function bucketsFromAvailableModels(body: unknown): QuotaBucket[] {
  if (!body || typeof body !== 'object') return [];
  const models = (body as { models?: Record<string, unknown> }).models;
  if (!models || typeof models !== 'object') return [];
  const out: QuotaBucket[] = [];
  for (const model of Object.values(models)) {
    if (!model || typeof model !== 'object') continue;
    const quotaInfo = (model as { quotaInfo?: QuotaBucket }).quotaInfo;
    if (quotaInfo) out.push(quotaInfo);
  }
  return out;
}

// ---- Antigravity local language server (free-tier fallback) ----

export interface AntigravityEndpoint {
  port: number;
  csrf: string;
}

export function findAntigravityEndpoint(raw = listProcessCommands()): AntigravityEndpoint | null {
  for (const line of raw) {
    const port = Number(/--extension_server_port[= ]"?(\d+)"?/.exec(line)?.[1]);
    if (!Number.isFinite(port) || port <= 0) continue;
    const csrf =
      /--extension_server_csrf_token[= ]"?'?([^\s"']+)/.exec(line)?.[1] ??
      /--csrf_token[= ]"?'?([^\s"']+)/.exec(line)?.[1];
    if (csrf) return { port, csrf };
  }
  return null;
}

function listProcessCommands(): string[] {
  try {
    return execFileSync('ps', ['ax', '-o', 'command='], { encoding: 'utf8', timeout: 3000 }).split('\n');
  } catch {
    return [];
  }
}

function localPost(port: number, csrf: string, path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const data = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        timeout: 8000,
        rejectUnauthorized: false, // self-signed cert, loopback only
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Codeium-Csrf-Token': csrf,
          'Connect-Protocol-Version': '1',
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
        res.on('end', () => {
          let body: unknown = null;
          try {
            body = JSON.parse(text);
          } catch {
            /* keep null */
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ status: 0, body: null }));
    req.end(data);
  });
}

export function windowsFromAntigravitySummary(body: unknown): UsageWindow[] {
  if (!body || typeof body !== 'object') return [];
  const root = ((body as { response?: unknown }).response ?? body) as Record<string, unknown>;
  const groups = Array.isArray(root.groups) ? (root.groups as Array<Record<string, unknown>>) : [];
  const out: UsageWindow[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const buckets = Array.isArray(group.buckets) ? (group.buckets as Array<Record<string, unknown>>) : [];
    for (const bucket of buckets) {
      const remaining = bucket.remaining as { remainingFraction?: unknown; resetTime?: unknown } | undefined;
      const fraction = Number(remaining?.remainingFraction);
      if (!Number.isFinite(fraction) || fraction < 0) continue;
      const label = String(
        bucket.windowName ?? bucket.name ?? bucket.limitType ?? bucket.window ?? bucket.period ?? '',
      );
      const key = /5|hour/i.test(label) ? '5h' : /week|7/i.test(label) ? '7d' : out.length === 0 ? '5h' : '7d';
      if (seen.has(key)) continue;
      const pct = clampPercent((1 - Math.min(fraction, 1)) * 100);
      if (pct === null) continue;
      seen.add(key);
      const w: UsageWindow = { key, pct };
      const iso = normalizeResetAt(remaining?.resetTime ?? bucket.resetTime);
      if (iso) w.resetsAt = iso;
      out.push(w);
    }
  }
  return out;
}

function make(
  entry: RegistrySubscription,
  windows: UsageWindow[],
  label: string,
  confidence: Subscription['confidence'],
  plan?: string,
): Subscription {
  return {
    id: entry.id,
    tool: 'Gemini',
    label,
    plan: plan ?? entry.plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectGemini(entry: RegistrySubscription): Promise<Subscription> {
  const key = `gemini:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const creds = readGeminiOauth(entry);
  if (!creds) {
    const empty = make(entry, [], '未登录（gemini 登录后自动接入）', 'error');
    quotaRemember(key, empty, false);
    return empty;
  }
  const token = await ensureGeminiToken(creds);
  if (!token) {
    const stale = cached ?? make(entry, [], 'token 失效', 'error');
    quotaRemember(key, stale, false);
    return stale;
  }

  let tier: LoadCodeAssistInfo = {};
  try {
    const res = await postJson(`${CODE_ASSIST_BASE}:loadCodeAssist`, token, {
      metadata: { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' },
    });
    if (res.status === 200) tier = parseLoadCodeAssist(res.body);
  } catch {
    /* tier probe is best-effort */
  }

  // Licensed accounts answer the remote quota endpoints.
  if (tier.project) {
    try {
      const [quotaRes, modelsRes] = await Promise.all([
        postJson(`${CODE_ASSIST_BASE}:retrieveUserQuota`, token, { project: tier.project }),
        postJson(`${CODE_ASSIST_BASE}:fetchAvailableModels`, token, { project: tier.project }),
      ]);
      const buckets = [
        ...bucketsFromRetrieveUserQuota(quotaRes.status === 200 ? quotaRes.body : null),
        ...bucketsFromAvailableModels(modelsRes.status === 200 ? modelsRes.body : null),
      ];
      const windows = windowsFromQuotaBuckets(buckets);
      if (windows.length) {
        const sub = make(entry, windows, 'Code Assist', 'live', tier.plan ?? entry.plan);
        quotaRemember(key, sub, true);
        return sub;
      }
    } catch {
      /* fall through to local probe */
    }
  }

  // Free tier: the Antigravity IDE language server holds the live numbers.
  const endpoint = findAntigravityEndpoint();
  if (endpoint) {
    const res = await localPost(
      endpoint.port,
      endpoint.csrf,
      '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
      { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en', ideVersion: 'unknown' },
    );
    const windows = res.status === 200 ? windowsFromAntigravitySummary(res.body) : [];
    if (windows.length) {
      const sub = make(entry, windows, 'Antigravity · 免费档', 'live', tier.plan ?? entry.plan ?? 'Free');
      quotaRemember(key, sub, true);
      return sub;
    }
  }

  const message = endpoint ? '配额接口不可用（免费档需 Antigravity 内部授权）' : '免费档需 Antigravity 运行中';
  const fallback = cached ?? make(entry, [], message, 'error', tier.plan ?? entry.plan);
  quotaRemember(key, fallback, false);
  return fallback;
}
