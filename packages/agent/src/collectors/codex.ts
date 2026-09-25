import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import type { Subscription, UsageWindow } from '@aindle/core';
import { codexHomePath, type RegistrySubscription } from '../registry.js';
import { clampPercent, decodeJwtPayload, normalizeResetAt } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

const WHAM_URL = 'https://chatgpt.com/backend-api/wham/usage';
const APP_SERVER_TIMEOUT_MS = 12_000;
const TIMEOUT_MS = 15_000;
const ROLLOUT_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.jsonl)?$/i;
const PLAN_NAMES: Record<string, string> = {
  pro: 'Pro',
  plus: 'Plus',
  free: 'Free',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  go: 'Go',
};

interface CodexAuth {
  tokens?: {
    access_token?: string;
    account_id?: string;
    id_token?: string;
  };
}

interface WhamWindow {
  used_percent?: number;
  reset_at?: unknown;
  limit_reached?: boolean;
  window_minutes?: number;
  limit_window_seconds?: number;
  window_seconds?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function formatChatgptPlan(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim().toLowerCase().replace(/^chatgpt[_-]?/, '');
  if (!key) return undefined;
  if (PLAN_NAMES[key]) return PLAN_NAMES[key];
  return key.replace(/^./, (c) => c.toUpperCase());
}

function chatgptAuthClaims(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  return asRecord(decodeJwtPayload(token)?.['https://api.openai.com/auth']);
}

function readAuthBundle(home: string): { token: string; accountId: string | null; plan?: string } | null {
  const authPath = path.join(home, 'auth.json');
  if (!fs.existsSync(authPath)) return null;
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as CodexAuth;
    const token = auth.tokens?.access_token?.trim();
    if (!token) return null;
    const authNs = chatgptAuthClaims(auth.tokens?.id_token) ?? chatgptAuthClaims(token);
    let accountId = auth.tokens?.account_id?.trim() || null;
    if (!accountId && typeof authNs?.chatgpt_account_id === 'string') {
      accountId = authNs.chatgpt_account_id;
    }
    return { token, accountId, plan: formatChatgptPlan(authNs?.chatgpt_plan_type) };
  } catch {
    return null;
  }
}

export function listCodexRollouts(sessionsDir: string, maxAgeMs: number): string[] {
  if (!fs.existsSync(sessionsDir)) return [];
  const cutoff = Date.now() - maxAgeMs;
  const found: { file: string; mtime: number }[] = [];

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile() || !ent.name.endsWith('.jsonl')) continue;
      try {
        const mtime = fs.statSync(full).mtimeMs;
        if (mtime >= cutoff) found.push({ file: full, mtime });
      } catch {
        /* skip */
      }
    }
  };

  walk(sessionsDir);
  return found.sort((a, b) => b.mtime - a.mtime).map((row) => row.file);
}

export function rolloutThreadId(file: string): string | null {
  const match = path.basename(file).match(ROLLOUT_ID_RE);
  return match?.[1] ?? null;
}

export type RolloutMeta = {
  id?: string;
  cwd?: string;
  parentThreadId?: string;
  threadSource?: string;
};

