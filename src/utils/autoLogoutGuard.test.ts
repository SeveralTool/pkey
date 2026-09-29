import {
  beginExternalUiSession,
  endExternalUiSession,
  EXTERNAL_UI_SETTLE_MS,
  isExternalUiSession,
  setBackgroundLockHandler,
  requestBackgroundLockIfNeeded,
  suppressAutoLogout,
  isAutoLogoutSuppressed,
  withExternalUiSession,
} from './autoLogoutGuard';

describe('autoLogoutGuard external UI session', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setBackgroundLockHandler(null);
  });

  afterEach(async () => {
    setBackgroundLockHandler(null);
    let guard = 0;
    while (isExternalUiSession() && guard < 5) {
      guard += 1;
      const done = endExternalUiSession(() => 'active');
      await jest.advanceTimersByTimeAsync(EXTERNAL_UI_SETTLE_MS);
      await done;
    }
    jest.useRealTimers();
  });

  it('does not lock when the app is active after the share sheet closes', async () => {
    const lock = jest.fn();
    setBackgroundLockHandler(lock);
    beginExternalUiSession();
    expect(isExternalUiSession()).toBe(true);

    const done = endExternalUiSession(() => 'active');
    await done;

    expect(isExternalUiSession()).toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  it('locks when the app is still background after the share sheet closes', async () => {
    const lock = jest.fn();
    setBackgroundLockHandler(lock);
    beginExternalUiSession();

    const done = endExternalUiSession(() => 'background');
    await jest.advanceTimersByTimeAsync(EXTERNAL_UI_SETTLE_MS);
    await done;

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('ends immediately when the app is already active', async () => {
    beginExternalUiSession();
    const done = endExternalUiSession(() => 'active');
    await done;
    expect(isExternalUiSession()).toBe(false);
  });

  it('stays in session until settle when dismiss happens in the background', async () => {
    beginExternalUiSession();
    const done = endExternalUiSession(() => 'background');
    expect(isExternalUiSession()).toBe(true);
    await jest.advanceTimersByTimeAsync(EXTERNAL_UI_SETTLE_MS - 1);
    expect(isExternalUiSession()).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    await done;
    expect(isExternalUiSession()).toBe(false);
  });

  it('withExternalUiSession begins and ends around the callback', async () => {
    const run = withExternalUiSession(async () => {
      expect(isExternalUiSession()).toBe(true);
    });
    await jest.advanceTimersByTimeAsync(EXTERNAL_UI_SETTLE_MS);
    await run;
    expect(isExternalUiSession()).toBe(false);
  });

  it('withExternalUiSession ends the session if the callback throws', async () => {
    const assertion = expect(
      withExternalUiSession(async () => {
        throw new Error('prompt failed');
      })
    ).rejects.toThrow('prompt failed');
    await jest.advanceTimersByTimeAsync(EXTERNAL_UI_SETTLE_MS);
    await assertion;
    expect(isExternalUiSession()).toBe(false);
  });
});

describe('autoLogoutGuard time suppress', () => {
  it('is active only until the requested window elapses', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    suppressAutoLogout(5_000);
    expect(isAutoLogoutSuppressed()).toBe(true);
    jest.setSystemTime(1_000_000 + 4_999);
    expect(isAutoLogoutSuppressed()).toBe(true);
    jest.setSystemTime(1_000_000 + 5_000);
    expect(isAutoLogoutSuppressed()).toBe(false);
    jest.useRealTimers();
  });
});

describe('requestBackgroundLockIfNeeded', () => {
  afterEach(() => {
    setBackgroundLockHandler(null);
  });

  it('does not lock while the app is active', () => {
    const lock = jest.fn();
    setBackgroundLockHandler(lock);
    requestBackgroundLockIfNeeded(() => 'active');
    expect(lock).not.toHaveBeenCalled();
  });

  it('locks when the app is backgrounded', () => {
    const lock = jest.fn();
    setBackgroundLockHandler(lock);
    requestBackgroundLockIfNeeded(() => 'background');
    expect(lock).toHaveBeenCalledTimes(1);
  });
});
