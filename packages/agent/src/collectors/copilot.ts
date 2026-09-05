import fs from 'node:fs';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';
import { readMacKeychainPassword } from '../lib/keychain.js';

// GitHub Copilot personal premium-request usage via the same endpoint the
// editor uses (undocumented, also used by VS Code/Zed/CodexBar):
// GET https://api.github.com/copilot_internal/user → quota_snapshots.
// Reading the Copilot CLI keychain item triggers a macOS authorization
// dialog on first use, so that path is opt-in via AINDLE_COPILOT_KEYCHAIN=1;
// prefer AINDLE_COPILOT_TOKEN or registry keyFile.
const USER_URL = 'https://api.github.com/copilot_internal/user';
const KEYCHAIN_SERVICES = ['copilot-cli', 'github-copilot-app'];

const PLAN_NAMES: Record<string, string> = {
  individual_pro: 'Pro',
  individual_pro_plus: 'Pro+',
  individual_pro_plus_plus: 'Pro++',
  individual: 'Individual',
  plus: 'Plus',
  free: 'Free',
  business: 'Business',
  enterprise: 'Enterprise',
  pro_monthly: 'Pro',
  pro_plus_monthly: 'Pro+',
};

export function copilotHome(entry: RegistrySubscription): string {
  return expandHome(entry.home ?? '~/.copilot');
}

export function copilotPlanLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;
  return PLAN_NAMES[key] ?? key;
}

function tokenFromEnvFiles(entry: RegistrySubscription): string | undefined {
  const env = process.env.AINDLE_COPILOT_TOKEN?.trim();
  if (env) return env;
  if (!entry.keyFile) return undefined;
  try {
    const text = fs.readFileSync(expandHome(entry.keyFile), 'utf8').trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function tokenFromKeychain(): string | undefined {
  if (!['1', 'on', 'true', 'yes'].includes(String(process.env.AINDLE_COPILOT_KEYCHAIN ?? '').toLowerCase())) {
    return undefined;
  }
  if (process.platform !== 'darwin') return undefined;
  for (const service of KEYCHAIN_SERVICES) {
    const raw = readMacKeychainPassword(service);
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.startsWith('gh')) return trimmed;
    // Some builds store a JSON blob; tolerate both shapes.
    try {
      const parsed = JSON.parse(trimmed) as { access_token?: string; token?: string };
      const inner = parsed.access_token ?? parsed.token;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    } catch {
      /* plain token */
    }
    if (trimmed.length > 20) return trimmed;
  }
  return undefined;
}

export function resolveCopilotToken(entry: RegistrySubscription): string | undefined {
  return tokenFromEnvFiles(entry) ?? tokenFromKeychain();
}

export interface CopilotSnapshotRow {
  unlimited?: boolean;
  percent_remaining?: number;
}

export function windowsFromCopilotUser(body: unknown): UsageWindow[] {
  if (!body || typeof body !== 'object') return [];
  const snapshots = (body as { quota_snapshots?: Record<string, unknown> }).quota_snapshots;
  if (!snapshots || typeof snapshots !== 'object') return [];
  const premium = snapshots.premium_interactions as CopilotSnapshotRow | undefined;
  if (!premium || premium.unlimited === true) return [];
  const remaining = Number(premium.percent_remaining);
  if (!Number.isFinite(remaining)) return [];
  const pct = clampPercent(100 - remaining);
  if (pct === null) return [];
  const reset = normalizeResetAt(
    (body as { quota_reset_date_utc?: unknown; quota_reset_date?: unknown }).quota_reset_date_utc ??
      (body as { quota_reset_date?: unknown }).quota_reset_date,
  );
  const window: UsageWindow = { key: '月', pct };
  if (reset) window.resetsAt = reset;
  return [window];
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
    tool: 'Copilot',
    label,
    plan: plan ?? entry.plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence,
  };
}

export async function collectCopilot(entry: RegistrySubscription): Promise<Subscription> {
  const key = `copilot:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const token = resolveCopilotToken(entry);
  if (!token) {
    const empty = make(entry, [], '无 token（设 AINDLE_COPILOT_TOKEN / keyFile）', 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  try {
    const res = await fetch(USER_URL, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.2',
        'Editor-Plugin-Version': 'copilot-chat/0.26.7',
        'User-Agent': 'GitHubCopilotChat/0.26.7',
        'X-GitHub-Api-Version': '2025-04-01',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Copilot token 无效');
    }
    if (!res.ok) throw new Error(`Copilot HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    const windows = windowsFromCopilotUser(body);
    const plan = entry.plan ?? copilotPlanLabel(body.copilot_plan);
    const sub = make(entry, windows, windows.length ? 'Premium requests' : '无配额快照', windows.length ? 'live' : 'error', plan);
    quotaRemember(key, sub, windows.length > 0);
    return sub;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = cached ?? make(entry, [], message.slice(0, 24), 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}

export function copilotDbPath(entry: RegistrySubscription): string {
  return path.join(copilotHome(entry), 'data.db');
}
