/**
 * Independent native KDF vs AEAD probes.
 *
 * Android XChaCha must match noble; a failing AEAD KAT must not close Argon2.
 * AEAD is enabled only when `decryptVault` opens the noble companion vector
 * (interop), not when native seal/open is merely self-consistent.
 */
import pkeyCrypto, { isPkeyCryptoAvailable } from 'pkey-crypto';
import {
  ARGON2ID_PROD_PROBE,
  ARGON2ID_PROD_PROBE_PASSWORD,
  ARGON2ID_PROD_PROBE_SALT_HEX,
  constantTimeEquals,
  HKDF_AUTH_KAT,
  HKDF_AUTH_KAT_PRK_HEX,
  HKDF_INFO_AUTH_VERIFY,
  XCHACHA_KAT_AAD,
  XCHACHA_KAT_CIPHERTEXT,
  XCHACHA_KAT_KEY,
  XCHACHA_KAT_NONCE,
  XCHACHA_KAT_PLAINTEXT,
} from '@pkey/core';

export type NativeCaps = Readonly<{ kdf: boolean; aead: boolean }>;
export type NativeProbeResult = Readonly<{ kdf: boolean; aead: boolean }>;

type NativeBoolMethod = 'selfTestKdfKat' | 'selfTestAeadKat';

async function dropQuietly(handle: string | null): Promise<void> {
  if (!handle || !pkeyCrypto) return;
  try {
    await pkeyCrypto.dropKey(handle);
  } catch {
    /* already dropped */
  }
}

function hasKdfApi(): boolean {
  return Boolean(
    pkeyCrypto &&
    typeof pkeyCrypto.deriveRootKey === 'function' &&
    typeof pkeyCrypto.exportKey === 'function' &&
    typeof pkeyCrypto.importKey === 'function' &&
    typeof pkeyCrypto.hkdfExpand === 'function' &&
    typeof pkeyCrypto.dropKey === 'function'
  );
}

function hasAeadApi(): boolean {
  return Boolean(
    pkeyCrypto &&
    typeof pkeyCrypto.encryptVault === 'function' &&
    typeof pkeyCrypto.decryptVault === 'function'
  );
}

async function callNativeBool(method: NativeBoolMethod): Promise<boolean | 'missing'> {
  if (!pkeyCrypto) return 'missing';
  const fn = pkeyCrypto[method];
  if (typeof fn !== 'function') return 'missing';
  try {
    const value = await fn();
    if (value === true) return true;
    if (value === false) return false;
    return 'missing';
  } catch (err) {
    console.warn(`[nativeCrypto] ${method} threw:`, err);
    return false;
  }
}

/**
 * Byte-identical Argon2id + HKDF against `@pkey/core` (m=32, not 64 MiB).
 * Used when `selfTestKdfKat` is absent on the binary.
 */
export async function probeNativeKdfViaDerive(): Promise<boolean> {
  if (!isPkeyCryptoAvailable() || !hasKdfApi() || !pkeyCrypto) return false;
  let deriveHandle: string | null = null;
  let hkdfHandle: string | null = null;
  try {
    deriveHandle = await pkeyCrypto.deriveRootKey(
      ARGON2ID_PROD_PROBE_PASSWORD,
      ARGON2ID_PROD_PROBE_SALT_HEX,
      32,
      3,
      1
    );
    const rootHex = await pkeyCrypto.exportKey(deriveHandle);
    await dropQuietly(deriveHandle);
    deriveHandle = null;
    if (!constantTimeEquals(rootHex.toLowerCase(), ARGON2ID_PROD_PROBE)) {
      return false;
    }
    hkdfHandle = await pkeyCrypto.importKey(HKDF_AUTH_KAT_PRK_HEX);
    const hkdfHex = await pkeyCrypto.hkdfExpand(hkdfHandle, HKDF_INFO_AUTH_VERIFY);
    await dropQuietly(hkdfHandle);
    hkdfHandle = null;
    return constantTimeEquals(hkdfHex.toLowerCase(), HKDF_AUTH_KAT);
  } catch (err) {
    console.warn('[nativeCrypto] KDF derive probe failed:', err);
    return false;
  } finally {
    await dropQuietly(deriveHandle);
    await dropQuietly(hkdfHandle);
  }
}

/**
 * Opens the noble XChaCha vector through `decryptVault` (the Expo JSON API).
 * A native-only roundtrip is not enough: that can pass with a wrong HChaCha.
 */
export async function probeNativeAeadInterop(): Promise<boolean> {
  if (!isPkeyCryptoAvailable() || !hasAeadApi() || !pkeyCrypto) return false;
  let handle: string | null = null;
  try {
    handle = await pkeyCrypto.importKey(XCHACHA_KAT_KEY);
    const packed = JSON.stringify({
      nonce: XCHACHA_KAT_NONCE,
      ciphertext: XCHACHA_KAT_CIPHERTEXT,
    });
    const opened = await pkeyCrypto.decryptVault(handle, packed, XCHACHA_KAT_AAD);
    if (opened !== XCHACHA_KAT_PLAINTEXT) {
      console.warn('[nativeCrypto] native AEAD is not byte-identical to noble; JS AEAD stays on');
      return false;
    }
    const rtPacked = await pkeyCrypto.encryptVault(handle, XCHACHA_KAT_PLAINTEXT, XCHACHA_KAT_AAD);
    const rtOpened = await pkeyCrypto.decryptVault(handle, rtPacked, XCHACHA_KAT_AAD);
    await dropQuietly(handle);
    handle = null;
    return rtOpened === XCHACHA_KAT_PLAINTEXT;
  } catch (err) {
    console.warn('[nativeCrypto] native AEAD API failed; vault wrap stays in JS', err);
    return false;
  } finally {
    await dropQuietly(handle);
  }
}

export async function probeNativeKdf(caps: NativeCaps | null): Promise<boolean> {
  if (caps?.kdf === false) return false;
  const native = await callNativeBool('selfTestKdfKat');
  if (native === true) return true;
  if (native === false) return false;
  return probeNativeKdfViaDerive();
}

export async function probeNativeAead(caps: NativeCaps | null): Promise<boolean> {
  if (caps?.aead === false) return false;
  const native = await callNativeBool('selfTestAeadKat');
  if (native === false) return false;
  return probeNativeAeadInterop();
}

/** Probes KDF and AEAD independently. KDF success does not require AEAD. */
export async function probeNativeCapabilities(caps: NativeCaps | null): Promise<NativeProbeResult> {
  const kdf = await probeNativeKdf(caps);
  const aead = await probeNativeAead(caps);
  return { kdf, aead };
}
