import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Confidence, Subscription } from '@aindle/core';

export interface RegistrySubscription {
  id: string;
  tool: 'claude' | 'codex' | 'cursor' | 'grok' | 'glm' | 'kimi' | 'zcode' | 'sub2api' | string;
  label: string;
  plan?: string;
  shared?: boolean;
  home?: string;
  projectsDir?: string;
  baseUrl?: string;
  mode?: 'admin' | 'user' | string;
  email?: string;
  passwordFile?: string;
  adminKeyFile?: string;
  jwtFile?: string;
  keyFile?: string;
  /** Balance-style providers: spend budget for the period (provider currency), drives the 预算 bar. */
  budget?: number;
}

export interface RegistryHost {
  id: string;
  label: string;
}

export interface RegistryFile {
  host: RegistryHost;
  subscriptions: RegistrySubscription[];
  claude?: { projectsDir?: string };
  codex?: { home?: string };
}

function cwdRegistry(): string {
  return path.join(process.cwd(), 'config', 'registry.yaml');
}

function homeRegistry(): string {
  return path.join(os.homedir(), '.config', 'aindle', 'registry.yaml');
}

export function resolveRegistryPath(explicit?: string): string {
  if (explicit?.trim()) return expandHome(explicit.trim());
  if (process.env.AINDLE_REGISTRY?.trim()) return expandHome(process.env.AINDLE_REGISTRY.trim());
  const cwd = cwdRegistry();
  if (fs.existsSync(cwd)) return cwd;
  const home = homeRegistry();
  if (fs.existsSync(home)) return home;
  return cwd;
}

export function loadRegistry(filePath?: string): RegistryFile {
  const p = resolveRegistryPath(filePath);
  if (!fs.existsSync(p)) {
    throw new Error(
      `registry not found: ${p}\nRun \`aindle init\` or copy config/registry.example.yaml to ./config/registry.yaml or ~/.config/aindle/registry.yaml`,
    );
  }
  const raw = parseYaml(fs.readFileSync(p, 'utf8')) as RegistryFile;
  if (!raw.host?.id || !raw.host?.label) {
    throw new Error('registry.host.id and registry.host.label required');
  }
  if (!Array.isArray(raw.subscriptions)) {
    throw new Error('registry.subscriptions must be an array');
  }
  return raw;
}

export function expandHome(input: string): string {
  if (input.startsWith('~')) return path.join(os.homedir(), input.slice(1));
  return input;
}

export function claudeCredsPath(home: string): string {
  return path.join(expandHome(home), '.credentials.json');
}

export function codexHomePath(home?: string): string {
  return expandHome(home ?? '~/.codex');
}

export function stubSubscription(entry: RegistrySubscription, confidence: Confidence): Subscription {
  const relay = entry.tool === 'sub2api';
  return {
    id: entry.id,
    tool: entry.tool.charAt(0).toUpperCase() + entry.tool.slice(1),
    label: entry.label,
    plan: entry.plan,
    shared: entry.shared,
    source: relay ? 'relay' : 'local',
    scope: relay ? (entry.mode === 'admin' ? 'admin' : 'user') : undefined,
    kind: relay ? (entry.mode === 'admin' ? 'site' : 'member') : 'quota',
    windows: [],
    confidence,
  };
}
