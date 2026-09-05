import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { folderLabel, type HostStats, type Initiator, type Run, type SignalConfidence } from '@aindle/core';
import { codexHomePath, expandHome, type RegistryFile, type RegistrySubscription } from '../registry.js';
import { readSqliteRows } from '../lib/sqlite.js';
import { claudeProjectsDir } from './claude.js';
import {
  clipSessionTitle,
  codexSessionsDir,
  listCodexRollouts,
  loadCodexThreadNames,
  readRolloutMeta,
  rolloutThreadId,
} from './codex.js';
import { cursorChatsDir } from './cursor.js';
import { grokSessionsDir } from './grok.js';
import { kimiProjectsDir } from './kimi.js';
import { zcodeDbPath } from './zcode.js';
import { isClaudeUserAsk, isCodexUserAsk, lastAskMs, lastAskMsInDir } from './user-ask.js';
import { scanSessionWait, type WaitFlavor } from './wait-scan.js';

type Collected = Run & { spawned?: boolean };

const ACTIVE_MIN = 2;
const IDLE_MIN = 10;
const DONE_MIN = 60;

function projectTitle(name: string): string {
  const label = folderLabel(name);
  return label === 'No Folder' ? clipSessionTitle(name) || name : label;
}

export function fallbackRunTitle(tool: string, projectLeaf?: string): string {
  const leaf = String(projectLeaf ?? '').trim();
  return leaf ? `${tool} · ${leaf}` : tool;
}

function latestFile(dir: string, test: (name: string) => boolean): string | undefined {
  let best: { file: string; mtime: number } | undefined;
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
      if (!ent.isFile() || !test(ent.name)) continue;
      try {
        const mtime = fs.statSync(fp).mtimeMs;
        if (!best || mtime > best.mtime) best = { file: fp, mtime };
      } catch {
        /* skip */
      }
    }
  };
  walk(dir);
  return best?.file;
}

function readJsonlRecords(file: string, headBytes = 16_384, tailBytes = 32_768): unknown[] {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, 'r');
    const chunks: string[] = [];
    const head = Buffer.alloc(Math.min(headBytes, st.size));
    fs.readSync(fd, head, 0, head.length, 0);
    chunks.push(head.toString('utf8'));
    if (st.size > headBytes + tailBytes) {
      const tail = Buffer.alloc(tailBytes);
      fs.readSync(fd, tail, 0, tail.length, st.size - tailBytes);
      chunks.push(tail.toString('utf8'));
    }
    fs.closeSync(fd);
    const rows: unknown[] = [];
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          rows.push(JSON.parse(line));
        } catch {
          /* skip torn lines at the cut */
        }
      }
    }
    return rows;
  } catch {
    return [];
  }
}

function asRec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapOrigin(
  originKind: string | undefined,
  sidechain: boolean,
): { initiator: Initiator; initiatorConfidence: SignalConfidence } {
  if (sidechain) return { initiator: 'agent', initiatorConfidence: 'direct' };
  if (originKind === 'human') return { initiator: 'human', initiatorConfidence: 'direct' };
  if (originKind === 'agent' || originKind === 'subagent' || originKind === 'sidechain') {
    return { initiator: 'agent', initiatorConfidence: 'direct' };
  }
  if (originKind === 'machine' || originKind === 'scheduled') {
    return { initiator: 'machine', initiatorConfidence: 'direct' };
  }
  return { initiator: 'human', initiatorConfidence: 'derived' };
}

function mapCodexSource(
  threadSource: string | undefined,
  parentThreadId?: string,
): { initiator: Initiator; initiatorConfidence: SignalConfidence; spawned: boolean } {
  const src = threadSource ?? '';
  const spawned = src === 'subagent' || Boolean(parentThreadId);
  if (src === 'subagent' || parentThreadId) {
    return { initiator: 'agent', initiatorConfidence: 'direct', spawned };
  }
  if (src === 'user') return { initiator: 'human', initiatorConfidence: 'direct', spawned };
  if (src === 'machine' || src === 'scheduled') {
    return { initiator: 'machine', initiatorConfidence: 'direct', spawned };
  }
  return { initiator: 'human', initiatorConfidence: 'derived', spawned };
}

