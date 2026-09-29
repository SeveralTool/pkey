// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setPbkdf2Provider, deriveVaultAuthSecret, computeChallengeResponse } from '@pkey/core';
import {
  __setStateForTests,
  __connectWsForTests,
  submitLogin,
  wipeSession,
  state,
  WS_REPLY_TIMEOUT_MS,
} from './appStore';
import { installMockWebSocket, type MockWsHandle } from '../test/mockWebSocket';

const SALT = 'b'.repeat(32);

describe('PWA login auth recovery', () => {
  let mock: MockWsHandle | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(0), 0) as unknown as number;
    });
    setPbkdf2Provider((_password, _salt, iterations, _keyLengthBytes) => {
      const tag = iterations.toString(16).padStart(8, '0');
      return (tag + 'ab'.repeat(32)).slice(0, 64);
    });
    __setStateForTests({
      connState: 'disconnected',
      wasAuthenticated: false,
      authenticated: false,
      challenge: null,
      loginPasswordVisible: false,
      loginError: '',
      authBusy: false,
      cards: [],
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await wipeSession({ skipPersist: true });
    mock?.restore();
    mock = null;
    setPbkdf2Provider(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openAndChallenge(replyAuth: (msg: Record<string, unknown>) => unknown) {
    mock = installMockWebSocket({
      reachable: () => true,
      delayMs: 1,
      reply: (_host, msg) => {
        if (msg.type === 'challenge_request') {
          return {
            type: 'challenge',
            challenge: 'nonce-login',
            salt: SALT,
            authScheme: 'v3-hkdf',
          };
        }
        if (msg.type === 'auth') return replyAuth(msg);
        return null;
      },
    });
    __connectWsForTests();
    await vi.advanceTimersByTimeAsync(5);
  }

  it('keeps the login form and retries the other hash after auth_error', async () => {
    const authResponses: string[] = [];
    await openAndChallenge((msg) => {
      authResponses.push(String(msg.response ?? ''));
      if (authResponses.length === 1) {
        return { type: 'auth_error', code: 'AUTH_FAILED', error: 'Authentication failed' };
      }
      return { type: 'auth_ok', token: 'tok' };
    });

    expect(state.challenge).toBe('nonce-login');
    expect(state.loginPasswordVisible).toBe(true);

    const pending = submitLogin('new-pass');
    await vi.advanceTimersByTimeAsync(80);
    await pending;
    await vi.advanceTimersByTimeAsync(20);

    expect(state.challenge).toBe('nonce-login');
    expect(state.loginPasswordVisible).toBe(true);
    expect(authResponses.length).toBeGreaterThanOrEqual(2);

    const v3 = deriveVaultAuthSecret('new-pass', SALT, 'v3-hkdf');
    const v2 = deriveVaultAuthSecret('new-pass', SALT, 'v2-pbkdf2');
    expect(authResponses[0]).toBe(computeChallengeResponse('nonce-login', v3));
    expect(authResponses[1]).toBe(computeChallengeResponse('nonce-login', v2));
  });

  it('restores the login form when auth never replies (watchdog)', async () => {
    await openAndChallenge(() => null);

    const pending = submitLogin('new-pass');
    await vi.advanceTimersByTimeAsync(80);
    await pending;

    expect(state.authBusy).toBe(true);
    expect(state.loginPasswordVisible).toBe(true);

    await vi.advanceTimersByTimeAsync(WS_REPLY_TIMEOUT_MS);

    expect(state.authBusy).toBe(false);
    expect(state.loginPasswordVisible).toBe(true);
    expect(state.loginError).toMatch(/timed out|agotó/i);
    expect(state.toast?.type).toBe('error');
    expect(state.connLabel).not.toMatch(/Authenticating|Autenticando/i);
  });

  it('clears authBusy and alerts when the master sends a protocol error', async () => {
    await openAndChallenge(() => ({
      type: 'error',
      code: 'RATE_LIMITED',
      error: 'Too many attempts',
    }));

    const pending = submitLogin('new-pass');
    await vi.advanceTimersByTimeAsync(80);
    await pending;
    await vi.advanceTimersByTimeAsync(20);

    expect(state.authBusy).toBe(false);
    expect(state.loginPasswordVisible).toBe(true);
    expect(state.loginError.length).toBeGreaterThan(0);
    expect(state.toast?.type).toBe('error');
  });
});
