// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __setStateForTests,
  __connectWsForTests,
  __wsReadyStateForTests,
  requestSync,
  wipeSession,
  state,
  WS_CONNECT_TIMEOUT_MS,
  WS_REPLY_TIMEOUT_MS,
  WS_PING_INTERVAL_MS,
} from './appStore';
import { installMockWebSocket, type MockWsHandle } from '../test/mockWebSocket';

const HASH = 'ab'.repeat(32);

describe('PWA WebSocket hung-sync recovery', () => {
  let mock: MockWsHandle | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    __setStateForTests({
      connState: 'offline',
      wasAuthenticated: true,
      passwordHash: HASH,
      cards: [],
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await wipeSession({ skipPersist: true });
    mock?.restore();
    mock = null;
    vi.useRealTimers();
  });

  it('drops a CONNECTING socket after the connect timeout and goes offline', async () => {
    mock = installMockWebSocket({ reachable: () => true, hangConnecting: true });
    __connectWsForTests();
    expect(__wsReadyStateForTests()).toBe(0);
    requestSync();
    expect(state.syncStatus).toBe('syncing');

    await vi.advanceTimersByTimeAsync(WS_CONNECT_TIMEOUT_MS);
    expect(state.connState).toBe('offline');
    expect(state.syncStatus).toBe('offline');
    expect(state.authenticated).toBe(false);
    expect(mock.instances.some((i) => i.closed)).toBe(true);
    expect(state.toast?.type).toBe('error');
  });

  it('second Sync tap while already syncing force-drops without waiting for the timeout', async () => {
    mock = installMockWebSocket({ reachable: () => true, hangConnecting: true });
    __connectWsForTests();
    requestSync();
    expect(state.syncStatus).toBe('syncing');

    requestSync();
    expect(state.connState).toBe('offline');
    expect(state.syncStatus).toBe('offline');
    expect(mock.instances.some((i) => i.closed)).toBe(true);
    expect(state.toast?.type).toBe('error');
  });

  it('drops after sync_pull_request with no sync_pull (mid-session / post-auth watchdog)', async () => {
    mock = installMockWebSocket({
      reachable: () => true,
      delayMs: 1,
      reply: (_host, msg) => {
        if (msg.type === 'challenge_request') {
          return {
            type: 'challenge',
            challenge: 'nonce-1',
            salt: 'saltabcdefghijkl',
            authScheme: 'v3-hkdf',
          };
        }
        if (msg.type === 'auth') {
          return { type: 'auth_ok', token: 'session-token' };
        }
        return undefined;
      },
    });
    __connectWsForTests();
    await vi.advanceTimersByTimeAsync(10);

    expect(mock.instances[0]?.sent.some((m) => m.type === 'sync_pull_request')).toBe(true);
    expect(state.syncStatus).toBe('syncing');

    await vi.advanceTimersByTimeAsync(WS_REPLY_TIMEOUT_MS);
    // Watchdog closes the hung socket; retry may already have opened a new one.
    expect(mock.instances[0]?.closed).toBe(true);
    expect(state.toast?.type).toBe('error');
  });

  it('drops an OPEN socket after inbound silence exceeds the stale window', async () => {
    await wipeSession({ skipPersist: true });
    __setStateForTests({
      connState: 'disconnected',
      wasAuthenticated: false,
      passwordHash: null,
    });
    mock = installMockWebSocket({
      reachable: () => true,
      delayMs: 1,
      reply: (_host, msg) => {
        if (msg.type === 'challenge_request') {
          return { type: 'challenge', challenge: 'nonce-1', salt: 'saltabcdefghijkl' };
        }
        return undefined;
      },
    });
    __connectWsForTests();
    await vi.advanceTimersByTimeAsync(10);
    expect(__wsReadyStateForTests()).toBe(1);

    await vi.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS * 3);
    expect(mock.instances.some((i) => i.closed)).toBe(true);
    expect(state.toast?.type).toBe('error');
  });
});
