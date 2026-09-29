/**
 * Installs a native PBKDF2 implementation (react-native-quick-crypto, C++/OpenSSL)
 * into @pkey/core, replacing the pure-JS crypto-es derivation that takes several
 * seconds per 100k-iteration run on Hermes.
 *
 * The provider is only installed after passing a known-answer self-test, so a
 * broken or byte-incompatible native module can never corrupt key derivation.
 * When the native module is unavailable (web, Jest, or a dev client built
 * before this dependency was added) the app silently keeps the JS fallback.
 */
import { setPbkdf2Provider } from '@pkey/core';

// PBKDF2-HMAC-SHA256, P="password", S="salt", c=1, dkLen=32 (known-answer vector).
const SELF_TEST = {
  password: 'password',
  salt: 'salt',
  iterations: 1,
  keyLengthBytes: 32,
  expectedHex: '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
};

export function installNativePbkdf2(): boolean {
  let pbkdf2Sync: (
    password: string,
    salt: string,
    iterations: number,
    keylen: number,
    digest: string
  ) => { toString(encoding: string): string };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ pbkdf2Sync } = require('react-native-quick-crypto'));
  } catch {
    console.info('[nativePbkdf2] native module unavailable, keeping JS PBKDF2');
    return false;
  }

  try {
    const probe = pbkdf2Sync(
      SELF_TEST.password,
      SELF_TEST.salt,
      SELF_TEST.iterations,
      SELF_TEST.keyLengthBytes,
      'sha256'
    ).toString('hex');

    if (probe !== SELF_TEST.expectedHex) {
      console.warn('[nativePbkdf2] self-test mismatch, keeping JS PBKDF2');
      return false;
    }
  } catch (e) {
    console.warn('[nativePbkdf2] self-test failed, keeping JS PBKDF2:', e);
    return false;
  }

  setPbkdf2Provider((password, salt, iterations, keyLengthBytes) =>
    pbkdf2Sync(password, salt, iterations, keyLengthBytes, 'sha256').toString('hex')
  );
  return true;
}

installNativePbkdf2();
