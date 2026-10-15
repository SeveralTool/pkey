/**
 * @fileoverview With `pkey-vault-keys` present, the unlock bundle must stay in hardware —
 * including after the device-secret toggle rewrites it.
 */

const mockSecureStore = new Map<string, string>();
const nativeBundle: { value: string | null } = { value: null };
const mockStoreUnlockBundle = jest.fn(async (json: string) => {
  nativeBundle.value = json;
});
const mockClearUnlockBundle = jest.fn(async () => {
  nativeBundle.value = null;
});

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

jest.mock('pkey-vault-keys', () => ({
  __esModule: true,
  isPkeyVaultKeysAvailable: () => true,
  default: {
    storeUnlockBundle: (...args: unknown[]) => mockStoreUnlockBundle(...(args as [string])),
    loadUnlockBundle: jest.fn(async () => nativeBundle.value),
    clearUnlockBundle: () => mockClearUnlockBundle(),
    hasUnlockBundle: jest.fn(async () => nativeBundle.value != null),
    detectCompromisedDevice: jest.fn(async () => ({ compromised: false, signals: [] })),
    storeDeviceSecret: jest.fn(),
    loadDeviceSecret: jest.fn(),
    clearDeviceSecret: jest.fn(),
    hasDeviceSecret: jest.fn(async () => false),
  },
}));

import * as LocalAuthentication from 'expo-local-authentication';
import vaultKeys from 'pkey-vault-keys';
import {
  hasUnlockBundle,
  loadUnlockCredentials,
  persistUnlockCredentials,
  replaceUnlockCredentials,
} from './biometrics';

const UNLOCK_BUNDLE_ID_V2 = 'pkey_unlock_bundle_v2';
const UNLOCK_META_ID = 'pkey_unlock_meta_v1';

beforeEach(() => {
  mockSecureStore.clear();
  nativeBundle.value = null;
  mockStoreUnlockBundle.mockClear();
  mockClearUnlockBundle.mockClear();
  jest.mocked(LocalAuthentication.authenticateAsync).mockClear();
  mockStoreUnlockBundle.mockImplementation(async (json: string) => {
    nativeBundle.value = json;
  });
});

describe('biometrics with pkey-vault-keys', () => {
  it('persists to hardware and removes any SecureStore copy', async () => {
    mockSecureStore.set(UNLOCK_BUNDLE_ID_V2, 'stale');
    await expect(persistUnlockCredentials('root', 'salt', 'hash')).resolves.toBe(true);
    expect(JSON.parse(nativeBundle.value as string)).toEqual({
      rootKeyHex: 'root',
      kdfSalt: 'salt',
      authHash: 'hash',
    });
    expect(mockSecureStore.has(UNLOCK_BUNDLE_ID_V2)).toBe(false);
    expect(mockSecureStore.get(UNLOCK_META_ID)).toContain('"hasBundle":true');
  });

  it('replaceUnlockCredentials keeps the new root in hardware, not SecureStore', async () => {
    await persistUnlockCredentials('old-root', 'salt', 'hash');
    await replaceUnlockCredentials('mixed-root', 'salt', 'hash');
    expect(mockClearUnlockBundle).toHaveBeenCalled();
    expect(JSON.parse(nativeBundle.value as string).rootKeyHex).toBe('mixed-root');
    expect(mockSecureStore.has(UNLOCK_BUNDLE_ID_V2)).toBe(false);
    await expect(loadUnlockCredentials()).resolves.toEqual({
      rootKeyHex: 'mixed-root',
      kdfSalt: 'salt',
      authHash: 'hash',
    });
  });

  it('leaves no bundle and no meta marker when the user cancels the hardware prompt', async () => {
    await persistUnlockCredentials('old-root', 'salt', 'hash');
    mockStoreUnlockBundle.mockImplementationOnce(async () => {
      const err = new Error('canceled') as Error & { code: string };
      err.code = 'E_USER_CANCELED';
      throw err;
    });
    await replaceUnlockCredentials('mixed-root', 'salt', 'hash');
    expect(nativeBundle.value).toBeNull();
    expect(mockSecureStore.has(UNLOCK_BUNDLE_ID_V2)).toBe(false);
    await expect(hasUnlockBundle()).resolves.toBe(false);
  });

  it('does not store a bundle when the device is compromised', async () => {
    const detect = vaultKeys?.detectCompromisedDevice as jest.Mock;
    nativeBundle.value = JSON.stringify({
      rootKeyHex: 'old',
      kdfSalt: 'salt',
      authHash: 'hash',
    });
    detect.mockResolvedValueOnce({ compromised: true, signals: ['root'] });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(persistUnlockCredentials('root', 'salt', 'hash')).resolves.toBe(false);
      expect(mockStoreUnlockBundle).not.toHaveBeenCalled();
      expect(JSON.parse(nativeBundle.value as string).rootKeyHex).toBe('old');
      expect(mockSecureStore.has(UNLOCK_BUNDLE_ID_V2)).toBe(false);
      expect(mockSecureStore.has(UNLOCK_META_ID)).toBe(false);
    } finally {
      warn.mockRestore();
      detect.mockResolvedValue({ compromised: false, signals: [] });
    }
  });

  it('replaceUnlockCredentials on a compromised device leaves no SecureStore copy', async () => {
    const detect = vaultKeys?.detectCompromisedDevice as jest.Mock;
    await persistUnlockCredentials('old-root', 'salt', 'hash');
    detect.mockResolvedValue({ compromised: true, signals: ['root'] });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await replaceUnlockCredentials('mixed-root', 'salt', 'hash');
      expect(nativeBundle.value).toBeNull();
      expect(mockSecureStore.has(UNLOCK_BUNDLE_ID_V2)).toBe(false);
      expect(mockSecureStore.has(UNLOCK_META_ID)).toBe(false);
    } finally {
      warn.mockRestore();
      detect.mockResolvedValue({ compromised: false, signals: [] });
    }
  });

  it('does not fall through to SecureStore when the user cancels the hardware prompt', async () => {
    const load = vaultKeys?.loadUnlockBundle as jest.Mock;
    load.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'E_USER_CANCELED' }));
    mockSecureStore.set(
      UNLOCK_BUNDLE_ID_V2,
      JSON.stringify({ rootKeyHex: 'stale', kdfSalt: 'salt', authHash: 'hash' })
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(loadUnlockCredentials()).resolves.toBeNull();
      expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to SecureStore when the hardware read fails for another reason', async () => {
    const load = vaultKeys?.loadUnlockBundle as jest.Mock;
    load.mockRejectedValueOnce(new Error('E_LOAD keystore unavailable'));
    mockSecureStore.set(
      UNLOCK_BUNDLE_ID_V2,
      JSON.stringify({ rootKeyHex: 'stored', kdfSalt: 'salt', authHash: 'hash' })
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(loadUnlockCredentials()).resolves.toEqual({
        rootKeyHex: 'stored',
        kdfSalt: 'salt',
        authHash: 'hash',
      });
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to SecureStore only when the hardware write fails for another reason', async () => {
    mockStoreUnlockBundle.mockImplementationOnce(async () => {
      throw new Error('E_STORE keystore unavailable');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(persistUnlockCredentials('root', 'salt', 'hash')).resolves.toBe(true);
    warn.mockRestore();
    expect(nativeBundle.value).toBeNull();
    expect(JSON.parse(mockSecureStore.get(UNLOCK_BUNDLE_ID_V2) as string).rootKeyHex).toBe('root');
  });
});
