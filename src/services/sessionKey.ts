/**
 * @fileoverview In-memory session root key for disk encryption without retaining the master password.
 *
 * After native KDF+AEAD pass, the root lives in `pkey-crypto` and the JS hex copy
 * is dropped. When only KDF is native (iOS), hex may be kept for JS AEAD writes;
 * `exportKey` is used if hex was dropped. `importKey` still lets `dropKey` wipe.
 */
import pkeyCrypto, { isPkeyCryptoAvailable } from 'pkey-crypto';
import { isNativeAeadReady } from './nativeCryptoReady';

let sessionRootKeyHex: string | null = null;
let sessionKdfSalt: string | null = null;
let sessionNativeHandle: string | null = null;
let attachGeneration = 0;
let attachChain: Promise<void> = Promise.resolve();

function queueAttach(work: () => Promise<void>): void {
  attachChain = attachChain.then(work).catch((err) => {
    console.warn('[sessionKey] native attach failed:', err);
  });
}

async function dropHandle(handle: string | null): Promise<void> {
  if (!handle || !isPkeyCryptoAvailable() || !pkeyCrypto) return;
  try {
    await pkeyCrypto.dropKey(handle);
  } catch (err) {
    console.warn('[sessionKey] dropKey failed:', err);
  }
}

/** Waits until the latest import/adopt has finished (Android native encrypt path). */
export function whenSessionNativeAttached(): Promise<void> {
  return attachChain;
}

/** Stores the derived root key and salt for the current unlocked session. */
export function setSessionRootKey(rootKeyHex: string, kdfSalt: string): void {
  sessionRootKeyHex = rootKeyHex;
  sessionKdfSalt = kdfSalt || null;
  if (!rootKeyHex || !kdfSalt) {
    return;
  }
  if (!isPkeyCryptoAvailable() || !pkeyCrypto) {
    return;
  }
  const crypto = pkeyCrypto;
  const gen = ++attachGeneration;
  const previous = sessionNativeHandle;
  queueAttach(async () => {
    const handle = await crypto.importKey(rootKeyHex);
    if (gen !== attachGeneration) {
      await dropHandle(handle);
      return;
    }
    if (previous && previous !== handle) {
      await dropHandle(previous);
    }
    sessionNativeHandle = handle;
    if (isNativeAeadReady()) {
      sessionRootKeyHex = null;
    }
  });
}

/**
 * Adopts a native-derived handle. Drops the JS hex copy only when native AEAD
 * is ready; otherwise keeps hex so iOS / JS wrap does not depend on exportKey.
 */
export async function adoptNativeHandle(handle: string, kdfSalt: string): Promise<void> {
  if (!handle || !kdfSalt) {
    return;
  }
  const gen = ++attachGeneration;
  const previous = sessionNativeHandle;
  sessionKdfSalt = kdfSalt;
  sessionNativeHandle = handle;
  const keepJsHex = !isNativeAeadReady();
  sessionRootKeyHex = keepJsHex ? sessionRootKeyHex : null;
  const work = async () => {
    if (gen !== attachGeneration) {
      await dropHandle(handle);
      return;
    }
    if (previous && previous !== handle) {
      await dropHandle(previous);
    }
    if (keepJsHex && pkeyCrypto && gen === attachGeneration) {
      try {
        sessionRootKeyHex = await pkeyCrypto.exportKey(handle);
      } catch (err) {
        console.warn('[sessionKey] exportKey after adopt failed:', err);
      }
    }
  };
  attachChain = attachChain.then(work).catch((err) => {
    console.warn('[sessionKey] native attach failed:', err);
  });
  await attachChain;
}

/** Returns the current session root key pair, or `null` when locked/logged out. */
export function getSessionRootKey(): { rootKeyHex: string; kdfSalt: string } | null {
  if (!sessionRootKeyHex || !sessionKdfSalt) return null;
  return { rootKeyHex: sessionRootKeyHex, kdfSalt: sessionKdfSalt };
}

export function getSessionNativeHandle(): string | null {
  return sessionNativeHandle;
}

export function getSessionKdfSalt(): string | null {
  return sessionKdfSalt;
}

/** True when the session can wrap the vault (JS hex and/or native handle). */
export function hasSessionKeyMaterial(): boolean {
  return Boolean(sessionKdfSalt && (sessionRootKeyHex || sessionNativeHandle));
}

/**
 * Hex of the session root for biometric persist / device-secret mix.
 * On the native path this copies out of the handle (brief JS lifetime).
 */
export async function exportSessionRootKeyHex(): Promise<string | null> {
  if (sessionRootKeyHex) return sessionRootKeyHex;
  if (sessionNativeHandle && isPkeyCryptoAvailable() && pkeyCrypto) {
    try {
      return await pkeyCrypto.exportKey(sessionNativeHandle);
    } catch (err) {
      console.warn('[sessionKey] exportKey failed:', err);
      return null;
    }
  }
  return null;
}

/** Clears the in-memory session key (logout / wipe) and native handle. */
export function clearSessionRootKey(): void {
  attachGeneration += 1;
  const handle = sessionNativeHandle;
  sessionNativeHandle = null;
  sessionRootKeyHex = null;
  sessionKdfSalt = null;
  void dropHandle(handle);
}
