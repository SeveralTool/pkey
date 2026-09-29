/**
 * Native-first vault KDF/AEAD. Password unlock derives Argon2id at most once.
 * Production never falls through to JS Argon2id 64 MiB; biometric AEAD stays JS-safe.
 */
import pkeyCrypto, { isPkeyCryptoAvailable } from 'pkey-crypto';
import {
  ARGON2_MEMORY_KIB,
  ARGON2_PARALLELISM,
  ARGON2_TIME_COST,
  argon2idHex,
  decryptVaultV4,
  deriveAuthVerifier,
  envelopeV4AadUtf8,
  HKDF_INFO_AUTH_VERIFY,
  isEnvelopeV4,
  KDF_ARGON2ID,
  type EnvelopeV4,
} from '@pkey/core';
import { LocalCipher } from './crypto';
import { mixDeviceSecret } from './deviceSecret';
import {
  isNativeAeadReady,
  isNativeKdfReady,
  resetNativeCryptoReadyForTests,
  setNativeAeadReady,
  setNativeKdfReady,
} from './nativeCryptoReady';
import * as kdfPolicy from './nativeKdfPolicy';
import { NativeKdfUnavailableError } from './nativeKdfPolicy';
import { beginKdfAttempt, recordKdfDerive, recordKdfMetric } from './kdfMetrics';
import {
  adoptNativeHandle,
  exportSessionRootKeyHex,
  getSessionNativeHandle,
  getSessionRootKey,
  setSessionRootKey,
} from './sessionKey';
import { probeNativeCapabilities, type NativeCaps } from './nativeCryptoProbe';

export { isNativeVaultCryptoReady, isNativeKdfReady, isNativeAeadReady } from './nativeCryptoReady';
export {
  NativeKdfUnavailableError,
  isNativeKdfUnavailableError,
  isJsArgon2FallbackAllowed,
} from './nativeKdfPolicy';

let probePromise: Promise<boolean> | null = null;

/** Idempotent KAT probe; first vault I/O should await this so the gate is stable. */
export function ensureNativeVaultCryptoProbed(): Promise<boolean> {
  if (!probePromise) {
    probePromise = probeNativeVaultCrypto();
  }
  return probePromise;
}

/** Test-only: drop the probe latch so the next call re-runs KATs. */
export function resetNativeVaultProbeForTests(): void {
  probePromise = null;
  resetNativeCryptoReadyForTests();
}

function v4Header(env: EnvelopeV4): Omit<EnvelopeV4, 'nonce' | 'ciphertext'> {
  return {
    v: 4,
    kdf: env.kdf,
    kdfMem: env.kdfMem,
    kdfTime: env.kdfTime,
    kdfPar: env.kdfPar,
    kdfSalt: env.kdfSalt,
    deviceBound: env.deviceBound === true,
  };
}

function packedNonceCt(env: EnvelopeV4): string {
  return JSON.stringify({ nonce: env.nonce, ciphertext: env.ciphertext });
}

async function readHotPathCaps(): Promise<NativeCaps | null> {
  if (!pkeyCrypto || typeof pkeyCrypto.hotPathCaps !== 'function') {
    return null;
  }
  try {
    const caps = await pkeyCrypto.hotPathCaps();
    return {
      kdf: caps?.kdf === true,
      aead: caps?.aead === true,
    };
  } catch {
    return null;
  }
}

function parsePackedNonceCt(packed: string): { nonce: string; ciphertext: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packed) as unknown;
  } catch {
    throw new Error('native encryptVault returned invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('native encryptVault returned an invalid envelope');
  }
  const rec = parsed as { nonce?: unknown; ciphertext?: unknown };
  if (typeof rec.nonce !== 'string' || typeof rec.ciphertext !== 'string') {
    throw new Error('native encryptVault returned an invalid envelope');
  }
  return { nonce: rec.nonce, ciphertext: rec.ciphertext };
}

/**
 * Enables KDF and AEAD independently. A failed XChaCha KAT must not disable Argon2.
 */
