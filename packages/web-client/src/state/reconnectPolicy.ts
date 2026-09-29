/**
 * @fileoverview Retry delay, circuit breaker, and browser-online guards for
 * PWA reconnect. Pure helpers so `appStore` does not grow more retry math.
 */

/** Consecutive failed discovery cycles before backing off. */
export const DISCOVERY_FAIL_LIMIT = 3;
/** How long to pause probing after the circuit opens. */
export const CIRCUIT_OPEN_MS = 90_000;
/** Cap for exponential reconnect delay. */
export const RETRY_DELAY_CAP_MS = 30_000;

/**
 * Exponential backoff with full jitter: `base * (0.5 + random)` where base is
 * `min(1000 * 2^retryCount, cap)`.
 */
export function nextRetryDelayMs(
  retryCount: number,
  random: () => number = Math.random
): number {
  const exp = Math.max(0, retryCount);
  const base = Math.min(1000 * 2 ** exp, RETRY_DELAY_CAP_MS);
  const jittered = base * (0.5 + random());
  return Math.max(500, Math.round(jittered));
}

/** True when discovery should stop probing until `openUntil`. */
export function isCircuitOpen(openUntil: number, now = Date.now()): boolean {
  return openUntil > now;
}

/** True after enough consecutive discovery failures. */
export function shouldOpenCircuit(consecutiveFails: number): boolean {
  return consecutiveFails >= DISCOVERY_FAIL_LIMIT;
}

/**
 * Browser connectivity. `navigator.onLine === false` is a hard stop (no sweep,
 * no WS hammer). `true` / missing navigator still allows LAN probes.
 */
export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