function mapGrokKind(kind: string): { initiator: Initiator; initiatorConfidence: SignalConfidence; spawned: boolean } {
  if (kind === 'headless' || kind === 'subagent') {
    return { initiator: 'agent', initiatorConfidence: 'direct', spawned: true };
  }
  if (kind === 'interactive') return { initiator: 'human', initiatorConfidence: 'direct', spawned: false };
  if (kind === 'machine' || kind === 'scheduled') {
    return { initiator: 'machine', initiatorConfidence: 'direct', spawned: true };
  }
  return { initiator: 'human', initiatorConfidence: 'derived', spawned: false };
}

function claudeFileMeta(file: string): {
  title?: string;
  initiator: Initiator;
  initiatorConfidence: SignalConfidence;
  spawned: boolean;
} {
  const rows = readJsonlRecords(file);
  let title: string | undefined;
  let sidechain = false;
  let originKind: string | undefined;
  for (const row of rows) {
    const rec = asRec(row);
    if (!rec) continue;
    if (rec.type === 'custom-title' && typeof rec.customTitle === 'string' && rec.customTitle.trim()) {
      title = clipSessionTitle(rec.customTitle) || undefined;
    }
    if (rec.isSidechain === true) sidechain = true;
    const origin = asRec(rec.origin);
    if (typeof origin?.kind === 'string' && origin.kind) originKind = origin.kind;
  }
  const mapped = mapOrigin(originKind, sidechain);
  return { title, ...mapped, spawned: mapped.initiator !== 'human' };
}

function grokDirMeta(dir: string): {
  title?: string;
  initiator: Initiator;
  initiatorConfidence: SignalConfidence;
  spawned: boolean;
  askedMs?: number;
} {
  const askedMs = lastAskMsInDir(dir, 'grok') || undefined;
  const file = path.join(dir, 'summary.json');
  if (!fs.existsSync(file)) return { askedMs, ...mapGrokKind('') };
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      generated_title?: string;
      session_kind?: string;
    };
    const mapped = mapGrokKind(String(rec.session_kind ?? ''));
    const title = clipSessionTitle(rec.generated_title || '') || undefined;
    return { title, askedMs, ...mapped };
  } catch {
    return { askedMs, ...mapGrokKind('') };
  }
}

function cursorDirMeta(dir: string): { title?: string; project?: string; askedMs?: number } {
  const askedMs = lastAskMsInDir(dir, 'cursor') || undefined;
  const file = path.join(dir, 'meta.json');
  if (!fs.existsSync(file)) return { askedMs };
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as { cwd?: string; title?: string };
    const title =
      typeof rec.title === 'string' && rec.title.trim() ? clipSessionTitle(rec.title) || undefined : undefined;
    const project = typeof rec.cwd === 'string' && rec.cwd.trim() ? projectTitle(rec.cwd) : undefined;
    return { title, project, askedMs };
  } catch {
    return { askedMs };
  }
}

function stateFromAge(ageMin: number): Run['state'] | null {
  if (ageMin <= ACTIVE_MIN) return 'active';
  if (ageMin <= IDLE_MIN) return 'idle';
  if (ageMin <= DONE_MIN) return 'done';
  return null;
}

function isLive(state: Run['state']): boolean {
  return state === 'active' || state === 'idle' || state === 'wait';
}

function fileTimes(file: string): { mtime: number; startedMs: number } | null {
  try {
    const st = fs.statSync(file);
    return { mtime: st.mtimeMs, startedMs: st.birthtimeMs || st.ctimeMs || st.mtimeMs };
  } catch {
    return null;
  }
}

function applyWait(
  file: string,
  flavor: WaitFlavor | null,
  ageState: Run['state'] | null,
): {
  state: Run['state'] | null;
  stateConfidence: SignalConfidence;
  waitReason?: 'needs_input';
} {
  if (!flavor || !ageState) {
    return { state: ageState, stateConfidence: 'derived' };
  }
  const wait = scanSessionWait(file, flavor);
  if (wait.reliable && wait.waiting) {
    return { state: 'wait', stateConfidence: 'direct', waitReason: 'needs_input' };
  }
  return { state: ageState, stateConfidence: 'derived' };
}