export async function probeNativeVaultCrypto(): Promise<boolean> {
  if (!isPkeyCryptoAvailable() || !pkeyCrypto) {
    setNativeKdfReady(false);
    setNativeAeadReady(false);
    return false;
  }
  const started = Date.now();
  const caps = await readHotPathCaps();
  const probed = await probeNativeCapabilities(caps);
  const kdf = probed.kdf;
  const aead = probed.aead;
  setNativeKdfReady(kdf);
  setNativeAeadReady(aead);
  recordKdfMetric({
    source: kdf ? 'native' : 'unavailable',
    op: 'kat',
    durationMs: Date.now() - started,
    m: 32,
    t: 3,
    p: 1,
    katOk: kdf,
    outcome: kdf ? 'ok' : 'fail',
    deriveCount: 0,
  });
  if (kdf && aead) {
    console.info('[nativeCrypto] native Argon2id + XChaCha20-Poly1305 ready');
  } else if (kdf && !aead) {
    if (caps?.aead === true) {
      console.warn(
        '[nativeCrypto] binary claimed native XChaCha but the noble KAT failed; vault wrap stays in JS'
      );
    } else {
      console.info('[nativeCrypto] native Argon2id ready; AEAD is JS');
    }
  } else {
    console.warn(
      '[nativeCrypto] native Argon2id KAT failed; password unlock will not use JS 64 MiB in production'
    );
  }
  return kdf;
}

export async function encryptVaultWithHandle(
  handle: string,
  plaintext: string,
  kdfSaltHex: string,
  opts?: { deviceBound?: boolean; t?: number; m?: number; p?: number }
): Promise<string> {
  if (!pkeyCrypto) {
    throw new Error('native crypto unavailable');
  }
  const header: Omit<EnvelopeV4, 'nonce' | 'ciphertext'> = {
    v: 4,
    kdf: KDF_ARGON2ID,
    kdfMem: opts?.m ?? ARGON2_MEMORY_KIB,
    kdfTime: opts?.t ?? ARGON2_TIME_COST,
    kdfPar: opts?.p ?? ARGON2_PARALLELISM,
    kdfSalt: kdfSaltHex,
    deviceBound: opts?.deviceBound === true,
  };
  const packed = await pkeyCrypto.encryptVault(handle, plaintext, envelopeV4AadUtf8(header));
  const parsed = parsePackedNonceCt(packed);
  const env: EnvelopeV4 = { ...header, nonce: parsed.nonce, ciphertext: parsed.ciphertext };
  return JSON.stringify(env);
}

/**
 * Wraps vault plaintext with the live session. Prefers native AEAD; if that
 * throws, demotes the AEAD gate and uses JS XChaCha (same envelope bytes).
 */
export async function encryptVaultPayloadForSession(
  plaintext: string,
  kdfSaltHex: string,
  opts?: { deviceBound?: boolean; t?: number; m?: number; p?: number }
): Promise<string> {
  const handle = getSessionNativeHandle();
  if (handle && isNativeAeadReady()) {
    try {
      return await encryptVaultWithHandle(handle, plaintext, kdfSaltHex, opts);
    } catch (err) {
      console.warn('[nativeVault] native AEAD wrap failed; using JS AEAD', err);
      setNativeAeadReady(false);
    }
  }
  const hex = (await exportSessionRootKeyHex()) ?? getSessionRootKey()?.rootKeyHex;
  if (!hex) {
    throw new Error('session-root-missing');
  }
  return LocalCipher.encryptWithCachedRoot(plaintext, hex, kdfSaltHex, {
    deviceBound: opts?.deviceBound === true,
  });
}

export async function decryptVaultWithHandle(
  handle: string,
  envelopeJson: string
): Promise<string | null> {
  if (!pkeyCrypto) return null;
  try {
    const env = JSON.parse(envelopeJson) as unknown;
    if (!isEnvelopeV4(env)) return null;
    return await pkeyCrypto.decryptVault(
      handle,
      packedNonceCt(env),
      envelopeV4AadUtf8(v4Header(env))
    );
  } catch {
    return null;
  }
}

async function openV4WithHandle(handle: string, env: EnvelopeV4): Promise<string | null> {
  const json = JSON.stringify(env);
  if (isNativeAeadReady() && pkeyCrypto) {
    const nativePlain = await decryptVaultWithHandle(handle, json);
    if (nativePlain) return nativePlain;
  }
  if (!pkeyCrypto) return null;
  try {
    const hex = await pkeyCrypto.exportKey(handle);
    const jsPlain = decryptVaultV4(json, hex);
    if (jsPlain && isNativeAeadReady()) {
      setNativeAeadReady(false);
      console.warn('[nativeVault] native AEAD failed but JS AEAD opened; demoting AEAD gate');
    }
    return jsPlain;
  } catch {
    return null;
  }
}

