// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateUnlockKeypair,
  wrapUnlockGrant,
  UNLOCK_REQUEST_TYPE,
  UNLOCK_GRANT_TYPE,
  DEFAULT_VAULT_SETTINGS,
} from '@pkey/core';
import {
  __setStateForTests,
  __connectWsForTests,
  startPhoneUnlock,
  requestSync,
  wipeSession,
  state,
} from './appStore';
import { installMockWebSocket, type MockWsHandle } from '../test/mockWebSocket';

const SALT = 'b'.repeat(32);
const HASH = 'aa'.repeat(32);

describe('PWA phone unlock', () => {
  let mock: MockWsHandle | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    __setStateForTests({
      connState: 'disconnected',
      wasAuthenticated: false,
      authenticated: false,
      challenge: null,
      loginPasswordVisible: false,
      loginError: '',
      authBusy: false,
      cards: [],
      settings: { ...DEFAULT_VAULT_SETTINGS, webLoginOnPhone: true },
      showUnlockWait: false,
      unlockSas: '',
      toast: null,
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await wipeSession({ skipPersist: true });
    mock?.restore();
    mock = null;
    vi.useRealTimers();
  });

  it('requestSync on login reconnects without a blind not_connected toast', async () => {
    mock = installMockWebSocket({
      reachable: () => true,
      delayMs: 1,
      reply: (_host, msg) => {
        if (msg.type === 'challenge_request') {
          return {
            type: 'challenge',
            challenge: 'nonce-sync',
            salt: SALT,
            authScheme: 'v3-hkdf',
          };
        }
        return null;
      },
    });
    expect(state.toast).toBeNull();
    requestSync();
    expect(state.toast).toBeNull();
    await vi.advanceTimersByTimeAsync(5);
    expect(state.challenge).toBe('nonce-sync');
  });

  it('does not send auth when the grant unwrap fails', async () => {
    const attacker = generateUnlockKeypair();
    const envelope = wrapUnlockGrant(attacker.secretKey, attacker.publicKeyHex, {
      passwordHash: HASH,
      salt: SALT,
      authScheme: 'v3-hkdf',
    });
    mock = installMockWebSocket({
      reachable: () => true,
      delayMs: 1,
      reply: (_host, msg) => {
        if (msg.type === 'challenge_request') {
          return {
            type: 'challenge',
            challenge: 'nonce-unlock',
            salt: SALT,
            authScheme: 'v3-hkdf',
          };
        }
        if (msg.type === UNLOCK_REQUEST_TYPE) {
          return {
            type: UNLOCK_GRANT_TYPE,
            requestId: msg.requestId,
            serverPub: attacker.publicKeyHex,
            encryptedPayload: envelope,
          };
        }
        if (msg.type === 'auth') {
          throw new Error('must not submitLogin/auth after a failed unwrap');
        }
        return null;
      },
    });
    __connectWsForTests();
    await vi.advanceTimersByTimeAsync(5);
    expect(state.challenge).toBe('nonce-unlock');
    startPhoneUnlock();
    await vi.advanceTimersByTimeAsync(5);
    expect(state.authenticated).toBe(false);
    expect(mock.instances[0]?.sent.some((m) => m.type === 'auth')).toBe(false);
    expect(state.showUnlockWait).toBe(false);
  });

  it('aborts a pending phone unlock when the socket drops', async () => {
    mock = installMockWebSocket({
      reachable: () => true,
      delayMs: 1,
      reply: (_host, msg) => {
        if (msg.type === 'challenge_request') {
          return {
            type: 'challenge',
            challenge: 'nonce-drop',
            salt: SALT,
            authScheme: 'v3-hkdf',
          };
        }
        return null;
      },
    });
    __connectWsForTests();
    await vi.advanceTimersByTimeAsync(5);
    startPhoneUnlock();
    expect(state.showUnlockWait).toBe(true);
    mock.disconnectAll();
    expect(state.showUnlockWait).toBe(false);
    expect(state.toast?.type).toBe('error');
  });
});
