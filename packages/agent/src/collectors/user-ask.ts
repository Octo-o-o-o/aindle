import fs from 'node:fs';
import path from 'node:path';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function isNoiseUserText(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t.startsWith('<recommended_plugins>') || t.startsWith('<environment')) return true;
  if (t.startsWith('<user_info>') || t.startsWith('<system-reminder>')) return true;
  if (t.startsWith('<in-app-browser-context')) return true;
  if (t.startsWith('<task-notification')) return true;
  if (t.startsWith('<local-command') || t.startsWith('<command-name>') || t.startsWith('<command-message>')) return true;
  if (/^# Files (mentioned|pasted) by the user/i.test(t)) return true;
  if (/^You are (Grok|Claude|Codex|Cursor)/i.test(t)) return true;
  return false;
}

export function extractMessageText(row: unknown): string {
  const rec = asRecord(row);
  if (!rec) return '';
  const payload = asRecord(rec.payload) ?? rec;
  const message = asRecord(payload.message);
  const content =
    typeof payload.content === 'string' || Array.isArray(payload.content)
      ? payload.content
      : message?.content ?? rec.content;
  if (typeof content === 'string') return content;
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const part of content) {
      if (typeof part === 'string') {
        texts.push(part);
        continue;
      }
      const item = asRecord(part);
      if (!item) continue;
      if (item.type === 'tool_result') continue;
      if (typeof item.text === 'string') texts.push(item.text);
    }
    return texts.join('\n');
  }
  return '';
}

export function rowTimestampMs(row: unknown): number {
  const rec = asRecord(row);
  if (!rec) return 0;
  const payload = asRecord(rec.payload);
  for (const src of [rec, payload]) {
    if (!src) continue;
    for (const key of ['timestamp', 'created_at', 'ts']) {
      const n = coerceTime(src[key]);
      if (n) return n;
    }
  }
  const stamped = extractMessageText(rec).match(/<timestamp>([^<]+)<\/timestamp>/i);
  if (stamped?.[1]) return parseCursorClock(stamped[1]);
  return 0;
}

function coerceTime(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1e12) return raw;
    if (raw > 1e9) return raw * 1000;
    return 0;
  }
  if (typeof raw !== 'string' || !raw.trim()) return 0;
  const n = Date.parse(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseCursorClock(raw: string): number {
  const t = String(raw ?? '').trim();
  const n = Date.parse(t);
  if (Number.isFinite(n)) return n;
  const cleaned = t.replace(/\s*\(UTC([+-]\d+)\)\s*$/i, (_, z) => {
    const hours = Number(z);
    const hh = String(Math.abs(hours)).padStart(2, '0');
    return ` GMT${hours >= 0 ? '+' : '-'}${hh}00`;
  });
  const m = Date.parse(cleaned);
  return Number.isFinite(m) ? m : 0;
}

export function isCodexUserAsk(row: unknown): boolean {
  const rec = asRecord(row);
  if (!rec) return false;
  const payload = asRecord(rec.payload) ?? rec;
  const text = extractMessageText(rec);
  if (isNoiseUserText(text)) return false;
  if (rec.type === 'event_msg' && payload.type === 'user_message') return true;
  return payload.role === 'user' || rec.role === 'user';
}

export function isClaudeUserAsk(row: unknown): boolean {
  const rec = asRecord(row);
  if (!rec || rec.type !== 'user') return false;
  if (rec.isSidechain === true) return false;
  const origin = asRecord(rec.origin);
  const kind = typeof origin?.kind === 'string' ? origin.kind : '';
  if (kind && kind !== 'human') return false;
  if (kind !== 'human') return false;
  return !isNoiseUserText(extractMessageText(rec));
}

export function isGrokUserAsk(row: unknown): boolean {
  const rec = asRecord(row);
  if (!rec) return false;
  const params = asRecord(rec.params);
  const update = asRecord(params?.update);
  if (update?.sessionUpdate !== 'user_message_chunk') return false;
  const content = asRecord(update.content);
  const text = typeof content?.text === 'string' ? content.text : extractMessageText(update);
  return !isNoiseUserText(text);
}

function askLineHint(line: string): boolean {
  return (
    line.includes('user_message') ||
    line.includes('"role":"user"') ||
    line.includes('"kind":"human"') ||
    line.includes('user_message_chunk')
  );
}

const askCache = new Map<string, { mtime: number; size: number; ms: number }>();

function scanAskFrom(file: string, isAsk: (row: unknown) => boolean, stopAt = 0): number {
  let found = 0;
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const chunkSize = 64 * 1024;
    let pos = st.size;
    let leftover = '';
    const floor = Math.max(0, stopAt - 4096);
    while (pos > floor) {
      const size = Math.min(chunkSize, pos - floor);
      if (size <= 0) break;
      pos -= size;
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, pos);
      const text = buf.toString('utf8') + leftover;
      const lines = text.split('\n');
      leftover = pos > floor ? (lines.shift() ?? '') : '';
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i]?.trim();
        if (!line || !askLineHint(line)) continue;
        try {
          const row = JSON.parse(line);
          if (!isAsk(row)) continue;
          const ms = rowTimestampMs(row);
          if (ms) {
            found = ms;
            return found;
          }
        } catch {
          /* torn */
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return found;
}

export function lastAskMs(file: string, isAsk: (row: unknown) => boolean): number {
  if (!file || !fs.existsSync(file)) return 0;
  try {
    const st = fs.statSync(file);
    const hit = askCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit.ms;
    let found = 0;
    if (hit && st.size > hit.size) {
      found = scanAskFrom(file, isAsk, hit.size) || hit.ms;
    } else {
      found = scanAskFrom(file, isAsk, 0);
    }
    askCache.set(file, { mtime: st.mtimeMs, size: st.size, ms: found });
    return found;
  } catch {
    return 0;
  }
}

export function lastCursorAskMs(storeFile: string): number {
  if (!storeFile || !fs.existsSync(storeFile)) return 0;
  let best = 0;
  try {
    const text = fs.readFileSync(storeFile);
    const re = /<timestamp>([^<]+)<\/timestamp>\s*<user_query>/gi;
    const blob = text.toString('utf8');
    for (const match of blob.matchAll(re)) {
      const ms = parseCursorClock(match[1] ?? '');
      if (ms > best) best = ms;
    }
  } catch {
    return 0;
  }
  return best;
}

export function lastAskMsInDir(
  dir: string,
  kind: 'codex' | 'claude' | 'grok' | 'cursor',
): number {
  if (!fs.existsSync(dir)) return 0;
  let best = 0;
  const walk = (p: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const fp = path.join(p, ent.name);
      if (ent.isDirectory()) {
        walk(fp);
        continue;
      }
      if (!ent.isFile()) continue;
      let ms = 0;
      if (kind === 'cursor' && ent.name === 'store.db') ms = lastCursorAskMs(fp);
      else if (kind === 'grok' && ent.name === 'updates.jsonl') ms = lastAskMs(fp, isGrokUserAsk);
      else if (kind === 'codex' && ent.name.endsWith('.jsonl')) ms = lastAskMs(fp, isCodexUserAsk);
      else if (kind === 'claude' && ent.name.endsWith('.jsonl')) ms = lastAskMs(fp, isClaudeUserAsk);
      if (ms > best) best = ms;
    }
  };
  walk(dir);
  return best;
}
