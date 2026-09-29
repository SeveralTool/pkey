/**
 * @fileoverview Device-secret recovery kit encoding (audit H4).
 */
import { formatRecoveryKit, parseRecoveryKit, mixRootWithSecret, isUserCanceledAuth, DeviceSecretCanceledError } from './deviceSecret';
import { hkdfExpand, HKDF_INFO_DEVICE_BIND } from '@pkey/core';

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
