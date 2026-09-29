/**
 * Independent KDF vs AEAD probes: AEAD failure must not close Argon2.
 */

import pkeyCrypto from 'pkey-crypto';
import {
  ARGON2ID_PROD_PROBE,
  HKDF_AUTH_KAT,
  XCHACHA_KAT_CIPHERTEXT,
  XCHACHA_KAT_PLAINTEXT,
} from '@pkey/core';
import { probeNativeAead, probeNativeCapabilities, probeNativeKdf } from './nativeCryptoProbe';

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
};

describe('nativeCryptoProbe', () => {
  beforeEach(() => {
    mockCrypto.available = true;
    mockCrypto.deriveRootKey.mockReset();
    mockCrypto.importKey.mockReset();
    mockCrypto.exportKey.mockReset();
    mockCrypto.hkdfExpand.mockReset();
    mockCrypto.encryptVault.mockReset();
    mockCrypto.decryptVault.mockReset();
    mockCrypto.dropKey.mockReset().mockResolvedValue(undefined);
    mockCrypto.selfTestKdfKat.mockReset();
    mockCrypto.selfTestAeadKat.mockReset();
  });

  afterEach(() => {
    mockCrypto.available = false;
  });

  it('keeps KDF when native AEAD KAT returns false', async () => {
    mockCrypto.selfTestKdfKat.mockResolvedValue(true);
    mockCrypto.selfTestAeadKat.mockResolvedValue(false);
    await expect(probeNativeCapabilities({ kdf: true, aead: true })).resolves.toEqual({
      kdf: true,
      aead: false,
    });
    expect(mockCrypto.deriveRootKey).not.toHaveBeenCalled();
    expect(mockCrypto.decryptVault).not.toHaveBeenCalled();
  });

  it('skips AEAD API when caps.aead is false (iOS)', async () => {
    mockCrypto.selfTestKdfKat.mockResolvedValue(true);
    mockCrypto.selfTestAeadKat.mockResolvedValue(false);
    await expect(probeNativeAead({ kdf: true, aead: false })).resolves.toBe(false);
    expect(mockCrypto.decryptVault).not.toHaveBeenCalled();
    expect(mockCrypto.encryptVault).not.toHaveBeenCalled();
  });

  it('enables AEAD only when decryptVault opens the noble vector', async () => {
    mockCrypto.selfTestAeadKat.mockResolvedValue(true);
    mockCrypto.importKey.mockResolvedValue('h');
    mockCrypto.decryptVault.mockImplementation(async (_h: string, packed: string) => {
      if (packed.includes(XCHACHA_KAT_CIPHERTEXT)) return XCHACHA_KAT_PLAINTEXT;
      return XCHACHA_KAT_PLAINTEXT;
    });
    mockCrypto.encryptVault.mockResolvedValue(
      JSON.stringify({ nonce: '11'.repeat(24), ciphertext: '22'.repeat(21) })
    );
    await expect(probeNativeAead({ kdf: true, aead: true })).resolves.toBe(true);
  });

  it('refuses AEAD when native roundtrip works but noble vector does not open', async () => {
    mockCrypto.selfTestAeadKat.mockResolvedValue(true);
    mockCrypto.importKey.mockResolvedValue('h');
    mockCrypto.decryptVault.mockImplementation(async (_h: string, packed: string) => {
      if (packed.includes(XCHACHA_KAT_CIPHERTEXT)) return null;
      return XCHACHA_KAT_PLAINTEXT;
    });
    mockCrypto.encryptVault.mockResolvedValue(
      JSON.stringify({ nonce: '11'.repeat(24), ciphertext: '22'.repeat(21) })
    );
    await expect(probeNativeAead({ kdf: true, aead: true })).resolves.toBe(false);
  });

  it('falls back to derive+export KAT when selfTestKdfKat is missing', async () => {
    mockCrypto.selfTestKdfKat.mockResolvedValue(undefined);
    mockCrypto.deriveRootKey.mockResolvedValue('dh');
    mockCrypto.exportKey.mockResolvedValue(ARGON2ID_PROD_PROBE);
    mockCrypto.importKey.mockResolvedValue('hh');
    mockCrypto.hkdfExpand.mockResolvedValue(HKDF_AUTH_KAT);
    await expect(probeNativeKdf({ kdf: true, aead: true })).resolves.toBe(true);
    expect(mockCrypto.deriveRootKey).toHaveBeenCalledTimes(1);
  });

  it('does not treat a thrown selfTestAeadKat as KDF death', async () => {
    mockCrypto.selfTestKdfKat.mockResolvedValue(true);
    mockCrypto.selfTestAeadKat.mockRejectedValue(
      new Error('ChaCha20 requires exactly 8 bytes of IV')
    );
    await expect(probeNativeCapabilities({ kdf: true, aead: true })).resolves.toEqual({
      kdf: true,
      aead: false,
    });
  });
});