async function dropQuietly(handle: string): Promise<void> {
  if (!pkeyCrypto) return;
  try {
    await pkeyCrypto.dropKey(handle);
  } catch {
    /* already dropped */
  }
}

/**
 * One native Argon2id, then AEAD (native or JS). Never retries with JS Argon2.
 */
async function tryDecryptV4Native(password: string, env: EnvelopeV4): Promise<string | null> {
  if (!pkeyCrypto) return null;
  const started = Date.now();
  recordKdfDerive();
  const handle = await pkeyCrypto.deriveRootKey(
    password,
    env.kdfSalt,
    env.kdfMem,
    env.kdfTime,
    env.kdfPar
  );

  let plain = await openV4WithHandle(handle, env);
  if (plain) {
    await adoptNativeHandle(handle, env.kdfSalt);
    recordKdfMetric({
      source: 'native',
      op: 'unlock',
      durationMs: Date.now() - started,
      m: env.kdfMem,
      t: env.kdfTime,
      p: env.kdfPar,
      outcome: 'ok',
    });
    return plain;
  }

  if (env.deviceBound === true) {
    try {
      const unboundHex = await pkeyCrypto.exportKey(handle);
      const mixed = await mixDeviceSecret(unboundHex, 'PKEY');
      await dropQuietly(handle);
      if (!mixed) {
        recordKdfMetric({
          source: 'native',
          op: 'unlock',
          durationMs: Date.now() - started,
          m: env.kdfMem,
          t: env.kdfTime,
          p: env.kdfPar,
          outcome: 'fail',
        });
        return null;
      }
      const mixedHandle = await pkeyCrypto.importKey(mixed);
      plain = await openV4WithHandle(mixedHandle, env);
      if (plain) {
        await adoptNativeHandle(mixedHandle, env.kdfSalt);
        recordKdfMetric({
          source: 'native',
          op: 'unlock',
          durationMs: Date.now() - started,
          m: env.kdfMem,
          t: env.kdfTime,
          p: env.kdfPar,
          outcome: 'ok',
        });
        return plain;
      }
      await dropQuietly(mixedHandle);
    } catch (err) {
      console.warn('[nativeVault] device-bound decrypt failed:', err);
      await dropQuietly(handle);
    }
    recordKdfMetric({
      source: 'native',
      op: 'unlock',
      durationMs: Date.now() - started,
      m: env.kdfMem,
      t: env.kdfTime,
      p: env.kdfPar,
      outcome: 'fail',
    });
    return null;
  }

  await dropQuietly(handle);
  recordKdfMetric({
    source: 'native',
    op: 'unlock',
    durationMs: Date.now() - started,
    m: env.kdfMem,
    t: env.kdfTime,
    p: env.kdfPar,
    outcome: 'fail',
  });
  return null;
}

async function decryptV4Js(
  password: string,
  envelopeJson: string,
  env: EnvelopeV4
): Promise<string> {
  kdfPolicy.assertJsArgon2Allowed(env.kdfMem);
  const started = Date.now();
  recordKdfDerive();
  const unbound = argon2idHex(password, env.kdfSalt, {
    t: env.kdfTime,
    m: env.kdfMem,
    p: env.kdfPar,
  });
  let plain = decryptVaultV4(envelopeJson, unbound);
  let root = unbound;
  if (!plain && env.deviceBound === true) {
    const mixed = await mixDeviceSecret(unbound, 'PKEY');
    if (mixed) {
      const bound = decryptVaultV4(envelopeJson, mixed);
      if (bound) {
        plain = bound;
        root = mixed;
      }
    }
  }
  recordKdfMetric({
    source: 'js',
    op: 'unlock',
    durationMs: Date.now() - started,
    m: env.kdfMem,
    t: env.kdfTime,
    p: env.kdfPar,
    outcome: plain ? 'ok' : 'fail',
  });
  if (plain) {
    setSessionRootKey(root, env.kdfSalt);
  }
  return plain ?? '';
}

/**
 * Decrypts a vault payload. At most one Argon2id per call for v4.
 * Production: native KDF required; wrong password does not retry in JS.
 */
