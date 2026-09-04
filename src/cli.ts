#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReport, pushReport } from '../packages/agent/src/run.js';
import { startHub } from '../packages/hub/src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function packageRoot(): string {
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === 'aindle') return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(here, '..');
}

function resolvePublicDir(): string {
  const root = packageRoot();
  const candidates = [
    path.join(here, 'public'),
    path.join(root, 'dist', 'public'),
    path.join(root, 'packages', 'hub', 'public'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'monitor.html'))) return dir;
  }
  return candidates[0]!;
}

function exampleRegistryPath(): string {
  const root = packageRoot();
  const candidates = [
    path.join(root, 'config', 'registry.example.yaml'),
    path.join(here, 'registry.example.yaml'),
    path.join(root, 'dist', 'registry.example.yaml'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return candidates[0]!;
}

function printHelp(): never {
  console.log(`Aindle — Kindle-friendly AI usage monitor

Usage:
  aindle init [--local]     Write a starter registry.yaml
  aindle hub                Start the hub (default :8787)
  aindle agent [options]    Collect local usage and POST to the hub
  aindle help               Show this help

Agent options:
  --once           Push one report and exit (default)
  --loop SEC       Push every SEC seconds (local sessions; official quota APIs stay ~5 min)
  --mock           Use built-in sample data (no credentials)
  --registry PATH  Registry YAML
  --hub URL        Hub base URL (default http://127.0.0.1:8787)
  --dry-run        Print JSON to stdout, do not POST

Init:
  default          ~/.config/aindle/registry.yaml
  --local          ./config/registry.yaml

Env:
  AINDLE_PORT AINDLE_HOST AINDLE_TOKEN AINDLE_HUB_URL
  AINDLE_REGISTRY AINDLE_SEED_MOCK AINDLE_HUB_ID AINDLE_HUB_LABEL
  AINDLE_SUB2API_BASE_URL AINDLE_SUB2API_EMAIL AINDLE_SUB2API_PASSWORD
  AINDLE_SUB2API_JWT AINDLE_SUB2API_ADMIN_KEY

Docs: https://github.com/Octo-o-o-o/aindle
`);
  process.exit(0);
}

function runInit(local: boolean): void {
  const dest = local
    ? path.join(process.cwd(), 'config', 'registry.yaml')
    : path.join(os.homedir(), '.config', 'aindle', 'registry.yaml');
  const src = exampleRegistryPath();
  if (!fs.existsSync(src)) {
    throw new Error(`example registry not found: ${src}`);
  }
  if (fs.existsSync(dest)) {
    console.log('already exists: %s', dest);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o600);
  console.log('wrote %s', dest);
  console.log('Edit the file, then run:');
  console.log('  aindle hub');
  console.log('  aindle agent --loop 60');
}

function parseAgentArgs(argv: string[]) {
  const opts = {
    loopSec: 0,
    mock: false,
    registryPath: undefined as string | undefined,
    hubUrl: process.env.AINDLE_HUB_URL ?? 'http://127.0.0.1:8787',
    dryRun: false,
    token: process.env.AINDLE_TOKEN,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') printHelp();
    if (a === '--once') opts.loopSec = 0;
    if (a === '--loop') opts.loopSec = Number(argv[++i] ?? '60');
    if (a === '--mock') opts.mock = true;
    if (a === '--registry') opts.registryPath = argv[++i];
    if (a === '--hub') opts.hubUrl = argv[++i] ?? opts.hubUrl;
    if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

async function tick(opts: ReturnType<typeof parseAgentArgs>): Promise<void> {
  const report = await collectReport({ mock: opts.mock, registryPath: opts.registryPath });
  if (opts.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  await pushReport(report, opts.hubUrl, opts.token);
  console.log(
    'pushed host=%s subs=%d runs=%d → %s',
    report.host.id,
    report.subscriptions.length,
    report.runs.length,
    opts.hubUrl,
  );
}

function runHub(): void {
  const port = Number(process.env.AINDLE_PORT ?? '8787');
  const host = process.env.AINDLE_HOST ?? '0.0.0.0';
  const token = process.env.AINDLE_TOKEN;
  const hubId = process.env.AINDLE_HUB_ID ?? 'hub';
  const hubLabel = process.env.AINDLE_HUB_LABEL ?? 'Aindle Hub';
  const seedMock = process.env.AINDLE_SEED_MOCK !== '0';
  startHub({
    host,
    port,
    token,
    hubId,
    hubLabel,
    seedMock,
    publicDir: resolvePublicDir(),
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') printHelp();
  if (cmd === 'init') {
    runInit(argv.includes('--local'));
    return;
  }
  if (cmd === 'hub') {
    runHub();
    return;
  }
  if (cmd === 'agent') {
    const opts = parseAgentArgs(argv.slice(1));
    if (opts.loopSec > 0) {
      const run = async () => {
        try {
          await tick(opts);
        } catch (err) {
          console.error('agent error:', (err as Error).message ?? err);
        }
      };
      void run();
      setInterval(run, opts.loopSec * 1000);
      return;
    }
    await tick(opts);
    return;
  }
  console.error('unknown command: %s', cmd);
  printHelp();
}

main().catch((err) => {
  console.error((err as Error).message ?? err);
  process.exit(1);
});
