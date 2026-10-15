/**
 * @fileoverview Device-secret recovery kit encoding (audit H4).
 */
jest.mock('pkey-vault-keys', () => {
  const api = {
    available: false,
    storeDeviceSecret: jest.fn(async () => undefined),
    loadDeviceSecret: jest.fn(async (): Promise<string | null> => null),
    clearDeviceSecret: jest.fn(async () => undefined),
    hasDeviceSecret: jest.fn(async () => false),
  };
  return {
    __esModule: true,
    default: api,
    isPkeyVaultKeysAvailable: () => api.available,
  };
});

import vaultKeys from 'pkey-vault-keys';
import {
  formatRecoveryKit,
  parseRecoveryKit,
  mixRootWithSecret,
  mixDeviceSecretOrRequire,
  restoreDeviceSecret,
  isUserCanceledAuth,
  isDeviceSecretRequiredError,
  DeviceSecretCanceledError,
  DeviceSecretRequiredError,
} from './deviceSecret';
import { hkdfExpand, HKDF_INFO_DEVICE_BIND } from '@pkey/core';

interface VaultKeysMock {
  available: boolean;
  storeDeviceSecret: jest.Mock;
  loadDeviceSecret: jest.Mock;
  hasDeviceSecret: jest.Mock;
}

const vault = vaultKeys as unknown as VaultKeysMock;

describe('device secret recovery kit', () => {
  const secretHex = '0123456789abcdef0123456789abcdef';

  it('round-trips Crockford encoding', () => {
    const kit = formatRecoveryKit(secretHex);
    expect(parseRecoveryKit(kit)).toBe(secretHex);
  });

  it('rejects the wrong length', () => {
    expect(parseRecoveryKit('ABCD')).toBeNull();
  });

  it('mixes the Argon2 root with the secret via HKDF', () => {
    const root = 'ab'.repeat(32);
    expect(mixRootWithSecret(root, secretHex)).toBe(
      hkdfExpand(root, `${HKDF_INFO_DEVICE_BIND}|${secretHex}`)
    );
    expect(mixRootWithSecret(root, secretHex)).not.toBe(root);
  });
});

describe('mixDeviceSecretOrRequire', () => {
  const root = 'ab'.repeat(32);
  const secretHex = '0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vault.available = false;
    vault.storeDeviceSecret.mockReset();
    vault.storeDeviceSecret.mockResolvedValue(undefined);
    vault.loadDeviceSecret.mockReset();
    vault.loadDeviceSecret.mockResolvedValue(null);
    vault.hasDeviceSecret.mockReset();
    vault.hasDeviceSecret.mockResolvedValue(false);
  });

  it('mixes a typed recovery kit without reading hardware', async () => {
    vault.available = true;
    vault.hasDeviceSecret.mockResolvedValue(true);
    vault.loadDeviceSecret.mockResolvedValue('ff'.repeat(16));
    await expect(mixDeviceSecretOrRequire(root, 'Unlock', secretHex)).resolves.toBe(
      mixRootWithSecret(root, secretHex)
    );
    expect(vault.hasDeviceSecret).not.toHaveBeenCalled();
    expect(vault.loadDeviceSecret).not.toHaveBeenCalled();
  });

  it('asks for the kit when this phone has no local secret', async () => {
    vault.available = true;
    vault.hasDeviceSecret.mockResolvedValue(false);
    await expect(mixDeviceSecretOrRequire(root, 'Unlock')).rejects.toMatchObject({
      name: 'DeviceSecretRequiredError',
      code: 'E_DEVICE_SECRET_REQUIRED',
      reason: 'missing',
    });
    expect(vault.loadDeviceSecret).not.toHaveBeenCalled();
  });

  it('treats a missing hardware module the same as a secret that was never enabled', async () => {
    await expect(mixDeviceSecretOrRequire(root, 'Unlock', '')).rejects.toBeInstanceOf(
      DeviceSecretRequiredError
    );
    await expect(mixDeviceSecretOrRequire(root, 'Unlock')).rejects.toMatchObject({
      reason: 'missing',
    });
  });

  it('rethrows a cancelled biometric prompt and does not ask for the recovery kit', async () => {
    const cancel = new DeviceSecretCanceledError();
    vault.available = true;
    vault.hasDeviceSecret.mockResolvedValue(true);
    vault.loadDeviceSecret.mockRejectedValue(cancel);
    await expect(mixDeviceSecretOrRequire(root, 'Unlock')).rejects.toBe(cancel);
  });

  it('asks for the kit when the local secret is unreadable', async () => {
    vault.available = true;
    vault.hasDeviceSecret.mockResolvedValue(true);
    vault.loadDeviceSecret.mockRejectedValue(new Error('Keystore unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(mixDeviceSecretOrRequire(root, 'Unlock')).rejects.toMatchObject({
        reason: 'unavailable',
      });
    } finally {
      warn.mockRestore();
    }
  });
});

describe('restoreDeviceSecret', () => {
  const secretHex = '0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vault.available = false;
    vault.storeDeviceSecret.mockReset();
    vault.storeDeviceSecret.mockResolvedValue(undefined);
  });

  it('returns false when the hardware module is missing', async () => {
    await expect(restoreDeviceSecret(secretHex, 'Save')).resolves.toBe(false);
    expect(vault.storeDeviceSecret).not.toHaveBeenCalled();
  });

  it('stores the kit secret so the next unlock does not need it', async () => {
    vault.available = true;
    await expect(restoreDeviceSecret(secretHex, 'Save')).resolves.toBe(true);
    expect(vault.storeDeviceSecret).toHaveBeenCalledWith(secretHex, 'Save');
  });

  it('returns false when the user cancels or the store fails, without closing the vault', async () => {
    vault.available = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      vault.storeDeviceSecret.mockRejectedValueOnce(new DeviceSecretCanceledError());
      await expect(restoreDeviceSecret(secretHex, 'Save')).resolves.toBe(false);
      expect(warn).not.toHaveBeenCalled();

      vault.storeDeviceSecret.mockRejectedValueOnce(new Error('store failed'));
      await expect(restoreDeviceSecret(secretHex, 'Save')).resolves.toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('isDeviceSecretRequiredError', () => {
  it('recognizes the class and cross-realm copies, not unrelated failures', () => {
    expect(isDeviceSecretRequiredError(new DeviceSecretRequiredError('missing'))).toBe(true);
    expect(isDeviceSecretRequiredError({ code: 'E_DEVICE_SECRET_REQUIRED' })).toBe(true);
    expect(isDeviceSecretRequiredError({ name: 'DeviceSecretRequiredError' })).toBe(true);
    expect(isDeviceSecretRequiredError(new Error('device secret missing'))).toBe(false);
    expect(isDeviceSecretRequiredError(new DeviceSecretCanceledError())).toBe(false);
    expect(isDeviceSecretRequiredError(null)).toBe(false);
  });
});

describe('isUserCanceledAuth', () => {
  it('treats native cancel codes and fingerprint dismissals as cancel', () => {
    expect(isUserCanceledAuth(new DeviceSecretCanceledError())).toBe(true);
    expect(isUserCanceledAuth({ code: 'E_USER_CANCELED', message: 'x' })).toBe(true);
    expect(isUserCanceledAuth(new Error('Fingerprint operation canceled by user'))).toBe(true);
    expect(isUserCanceledAuth('Error: Fingerprint operation canceled by user')).toBe(true);
    expect(isUserCanceledAuth(new Error('Keystore unavailable'))).toBe(false);
    expect(isUserCanceledAuth(null)).toBe(false);
  });
});
