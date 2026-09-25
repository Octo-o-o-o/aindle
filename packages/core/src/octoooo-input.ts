import { createHash } from 'node:crypto';
import { Snapshot } from './schema.js';
export interface OctooooSourceMapping { instanceId: string; sourceIdsByTool: Record<string, string>; }
export function octooooInput(raw: unknown, mapping: OctooooSourceMapping) {
  const snapshot = Snapshot.parse(raw);
  const observations: Record<string, unknown>[] = [];
  const usage: Record<string, unknown>[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const identity = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value);
  if (!identity(mapping.instanceId)) throw new Error('An explicit stable source instance is required');
  for (const run of snapshot.runs) {
    const sourceId = mapping.sourceIdsByTool[run.tool];
    if (!identity(sourceId) || !identity(run.hostId) || !identity(run.id) || !run.observedAt) {
      skipped.push({ id: run.id, reason: 'missing_explicit_identity_or_source_observed_at' }); continue;
    }
    const direct = run.stateConfidence === 'direct';
    const status = direct ? ({ active: 'running', idle: 'idle', done: 'completed', fail: 'failed', wait: 'needs_attention' } as const)[run.state] : 'unknown';
    const observation = { schema_version: '1.2.0', source_id: sourceId, instance_id: mapping.instanceId, host_id: run.hostId, native_id: run.id,
      source_observed_at: run.observedAt, status, capability: 'observe', availability: direct ? 'healthy' : 'partial_failure',
      reason: direct ? null : 'unsupported_event', title: 'Aindle 来源观察' };
    observations.push({ ...observation, observation_id: createHash('sha256').update(JSON.stringify(observation)).digest('hex') });
  }
  for (const subscription of snapshot.subscriptions) {
    if ((subscription.kind ?? 'quota') !== 'quota') continue;
    const provider = mapping.sourceIdsByTool[subscription.tool];
    if (!identity(provider) || !subscription.collectedAt) {
      skipped.push({ id: subscription.id, reason: 'missing_explicit_provider_or_collected_at' }); continue;
    }
    for (const window of subscription.windows) usage.push({ provider, account: subscription.id, window: window.key,
      metric: 'used_percent', observed_at: subscription.collectedAt, value: window.pct, resets_at: window.resetsAt ?? null, window_minutes: null });
    for (const period of ['h24', 'd7'] as const) {
      const amount = subscription.usage?.[period];
      if (!amount) continue;
      const window = period === 'h24' ? '24h' : '7d';
      const window_minutes = period === 'h24' ? 1440 : 10080;
      if (Number.isSafeInteger(amount.tokens)) usage.push({ provider, account: subscription.id, window,
        metric: 'used_tokens', observed_at: subscription.collectedAt, value: amount.tokens, resets_at: null, window_minutes });
      else skipped.push({ id: subscription.id, reason: 'non_integer_tokens' });
      if (amount.cost !== undefined) usage.push({ provider, account: subscription.id, window,
        metric: 'spent_amount', observed_at: subscription.collectedAt, value: amount.cost, resets_at: null, window_minutes, currency: 'USD' });
    }
  }
  return { observations, usage, skipped };
}
