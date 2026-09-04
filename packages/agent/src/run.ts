import { INGEST_SCHEMA, type IngestReport } from '@aindle/core';
import { collectSubscriptions } from './collectors/index.js';
import { collectHostStats, collectRuns, hostOs } from './collectors/sessions.js';
import { loadRegistry } from './registry.js';

export interface CollectOptions {
  registryPath?: string;
  mock?: boolean;
}

export async function collectReport(opts: CollectOptions = {}): Promise<IngestReport> {
  if (opts.mock) {
    const { buildMockIngest } = await import('@aindle/core');
    return buildMockIngest('mbp');
  }

  const registry = loadRegistry(opts.registryPath);
  const subscriptionLists = await Promise.all(registry.subscriptions.map((s) => collectSubscriptions(s)));
  const subscriptions = subscriptionLists.flat();
  const runs = collectRuns(registry);
  const stats = collectHostStats(runs);

  return {
    schema: INGEST_SCHEMA,
    host: {
      id: registry.host.id,
      label: registry.host.label,
      os: hostOs(),
    },
    reportedAt: new Date().toISOString(),
    subscriptions,
    runs,
    stats,
  };
}

export async function pushReport(
  report: IngestReport,
  hubUrl: string,
  token?: string,
): Promise<void> {
  const url = new URL('/api/ingest', hubUrl);
  if (token) url.searchParams.set('token', token);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`hub ingest failed ${res.status}: ${text}`);
  }
}
