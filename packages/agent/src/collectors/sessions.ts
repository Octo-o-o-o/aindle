import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { folderLabel, type Run, type HostStats } from '@aindle/core';
import { codexHomePath, expandHome, type RegistryFile, type RegistrySubscription } from '../registry.js';
import { claudeProjectsDir } from './claude.js';
import {
  clipSessionTitle,
  codexSessionsDir,
  listCodexRollouts,
  loadCodexThreadNames,
  readCodexUserTitle,
  readRolloutMeta,
  rolloutThreadId,
} from './codex.js';
import { cursorChatsDir } from './cursor.js';
import { grokSessionsDir } from './grok.js';
import { kimiProjectsDir } from './kimi.js';
import { isClaudeUserAsk, isCodexUserAsk, lastAskMs, lastAskMsInDir } from './user-ask.js';

type Collected = Run & { spawned?: boolean };

const ACTIVE_MIN = 2;
const IDLE_MIN = 10;
const DONE_MIN = 60;

function projectTitle(name: string): string {
  const label = folderLabel(name);
  return label === 'No Folder' ? clipSessionTitle(name) || name : label;
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

function firstUserText(row: unknown): string | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const rec = row as Record<string, unknown>;
  if (rec.type !== 'user') return undefined;
  const message = rec.message as Record<string, unknown> | undefined;
  const content = message?.content ?? rec.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return undefined;
}

function claudeSessionMeta(projectPath: string): { title?: string; spawned?: boolean; askedMs?: number } {
  const file = latestFile(projectPath, (n) => n.endsWith('.jsonl'));
  if (!file) return {};
  const rows = readJsonlRecords(file);
  let title: string | undefined;
  let spawned = false;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (rec.type === 'custom-title' && typeof rec.customTitle === 'string' && rec.customTitle.trim()) {
      title = clipSessionTitle(rec.customTitle);
    }
    if (rec.type === 'user') {
      if (rec.isSidechain === true) spawned = true;
      const origin = rec.origin as { kind?: string } | undefined;
      if (origin?.kind && origin.kind !== 'human') spawned = true;
      if (!title) {
        const text = firstUserText(row);
        if (text) title = clipSessionTitle(text);
      }
    }
  }
  return { title, spawned, askedMs: lastAskMs(file, isClaudeUserAsk) };
}

function grokSessionMeta(projectPath: string): { title?: string; spawned?: boolean; askedMs?: number } {
  const file = latestFile(projectPath, (n) => n === 'summary.json');
  const askedMs = lastAskMsInDir(projectPath, 'grok');
  if (!file) return { askedMs: askedMs || undefined };
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      generated_title?: string;
      session_summary?: string;
      session_kind?: string;
    };
    const kind = String(rec.session_kind ?? '');
    const title = clipSessionTitle(rec.generated_title || rec.session_summary || '');
    return {
      title: title || undefined,
      spawned: kind === 'headless' || kind === 'subagent',
      askedMs: askedMs || undefined,
    };
  } catch {
    return { askedMs: askedMs || undefined };
  }
}

function cursorSessionMeta(projectPath: string): { title?: string; askedMs?: number } {
  const askedMs = lastAskMsInDir(projectPath, 'cursor') || undefined;
  const file = latestFile(projectPath, (n) => n === 'meta.json');
  if (!file) return { askedMs };
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as { cwd?: string; title?: string };
    if (typeof rec.title === 'string' && rec.title.trim()) {
      return { title: clipSessionTitle(rec.title), askedMs };
    }
    if (typeof rec.cwd === 'string' && rec.cwd.trim()) return { title: projectTitle(rec.cwd), askedMs };
  } catch {
    /* ignore */
  }
  return { askedMs };
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

