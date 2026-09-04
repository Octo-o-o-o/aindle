import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription } from '@aindle/core';

function cachePath(): string {
  const hinted = process.env.AINDLE_QUOTA_LAST_FILE?.trim();
  if (hinted) return hinted;
  return path.join(os.homedir(), '.config', 'aindle', 'quota-last.json');
}

function loadAll(): Record<string, Subscription> {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as Record<string, Subscription>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function loadQuotaLast(id: string): Subscription | undefined {
  const row = loadAll()[id];
  if (!row?.windows?.length) return undefined;
  return row;
}

export function saveQuotaLast(sub: Subscription): void {
  if (!sub.id || !sub.windows?.length) return;
  const all = loadAll();
  all[sub.id] = {
    id: sub.id,
    tool: sub.tool,
    label: sub.label,
    plan: sub.plan,
    shared: sub.shared,
    source: sub.source,
    kind: sub.kind,
    windows: sub.windows,
    confidence: 'stale',
  };
  const dir = path.dirname(cachePath());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${cachePath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, cachePath());
}
