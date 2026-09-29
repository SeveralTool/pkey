/**
 * @fileoverview Foreground idle lock duration helper (audit M5).
 */
import { foregroundIdleLockMs } from './useForegroundIdleLock';

describe('foregroundIdleLockMs', () => {
  it('returns 0 for NEVER and omitted', () => {
    expect(foregroundIdleLockMs('NEVER')).toBe(0);
    expect(foregroundIdleLockMs(undefined)).toBe(0);
  });

  it('maps 1 / 5 / 15 minute settings', () => {
    expect(foregroundIdleLockMs('1M')).toBe(60_000);
    expect(foregroundIdleLockMs('5M')).toBe(5 * 60_000);
    expect(foregroundIdleLockMs('15M')).toBe(15 * 60_000);
  });
});
