import {
  AUTO_LOGOUT_1M_MS,
  INSTANT_RESUME_GRACE_MS,
  foregroundResumeTimeoutMs,
  shouldLockOnForegroundResume,
} from './autoLogoutPolicy';

describe('shouldLockOnForegroundResume', () => {
  const backgroundedAt = 1_000_000;

  it('does not lock when background tracking never started', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt: null,
        now: backgroundedAt + AUTO_LOGOUT_1M_MS * 3,
        timeoutMs: AUTO_LOGOUT_1M_MS,
      })
    ).toBe(false);
  });

  it('does not lock when returning before the timeout', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt,
        now: backgroundedAt + AUTO_LOGOUT_1M_MS - 1,
        timeoutMs: AUTO_LOGOUT_1M_MS,
      })
    ).toBe(false);
  });

  it('locks when elapsed time equals the timeout', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt,
        now: backgroundedAt + AUTO_LOGOUT_1M_MS,
        timeoutMs: AUTO_LOGOUT_1M_MS,
      })
    ).toBe(true);
  });

  it('locks when elapsed time exceeds the timeout (timer-frozen background)', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt,
        now: backgroundedAt + 180_000,
        timeoutMs: AUTO_LOGOUT_1M_MS,
      })
    ).toBe(true);
  });

  it('does not lock for a non-positive timeout', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt,
        now: backgroundedAt + 10_000,
        timeoutMs: 0,
      })
    ).toBe(false);
  });

  it('locks INSTANT on resume after the overlay grace', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt,
        now: backgroundedAt + INSTANT_RESUME_GRACE_MS,
        timeoutMs: INSTANT_RESUME_GRACE_MS,
      })
    ).toBe(true);
  });

  it('does not lock INSTANT on a sub-grace inactive blip', () => {
    expect(
      shouldLockOnForegroundResume({
        backgroundedAt,
        now: backgroundedAt + INSTANT_RESUME_GRACE_MS - 1,
        timeoutMs: INSTANT_RESUME_GRACE_MS,
      })
    ).toBe(false);
  });
});

describe('foregroundResumeTimeoutMs', () => {
  it('uses overlay grace for INSTANT and 1M for the delayed setting', () => {
    expect(foregroundResumeTimeoutMs('INSTANT')).toBe(INSTANT_RESUME_GRACE_MS);
    expect(foregroundResumeTimeoutMs('1M')).toBe(AUTO_LOGOUT_1M_MS);
  });
});
