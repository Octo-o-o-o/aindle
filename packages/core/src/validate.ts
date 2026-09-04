import { Snapshot, IngestReport, assertNoSecrets } from './schema.js';

export function validateSnapshot(input: unknown): Snapshot {
  const parsed = Snapshot.parse(input);
  assertNoSecrets(parsed);
  return parsed;
}

export function validateIngest(input: unknown): IngestReport {
  const parsed = IngestReport.parse(input);
  assertNoSecrets(parsed);
  return parsed;
}

export function isSnapshot(input: unknown): input is Snapshot {
  return Snapshot.safeParse(input).success;
}
