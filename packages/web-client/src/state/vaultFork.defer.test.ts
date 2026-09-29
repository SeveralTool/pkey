// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptControlWire,
  wrapControlInner,
  VAULT_FORK_DECISION_TYPE,
  type PasswordCard,
} from '@pkey/core';
import {
  __handleMessageForTests,
  __setStateForTests,
  __setVaultForkForTests,
  __isVaultForkBlockingPersistForTests,
  requestSync,
  wipeSession,
  state,
} from './appStore';
import { loadVaultForkDefer, clearVaultForkDefer } from './vaultForkDefer';

const HASH = 'ab'.repeat(32);
const TOKEN = 'session-token-fork-defer';
const OLD_SALT = 'old-vault-salt';
const NEW_SALT = 'new-phone-salt';

const card = (id: string): PasswordCard =>
  ({
    id,
    type: 'PASSWORD',
    title: id,
    icon: { type: 'icon', value: 'globe' },
    username: '',
    passwordList: [],
    link: '',
    notes: '',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-01-01T00:00:00.000Z',
    tags: [],
    _hasSecret: true,
  }) as PasswordCard;

describe('PWA vault-fork defer', () => {
  beforeEach(() => {
    clearVaultForkDefer();
    __setStateForTests({
      connState: 'offline',
      wasAuthenticated: true,
      authenticated: false,
      passwordHash: HASH,
      wsToken: TOKEN,
      salt: NEW_SALT,
      cards: [card('pwa-1')],
      vaultForkPending: false,
      syncStatus: 'idle',
    });
  });

  afterEach(async () => {
    await wipeSession({ skipPersist: true });
    __setVaultForkForTests({ deferred: null, pending: null, pinnedSalt: '' });
    clearVaultForkDefer();
  });

  it('re-raises the chooser on auth_ok when pinned salt was overwritten to the phone salt', () => {
    __setVaultForkForTests({
      pinnedSalt: NEW_SALT,
      salt: NEW_SALT,
      deferred: { previousSalt: OLD_SALT, phoneSalt: NEW_SALT },
    });
    __handleMessageForTests({ type: 'auth_ok', token: TOKEN });
    expect(state.vaultForkPending).toBe(true);
    expect(state.syncStatus).not.toBe('syncing');
    expect(__isVaultForkBlockingPersistForTests()).toBe(true);
  });

  it('persists a defer record and skips IndexedDB writes', () => {
    __setVaultForkForTests({
      pinnedSalt: OLD_SALT,
      salt: NEW_SALT,
      pending: { previousSalt: OLD_SALT },
    });
    __setStateForTests({
      authenticated: true,
      connState: 'authenticated',
      passwordHash: HASH,
      wsToken: TOKEN,
      salt: NEW_SALT,
      vaultForkPending: true,
    });
    const wire = encryptControlWire(
      VAULT_FORK_DECISION_TYPE,
      wrapControlInner(TOKEN, { action: 'defer' }),
      HASH
    );
    __handleMessageForTests({ ...wire });
    expect(loadVaultForkDefer()).toEqual({ previousSalt: OLD_SALT, phoneSalt: NEW_SALT });
    expect(state.connState).toBe('offline');
    expect(state.vaultForkPending).toBe(false);
    expect(__isVaultForkBlockingPersistForTests()).toBe(true);
  });

  it('does not pull when the user taps Sync after deferring', () => {
    __setVaultForkForTests({
      pinnedSalt: OLD_SALT,
      deferred: { previousSalt: OLD_SALT, phoneSalt: NEW_SALT },
    });
    __setStateForTests({
      authenticated: true,
      connState: 'authenticated',
      syncStatus: 'idle',
    });
    requestSync();
    expect(state.syncStatus).not.toBe('syncing');
  });
});
