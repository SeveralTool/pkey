/**
 * @fileoverview Biometric unlock bundle must never persist the master password.
 */

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true as const })),
}));

import * as LocalAuthentication from 'expo-local-authentication';
import {
  clearUnlockCredentials,
  hasUnlockBundle,
  loadUnlockCredentials,
  persistUnlockCredentials,
  replaceUnlockCredentials,
  retrieveMasterKey,
} from './biometrics';

const UNLOCK_BUNDLE_ID_V2 = 'pkey_unlock_bundle_v2';
const UNLOCK_META_ID = 'pkey_unlock_meta_v1';

beforeEach(() => {
  mockSecureStore.clear();
  jest.mocked(LocalAuthentication.authenticateAsync).mockImplementation(async () => ({
    success: true,
  }));
});

describe('biometrics unlock bundle', () => {
  it('never writes a masterPassword field, even if a legacy arg is passed', async () => {
    await persistUnlockCredentials('root', 'salt', 'hash', 'super-secret-master');

    const raw = mockSecureStore.get(UNLOCK_BUNDLE_ID_V2);
    expect(raw).toBeDefined();
    expect(raw).not.toContain('super-secret-master');
    expect(raw).not.toContain('masterPassword');
    expect(JSON.parse(raw as string)).toEqual({
      rootKeyHex: 'root',
      kdfSalt: 'salt',
      authHash: 'hash',
    });
    expect(mockSecureStore.get(UNLOCK_META_ID)).toContain('"hasBundle":true');
  });

  it('retrieveMasterKey is a permanent no-op', async () => {
    await persistUnlockCredentials('root', 'salt', 'hash');
    await expect(retrieveMasterKey('Unlock')).resolves.toBeNull();
  });

  it('loadUnlockCredentials requires a successful OS prompt', async () => {
    await persistUnlockCredentials('root', 'salt', 'hash');
    jest
      .mocked(LocalAuthentication.authenticateAsync)
      .mockImplementationOnce(async () => ({ success: false, error: 'user_cancel' }));
    await expect(loadUnlockCredentials()).resolves.toBeNull();

    const loaded = await loadUnlockCredentials();
    expect(loaded).toEqual({ rootKeyHex: 'root', kdfSalt: 'salt', authHash: 'hash' });
  });

  it('strips masterPassword if a legacy v1 blob is still on disk', async () => {
    mockSecureStore.set(
      'pkey_unlock_bundle_v1',
      JSON.stringify({
        rootKeyHex: 'legacy-root',
        kdfSalt: 'legacy-salt',
        authHash: 'legacy-hash',
        masterPassword: 'should-not-survive',
      })
    );

    const loaded = await loadUnlockCredentials();
    expect(loaded).toEqual({
      rootKeyHex: 'legacy-root',
      kdfSalt: 'legacy-salt',
      authHash: 'legacy-hash',
    });
    const migrated = JSON.parse(mockSecureStore.get(UNLOCK_BUNDLE_ID_V2) as string);
    expect(migrated.masterPassword).toBeUndefined();
    expect(mockSecureStore.has('pkey_unlock_bundle_v1')).toBe(false);
  });

  it('clearUnlockCredentials removes meta and v2 bundle', async () => {
    await persistUnlockCredentials('root', 'salt', 'hash');
    expect(await hasUnlockBundle()).toBe(true);
    await clearUnlockCredentials();
    expect(await hasUnlockBundle()).toBe(false);
    expect(mockSecureStore.get(UNLOCK_BUNDLE_ID_V2)).toBeUndefined();
  });

  it('replaceUnlockCredentials overwrites the session root without a master password', async () => {
    await persistUnlockCredentials('old-root', 'salt', 'hash');
    await replaceUnlockCredentials('mixed-root', 'salt', 'hash');
    expect(JSON.parse(mockSecureStore.get(UNLOCK_BUNDLE_ID_V2) as string)).toEqual({
      rootKeyHex: 'mixed-root',
      kdfSalt: 'salt',
      authHash: 'hash',
    });
    expect(await hasUnlockBundle()).toBe(true);
  });
});
