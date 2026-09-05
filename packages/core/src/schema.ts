import { z } from 'zod';

export const SNAPSHOT_SCHEMA = 'aindle.snapshot.v2' as const;
export const INGEST_SCHEMA = 'aindle.ingest.v2' as const;

export const Initiator = z.enum(['human', 'agent', 'machine']);
export type Initiator = z.infer<typeof Initiator>;

export const SignalConfidence = z.enum(['direct', 'derived']);
export type SignalConfidence = z.infer<typeof SignalConfidence>;

export const WaitReason = z.enum(['needs_input']);
export type WaitReason = z.infer<typeof WaitReason>;

export const Confidence = z.enum(['live', 'cached', 'stale', 'error', 'none']);
export type Confidence = z.infer<typeof Confidence>;

export const HostStatus = z.enum(['ok', 'stale']);
export type HostStatus = z.infer<typeof HostStatus>;

export const RunState = z.enum(['active', 'wait', 'idle', 'done', 'fail']);
export type RunState = z.infer<typeof RunState>;

export const UsageWindow = z.object({
  key: z.string().min(1),
  pct: z.number().min(0).max(100),
  resetsAt: z.string().datetime({ offset: true }).optional(),
});
export type UsageWindow = z.infer<typeof UsageWindow>;

export const SubscriptionSource = z.enum(['local', 'relay']);
export type SubscriptionSource = z.infer<typeof SubscriptionSource>;

export const SubscriptionScope = z.enum(['admin', 'user', 'people']);
export type SubscriptionScope = z.infer<typeof SubscriptionScope>;

export const SubscriptionKind = z.enum(['quota', 'site', 'account', 'member', 'key', 'spend']);
export type SubscriptionKind = z.infer<typeof SubscriptionKind>;

export const UsageDay = z.object({
  date: z.string().min(1),
  cost: z.number(),
  requests: z.number(),
});
export type UsageDay = z.infer<typeof UsageDay>;

export const UsageEvent = z.object({
  at: z.string().min(1),
  model: z.string().min(1),
  cost: z.number(),
  via: z.string().optional(),
  count: z.number().int().min(1).optional(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;

export const UsageBreakdown = z.object({
  userId: z.number().int().optional(),
  todayCount: z.number().int().min(0).optional(),
  days: z.array(UsageDay).max(14).optional(),
  today: z.array(UsageEvent).max(16).optional(),
});
export type UsageBreakdown = z.infer<typeof UsageBreakdown>;

export const Subscription = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  label: z.string().min(1),
  plan: z.string().optional(),
  shared: z.boolean().optional(),
  source: SubscriptionSource.optional(),
  scope: SubscriptionScope.optional(),
  kind: SubscriptionKind.optional(),
  windows: z.array(UsageWindow),
  confidence: Confidence,
  hostIds: z.array(z.string()).optional(),
  breakdown: UsageBreakdown.optional(),
});
export type Subscription = z.infer<typeof Subscription>;

export const HostStats = z.object({
  liveRuns: z.number().int().min(0),
  waitRuns: z.number().int().min(0),
  sessionsToday: z.number().int().min(0),
  tokensToday: z.string(),
});
export type HostStats = z.infer<typeof HostStats>;

export const Host = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  os: z.enum(['darwin', 'linux', 'win32']),
  seenAt: z.string().datetime({ offset: true }),
  status: HostStatus,
  stats: HostStats.optional(),
});
export type Host = z.infer<typeof Host>;

export const Run = z
  .object({
    id: z.string().min(1),
    hostId: z.string().min(1),
    subscriptionId: z.string().optional(),
    tool: z.string().min(1),
    title: z.string().min(1),
    project: z.string().optional(),
    state: RunState,
    startedAt: z.string().datetime({ offset: true }).optional(),
    lastActivityAt: z.string().datetime({ offset: true }).optional(),
    detail: z.string().optional(),
    spawned: z.boolean().optional(),
    initiator: Initiator,
    initiatorConfidence: SignalConfidence,
    stateConfidence: SignalConfidence,
    waitReason: WaitReason.optional(),
  })
  .refine(
    (run) => {
      if (run.state === 'wait') {
        return run.stateConfidence === 'direct' && run.waitReason === 'needs_input';
      }
      return run.waitReason === undefined;
    },
    { message: 'state=wait requires stateConfidence=direct and waitReason=needs_input' },
  );
export type Run = z.infer<typeof Run>;

export const Snapshot = z.object({
  schema: z.literal(SNAPSHOT_SCHEMA),
  generatedAt: z.string().datetime({ offset: true }),
  hub: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
  }),
  freshness: z.object({
    oldestHostMs: z.number().int().min(0),
    staleHosts: z.array(z.string()),
  }),
  hosts: z.array(Host),
  subscriptions: z.array(Subscription),
  runs: z.array(Run),
  monitorPeriod: z.string().min(1),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const IngestReport = z.object({
  schema: z.literal(INGEST_SCHEMA),
  host: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    os: z.enum(['darwin', 'linux', 'win32']),
  }),
  reportedAt: z.string().datetime({ offset: true }),
  subscriptions: z.array(Subscription),
  runs: z.array(Run),
  stats: HostStats.optional(),
});
export type IngestReport = z.infer<typeof IngestReport>;

export const FORBIDDEN_SNAPSHOT_KEYS = [
  'token',
  'cookie',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
  'prompt',
  'stack',
] as const;

export function assertNoSecrets(value: unknown, path = 'root'): void {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoSecrets(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    const forbidden = FORBIDDEN_SNAPSHOT_KEYS.some((k) => lower === k.toLowerCase());
    if (forbidden) {
      throw new Error(`forbidden snapshot field at ${path}.${key}`);
    }
    assertNoSecrets(child, `${path}.${key}`);
  }
}
