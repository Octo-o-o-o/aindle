import fs from 'node:fs';

export const WAIT_WINDOW_MS = 60 * 60 * 1000;
export type WaitFlavor = 'claude' | 'codex';

export type StructuralEvent = {
  ts: number;
  kind: 'ask' | 'result' | 'human';
  id?: string;
};

export type WaitScanResult = {
  waiting: boolean;
  reliable: boolean;
};

type FileCursor = {
  ino: number;
  size: number;
  offset: number;
  leftover: string;
  events: StructuralEvent[];
  reliable: boolean;
};

const cursors = new Map<string, FileCursor>();
const SMALL_FILE_BYTES = 1_048_576;
const CHUNK = 64 * 1024;

function asRec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fieldTs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1e12) return raw;
    if (raw > 1e9) return raw * 1000;
    return 0;
  }
  if (typeof raw !== 'string' || !raw.trim()) return 0;
  const n = Date.parse(raw);
  return Number.isFinite(n) ? n : 0;
}

function rowTimestamp(rec: Record<string, unknown>, payload?: Record<string, unknown> | null): number {
  return fieldTs(rec.timestamp) || fieldTs(payload?.timestamp);
}

function contentBlocks(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const part of content) {
    const rec = asRec(part);
    if (rec) out.push(rec);
  }
  return out;
}

function whitelistBlock(part: Record<string, unknown>): {
  type?: string;
  name?: string;
  id?: string;
  toolUseId?: string;
  callId?: string;
} {
  return {
    type: typeof part.type === 'string' ? part.type : undefined,
    name: typeof part.name === 'string' ? part.name : undefined,
    id: typeof part.id === 'string' ? part.id : undefined,
    toolUseId: typeof part.tool_use_id === 'string' ? part.tool_use_id : undefined,
    callId: typeof part.call_id === 'string' ? part.call_id : undefined,
  };
}

export function structuralEventsFromRow(row: unknown, flavor: WaitFlavor): StructuralEvent[] {
  const rec = asRec(row);
  if (!rec) return [];
  if (flavor === 'claude') return claudeEvents(rec);
  return codexEvents(rec);
}

function claudeEvents(rec: Record<string, unknown>): StructuralEvent[] {
  const message = asRec(rec.message);
  const origin = asRec(rec.origin);
  const originKind = typeof origin?.kind === 'string' ? origin.kind : '';
  const isSidechain = rec.isSidechain === true;
  const content = message?.content ?? rec.content;
  const ts = rowTimestamp(rec);
  const type = typeof rec.type === 'string' ? rec.type : '';
  const role = typeof rec.role === 'string' ? rec.role : typeof message?.role === 'string' ? message.role : '';
  const events: StructuralEvent[] = [];

  const considerAsk = (name?: string, id?: string) => {
    if (name === 'AskUserQuestion' && id) events.push({ ts, kind: 'ask', id });
  };
  const considerResult = (id?: string) => {
    if (id) events.push({ ts, kind: 'result', id });
  };

  if (type === 'tool_use') {
    considerAsk(typeof rec.name === 'string' ? rec.name : undefined, typeof rec.id === 'string' ? rec.id : undefined);
  }
  if (type === 'tool_result') {
    considerResult(typeof rec.tool_use_id === 'string' ? rec.tool_use_id : undefined);
  }

  let sawResult = false;
  let sawNonResult = typeof content === 'string';
  for (const part of contentBlocks(content)) {
    const block = whitelistBlock(part);
    if (block.type === 'tool_use') considerAsk(block.name, block.id);
    if (block.type === 'tool_result') {
      considerResult(block.toolUseId);
      sawResult = true;
    } else if (block.type) {
      sawNonResult = true;
    }
  }

  const isUser = type === 'user' || role === 'user';
  if (isUser && originKind === 'human' && !isSidechain && (!sawResult || sawNonResult)) {
    events.push({ ts, kind: 'human' });
  }
  return events;
}

