import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

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

function commandExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
