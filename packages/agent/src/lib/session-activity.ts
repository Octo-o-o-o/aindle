import fs from 'node:fs';
import path from 'node:path';

const LIVE_MS = 10 * 60_000;

function walkLatest(dir: string, newest: number, stopAfter: number): number {
  let latest = newest;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return latest;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      latest = walkLatest(full, latest, stopAfter);
      if (latest >= stopAfter) return latest;
      continue;
    }
    if (!/\.(jsonl|db|json)$/i.test(entry.name)) continue;
    try {
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime > latest) latest = mtime;
      if (latest >= stopAfter) return latest;
    } catch {
      continue;
    }
  }
  return latest;
}

export function latestSessionMtime(dir: string): number {
  if (!dir || !fs.existsSync(dir)) return 0;
  return walkLatest(dir, 0, Number.POSITIVE_INFINITY);
}

export function hasLiveLocalSession(dir: string, withinMs = LIVE_MS, now = Date.now()): boolean {
  if (!dir || !fs.existsSync(dir)) return false;
  const cutoff = now - withinMs;
  return walkLatest(dir, 0, cutoff) >= cutoff;
}
