/**
 * @fileoverview Password unlock derives Argon2id at most once; production never
 * retries native failure with JS 64 MiB.
 */

import pkeyCrypto from 'pkey-crypto';
import { XCHACHA_KAT_AAD } from '@pkey/core';
import { LocalCipher } from './crypto';
import * as kdfPolicy from './nativeKdfPolicy';
import { getKdfDeriveCount, resetKdfMetricsForTests, getKdfMetrics } from './kdfMetrics';
import {
  decryptVaultPayload,
  establishSessionFromPassword,
  resetNativeVaultProbeForTests,
  NativeKdfUnavailableError,
} from './nativeVault';
import { isNativeAeadReady, isNativeKdfReady } from './nativeCryptoReady';
import { clearSessionRootKey, hasSessionKeyMaterial } from './sessionKey';

const mockCrypto = pkeyCrypto as typeof pkeyCrypto & {
  available: boolean;
  deriveRootKey: jest.Mock;
  importKey: jest.Mock;
  exportKey: jest.Mock;
  hkdfExpand: jest.Mock;
  encryptVault: jest.Mock;
  decryptVault: jest.Mock;
  dropKey: jest.Mock;
  selfTestKdfKat: jest.Mock;
  selfTestAeadKat: jest.Mock;
  selfTestKat: jest.Mock;
  hotPathCaps: jest.Mock;
};

const PASSWORD = 'test-password-parity';
const SALT = 'aabbccddeeff00112233445566778899';

function mockNativeKat(opts?: { kdf?: boolean; aead?: boolean }): void {
  const kdf = opts?.kdf !== false;
  const aead = opts?.aead !== false;
  mockCrypto.available = true;
  mockCrypto.selfTestKdfKat.mockResolvedValue(kdf);
  mockCrypto.selfTestAeadKat.mockResolvedValue(aead);
  mockCrypto.hotPathCaps.mockResolvedValue({ kdf, aead });
  mockCrypto.importKey.mockResolvedValue('kat-handle');
  mockCrypto.encryptVault.mockResolvedValue(
    JSON.stringify({ nonce: '00'.repeat(24), ciphertext: 'aa'.repeat(21) })
  );
  mockCrypto.decryptVault.mockImplementation(
    async (_handle: string, _envelopeJson: string, aad: string) => {
      if (aad === XCHACHA_KAT_AAD) {
        return aead ? 'hello' : null;
      }
      return null;
    }
  );
}