export function readRolloutMeta(file: string): RolloutMeta {
  try {
    const fd = fs.openSync(file, 'r');
    let text = '';
    const buf = Buffer.alloc(8192);
    let offset = 0;
    while (text.length < 256_000) {
      const n = fs.readSync(fd, buf, 0, buf.length, offset);
      if (n <= 0) break;
      offset += n;
      text += buf.toString('utf8', 0, n);
      const nl = text.indexOf('\n');
      if (nl !== -1) {
        text = text.slice(0, nl);
        break;
      }
    }
    fs.closeSync(fd);
    if (!text) return {};
    try {
      const payload = asRecord(JSON.parse(text).payload);
      const id =
        typeof payload?.id === 'string'
          ? payload.id
          : typeof payload?.session_id === 'string'
            ? payload.session_id
            : undefined;
      const cwd = typeof payload?.cwd === 'string' ? payload.cwd : undefined;
      const parentThreadId =
        typeof payload?.parent_thread_id === 'string' ? payload.parent_thread_id : undefined;
      const threadSource = typeof payload?.thread_source === 'string' ? payload.thread_source : undefined;
      return { id, cwd, parentThreadId, threadSource };
    } catch {
      const cwd = text.match(/"cwd"\s*:\s*"((?:\\.|[^"\\])*)"/);
      const id =
        text.match(/"session_id"\s*:\s*"([0-9a-f-]{36})"/i) ??
        text.match(/"id"\s*:\s*"([0-9a-f-]{36})"/i);
      const parent = text.match(/"parent_thread_id"\s*:\s*"([0-9a-f-]{36})"/i);
      const source = text.match(/"thread_source"\s*:\s*"([^"]+)"/);
      return {
        cwd: cwd ? (JSON.parse(`"${cwd[1]}"`) as string) : undefined,
        id: id?.[1],
        parentThreadId: parent?.[1],
        threadSource: source?.[1],
      };
    }
  } catch {
    return {};
  }
}

export function clipSessionTitle(raw: string, max = 32): string {
  let t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^#+\s*/, '');
  if (!t) return '';
  return t.length > max ? `${[...t].slice(0, max - 1).join('')}…` : t;
}

