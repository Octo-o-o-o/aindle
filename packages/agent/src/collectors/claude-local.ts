import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UsageWindow } from '@aindle/core';
import { expandHome } from '../registry.js';

const FRESH_MS = 15 * 60_000;

type UnknownRecord = Record<string, unknown>;

export interface LocalClaudeUsage {
  windows: UsageWindow[];
  fresh: boolean;
  source?: string;
  mtime: number;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function clampPct(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function asIso(reset: unknown): string | undefined {
  if (typeof reset === 'string' && reset.trim()) {
    if (/^\d+(\.\d+)?$/.test(reset.trim())) return asIso(Number(reset));
    const t = Date.parse(reset);
    return Number.isFinite(t) ? new Date(t).toISOString() : reset.trim();
  }
  if (typeof reset === 'number' && Number.isFinite(reset) && reset > 0) {
    const ms = reset < 1e12 ? reset * 1000 : reset;
    return new Date(ms).toISOString();
  }
  return undefined;
}

function pushWindow(out: UsageWindow[], seen: Set<string>, key: string, pctRaw: unknown, resetsAt?: unknown) {
  const pct = clampPct(pctRaw);
  if (pct === null) return;
  const label = key.trim();
  if (!label || seen.has(label.toLowerCase())) return;
  seen.add(label.toLowerCase());
  const w: UsageWindow = { key: label, pct };
  const iso = asIso(resetsAt);
  if (iso) w.resetsAt = iso;
  out.push(w);
}

function windowFromBucket(raw: unknown): { pct: unknown; reset: unknown } | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const pct = rec.used_percentage ?? rec.utilization ?? rec.percent;
  if (clampPct(pct) === null) return undefined;
  return { pct, reset: rec.resets_at ?? rec.resetsAt ?? rec.reset };
}

export function windowsFromClaudeUsage(raw: unknown): UsageWindow[] {
  const root = asRecord(raw);
  if (!root) return [];
  if (Array.isArray(root.windows)) {
    const direct: UsageWindow[] = [];
    const seen = new Set<string>();
    for (const item of root.windows) {
      const rec = asRecord(item);
      if (!rec?.key) continue;
      pushWindow(direct, seen, String(rec.key), rec.pct ?? rec.used_percentage, rec.resetsAt ?? rec.resets_at);
    }
    if (direct.length) return direct;
  }
  const body = asRecord(root.rate_limits) ?? asRecord(root._vibe_usage) ?? root;
  const out: UsageWindow[] = [];
  const seen = new Set<string>();

  const five = windowFromBucket(body.five_hour);
  if (five) pushWindow(out, seen, '5h', five.pct, five.reset);
  const week = windowFromBucket(body.seven_day);
  if (week) pushWindow(out, seen, '7d', week.pct, week.reset);
  const opus = windowFromBucket(body.seven_day_opus);
  if (opus) pushWindow(out, seen, 'Opus', opus.pct, opus.reset);
  const sonnet = windowFromBucket(body.seven_day_sonnet);
  if (sonnet) pushWindow(out, seen, 'Sonnet', sonnet.pct, sonnet.reset);

  const limits = Array.isArray(body.limits) ? body.limits : [];
  for (const item of limits) {
    const rec = asRecord(item);
    if (!rec || rec.kind !== 'weekly_scoped') continue;
    const scope = asRecord(rec.scope);
    const model = asRecord(scope?.model);
    const label = String(model?.display_name ?? model?.id ?? '').trim();
    if (!label) continue;
    pushWindow(out, seen, label, rec.percent ?? rec.utilization, rec.resets_at ?? rec.resetsAt);
  }
  return out;
}

export function claudeLocalUsageHome(home?: string): string {
  if (home?.trim()) return expandHome(home.trim());
  return expandHome(process.env.AINDLE_CLAUDE_RATE_HOME?.trim() || os.homedir());
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  return [...new Set(paths.filter((p): p is string => Boolean(p)).map((p) => expandHome(p)))];
}

export function claudeLocalUsagePaths(home?: string): { headers: string[]; fill: string[]; own: string } {
  const root = claudeLocalUsageHome(home);
  const hinted = process.env.AINDLE_CLAUDE_RATE_FILE?.trim();
  const own = path.join(root, '.config', 'aindle', 'claude-rate-limits.json');
  return {
    headers: uniquePaths([hinted, path.join(root, '.vibe-island', 'cache', 'rl.json')]).filter((p) => p !== own),
    fill: uniquePaths([path.join(root, '.vibe-island', 'cache', 'anthropic-oauth-usage.json')]),
    own,
  };
}

function readUsageFile(file: string): { windows: UsageWindow[]; mtime: number } | undefined {
  try {
    const st = fs.statSync(file);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const windows = windowsFromClaudeUsage(raw);
    if (!windows.length) return undefined;
    return { windows, mtime: st.mtimeMs };
  } catch {
    return undefined;
  }
}

function mergeWindows(
  files: string[],
  byKey: Map<string, { win: UsageWindow; mtime: number; source: string }>,
  onlyMissing: boolean,
): { newest: number; source?: string } {
  let newest = 0;
  let source: string | undefined;
  for (const file of files) {
    const got = readUsageFile(file);
    if (!got) continue;
    if (got.mtime > newest) {
      newest = got.mtime;
      source = file;
    }
    for (const win of got.windows) {
      if (onlyMissing && byKey.has(win.key)) continue;
      const prev = byKey.get(win.key);
      if (!prev || got.mtime >= prev.mtime) byKey.set(win.key, { win, mtime: got.mtime, source: file });
    }
  }
  return { newest, source };
}

function sortWindows(windows: UsageWindow[]): UsageWindow[] {
  const rank: Record<string, number> = { '5h': 0, '7d': 1 };
  return [...windows].sort((a, b) => (rank[a.key] ?? 10) - (rank[b.key] ?? 10) || a.key.localeCompare(b.key));
}

export function readLocalClaudeUsage(now = Date.now(), home?: string): LocalClaudeUsage {
  const { headers, fill, own } = claudeLocalUsagePaths(home);
  const byKey = new Map<string, { win: UsageWindow; mtime: number; source: string }>();
  const header = mergeWindows(headers, byKey, false);
  const headerFresh = header.newest > 0 && now - header.newest <= FRESH_MS;
  // Fresh conversation headers win. Stale headers must not block a newer oauth snapshot
  // (Aindle used to keep Sep-4 test numbers in front of today's vibe-island file).
  const fillInfo = mergeWindows(fill, byKey, headerFresh);
  if (!byKey.size) mergeWindows([own], byKey, false);
  const newest = Math.max(header.newest, fillInfo.newest);
  const source = (fillInfo.newest >= header.newest ? fillInfo.source : undefined) ?? header.source;
  return {
    windows: sortWindows([...byKey.values()].map((row) => row.win)),
    fresh: newest > 0 && now - newest <= FRESH_MS,
    source,
    mtime: newest,
  };
}

export function writeLocalClaudeUsage(windows: UsageWindow[], home?: string): void {
  if (!windows.length) return;
  const file = path.join(claudeLocalUsageHome(home), '.config', 'aindle', 'claude-rate-limits.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify({ windows, updated_at: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
  fs.renameSync(tmp, file);
}
