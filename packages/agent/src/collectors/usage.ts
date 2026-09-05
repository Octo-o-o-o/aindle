import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SourceUsage } from '@aindle/core';
import { expandHome, type RegistryFile, type RegistrySubscription } from '../registry.js';
import { costOf } from '../lib/pricing.js';
import { claudeProjectsDir } from './claude.js';
import { codexSessionsDir, listCodexRollouts } from './codex.js';
import { kimiProjectsDir } from './kimi.js';
import { listJsonlSessions } from './sessions.js';

const HOUR_MS = 3600_000;
const SCAN_WINDOW_MS = 8 * 24 * HOUR_MS;
const KEEP_HOURS = 8 * 24;

interface Bucket {
  tokens: number;
  cost?: number;
}

interface CacheEntry {
  size: number;
  buckets: Record<string, Bucket>;
  lastMs: number;
}

type CacheFile = Record<string, CacheEntry>;

type Flavor = 'claude' | 'codex';

function cachePath(): string {
  const hinted = process.env.AINDLE_USAGE_CACHE_FILE?.trim();
  if (hinted) return hinted;
  return path.join(os.homedir(), '.config', 'aindle', 'usage-cache.json');
}

function loadCache(): CacheFile {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CacheFile) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: CacheFile): void {
  try {
    const file = cachePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(cache)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    /* cache is best-effort */
  }
}

function asRec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function tsMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : undefined;
}

interface ParsedRecord {
  ms?: number;
  tokens: number;
  cost?: number;
}

function claudeRecord(rec: Record<string, unknown>): ParsedRecord | null {
  const msg = asRec(rec.message);
  const usage = asRec(msg?.usage);
  if (!usage) return null;
  const input = num(usage.input_tokens);
  const output = num(usage.output_tokens);
  const cacheRead = num(usage.cache_read_input_tokens);
  const cacheWrite = num(usage.cache_creation_input_tokens);
  const tokens = input + output + cacheRead + cacheWrite;
  if (!tokens) return null;
  const model = typeof msg?.model === 'string' ? msg.model : '';
  const cost = costOf(model, { input, output, cacheRead, cacheWrite });
  const ms = tsMs(rec.timestamp);
  return { ...(ms !== undefined ? { ms } : {}), tokens, ...(cost !== undefined ? { cost } : {}) };
}

function parseSlice(
  text: string,
  flavor: Flavor,
  state: { model?: string },
): ParsedRecord[] {
  const out: ParsedRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (flavor === 'claude') {
      const parsed = claudeRecord(rec);
      if (parsed) out.push(parsed);
      continue;
    }
    const payload = asRec(rec.payload);
    if (
      (rec.type === 'session_meta' || rec.type === 'turn_context') &&
      typeof payload?.model === 'string' &&
      payload.model
    ) {
      state.model = payload.model;
    }
    if (payload?.type !== 'token_count') continue;
    const last = asRec(asRec(payload.info)?.last_token_usage);
    if (!last) continue;
    const input = num(last.input_tokens);
    const output = num(last.output_tokens);
    const reasoning = num(last.reasoning_output_tokens);
    const tokens = input + output + reasoning;
    if (!tokens) continue;
    const cacheRead = num(last.cached_input_tokens);
    const cacheWrite = num(last.cache_write_input_tokens);
    const cost = state.model
      ? costOf(state.model, {
          input: Math.max(0, input - cacheRead),
          output: output + reasoning,
          cacheRead,
          cacheWrite,
        })
      : undefined;
    const ms = tsMs(rec.timestamp);
    out.push({ ...(ms !== undefined ? { ms } : {}), tokens, ...(cost !== undefined ? { cost } : {}) });
  }
  return out;
}

function scanFile(
  file: string,
  flavor: Flavor,
  size: number,
  mtime: number,
  cached: CacheEntry | undefined,
  now: number,
): CacheEntry {
  if (cached && cached.size === size) return cached;
  let offset = 0;
  let buckets: Record<string, Bucket> = {};
  let lastMs = 0;
  if (cached && cached.size > 0 && cached.size < size) {
    offset = cached.size;
    buckets = { ...cached.buckets };
    lastMs = cached.lastMs;
  }
  try {
    const fd = fs.openSync(file, 'r');
    let text = '';
    let startsMidLine = false;
    try {
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      text = buf.toString('utf8');
      if (offset > 0) {
        const prev = Buffer.alloc(1);
        fs.readSync(fd, prev, 0, 1, offset - 1);
        startsMidLine = prev[0] !== 0x0a;
      }
    } finally {
      fs.closeSync(fd);
    }
    if (startsMidLine) {
      const nl = text.indexOf('\n');
      text = nl === -1 ? '' : text.slice(nl + 1);
    }
    const state: { model?: string } = {};
    for (const rec of parseSlice(text, flavor, state)) {
      if (rec.ms !== undefined && rec.ms > lastMs) lastMs = rec.ms;
      const hour = Math.floor((rec.ms ?? mtime) / HOUR_MS);
      const key = String(hour);
      const bucket = buckets[key] ?? { tokens: 0 };
      bucket.tokens += rec.tokens;
      if (rec.cost !== undefined) bucket.cost = (bucket.cost ?? 0) + rec.cost;
      buckets[key] = bucket;
    }
  } catch {
    /* unreadable file: keep whatever the cache had */
  }
  const minHour = Math.floor(now / HOUR_MS) - KEEP_HOURS;
  for (const key of Object.keys(buckets)) {
    if (Number(key) < minHour) delete buckets[key];
  }
  return { size, buckets, lastMs };
}

