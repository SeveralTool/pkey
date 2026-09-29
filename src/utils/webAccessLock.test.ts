import {
  setWebAccessLockStopHandler,
  stopWebAccessOnVaultLock,
  setAndroidWebAccessKeepAlive,
  isAndroidWebAccessKeepAlive,
} from './webAccessLock';

describe('webAccessLock', () => {
  afterEach(() => {
    setWebAccessLockStopHandler(null);
    setAndroidWebAccessKeepAlive(false);
  });

  it('is a no-op when no handler is registered', () => {
    expect(() => stopWebAccessOnVaultLock()).not.toThrow();
  });

  it('invokes the registered stop handler on vault lock', () => {
    const stop = jest.fn();
    setWebAccessLockStopHandler(stop);
    stopWebAccessOnVaultLock();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not invoke a handler after it is cleared', () => {
    const stop = jest.fn();
    setWebAccessLockStopHandler(stop);
    setWebAccessLockStopHandler(null);
    stopWebAccessOnVaultLock();
    expect(stop).not.toHaveBeenCalled();
  });

  it('tracks Android web-access keep-alive independently of the stop handler', () => {
    expect(isAndroidWebAccessKeepAlive()).toBe(false);
    setAndroidWebAccessKeepAlive(true);
    expect(isAndroidWebAccessKeepAlive()).toBe(true);
    setAndroidWebAccessKeepAlive(false);
    expect(isAndroidWebAccessKeepAlive()).toBe(false);
  });
});
