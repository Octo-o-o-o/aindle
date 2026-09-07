import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { expandHome } from '../src/registry.js';
import { kiroDefaultDbCandidates, kiroDbPath } from '../src/collectors/kiro.js';
import { processListCommand } from '../src/collectors/gemini.js';
import { lookupCommandBin } from '../src/lib/sqlite.js';

describe('expandHome', () => {
  it('expands ~ and %VAR% for Windows-style registry paths', () => {
    assert.equal(expandHome('~/.claude'), path.join(os.homedir(), '.claude'));
    assert.equal(expandHome('~\\.codex'), path.join(os.homedir(), '.codex'));
    const prev = process.env.AINDLE_TEST_HOME;
    process.env.AINDLE_TEST_HOME = '/tmp/x';
    try {
      assert.equal(expandHome('%AINDLE_TEST_HOME%/.claude'), path.normalize('/tmp/x/.claude'));
    } finally {
      if (prev === undefined) delete process.env.AINDLE_TEST_HOME;
      else process.env.AINDLE_TEST_HOME = prev;
    }
  });
});

describe('kiro default db', () => {
  it('uses AppData on Windows and Library on macOS', () => {
    const win = kiroDefaultDbCandidates({
      platform: 'win32',
      home: 'C:\\Users\\sam',
      env: { APPDATA: 'C:\\Users\\sam\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local' },
    });
    assert.ok(win[0]?.includes('AppData'));
    assert.ok(win[0]?.endsWith('data.sqlite3'));
    assert.ok(win.some((p) => p.includes(`${path.sep}.local${path.sep}share${path.sep}kiro-cli`)));
    const mac = kiroDefaultDbCandidates({ platform: 'darwin', home: '/Users/sam', env: {} });
    assert.equal(mac[0], '/Users/sam/Library/Application Support/kiro-cli/data.sqlite3');
  });

  it('treats registry home as a directory unless it is a db file', () => {
    const p = kiroDbPath({ id: 'k', tool: 'kiro', label: 'Kiro', home: '~/.kiro-cli' });
    assert.equal(p, path.join(os.homedir(), '.kiro-cli', 'data.sqlite3'));
  });
});

describe('platform helpers', () => {
  it('lists processes with wmic on Windows and ps elsewhere', () => {
    assert.equal(processListCommand('win32').cmd, 'wmic');
    assert.equal(processListCommand('darwin').cmd, 'ps');
    assert.equal(processListCommand('linux').cmd, 'ps');
  });

  it('resolves Windows where.exe when SystemRoot is set', () => {
    if (process.platform === 'win32') {
      assert.match(lookupCommandBin(), /where/i);
    } else {
      assert.equal(lookupCommandBin(), 'which');
    }
  });
});