function scanDirMtime(
  dir: string,
  hostId: string,
  tool: string,
  label: string,
  idPrefix: string,
  metaFor?: (projectPath: string) => { title?: string; spawned?: boolean; askedMs?: number },
): Collected[] {
  if (!fs.existsSync(dir)) return [];
  const now = Date.now();
  const runs: Collected[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectPath = path.join(dir, entry.name);
    let latestMtime = 0;
    let startedMs = 0;
    try {
      const walk = (p: string) => {
        for (const f of fs.readdirSync(p, { withFileTypes: true })) {
          const fp = path.join(p, f.name);
          if (f.isDirectory()) {
            walk(fp);
            continue;
          }
          if (!/\.(jsonl|db|json)$/i.test(f.name)) continue;
          const st = fs.statSync(fp);
          if (st.mtimeMs > latestMtime) {
            latestMtime = st.mtimeMs;
            startedMs = st.birthtimeMs || st.ctimeMs || st.mtimeMs;
          }
        }
      };
      walk(projectPath);
    } catch {
      continue;
    }
    if (!latestMtime) continue;
    const ageMin = Math.floor((now - latestMtime) / 60_000);
    const state = stateFromAge(ageMin);
    if (!state) continue;
    const extra = metaFor?.(projectPath) ?? {};
    const folder = projectTitle(entry.name);
    runs.push({
      id: `${idPrefix}-${entry.name}`,
      hostId,
      tool,
      title: extra.title || folder,
      project: folder,
      state,
      startedAt: new Date(extra.askedMs || startedMs || latestMtime).toISOString(),
      lastActivityAt: new Date(latestMtime).toISOString(),
      detail: `${label} · ${ageMin} 分钟前活动`,
      spawned: extra.spawned,
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
    let mtime = 0;
    let startedMs = 0;
    try {
      const st = fs.statSync(file);
      mtime = st.mtimeMs;
      startedMs = st.birthtimeMs || st.ctimeMs || st.mtimeMs;
    } catch {
      continue;
    }
    const ageMin = Math.floor((now - mtime) / 60_000);
    const state = stateFromAge(ageMin);
    if (!state) continue;
    const meta = readRolloutMeta(file);
    const threadId = rolloutThreadId(file) ?? meta.id ?? path.basename(file, '.jsonl');
    const cwdName = meta.cwd ? projectTitle(meta.cwd) : '';
    const spawned = meta.threadSource === 'subagent' || Boolean(meta.parentThreadId);
    const askedMs = lastAskMs(file, isCodexUserAsk);
    const title =
      (meta.parentThreadId ? titles.get(meta.parentThreadId) : undefined) ||
      titles.get(threadId) ||
      readCodexUserTitle(file) ||
      cwdName ||
      projectTitle(path.basename(file, '.jsonl'));
    runs.push({
      id: `codex-${sub.id}-${threadId}`,
      hostId,
      tool: 'Codex',
      title,
      project: cwdName || undefined,
      state,
      startedAt: new Date(askedMs || startedMs || mtime).toISOString(),
      lastActivityAt: new Date(mtime).toISOString(),
      detail: `${sub.label} · ${ageMin} 分钟前活动`,
      spawned,
    });
  }
  return runs;
}

function runsForSubscription(sub: RegistrySubscription, hostId: string): Collected[] {
  switch (sub.tool) {
    case 'claude':
      return scanDirMtime(
        claudeProjectsDir(sub),
        hostId,
        'Claude',
        sub.label,
        `claude-${sub.id}`,
        claudeSessionMeta,
      );
    case 'codex':
      return scanCodexRollouts(sub, hostId);
    case 'grok':
      return scanDirMtime(grokSessionsDir(sub), hostId, 'Grok', sub.label, `grok-${sub.id}`, grokSessionMeta);
    case 'cursor':
      return scanDirMtime(cursorChatsDir(), hostId, 'Cursor', sub.label, `cursor-${sub.id}`, cursorSessionMeta);
    case 'kimi':
      return scanDirMtime(kimiProjectsDir(sub), hostId, 'Kimi', sub.label, `kimi-${sub.id}`, claudeSessionMeta);
    case 'glm':
      return scanDirMtime(
        expandHome(sub.projectsDir ?? '~/.claude-glm/projects'),
        hostId,
        'GLM',
        sub.label,
        `glm-${sub.id}`,
        claudeSessionMeta,
      );
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
    .slice(0, 64)
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