function listJsonlSessions(root: string): Array<{ file: string; project: string; stem: string }> {
  const out: Array<{ file: string; project: string; stem: string }> = [];
  if (!fs.existsSync(root)) return out;
  let projects: fs.Dirent[];
  try {
    projects = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const proj of projects) {
    if (!proj.isDirectory()) continue;
    const project = projectTitle(proj.name);
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
        if (!ent.isFile() || !ent.name.endsWith('.jsonl')) continue;
        out.push({ file: fp, project, stem: `${proj.name}-${path.basename(ent.name, '.jsonl')}` });
      }
    };
    walk(path.join(root, proj.name));
  }
  return out;
}

function scanClaudeLikeSessions(
  dir: string,
  hostId: string,
  tool: string,
  label: string,
  idPrefix: string,
  waitFlavor: WaitFlavor | null,
): Collected[] {
  const now = Date.now();
  const runs: Collected[] = [];
  for (const sess of listJsonlSessions(dir)) {
    const times = fileTimes(sess.file);
    if (!times) continue;
    const ageMin = Math.floor((now - times.mtime) / 60_000);
    const ageState = stateFromAge(ageMin);
    const waited = applyWait(sess.file, waitFlavor, ageState);
    if (!waited.state) continue;
    const extra = claudeFileMeta(sess.file);
    const askedMs = lastAskMs(sess.file, isClaudeUserAsk);
    runs.push({
      id: `${idPrefix}-${sess.stem}`,
      hostId,
      tool,
      title: extra.title || fallbackRunTitle(tool, sess.project),
      project: sess.project,
      state: waited.state,
      startedAt: new Date(askedMs || times.startedMs || times.mtime).toISOString(),
      lastActivityAt: new Date(times.mtime).toISOString(),
      detail: waited.state === 'wait' ? '等待提问' : `${label} · ${ageMin} 分钟前活动`,
      spawned: extra.spawned,
      initiator: extra.initiator,
      initiatorConfidence: extra.initiatorConfidence,
      stateConfidence: waited.stateConfidence,
      waitReason: waited.waitReason,
    });
  }
  return runs;
}