interface UsageFile {
  file: string;
  flavor: Flavor;
  size: number;
  mtime: number;
}

function statUsageFile(file: string, flavor: Flavor, cutoff: number): UsageFile | null {
  try {
    const st = fs.statSync(file);
    if (st.mtimeMs < cutoff) return null;
    return { file, flavor, size: st.size, mtime: st.mtimeMs };
  } catch {
    return null;
  }
}

function usageFiles(sub: RegistrySubscription, now: number): UsageFile[] {
  const cutoff = now - SCAN_WINDOW_MS;
  switch (sub.tool) {
    case 'claude':
    case 'kimi':
    case 'glm': {
      const root =
        sub.tool === 'claude'
          ? claudeProjectsDir(sub)
          : sub.tool === 'kimi'
            ? kimiProjectsDir(sub)
            : expandHome(sub.projectsDir ?? '~/.claude-glm/projects');
      return listJsonlSessions(root)
        .map((sess) => statUsageFile(sess.file, 'claude', cutoff))
        .filter((row): row is UsageFile => row !== null);
    }
    case 'codex':
      return listCodexRollouts(codexSessionsDir(sub), SCAN_WINDOW_MS)
        .map((file) => statUsageFile(file, 'codex', cutoff))
        .filter((row): row is UsageFile => row !== null);
    default:
      return [];
  }
}

function roundCost(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function sumWindow(agg: Map<number, Bucket>, fromHour: number, toHour: number): Bucket {
  let tokens = 0;
  let cost: number | undefined;
  for (const [hour, bucket] of agg) {
    if (hour < fromHour || hour > toHour) continue;
    tokens += bucket.tokens;
    if (bucket.cost !== undefined) cost = (cost ?? 0) + bucket.cost;
  }
  return { tokens: Math.round(tokens), ...(cost !== undefined ? { cost: roundCost(cost) } : {}) };
}

/**
 * Local session JSONL → per-subscription 24h/7d token usage (+ USD estimate).
 * Subscriptions without any session file in the last 8 days get no entry, so
 * the hub's "no evidence, don't hide" rule applies. A subscription with files
 * but zero usage records still reports d7.tokens=0 + lastUsedAt=file mtime.
 */
export function collectSourceUsage(registry: RegistryFile, now = Date.now()): Map<string, SourceUsage> {
  const cache = loadCache();
  const seen = new Set<string>();
  const out = new Map<string, SourceUsage>();

  for (const sub of registry.subscriptions) {
    const files = usageFiles(sub, now);
    if (!files.length) continue;
    const agg = new Map<number, Bucket>();
    let lastMs = 0;
    let lastMtime = 0;
    for (const uf of files) {
      seen.add(uf.file);
      lastMtime = Math.max(lastMtime, uf.mtime);
      const entry = scanFile(uf.file, uf.flavor, uf.size, uf.mtime, cache[uf.file], now);
      cache[uf.file] = entry;
      lastMs = Math.max(lastMs, entry.lastMs);
      for (const [key, bucket] of Object.entries(entry.buckets)) {
        const hour = Number(key);
        const cur = agg.get(hour) ?? { tokens: 0 };
        cur.tokens += bucket.tokens;
        if (bucket.cost !== undefined) cur.cost = (cur.cost ?? 0) + bucket.cost;
        agg.set(hour, cur);
      }
    }
    const currentHour = Math.floor(now / HOUR_MS);
    out.set(sub.id, {
      h24: sumWindow(agg, currentHour - 23, currentHour),
      d7: sumWindow(agg, currentHour - 167, currentHour),
      lastUsedAt: new Date(lastMs || lastMtime).toISOString(),
    });
  }

  for (const key of Object.keys(cache)) {
    if (!seen.has(key)) delete cache[key];
  }
  saveCache(cache);
  return out;
}
