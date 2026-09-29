/**
 * @fileoverview Polyfill `crypto.getRandomValues` from expo-crypto for @pkey/core on native.
 *
 * React Native does not expose Web Crypto getRandomValues; shared core utilities need it.
 * Fail-fast at startup if no CSPRNG is available — every key, salt and nonce depends on it.
 */
import * as ExpoCrypto from 'expo-crypto';

function installGetRandomValues(): void {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    return;
  }

  const getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const bytes = ExpoCrypto.getRandomBytes(array.byteLength);
    const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    view.set(bytes);
    return array;
  };

  if (globalThis.crypto) {
    (globalThis.crypto as Crypto).getRandomValues = getRandomValues;
  } else {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues },
      configurable: true,
      writable: true,
    });
  }
}

installGetRandomValues();

// Fail fast at startup if no CSPRNG ended up available: every key, salt and
// nonce in the app depends on it, so continuing would be unsafe.
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  throw new Error('[cryptoPolyfill] CSPRNG unavailable: crypto.getRandomValues missing');
}
