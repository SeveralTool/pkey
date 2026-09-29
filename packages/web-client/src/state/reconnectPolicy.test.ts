// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  nextRetryDelayMs,
  isCircuitOpen,
  shouldOpenCircuit,
  isBrowserOnline,
  DISCOVERY_FAIL_LIMIT,
  CIRCUIT_OPEN_MS,
  RETRY_DELAY_CAP_MS,
} from './reconnectPolicy';

afterEach(() => {
  // Restore in case a test stubbed navigator.onLine via defineProperty.
});

describe('nextRetryDelayMs', () => {
  it('grows exponentially and applies jitter in [0.5, 1.5) of the base', () => {
    const minJitter = () => 0;
    const maxJitter = () => 0.999;
    expect(nextRetryDelayMs(0, minJitter)).toBe(500);
    expect(nextRetryDelayMs(0, maxJitter)).toBe(1499);
    expect(nextRetryDelayMs(3, minJitter)).toBe(4000);
    expect(nextRetryDelayMs(10, minJitter)).toBe(Math.round(RETRY_DELAY_CAP_MS * 0.5));
  });
});

describe('circuit breaker', () => {
  it('opens after the failure limit and stays open until the deadline', () => {
    expect(shouldOpenCircuit(DISCOVERY_FAIL_LIMIT - 1)).toBe(false);
    expect(shouldOpenCircuit(DISCOVERY_FAIL_LIMIT)).toBe(true);
    const now = 1_000_000;
    expect(isCircuitOpen(now + CIRCUIT_OPEN_MS, now)).toBe(true);
    expect(isCircuitOpen(now, now)).toBe(false);
  });
});

describe('isBrowserOnline', () => {
  it('is true unless navigator.onLine is explicitly false', () => {
    expect(isBrowserOnline()).toBe(true);
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    try {
      expect(isBrowserOnline()).toBe(false);
    } finally {
      if (desc) Object.defineProperty(Navigator.prototype, 'onLine', desc);
    }
  });
});
