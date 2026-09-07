import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

export type SqliteParam = number | string;

function inlineSqlLiterals(sql: string, params: readonly SqliteParam[]): string {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const value = params[i++];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    return 'NULL';
  });
}

// Reads whole rows (strings/numbers/null only); blob values come back as lossy strings.
export function readSqliteRows(
  dbPath: string,
  sql: string,
  params: readonly SqliteParam[] = [],
): Array<Record<string, string | number | null>> {
  if (!fs.existsSync(dbPath)) return [];

  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (
        p: string,
        o: { readOnly: boolean },
      ) => {
        prepare: (sql: string) => { all: (...args: SqliteParam[]) => unknown };
        close: () => void;
      };
    };
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare(sql).all(...params) as Array<Record<string, string | number | null>>;
      return Array.isArray(rows) ? rows : [];
    } finally {
      db.close();
    }
  } catch {
    /* fall through to CLI */
  }

  if (!commandExists('sqlite3')) return [];
  try {
    const raw = execFileSync('sqlite3', ['-readonly', '-json', dbPath, inlineSqlLiterals(sql, params)], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (!raw.trim()) return [];
    const rows = JSON.parse(raw) as Array<Record<string, string | number | null>>;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function readSqliteValue(dbPath: string, sql: string, column: string): string | null {
  if (!fs.existsSync(dbPath)) return null;

  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (
        p: string,
        o: { readOnly: boolean },
      ) => {
        prepare: (sql: string) => { get: () => Record<string, unknown> | undefined };
        close: () => void;
      };
    };
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db.prepare(sql).get();
      const val = row?.[column];
      return typeof val === 'string' ? val : null;
    } finally {
      db.close();
    }
  } catch {
    /* fall through to CLI */
  }

  if (!commandExists('sqlite3')) return null;
  try {
    const raw = execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    if (!raw.trim()) return null;
    const rows = JSON.parse(raw) as Array<Record<string, string>>;
    const val = rows[0]?.[column];
    return typeof val === 'string' ? val : null;
  } catch {
    return null;
  }
}

export function lookupCommandBin(): string {
  if (process.platform !== 'win32') return 'which';
  const root = process.env.SystemRoot;
  if (root) {
    const p = path.join(root, 'System32', 'where.exe');
    if (fs.existsSync(p)) return p;
  }
  return 'where.exe';
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync(lookupCommandBin(), [cmd], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
