import { Snapshot, IngestReport, INGEST_SCHEMA, assertNoSecrets } from './schema.js';

function schemaName(input: unknown): string {
  if (input && typeof input === 'object' && 'schema' in input) {
    const value = (input as { schema?: unknown }).schema;
    if (typeof value === 'string') return value;
  }
  return '';
}

export function validateSnapshot(input: unknown): Snapshot {
  const parsed = Snapshot.parse(input);
  assertNoSecrets(parsed);
  return parsed;
}

export function validateIngest(input: unknown): IngestReport {
  const got = schemaName(input);
  if (got !== INGEST_SCHEMA) {
    throw new Error(`schema error: expected ${INGEST_SCHEMA}, got ${got || 'missing'}`);
  }
  const parsed = IngestReport.parse(input);
  assertNoSecrets(parsed);
  return parsed;
}

export function isSnapshot(input: unknown): input is Snapshot {
  return Snapshot.safeParse(input).success;
}