function scanGrokSessions(dir: string, hostId: string, label: string, idPrefix: string): Collected[] {
  if (!fs.existsSync(dir)) return [];
  const now = Date.now();
  const runs: Collected[] = [];
  let projects: fs.Dirent[];
  try {
    projects = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessionDirs: Array<{ dir: string; project: string; stem: string }> = [];
  for (const proj of projects) {
    if (!proj.isDirectory()) continue;
    const projPath = path.join(dir, proj.name);
    const project = projectTitle(proj.name);
    if (fs.existsSync(path.join(projPath, 'summary.json')) || fs.existsSync(path.join(projPath, 'updates.jsonl'))) {
      sessionDirs.push({ dir: projPath, project, stem: proj.name });
      continue;
    }
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(projPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const sessPath = path.join(projPath, child.name);
      if (fs.existsSync(path.join(sessPath, 'summary.json')) || fs.existsSync(path.join(sessPath, 'updates.jsonl'))) {
        sessionDirs.push({ dir: sessPath, project, stem: `${proj.name}-${child.name}` });
      }
    }
  }

  for (const sess of sessionDirs) {
    const hot = latestFile(sess.dir, (n) => /\.(jsonl|json)$/i.test(n));
    const times = hot ? fileTimes(hot) : null;
    if (!times) continue;
    const ageMin = Math.floor((now - times.mtime) / 60_000);
    const state = stateFromAge(ageMin);
    if (!state) continue;
    const extra = grokDirMeta(sess.dir);
    runs.push({
      id: `${idPrefix}-${sess.stem}`,
      hostId,
      tool: 'Grok',
      title: extra.title || fallbackRunTitle('Grok', sess.project),
      project: sess.project,
      state,
      startedAt: new Date(extra.askedMs || times.startedMs || times.mtime).toISOString(),
      lastActivityAt: new Date(times.mtime).toISOString(),
      detail: `${label} · ${ageMin} 分钟前活动`,
      spawned: extra.spawned,
      initiator: extra.initiator,
      initiatorConfidence: extra.initiatorConfidence,
      stateConfidence: 'derived',
    });
  }
  return runs;
}

function cursorSessionRoot(sub: RegistrySubscription): string {
  if (sub.home) return path.join(expandHome(sub.home), 'chats');
  return cursorChatsDir();
}

function listCursorSessionDirs(root: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    if (files.has('meta.json') || files.has('store.db')) {
      out.push(p);
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) walk(path.join(p, ent.name));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

function scanCursorSessions(sub: RegistrySubscription, hostId: string): Collected[] {
  const root = cursorSessionRoot(sub);
  const now = Date.now();
  const runs: Collected[] = [];
  for (const dir of listCursorSessionDirs(root)) {
    const hot = latestFile(dir, (n) => n === 'meta.json' || n === 'store.db' || n.endsWith('.jsonl'));
    const times = hot ? fileTimes(hot) : null;
    if (!times) continue;
    const ageMin = Math.floor((now - times.mtime) / 60_000);
    const state = stateFromAge(ageMin);
    if (!state) continue;
    const extra = cursorDirMeta(dir);
    const folder = extra.project || projectTitle(path.basename(dir));
    runs.push({
      id: `cursor-${sub.id}-${path.basename(dir)}`,
      hostId,
      tool: 'Cursor',
      title: extra.title || fallbackRunTitle('Cursor', extra.project || folder),
      project: extra.project || folder,
      state,
      startedAt: new Date(extra.askedMs || times.startedMs || times.mtime).toISOString(),
      lastActivityAt: new Date(times.mtime).toISOString(),
      detail: `${sub.label} · ${ageMin} 分钟前活动`,
      initiator: 'human',
      initiatorConfidence: 'derived',
      stateConfidence: 'derived',
    });
  }
  return runs;
}

function scanCodexRollouts(sub: RegistrySubscription, hostId: string): Collected[] {
  const home = codexHomePath(sub.home);
  const files = listCodexRollouts(codexSessionsDir(sub), DONE_MIN * 60_000);
  if (!files.length) return [];
  const titles = loadCodexThreadNames(home);
  const now = Date.now();
  const runs: Collected[] = [];

  for (const file of files) {
    const times = fileTimes(file);
    if (!times) continue;
    const ageMin = Math.floor((now - times.mtime) / 60_000);
    const ageState = stateFromAge(ageMin);
    const waited = applyWait(file, 'codex', ageState);
    if (!waited.state) continue;
    const meta = readRolloutMeta(file);
    const threadId = rolloutThreadId(file) ?? meta.id ?? path.basename(file, '.jsonl');
    const cwdName = meta.cwd ? projectTitle(meta.cwd) : '';
    const mapped = mapCodexSource(meta.threadSource, meta.parentThreadId);
    const askedMs = lastAskMs(file, isCodexUserAsk);
    const title =
      (meta.parentThreadId ? titles.get(meta.parentThreadId) : undefined) ||
      titles.get(threadId) ||
      fallbackRunTitle('Codex', cwdName);
    runs.push({
      id: `codex-${sub.id}-${threadId}`,
      hostId,
      tool: 'Codex',
      title,
      project: cwdName || undefined,
      state: waited.state,
      startedAt: new Date(askedMs || times.startedMs || times.mtime).toISOString(),
      lastActivityAt: new Date(times.mtime).toISOString(),
      detail: waited.state === 'wait' ? '等待提问' : `${sub.label} · ${ageMin} 分钟前活动`,
      spawned: mapped.spawned,
      initiator: mapped.initiator,
      initiatorConfidence: mapped.initiatorConfidence,
      stateConfidence: waited.stateConfidence,
      waitReason: waited.waitReason,
    });
  }
  return runs;
}

// ZCode keeps sessions (title / project / timestamps) in its local sqlite db.
export function scanZcodeSessions(sub: RegistrySubscription, hostId: string, now = Date.now()): Collected[] {
  const cutoff = now - DONE_MIN * 60_000;
  const rows = readSqliteRows(
    zcodeDbPath(sub),
    `SELECT id, title, directory, task_type, time_created, time_updated
       FROM session
      WHERE time_updated >= ? AND time_archived IS NULL
      ORDER BY time_updated DESC
      LIMIT 40`,
    [cutoff],
  );
  const runs: Collected[] = [];
  for (const row of rows) {
    const updatedMs = Number(row.time_updated);
    if (!Number.isFinite(updatedMs) || updatedMs < cutoff) continue;
    const ageMin = Math.floor((now - updatedMs) / 60_000);
    const state = stateFromAge(ageMin);
    if (!state) continue;
    const createdMs = Number(row.time_created);
    const taskType = String(row.task_type ?? 'interactive');
    const directory = typeof row.directory === 'string' ? row.directory : '';
    const title = clipSessionTitle(String(row.title ?? '')) || undefined;
    runs.push({
      id: `zcode-${sub.id}-${String(row.id ?? title ?? updatedMs)}`,
      hostId,
      tool: 'ZCode',
      title: title || (directory ? fallbackRunTitle('ZCode', projectTitle(directory)) : 'ZCode'),
      project: directory ? projectTitle(directory) : undefined,
      state,
      startedAt: new Date(Number.isFinite(createdMs) && createdMs > 0 ? createdMs : updatedMs).toISOString(),
      lastActivityAt: new Date(updatedMs).toISOString(),
      detail: `${sub.label} · ${ageMin} 分钟前活动`,
      spawned: taskType !== 'interactive',
      initiator: 'human',
      initiatorConfidence: 'derived',
      stateConfidence: 'derived',
    });
  }
  return runs;
}

function runsForSubscription(sub: RegistrySubscription, hostId: string): Collected[] {
  switch (sub.tool) {
    case 'claude':
      return scanClaudeLikeSessions(claudeProjectsDir(sub), hostId, 'Claude', sub.label, `claude-${sub.id}`, 'claude');
    case 'codex':
      return scanCodexRollouts(sub, hostId);
    case 'grok':
      return scanGrokSessions(grokSessionsDir(sub), hostId, sub.label, `grok-${sub.id}`);
    case 'cursor':
      return scanCursorSessions(sub, hostId);
    case 'kimi':
      return scanClaudeLikeSessions(kimiProjectsDir(sub), hostId, 'Kimi', sub.label, `kimi-${sub.id}`, null);
    case 'glm':
      return scanClaudeLikeSessions(
        expandHome(sub.projectsDir ?? '~/.claude-glm/projects'),
        hostId,
        'GLM',
        sub.label,
        `glm-${sub.id}`,
        null,
      );
    case 'zcode':
      return scanZcodeSessions(sub, hostId);
    default:
      return [];
  }
}

function asIngestRun(run: Collected): Run {
  if (run.spawned) return run;
  const { spawned: _spawned, ...rest } = run;
  return rest;
}

export function collectRuns(registry: RegistryFile): Run[] {
  const hostId = registry.host.id;
  const byId = new Map<string, Collected>();
  for (const sub of registry.subscriptions) {
    for (const run of runsForSubscription(sub, hostId)) {
      byId.set(run.id, run);
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      const liveA = isLive(a.state) ? 0 : 1;
      const liveB = isLive(b.state) ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      const spawnA = a.spawned ? 1 : 0;
      const spawnB = b.spawned ? 1 : 0;
      if (spawnA !== spawnB) return spawnA - spawnB;
      const ta = Date.parse(a.lastActivityAt ?? '') || 0;
      const tb = Date.parse(b.lastActivityAt ?? '') || 0;
      return tb - ta;
    })
    .map(asIngestRun);
}

export function collectHostStats(runs: Run[]): HostStats {
  return {
    liveRuns: runs.filter((r) => r.state === 'active' || r.state === 'idle' || r.state === 'wait').length,
    waitRuns: runs.filter((r) => r.state === 'wait').length,
    sessionsToday: runs.length,
    tokensToday: '—',
  };
}

export function hostOs(): 'darwin' | 'linux' | 'win32' {
  const p = os.platform();
  if (p === 'darwin' || p === 'linux' || p === 'win32') return p;
  return 'linux';
}