function codexEvents(rec: Record<string, unknown>): StructuralEvent[] {
  const payload = asRec(rec.payload) ?? rec;
  const ts = rowTimestamp(rec, payload);
  const ptype = typeof payload.type === 'string' ? payload.type : '';
  const name = typeof payload.name === 'string' ? payload.name : undefined;
  const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined;
  const events: StructuralEvent[] = [];

  if (ptype === 'function_call' && name === 'request_user_input' && callId) {
    events.push({ ts, kind: 'ask', id: callId });
    return events;
  }
  if (ptype === 'function_call_output' && callId) {
    events.push({ ts, kind: 'result', id: callId });
    return events;
  }
  if (rec.type === 'event_msg' && ptype === 'user_message') {
    events.push({ ts, kind: 'human' });
    return events;
  }
  if (ptype === 'message' && payload.role === 'user') {
    events.push({ ts, kind: 'human' });
  }
  return events;
}

function evaluate(events: StructuralEvent[], now: number): boolean {
  const cutoff = now - WAIT_WINDOW_MS;
  const pending = new Map<string, number>();
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  for (const event of ordered) {
    if (!event.ts || event.ts < cutoff) continue;
    if (event.kind === 'ask' && event.id) pending.set(event.id, event.ts);
    if (event.kind === 'result' && event.id) pending.delete(event.id);
    if (event.kind === 'human') pending.clear();
  }
  for (const [id, ts] of pending) {
    if (now - ts > WAIT_WINDOW_MS) pending.delete(id);
  }
  return pending.size > 0;
}

function prune(events: StructuralEvent[], now: number): StructuralEvent[] {
  const cutoff = now - WAIT_WINDOW_MS;
  return events.filter((event) => event.ts >= cutoff);
}

function parseLine(line: string, flavor: WaitFlavor): { events: StructuralEvent[]; ok: boolean } {
  const trimmed = line.trim();
  if (!trimmed) return { events: [], ok: true };
  try {
    return { events: structuralEventsFromRow(JSON.parse(trimmed), flavor), ok: true };
  } catch {
    return { events: [], ok: false };
  }
}

function eventsNeedTs(events: StructuralEvent[]): boolean {
  return events.some((event) => event.kind === 'ask' || event.kind === 'result' || event.kind === 'human');
}

function absorb(
  events: StructuralEvent[],
  parsed: StructuralEvent[],
  reliable: boolean,
): { events: StructuralEvent[]; reliable: boolean } {
  if (!reliable) return { events, reliable: false };
  if (eventsNeedTs(parsed) && parsed.some((event) => !event.ts)) {
    return { events, reliable: false };
  }
  return { events: events.concat(parsed.filter((event) => event.ts)), reliable: true };
}

function readForward(file: string, start: number, leftover: string, flavor: WaitFlavor): {
  events: StructuralEvent[];
  leftover: string;
  offset: number;
  reliable: boolean;
} {
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const size = st.size - start;
    const buf = Buffer.alloc(size);
    if (size > 0) fs.readSync(fd, buf, 0, size, start);
    const text = leftover + buf.toString('utf8');
    const parts = text.split('\n');
    const nextLeftover = text.endsWith('\n') ? '' : (parts.pop() ?? '');
    let events: StructuralEvent[] = [];
    let reliable = true;
    for (const line of parts) {
      const parsed = parseLine(line, flavor);
      const next = absorb(events, parsed.events, parsed.ok);
      events = next.events;
      reliable = next.reliable;
      if (!reliable) break;
    }
    return { events, leftover: nextLeftover, offset: st.size, reliable };
  } finally {
    fs.closeSync(fd);
  }
}

