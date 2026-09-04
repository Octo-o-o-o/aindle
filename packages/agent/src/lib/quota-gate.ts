import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BUSY_INTERVAL_MS = 5 * 60_000;
export const IDLE_INTERVAL_MS = 45 * 60_000;
const BACKOFF_MS = [30 * 60_000, 60 * 60_000, 90 * 60_000];

interface Slot<T> {
  data?: T;
  nextAt: number;
  fails: number;
}

interface DiskSlot {
  nextAt: number;
  fails: number;
}

const slots = new Map<string, Slot<unknown>>();

function gatePath(): string {
  const hinted = process.env.AINDLE_QUOTA_GATE_FILE?.trim();
  if (hinted) return hinted;
  return path.join(os.homedir(), '.config', 'aindle', 'quota-gate.json');
}

function loadDisk(): Record<string, DiskSlot> {
  try {
    const raw = JSON.parse(fs.readFileSync(gatePath(), 'utf8')) as Record<string, DiskSlot>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveDisk(): void {
  const all = loadDisk();
  for (const [key, slot] of slots) {
    all[key] = { nextAt: slot.nextAt, fails: slot.fails };
  }
  const file = gatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function hydrate(key: string): Slot<unknown> | undefined {
  const mem = slots.get(key);
  if (mem) return mem;
  const disk = loadDisk()[key];
  if (!disk || !Number.isFinite(disk.nextAt)) return undefined;
  const slot: Slot<unknown> = { nextAt: disk.nextAt, fails: disk.fails ?? 0 };
  slots.set(key, slot);
  return slot;
}

export function quotaIntervalMs(busy = true): number {
  const envName = busy ? 'AINDLE_QUOTA_INTERVAL_SEC' : 'AINDLE_QUOTA_IDLE_INTERVAL_SEC';
  const fallback = busy ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS;
  const raw = Number(process.env[envName]);
  if (Number.isFinite(raw) && raw >= 60) return Math.round(raw * 1000);
  return fallback;
}

export function quotaPeek<T>(key: string): T | undefined {
  return hydrate(key)?.data as T | undefined;
}

export function quotaDue(key: string, now = Date.now()): boolean {
  const slot = hydrate(key);
  return !slot || now >= slot.nextAt;
}

export function quotaRemember<T>(
  key: string,
  data: T | undefined,
  ok: boolean,
  retryAfterMs?: number,
  now = Date.now(),
  intervalMs?: number,
): void {
  const prev = hydrate(key) as Slot<T> | undefined;
  const fails = ok ? 0 : (prev?.fails ?? 0) + 1;
  const wait =
    retryAfterMs ??
    (ok ? (intervalMs ?? quotaIntervalMs(true)) : BACKOFF_MS[Math.min(Math.max(fails - 1, 0), BACKOFF_MS.length - 1)]);
  slots.set(key, {
    data: data !== undefined ? data : prev?.data,
    nextAt: now + wait,
    fails,
  });
  saveDisk();
}

export function quotaResetForTests(): void {
  slots.clear();
}

export function quotaClearDiskForTests(): void {
  const file = process.env.AINDLE_QUOTA_GATE_FILE?.trim();
  if (file && fs.existsSync(file)) fs.rmSync(file, { force: true });
}
