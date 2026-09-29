import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __setStateForTests,
  wipeSession,
  state,
  WEB_AUTO_LOGOUT_MS,
} from './appStore';

const FAKE_NOW = 1_000_000;

describe('webAutoLogout timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
    __setStateForTests({
      connState: 'offline',
      passwordHash: 'test-hash',
      settings: {
        ...state.settings,
        webAutoLogout: '5M',
        autoLogout: 'INSTANT',
      },
    });
  });

  afterEach(async () => {
    await wipeSession({ skipPersist: true });
    vi.useRealTimers();
  });

  it('uses webAutoLogout duration, not mobile autoLogout INSTANT/1M', async () => {
    const { setSearch } = await import('./appStore');
    setSearch('x');
    expect(state.sessionUnlocked).toBe(true);
    await vi.advanceTimersByTimeAsync(WEB_AUTO_LOGOUT_MS['5M'] - 1_000);
    expect(state.sessionUnlocked).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(state.sessionUnlocked).toBe(false);
  });

  it('NEVER disables the idle timer', async () => {
    __setStateForTests({
      connState: 'offline',
      passwordHash: 'test-hash',
      settings: { ...state.settings, webAutoLogout: 'NEVER' },
    });
    const { setSearch } = await import('./appStore');
    setSearch('y');
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(state.sessionUnlocked).toBe(true);
  });

  it('does not lock when returning before the idle duration', async () => {
    const { __onWebVisibilityForTests } = await import('./appStore');
    expect(state.sessionUnlocked).toBe(true);
    await __onWebVisibilityForTests(true);
    vi.setSystemTime(FAKE_NOW + 2_000);
    await __onWebVisibilityForTests(false);
    expect(state.sessionUnlocked).toBe(true);
  });

  it('locks on resume when wall-clock passed the duration with frozen timers', async () => {
    const { __onWebVisibilityForTests } = await import('./appStore');
    expect(state.sessionUnlocked).toBe(true);
    await __onWebVisibilityForTests(true);
    vi.setSystemTime(FAKE_NOW + WEB_AUTO_LOGOUT_MS['5M'] + 1);
    await __onWebVisibilityForTests(false);
    expect(state.sessionUnlocked).toBe(false);
  });

  it('does not lock on resume when webAutoLogout is NEVER', async () => {
    __setStateForTests({
      connState: 'offline',
      passwordHash: 'test-hash',
      settings: { ...state.settings, webAutoLogout: 'NEVER' },
    });
    const { __onWebVisibilityForTests } = await import('./appStore');
    await __onWebVisibilityForTests(true);
    vi.setSystemTime(FAKE_NOW + WEB_AUTO_LOGOUT_MS['1H'] + 1_000);
    await __onWebVisibilityForTests(false);
    expect(state.sessionUnlocked).toBe(true);
  });
});