export async function decryptVaultPayload(password: string, payload: string): Promise<string> {
  beginKdfAttempt();
  await ensureNativeVaultCryptoProbed();
  const trimmed = payload.trim();
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return LocalCipher.decrypt(payload, password);
    }
    if (isEnvelopeV4(parsed)) {
      if (isNativeKdfReady() && pkeyCrypto) {
        try {
          const nativePlain = await tryDecryptV4Native(password, parsed);
          return nativePlain ?? '';
        } catch (err) {
          console.warn('[nativeVault] native v4 decrypt failed:', err);
          return '';
        }
      }
      if (!kdfPolicy.isJsArgon2FallbackAllowed()) {
        throw new NativeKdfUnavailableError();
      }
      return decryptV4Js(password, trimmed, parsed);
    }
  }
  return LocalCipher.decrypt(payload, password);
}

export async function decryptVaultWithImportedKey(
  rootKeyHex: string,
  envelopeJson: string
): Promise<string | null> {
  await ensureNativeVaultCryptoProbed();
  if (isNativeAeadReady() && pkeyCrypto) {
    try {
      const env = JSON.parse(envelopeJson) as unknown;
      if (!isEnvelopeV4(env)) {
        const js = LocalCipher.decryptWithCachedRoot(envelopeJson, rootKeyHex);
        return js || null;
      }
      const handle = await pkeyCrypto.importKey(rootKeyHex);
      const plain = await decryptVaultWithHandle(handle, envelopeJson);
      if (plain) {
        await adoptNativeHandle(handle, env.kdfSalt);
        return plain;
      }
      const js = LocalCipher.decryptWithCachedRoot(envelopeJson, rootKeyHex);
      if (js) {
        setNativeAeadReady(false);
        console.warn('[nativeVault] native AEAD import-open failed; demoting AEAD gate');
        await dropQuietly(handle);
        return js;
      }
      await dropQuietly(handle);
      return null;
    } catch (err) {
      console.warn('[nativeVault] decryptVaultWithImportedKey failed:', err);
      const js = LocalCipher.decryptWithCachedRoot(envelopeJson, rootKeyHex);
      return js || null;
    }
  }
  return LocalCipher.decryptWithCachedRoot(envelopeJson, rootKeyHex) || null;
}

export async function establishSessionFromPassword(
  password: string,
  saltHex: string,
  params?: { t?: number; m?: number; p?: number }
): Promise<{ rootKeyHex: string; authVerifier: string }> {
  await ensureNativeVaultCryptoProbed();
  const t = params?.t ?? ARGON2_TIME_COST;
  const m = params?.m ?? ARGON2_MEMORY_KIB;
  const p = params?.p ?? ARGON2_PARALLELISM;
  beginKdfAttempt();
  const started = Date.now();
  if (isNativeKdfReady() && pkeyCrypto) {
    recordKdfDerive();
    const handle = await pkeyCrypto.deriveRootKey(password, saltHex, m, t, p);
    await adoptNativeHandle(handle, saltHex);
    const rootKeyHex = await pkeyCrypto.exportKey(handle);
    const authVerifier = await pkeyCrypto.hkdfExpand(handle, HKDF_INFO_AUTH_VERIFY);
    recordKdfMetric({
      source: 'native',
      op: 'create',
      durationMs: Date.now() - started,
      m,
      t,
      p,
      outcome: 'ok',
    });
    return { rootKeyHex, authVerifier };
  }
  if (!kdfPolicy.isJsArgon2FallbackAllowed()) {
    throw new NativeKdfUnavailableError();
  }
  kdfPolicy.assertJsArgon2Allowed(m);
  recordKdfDerive();
  const rootKeyHex = LocalCipher.deriveRootKey(password, saltHex);
  setSessionRootKey(rootKeyHex, saltHex);
  recordKdfMetric({
    source: 'js',
    op: 'create',
    durationMs: Date.now() - started,
    m,
    t,
    p,
    outcome: 'ok',
  });
  return { rootKeyHex, authVerifier: deriveAuthVerifier(rootKeyHex) };
}

/**
 * One Argon2id; adopts the session only if HKDF(root) matches `storedHash`.
 * Used when replacing a live (e.g. device-bound) session without a second derive.
 */
