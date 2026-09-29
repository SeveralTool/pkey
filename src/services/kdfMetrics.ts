/**
 * In-memory KDF timings for lab/debug. Never records passwords, salts, roots, or verifiers.
 * Not sent off-device.
 */

export type KdfSource = 'native' | 'js' | 'unavailable';
export type KdfOp = 'unlock' | 'create' | 'verify' | 'import' | 'kat' | 'derive';
export type KdfOutcome = 'ok' | 'fail' | 'unavailable';

export type KdfMetricEvent = Readonly<{
  source: KdfSource;
  op: KdfOp;
  durationMs: number;
  m: number;
  t: number;
  p: number;
  katOk?: boolean;
  outcome: KdfOutcome;
  deriveCount: number;
}>;

let events: KdfMetricEvent[] = [];
let deriveCountThisAttempt = 0;

/** Starts a password-KDF attempt; resets the per-attempt derive counter. */
export function beginKdfAttempt(): void {
  deriveCountThisAttempt = 0;
}

/** Records one Argon2id invocation (native or JS) in the current attempt. */
export function recordKdfDerive(): number {
  deriveCountThisAttempt += 1;
  return deriveCountThisAttempt;
}

export function getKdfDeriveCount(): number {
  return deriveCountThisAttempt;
}

export function recordKdfMetric(
  event: Omit<KdfMetricEvent, 'deriveCount'> & { deriveCount?: number }
): void {
  const full: KdfMetricEvent = {
    ...event,
    deriveCount: event.deriveCount ?? deriveCountThisAttempt,
  };
  events = [...events, full];
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info('[kdf]', JSON.stringify(full));
  }
}

export function getKdfMetrics(): readonly KdfMetricEvent[] {
  return events;
}

/** Test-only. */
export function resetKdfMetricsForTests(): void {
  events = [];
  deriveCountThisAttempt = 0;
}
