/**
 * Gates for native Argon2id (KDF) vs native XChaCha20-Poly1305 (AEAD).
 * Kept in its own module so `sessionKey` can read them without vault I/O.
 *
 * Android after KAT: both true. iOS after KAT: KDF true, AEAD false (JS AEAD).
 */

let nativeKdfReady = false;
let nativeAeadReady = false;

/** True after native Argon2id + HKDF known-answer tests succeed. */
export function isNativeKdfReady(): boolean {
  return nativeKdfReady;
}

/** True after native XChaCha20-Poly1305 known-answer tests succeed. */
export function isNativeAeadReady(): boolean {
  return nativeAeadReady;
}

/** Both KDF and AEAD native (legacy Android-only meaning). */
export function isNativeVaultCryptoReady(): boolean {
  return nativeKdfReady && nativeAeadReady;
}

export function setNativeKdfReady(ready: boolean): void {
  nativeKdfReady = ready;
}

export function setNativeAeadReady(ready: boolean): void {
  nativeAeadReady = ready;
}

/** Records both gates. Test-only callers may reset via {@link resetNativeCryptoReadyForTests}. */
export function setNativeVaultCryptoReady(ready: boolean): void {
  nativeKdfReady = ready;
  nativeAeadReady = ready;
}

/** Test-only: clear KAT gates so the next probe is not sticky. */
export function resetNativeCryptoReadyForTests(): void {
  nativeKdfReady = false;
  nativeAeadReady = false;
}
