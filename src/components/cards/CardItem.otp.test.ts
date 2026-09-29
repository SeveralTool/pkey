import { generateTotp, getRemainingSeconds, getTotpAtOffset } from '@pkey/core';

const SECRET = 'JBSWY3DPEHPK3PXP';
const PERIOD = 30;

describe('CardItem OTP integration (core)', () => {
  const fixedTs = 59 * PERIOD * 1000;

  it('generates stable code for fixed period timestamp', () => {
    const code = generateTotp(SECRET, {
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      timestamp: fixedTs,
    });
    expect(code).toHaveLength(6);
    expect(code).toBe(
      generateTotp(SECRET, {
        algorithm: 'SHA1',
        digits: 6,
        period: PERIOD,
        timestamp: fixedTs,
      })
    );
  });

  it('returns different codes for window offsets', () => {
    const current = getTotpAtOffset(SECRET, 0, 1, {
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      timestamp: fixedTs,
    });
    const prev = getTotpAtOffset(SECRET, -1, 1, {
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      timestamp: fixedTs,
    });
    const next = getTotpAtOffset(SECRET, 1, 1, {
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      timestamp: fixedTs,
    });
    expect(prev).not.toBe(current);
    expect(next).not.toBe(current);
  });

  it('countdown decreases within a period', () => {
    jest.useFakeTimers();
    const base = 45_000;
    jest.setSystemTime(base);
    expect(getRemainingSeconds(PERIOD, base)).toBe(15);
    jest.setSystemTime(base + 5_000);
    expect(getRemainingSeconds(PERIOD, base + 5_000)).toBe(10);
    jest.useRealTimers();
  });
});
