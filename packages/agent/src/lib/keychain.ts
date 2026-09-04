import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { expandHome } from '../registry.js';

const SECURITY = '/usr/bin/security';
const DEFAULT_SERVICE = 'Claude Code-credentials';

export interface ClaudeOauth {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  scopes?: string[];
  subscriptionType?: string | null;
  rateLimitTier?: string | null;
}

export interface ClaudeCredsFile {
  claudeAiOauth?: ClaudeOauth;
  [key: string]: unknown;
}

export interface ClaudeCredsBundle {
  creds: ClaudeCredsFile;
  source: 'keychain' | 'file';
  path?: string;
  service?: string;
  account?: string;
}

export function claudeKeychainServices(configDir: string): string[] {
  const expanded = expandHome(configDir);
  const defaultHome = expandHome('~/.claude');
  if (expanded === defaultHome) return [DEFAULT_SERVICE];
  const hash = crypto.createHash('sha256').update(expanded).digest('hex').slice(0, 8);
  return [`${DEFAULT_SERVICE}-${hash}`, DEFAULT_SERVICE];
}

export function readMacKeychainPassword(service: string): string | null {
  if (!fs.existsSync(SECURITY)) return null;
  try {
    const out = execFileSync(SECURITY, ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function keychainAccount(service: string): string {
  try {
    const out = execFileSync(SECURITY, ['find-generic-password', '-s', service], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 3000,
    });
    const match = out.match(/"acct"<blob>="([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch {
    /* fall through */
  }
  return os.userInfo().username;
}

export function readClaudeCreds(configDir: string): ClaudeCredsBundle | null {
  const home = expandHome(configDir);

  if (process.platform === 'darwin') {
    for (const service of claudeKeychainServices(home)) {
      const raw = readMacKeychainPassword(service);
      if (!raw) continue;
      try {
        const creds = JSON.parse(raw) as ClaudeCredsFile;
        if (creds.claudeAiOauth?.accessToken || creds.claudeAiOauth?.refreshToken) {
          return { creds, source: 'keychain', service, account: keychainAccount(service) };
        }
      } catch {
        continue;
      }
    }
  }

  const credPath = `${home}/.credentials.json`;
  if (!fs.existsSync(credPath)) return null;
  try {
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8')) as ClaudeCredsFile;
    if (creds.claudeAiOauth?.accessToken || creds.claudeAiOauth?.refreshToken) {
      return { creds, source: 'file', path: credPath };
    }
  } catch {
    return null;
  }
  return null;
}

export function writeClaudeCreds(bundle: ClaudeCredsBundle, creds: ClaudeCredsFile): void {
  const text = `${JSON.stringify(creds)}\n`;
  if (bundle.source === 'keychain') {
    if (!bundle.service) throw new Error('Claude keychain service missing');
    const account = bundle.account || os.userInfo().username;
    execFileSync(SECURITY, ['add-generic-password', '-U', '-s', bundle.service, '-a', account, '-w', text.trim()], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return;
  }
  if (!bundle.path) throw new Error('Claude credentials path missing');
  const tmp = `${bundle.path}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, bundle.path);
}

export function readClaudeAccessToken(configDir: string): string | null {
  return readClaudeCreds(configDir)?.creds.claudeAiOauth?.accessToken?.trim() ?? null;
}