describe('nativeVault password KDF', () => {
  beforeEach(() => {
    mockCrypto.available = false;
    mockCrypto.deriveRootKey.mockReset();
    mockCrypto.importKey.mockReset();
    mockCrypto.exportKey.mockReset();
    mockCrypto.hkdfExpand.mockReset();
    mockCrypto.encryptVault.mockReset();
    mockCrypto.decryptVault.mockReset();
    mockCrypto.dropKey.mockReset().mockResolvedValue(undefined);
    mockCrypto.selfTestKdfKat.mockReset();
    mockCrypto.selfTestAeadKat.mockReset();
    mockCrypto.selfTestKat.mockReset().mockResolvedValue(true);
    mockCrypto.hotPathCaps.mockReset().mockResolvedValue({ kdf: true, aead: true });
    resetNativeVaultProbeForTests();
    resetKdfMetricsForTests();
    clearSessionRootKey();
  });

  afterEach(() => {
    mockCrypto.available = false;
    jest.restoreAllMocks();
    clearSessionRootKey();
    resetNativeVaultProbeForTests();
  });

  it('JS fallback (tests): one Argon2id on successful v4 unlock', async () => {
    const plaintext = JSON.stringify({ ok: true, salt: SALT });
    const env = LocalCipher.encrypt(plaintext, PASSWORD, SALT);
    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');

    await expect(decryptVaultPayload(PASSWORD, env)).resolves.toBe(plaintext);
    expect(getKdfDeriveCount()).toBe(1);
    expect(getKdfMetrics().some((e) => e.source === 'js' && e.op === 'unlock')).toBe(true);
    expect(mockCrypto.deriveRootKey).not.toHaveBeenCalled();
    expect(hasSessionKeyMaterial()).toBe(true);
    deriveSpy.mockRestore();
  });

  it('JS fallback: one Argon2id on wrong password, no native derive', async () => {
    const env = LocalCipher.encrypt('plain', PASSWORD, SALT);
    await expect(decryptVaultPayload('wrong-password', env)).resolves.toBe('');
    expect(getKdfDeriveCount()).toBe(1);
    expect(mockCrypto.deriveRootKey).not.toHaveBeenCalled();
  });

  it('native v4 success: one deriveRootKey and zero LocalCipher.deriveRootKey', async () => {
    const plaintext = JSON.stringify({ ok: true, salt: SALT });
    const env = LocalCipher.encrypt(plaintext, PASSWORD, SALT);
    mockNativeKat();
    mockCrypto.deriveRootKey.mockResolvedValue('handle-1');
    mockCrypto.decryptVault.mockImplementation(
      async (_handle: string, _envelopeJson: string, aad: string) => {
        if (aad === XCHACHA_KAT_AAD) return 'hello';
        return plaintext;
      }
    );
    mockCrypto.exportKey.mockResolvedValue('aa'.repeat(32));
    mockCrypto.hkdfExpand.mockResolvedValue('bb'.repeat(32));

    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    await expect(decryptVaultPayload(PASSWORD, env)).resolves.toBe(plaintext);
    expect(mockCrypto.deriveRootKey).toHaveBeenCalledTimes(1);
    expect(deriveSpy).not.toHaveBeenCalled();
    expect(getKdfDeriveCount()).toBe(1);
    expect(getKdfMetrics().filter((e) => e.source === 'js' && e.op === 'unlock')).toHaveLength(0);
    expect(isNativeKdfReady()).toBe(true);
    expect(isNativeAeadReady()).toBe(true);
    deriveSpy.mockRestore();
  });

  it('native KDF with JS AEAD: AEAD KAT fail does not disable Argon2', async () => {
    const plaintext = JSON.stringify({ ok: true, salt: SALT });
    const env = LocalCipher.encrypt(plaintext, PASSWORD, SALT);
    const root = LocalCipher.deriveRootKey(PASSWORD, SALT);
    mockNativeKat({ kdf: true, aead: false });
    mockCrypto.deriveRootKey.mockResolvedValue('handle-js-aead');
    mockCrypto.exportKey.mockResolvedValue(root);
    mockCrypto.hkdfExpand.mockResolvedValue('bb'.repeat(32));

    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    await expect(decryptVaultPayload(PASSWORD, env)).resolves.toBe(plaintext);
    expect(mockCrypto.deriveRootKey).toHaveBeenCalledTimes(1);
    expect(deriveSpy).not.toHaveBeenCalled();
    expect(isNativeKdfReady()).toBe(true);
    expect(isNativeAeadReady()).toBe(false);
    deriveSpy.mockRestore();
  });

  it('native v4 wrong password: one derive, empty payload, no JS Argon2 retry, AEAD gate stays', async () => {
    const env = LocalCipher.encrypt('plain', PASSWORD, SALT);
    mockNativeKat();
    mockCrypto.deriveRootKey.mockResolvedValue('handle-bad');
    mockCrypto.decryptVault.mockImplementation(
      async (_handle: string, _envelopeJson: string, aad: string) => {
        if (aad === XCHACHA_KAT_AAD) return 'hello';
        return null;
      }
    );
    mockCrypto.exportKey.mockResolvedValue('00'.repeat(32));
    mockCrypto.dropKey.mockResolvedValue(undefined);

    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    await expect(decryptVaultPayload('wrong-password', env)).resolves.toBe('');
    expect(mockCrypto.deriveRootKey).toHaveBeenCalledTimes(1);
    expect(deriveSpy).not.toHaveBeenCalled();
    expect(getKdfDeriveCount()).toBe(1);
    expect(isNativeAeadReady()).toBe(true);
    deriveSpy.mockRestore();
  });

  it('production: native KDF down throws NativeKdfUnavailableError (no JS 64 MiB)', async () => {
    mockCrypto.available = false;
    jest.spyOn(kdfPolicy, 'isJsArgon2FallbackAllowed').mockReturnValue(false);
    const env = LocalCipher.encrypt('plain', PASSWORD, SALT);
    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    await expect(decryptVaultPayload(PASSWORD, env)).rejects.toBeInstanceOf(
      NativeKdfUnavailableError
    );
    expect(deriveSpy).not.toHaveBeenCalled();
    expect(mockCrypto.deriveRootKey).not.toHaveBeenCalled();
    deriveSpy.mockRestore();
  });

  it('establishSessionFromPassword native path derives once', async () => {
    mockNativeKat();
    mockCrypto.deriveRootKey.mockResolvedValue('handle-c');
    mockCrypto.exportKey.mockResolvedValue('cc'.repeat(32));
    mockCrypto.hkdfExpand.mockResolvedValue('dd'.repeat(32));
    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    const out = await establishSessionFromPassword(PASSWORD, SALT);
    expect(out.rootKeyHex).toBe('cc'.repeat(32));
    expect(out.authVerifier).toBe('dd'.repeat(32));
    expect(mockCrypto.deriveRootKey).toHaveBeenCalledTimes(1);
    expect(deriveSpy).not.toHaveBeenCalled();
    deriveSpy.mockRestore();
  });
});