function readBackwardWindow(file: string, flavor: WaitFlavor, now: number): {
  events: StructuralEvent[];
  leftover: string;
  offset: number;
  reliable: boolean;
} {
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  const cutoff = now - WAIT_WINDOW_MS;
  try {
    let pos = st.size;
    let carry = '';
    let newer = '';
    const collected: StructuralEvent[] = [];
    let reliable = true;
    let sawOlder = false;

    while (pos > 0 && reliable && !sawOlder) {
      const n = Math.min(CHUNK, pos);
      pos -= n;
      const buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, pos);
      const text = buf.toString('utf8') + carry;
      const parts = text.split('\n');
      carry = pos > 0 ? (parts.shift() ?? '') : '';
      const chunk = parts.join('\n');
      const combined = chunk + (newer ? `\n${newer}` : '');
      const lines = combined.split('\n');
      newer = pos > 0 ? (lines.shift() ?? '') : combined;

      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const parsed = parseLine(lines[i] ?? '', flavor);
        if (!parsed.ok) {
          reliable = false;
          break;
        }
        if (eventsNeedTs(parsed.events) && parsed.events.some((event) => !event.ts)) {
          reliable = false;
          break;
        }
        for (const event of parsed.events) {
          if (!event.ts) continue;
          if (event.ts < cutoff) {
            sawOlder = true;
            continue;
          }
          collected.push(event);
        }
      }
    }

    if (pos === 0 && carry && reliable) {
      const parsed = parseLine(carry, flavor);
      if (!parsed.ok || (eventsNeedTs(parsed.events) && parsed.events.some((event) => !event.ts))) {
        reliable = false;
      } else {
        for (const event of parsed.events) {
          if (event.ts >= cutoff) collected.push(event);
        }
      }
    }

    let last = '';
    if (st.size > 0) {
      const tail = Buffer.alloc(1);
      fs.readSync(fd, tail, 0, 1, st.size - 1);
      if (tail[0] !== 0x0a) last = readIncompleteTailFromFd(fd, st.size);
    }
    collected.reverse();
    return { events: collected, leftover: last, offset: st.size, reliable };
  } finally {
    fs.closeSync(fd);
  }
}

function readIncompleteTailFromFd(fd: number, size: number): string {
  const n = Math.min(CHUNK, size);
  const buf = Buffer.alloc(n);
  fs.readSync(fd, buf, 0, n, size - n);
  const text = buf.toString('utf8');
  const idx = text.lastIndexOf('\n');
  return idx === -1 ? text : text.slice(idx + 1);
}

function rebuild(file: string, flavor: WaitFlavor, now: number, st: fs.Stats): FileCursor {
  const useForward = st.size <= SMALL_FILE_BYTES;
  const read = useForward
    ? readForward(file, 0, '', flavor)
    : readBackwardWindow(file, flavor, now);
  return {
    ino: st.ino,
    size: st.size,
    offset: read.offset,
    leftover: read.leftover,
    events: prune(read.events, now),
    reliable: read.reliable,
  };
}

export function resetWaitScanCache(file?: string): void {
  if (file) cursors.delete(file);
  else cursors.clear();
}

export function scanSessionWait(file: string, flavor: WaitFlavor, now = Date.now()): WaitScanResult {
  if (!file || !fs.existsSync(file)) return { waiting: false, reliable: true };
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { waiting: false, reliable: false };
  }

  const prev = cursors.get(file);
  const mustRebuild = !prev || prev.ino !== st.ino || st.size < prev.size;
  let cursor: FileCursor;

  if (mustRebuild) {
    cursor = rebuild(file, flavor, now, st);
  } else if (st.size > prev.offset || prev.leftover) {
    const added = readForward(file, prev.offset, prev.leftover, flavor);
    cursor = {
      ino: st.ino,
      size: st.size,
      offset: added.offset,
      leftover: added.leftover,
      events: prune(prev.events.concat(added.events), now),
      reliable: prev.reliable && added.reliable,
    };
    if (!cursor.reliable) {
      cursor = rebuild(file, flavor, now, st);
    }
  } else {
    cursor = { ...prev, events: prune(prev.events, now) };
  }

  cursors.set(file, cursor);
  if (!cursor.reliable) return { waiting: false, reliable: false };
  return { waiting: evaluate(cursor.events, now), reliable: true };
}
