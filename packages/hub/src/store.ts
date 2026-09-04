import type { IngestReport, Snapshot } from '@aindle/core';
import { mergeReports } from '@aindle/core';

export interface HubOptions {
  id: string;
  label: string;
  staleAfterMs?: number;
  monitorPeriod?: string;
}

export class HubStore {
  private reports = new Map<string, IngestReport>();
  private lastGoodSnapshot: Snapshot | null = null;

  constructor(private readonly options: HubOptions) {}

  ingest(report: IngestReport): void {
    this.reports.set(report.host.id, report);
  }

  removeHost(hostId: string): void {
    this.reports.delete(hostId);
  }

  listHostIds(): string[] {
    return [...this.reports.keys()];
  }

  snapshot(now = new Date()): Snapshot {
    const reports = [...this.reports.values()];
    if (reports.length === 0 && this.lastGoodSnapshot) {
      const stale = structuredClone(this.lastGoodSnapshot);
      stale.generatedAt = now.toISOString();
      stale.freshness.staleHosts = stale.hosts.map((h) => h.id);
      stale.hosts = stale.hosts.map((h) => ({ ...h, status: 'stale' as const }));
      return stale;
    }
    const snap = mergeReports(reports, this.options, now);
    this.lastGoodSnapshot = snap;
    return snap;
  }
}
