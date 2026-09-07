#!/usr/bin/env node
import { collectReport, pushReport } from './run.js';

function usage(): never {
  console.log(`Usage: aindle-agent [options]

Options:
  --once           Push one report and exit (default)
  --loop SEC       Push every SEC seconds (sessions; Claude quota reads local rate_limits)
  --mock           Use built-in mock data (no registry/collectors)
  --registry PATH  Registry YAML (default config/registry.yaml)
  --hub URL        Hub base URL (default http://127.0.0.1:8787)
  --dry-run        Print JSON to stdout, do not POST
  --help           Show this help

Env:
  AINDLE_REGISTRY, AINDLE_HUB_URL, AINDLE_TOKEN
  AINDLE_CLAUDE_USAGE_API=1  opt-in Anthropic /api/oauth/usage (off by default)
`);
  process.exit(0);
}

function parseArgs(argv: string[]) {
  const opts = {
    once: true,
    loopSec: 0,
    mock: false,
    registryPath: undefined as string | undefined,
    hubUrl: process.env.AINDLE_HUB_URL ?? 'http://127.0.0.1:8787',
    dryRun: false,
    token: process.env.AINDLE_TOKEN,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    if (a === '--once') opts.once = true;
    if (a === '--loop') opts.loopSec = Number(argv[++i] ?? '120');
    if (a === '--mock') opts.mock = true;
    if (a === '--registry') opts.registryPath = argv[++i];
    if (a === '--hub') opts.hubUrl = argv[++i] ?? opts.hubUrl;
    if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

async function tick(opts: ReturnType<typeof parseArgs>) {
  const report = await collectReport({ mock: opts.mock, registryPath: opts.registryPath });
  if (!opts.mock && report.subscriptions.length === 0) {
    console.error('registry has no subscriptions; uncomment tools you already use in the YAML');
  }
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

const opts = parseArgs(process.argv.slice(2));

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
} else {
  tick(opts).catch((err) => {
    console.error('agent error:', (err as Error).message ?? err);
    process.exit(1);
  });
}