export async function adoptSessionIfPasswordMatches(
  password: string,
  salt: string,
  storedHash: string,
  params?: { t?: number; m?: number; p?: number }
): Promise<boolean> {
  await ensureNativeVaultCryptoProbed();
  const t = params?.t ?? ARGON2_TIME_COST;
  const m = params?.m ?? ARGON2_MEMORY_KIB;
  const p = params?.p ?? ARGON2_PARALLELISM;
  beginKdfAttempt();
  const started = Date.now();
  if (isNativeKdfReady() && pkeyCrypto) {
    recordKdfDerive();
    const handle = await pkeyCrypto.deriveRootKey(password, salt, m, t, p);
    try {
      const verifier = await pkeyCrypto.hkdfExpand(handle, HKDF_INFO_AUTH_VERIFY);
      const ok = LocalCipher.secureCompare(verifier, storedHash);
      recordKdfMetric({
        source: 'native',
        op: 'verify',
        durationMs: Date.now() - started,
        m,
        t,
        p,
        outcome: ok ? 'ok' : 'fail',
      });
      if (!ok) {
        await dropQuietly(handle);
        return false;
      }
      await adoptNativeHandle(handle, salt);
      return true;
    } catch (err) {
      await dropQuietly(handle);
      throw err;
    }
  }
  if (!kdfPolicy.isJsArgon2FallbackAllowed()) {
    throw new NativeKdfUnavailableError();
  }
  kdfPolicy.assertJsArgon2Allowed(m);
  recordKdfDerive();
  const rootKeyHex = LocalCipher.deriveRootKey(password, salt);
  const ok = LocalCipher.secureCompare(deriveAuthVerifier(rootKeyHex), storedHash);
  recordKdfMetric({
    source: 'js',
    op: 'verify',
    durationMs: Date.now() - started,
    m,
    t,
    p,
    outcome: ok ? 'ok' : 'fail',
  });
  if (!ok) return false;
  setSessionRootKey(rootKeyHex, salt);
  return true;
}

/** Verifies a typed password with at most one Argon2id; does not replace the session. */
export async function verifyTypedPassword(
  password: string,
  storedHash: string,
  salt?: string
): Promise<boolean> {
  if (!salt) {
    return LocalCipher.verifyPasswordHash(password, storedHash, salt);
  }
  await ensureNativeVaultCryptoProbed();
  beginKdfAttempt();
  const started = Date.now();
  const t = ARGON2_TIME_COST;
  const m = ARGON2_MEMORY_KIB;
  const p = ARGON2_PARALLELISM;
  if (isNativeKdfReady() && pkeyCrypto) {
    recordKdfDerive();
    const handle = await pkeyCrypto.deriveRootKey(password, salt, m, t, p);
    try {
      const verifier = await pkeyCrypto.hkdfExpand(handle, HKDF_INFO_AUTH_VERIFY);
      const ok = LocalCipher.secureCompare(verifier, storedHash);
      recordKdfMetric({
        source: 'native',
        op: 'verify',
        durationMs: Date.now() - started,
        m,
        t,
        p,
        outcome: ok ? 'ok' : 'fail',
      });
      if (ok) return true;
      const v3 = LocalCipher.deriveRootKeyPbkdf2(password, salt);
      if (LocalCipher.secureCompare(deriveAuthVerifier(v3), storedHash)) return true;
      const v2 = LocalCipher.deriveAuthHashV2Legacy(password, salt);
      return LocalCipher.secureCompare(v2, storedHash);
    } finally {
      await dropQuietly(handle);
    }
  }
  if (!kdfPolicy.isJsArgon2FallbackAllowed()) {
    throw new NativeKdfUnavailableError();
  }
  kdfPolicy.assertJsArgon2Allowed(m);
  recordKdfDerive();
  const ok = LocalCipher.verifyPasswordHash(password, storedHash, salt);
  recordKdfMetric({
    source: 'js',
    op: 'verify',
    durationMs: Date.now() - started,
    m,
    t,
    p,
    outcome: ok ? 'ok' : 'fail',
  });
  return ok;
}

/**
 * HKDF of the live session handle vs on-disk verifier. Does not Argon2.
 * Returns false when there is no handle or the handle is device-bound mixed.
 */
export async function verifyPasswordHashWithSession(
  _password: string,
  storedHash: string,
  _salt?: string
): Promise<boolean> {
  if (!pkeyCrypto) return false;
  const handle = getSessionNativeHandle();
  if (!handle) return false;
  try {
    const verifier = await pkeyCrypto.hkdfExpand(handle, HKDF_INFO_AUTH_VERIFY);
    return LocalCipher.secureCompare(verifier, storedHash);
  } catch {
    return false;
  }
}