export function loadCodexThreadNames(home: string): Map<string, string> {
  const map = new Map<string, string>();
  const indexPath = path.join(home, 'session_index.jsonl');
  if (!fs.existsSync(indexPath)) return map;
  try {
    for (const line of fs.readFileSync(indexPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const row = asRecord(JSON.parse(line));
      if (typeof row?.id === 'string' && typeof row.thread_name === 'string' && row.thread_name.trim()) {
        map.set(row.id, row.thread_name.trim());
      }
    }
  } catch {
    /* ignore a broken index */
  }
  return map;
}

function minutesFromWham(w: WhamWindow | undefined): number | undefined {
  if (!w) return undefined;
  const minutes = Number(w.window_minutes);
  if (Number.isFinite(minutes) && minutes > 0) return minutes;
  const seconds = Number(w.limit_window_seconds ?? w.window_seconds);
  if (Number.isFinite(seconds) && seconds > 0) return seconds / 60;
  return undefined;
}

function inferWindowKey(w: WhamWindow | undefined, fallback: string): string {
  const fromMinutes = windowKeyFromMinutes(minutesFromWham(w), '');
  if (fromMinutes) return fromMinutes;
  const reset = Date.parse(String(normalizeResetAt(w?.reset_at) ?? ''));
  if (Number.isFinite(reset) && reset - Date.now() > 12 * 3600_000) return '7d';
  return fallback;
}

interface WhamRateLimit {
  primary_window?: WhamWindow;
  secondary_window?: WhamWindow;
  primaryWindow?: WhamWindow;
  secondaryWindow?: WhamWindow;
}

interface WhamAdditionalLimit {
  limit_name?: string;
  limitName?: string;
  metered_feature?: string;
  meteredFeature?: string;
  rate_limit?: WhamRateLimit;
  rateLimit?: WhamRateLimit;
}

interface WhamUsageBody {
  rate_limit?: WhamRateLimit;
  rateLimit?: WhamRateLimit;
  additional_rate_limits?: WhamAdditionalLimit[];
  additionalRateLimits?: WhamAdditionalLimit[];
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function extraCodexWindowKey(name: string, minutes?: number): string {
  const lower = name.toLowerCase();
  if (lower.includes('spark')) {
    if (minutes != null && minutes >= 24 * 60) return 'Spark周';
    return 'Spark';
  }
  const raw = name.replace(/^codex[-_\s]*/i, '').trim() || name.trim();
  if (raw.length <= 8) return raw;
  return `${[...raw].slice(0, 7).join('')}…`;
}

function pushUniqueWindow(out: UsageWindow[], key: string, raw: unknown, reset: unknown): void {
  const pct = clampPercent(raw);
  if (pct === null) return;
  if (out.some((w) => w.key === key)) return;
  out.push({ key, pct, resetsAt: normalizeResetAt(reset) });
}

function shapeWhamBucket(out: UsageWindow[], window: WhamWindow | undefined, fallback: string): void {
  if (!window) return;
  pushUniqueWindow(
    out,
    inferWindowKey(window, fallback),
    window.used_percent ?? (window as { usedPercent?: number }).usedPercent,
    window.reset_at ?? (window as { resetAt?: unknown }).resetAt,
  );
}

function shapeAdditionalWham(out: UsageWindow[], extras: WhamAdditionalLimit[] | undefined): void {
  if (!extras?.length) return;
  for (const entry of extras) {
    const limit = entry.rate_limit ?? entry.rateLimit;
    const name = firstNonEmpty(entry.limit_name, entry.limitName, entry.metered_feature, entry.meteredFeature);
    if (!name) continue;
    const primary = limit?.primary_window ?? limit?.primaryWindow;
    const secondary = limit?.secondary_window ?? limit?.secondaryWindow;
    if (primary) {
      pushUniqueWindow(
        out,
        extraCodexWindowKey(name, minutesFromWham(primary)),
        primary.used_percent ?? (primary as { usedPercent?: number }).usedPercent,
        primary.reset_at ?? (primary as { resetAt?: unknown }).resetAt,
      );
    }
    if (secondary) {
      pushUniqueWindow(
        out,
        extraCodexWindowKey(`${name} week`, minutesFromWham(secondary) ?? 24 * 60),
        secondary.used_percent ?? (secondary as { usedPercent?: number }).usedPercent,
        secondary.reset_at ?? (secondary as { resetAt?: unknown }).resetAt,
      );
    }
  }
}

export function shapeWhamWindows(body: WhamUsageBody): UsageWindow[] {
  const out: UsageWindow[] = [];
  const limit = body.rate_limit ?? body.rateLimit;
  shapeWhamBucket(out, limit?.primary_window ?? limit?.primaryWindow, '5h');
  shapeWhamBucket(out, limit?.secondary_window ?? limit?.secondaryWindow, '7d');
  shapeAdditionalWham(out, body.additional_rate_limits ?? body.additionalRateLimits);
  return out;
}

export function isCodexProPlan(plan?: string): boolean {
  const key = (plan ?? '').trim().toLowerCase();
  return key === 'pro' || key.startsWith('pro ') || /^pro\d/.test(key);
}

export function finalizeCodexWindows(windows: UsageWindow[], plan?: string): UsageWindow[] {
  if (!isCodexProPlan(plan)) return windows;
  const extras = windows.filter((w) => w.key !== '5h' && w.key !== '7d');
  const weekly = windows.filter((w) => w.key === '7d');
  if (weekly.length) return [...weekly, ...extras];
  const remapped = windows
    .filter((w) => w.key === '5h' || w.key === '7d')
    .map((w) => (w.key === '5h' ? { ...w, key: '7d' } : w));
  return [...remapped, ...extras];
}

async function fetchWhamUsage(token: string, accountId: string | null): Promise<UsageWindow[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (accountId) headers['ChatGPT-Account-Id'] = accountId;

  const res = await fetch(WHAM_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 401 || res.status === 403 || res.status === 404) return [];
  if (!res.ok) throw new Error(`Codex wham HTTP ${res.status}`);
  const body = (await res.json()) as WhamUsageBody;
  return shapeWhamWindows(body);
}

function appServerEnabled(): boolean {
  const flag = String(process.env.CODEX_APP_SERVER ?? '').toLowerCase();
  return !['0', 'off', 'false'].includes(flag);
}

function windowMinutes(rec: Record<string, unknown> | null): number | undefined {
  if (!rec) return undefined;
  const n = Number(rec.windowDurationMins ?? rec.window_duration_mins ?? rec.window_minutes ?? rec.window);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function pushAppServerWindow(
  out: UsageWindow[],
  rec: Record<string, unknown> | null,
  fallback: string,
  keyOverride?: string,
): void {
  if (!rec) return;
  const minutes = windowMinutes(rec);
  const key = keyOverride ?? windowKeyFromMinutes(minutes, fallback);
  pushUniqueWindow(
    out,
    key,
    rec.usedPercent ?? rec.used_percent ?? rec.percent,
    rec.resetsAt ?? rec.resets_at ?? rec.reset_at,
  );
}

export function windowsFromAppServerResult(result: unknown): UsageWindow[] {
  const root = asRecord(result);
  if (!root) return [];
  const out: UsageWindow[] = [];
  const rl = asRecord(root.rateLimits) ?? asRecord(root.rate_limits);
  const primary = asRecord(rl?.primary);
  const secondary = asRecord(rl?.secondary);
  if (primary || secondary) {
    pushAppServerWindow(out, primary, '5h');
    pushAppServerWindow(out, secondary, '7d');
  } else if (rl) {
    pushAppServerWindow(out, asRecord(rl.fiveHour) ?? asRecord(rl.five_hour), '5h', '5h');
    pushAppServerWindow(out, asRecord(rl.sevenDay) ?? asRecord(rl.seven_day), '7d', '7d');
  }

  const byId = asRecord(root.rateLimitsByLimitId) ?? asRecord(root.rate_limits_by_limit_id);
  const mainId = typeof rl?.limitId === 'string' ? rl.limitId : typeof rl?.limit_id === 'string' ? rl.limit_id : 'codex';
  if (byId) {
    for (const [id, snap] of Object.entries(byId)) {
      if (id === mainId || id === 'codex') continue;
      const rec = asRecord(snap);
      const p = asRecord(rec?.primary);
      const s = asRecord(rec?.secondary);
      if (p) pushAppServerWindow(out, p, '5h', extraCodexWindowKey(id, windowMinutes(p)));
      if (s) pushAppServerWindow(out, s, '7d', extraCodexWindowKey(`${id} week`, windowMinutes(s) ?? 24 * 60));
    }
  }
  return out;
}

function readAccountViaAppServer(home: string): Promise<UsageWindow[]> {
  return new Promise((resolve, reject) => {
    const command = process.env.CODEX_BIN ?? 'codex';
    const child = spawn(command, ['-s', 'read-only', '-a', 'never', 'app-server'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
      env: { ...process.env, CODEX_HOME: home },
    });
    const lines = readline.createInterface({ input: child.stdout });
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      lines.close();
      child.kill();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const finish = (result: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(windowsFromAppServerResult(result));
    };

    const timer = setTimeout(() => fail(new Error('Codex app-server timeout')), APP_SERVER_TIMEOUT_MS);
    child.once('error', fail);
    child.once('exit', (code) => {
      if (!settled) fail(new Error(`Codex app-server exited (${code ?? 'unknown'})`));
    });
    lines.on('line', (line) => {
      let message: { id?: number; error?: unknown; result?: unknown };
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === 0) {
        if (message.error) return fail(new Error('Codex app-server init failed'));
        child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
        child.stdin.write(`${JSON.stringify({ method: 'account/rateLimits/read', id: 1, params: null })}\n`);
        return;
      }
      if (message.id !== 1) return;
      if (message.error) return fail(new Error('Codex rate limits failed'));
      finish(message.result);
    });
    child.stdin.write(
      `${JSON.stringify({
        method: 'initialize',
        id: 0,
        params: {
          clientInfo: { name: 'aindle', title: 'Aindle', version: '0.1.0' },
          capabilities: { experimentalApi: true },
        },
      })}\n`,
    );
  });
}

function windowKeyFromMinutes(minutes: unknown, fallback: string): string {
  const n = Number(minutes);
  if (Number.isFinite(n) && n > 0) {
    if (n >= 24 * 60) return '7d';
    if (n >= 60) return '5h';
  }
  return fallback;
}

function pushWindow(out: UsageWindow[], key: string, raw: unknown, reset: unknown): void {
  const pct = clampPercent(raw);
  if (pct === null) return;
  out.push({ key, pct, resetsAt: normalizeResetAt(reset) });
}

function windowsFromRolloutEvent(evt: Record<string, unknown>): { windows: UsageWindow[]; plan?: string } {
  const payload = asRecord(evt.payload);
  if (evt.type !== 'token_count' && payload?.type !== 'token_count') return { windows: [] };
  const rl = asRecord(evt.rate_limits) ?? asRecord(payload?.rate_limits);
  if (!rl) return { windows: [] };
  const out: UsageWindow[] = [];
  const primary = asRecord(rl.primary);
  const secondary = asRecord(rl.secondary);
  if (primary) {
    pushWindow(
      out,
      windowKeyFromMinutes(primary.window_minutes ?? primary.window, '5h'),
      primary.used_percent ?? primary.percent,
      primary.resets_at ?? primary.reset_at,
    );
  } else {
    pushWindow(
      out,
      typeof rl.window === 'string' ? rl.window : '5h',
      rl.used_percent ?? rl.percent,
      rl.resets_at ?? rl.reset_at,
    );
  }
  if (secondary) {
    pushWindow(
      out,
      windowKeyFromMinutes(secondary.window_minutes ?? secondary.window, '7d'),
      secondary.used_percent ?? secondary.percent,
      secondary.resets_at ?? secondary.reset_at,
    );
  }
  return { windows: out, plan: formatChatgptPlan(rl.plan_type) };
}

function readTailLines(file: string, maxBytes = 80_000): string[] {
  const st = fs.statSync(file);
  const start = Math.max(0, st.size - maxBytes);
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(st.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  return buf.toString('utf8').split('\n');
}

function collectFromRollouts(home: string): { windows: UsageWindow[]; plan?: string } {
  const files = listCodexRollouts(path.join(home, 'sessions'), 2 * 24 * 60 * 60_000).slice(0, 12);
  for (const file of files) {
    try {
      for (const line of readTailLines(file).reverse()) {
        if (!line.trim()) continue;
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const parsed = windowsFromRolloutEvent(evt);
        if (parsed.windows.length) return parsed;
      }
    } catch {
      continue;
    }
  }
  return { windows: [] };
}

function mergeWindows(primary: UsageWindow[], extra: UsageWindow[]): UsageWindow[] {
  const seen = new Set(primary.map((w) => w.key));
  const out = [...primary];
  for (const w of extra) {
    if (seen.has(w.key)) continue;
    seen.add(w.key);
    out.push(w);
  }
  return out;
}

export async function collectCodex(entry: RegistrySubscription): Promise<Subscription> {
  const home = codexHomePath(entry.home);
  const key = `codex:${entry.id}`;
  const cached = quotaPeek<UsageWindow[]>(key);
  let windows: UsageWindow[] = [];
  let confidence: Subscription['confidence'] = 'error';

  const auth = readAuthBundle(home);
  let rolloutPlan: string | undefined;
  const local = collectFromRollouts(home);
  rolloutPlan = local.plan;

  if (!quotaDue(key) && cached?.length) {
    windows = cached;
    confidence = 'cached';
  } else {
    if (auth) {
      try {
        windows = await fetchWhamUsage(auth.token, auth.accountId);
        if (windows.length) confidence = 'live';
      } catch {
        /* try fallbacks */
      }
    }

    if (!windows.length && appServerEnabled()) {
      try {
        windows = await readAccountViaAppServer(home);
        if (windows.length) confidence = 'live';
      } catch {
        /* rollout fallback */
      }
    }

    if (!windows.length) {
      windows = local.windows;
      if (windows.length) confidence = 'live';
    }
  }

  const plan = auth?.plan ?? rolloutPlan ?? entry.plan;
  windows = finalizeCodexWindows(mergeWindows(windows, local.windows), plan);
  if (confidence !== 'cached') quotaRemember(key, windows, windows.length > 0);

  return {
    id: entry.id,
    tool: 'Codex',
    label: entry.label,
    plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows,
    confidence: windows.length ? confidence : 'error',
  };
}

export function codexSessionsDir(entry: RegistrySubscription): string {
  return path.join(codexHomePath(entry.home), 'sessions');
}
