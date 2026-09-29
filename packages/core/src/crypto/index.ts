/**
 * @fileoverview Cryptographic primitives for vault auth and sync envelopes.
 *
 * Provides hashing, PBKDF2-based password derivation, constant-time comparison,
 * and AES-CBC + HMAC authenticated encryption used by multi-device sync.
 */

import {
  PBKDF2,
  SHA256Algo,
  WordArray,
  Hex,
  AES,
  CBC,
  Pkcs7,
  HmacSHA256,
  Utf8,
  SHA256,
  CipherParams,
} from 'crypto-es';
import { isAeadWireEnvelope, decryptWireAead } from './wireAead';
import { argon2idHex } from './envelopeV4';

const pbkdf2Cache = new Map<string, string>();
/** Per-process HMAC key so cache map keys are not SHA-256(password) (audit M2). */
let pbkdf2CacheMacKey: WordArray | null = null;

/**
 * Pluggable PBKDF2-HMAC-SHA256 implementation. Hosts (e.g. React Native with
 * a native crypto module) can install a faster provider; the crypto-es
 * implementation remains the default so core stays pure JS.
 *
 * Must return the lowercase hex-encoded derived key and be byte-identical to
 * PBKDF2-HMAC-SHA256 over the UTF-8 bytes of `password` and `salt`.
 */
export type Pbkdf2Provider = (
  password: string,
  salt: string,
  iterations: number,
  keyLengthBytes: number
) => string;

let pbkdf2Provider: Pbkdf2Provider | null = null;

/**
 * Installs (or removes, with `null`) a host-provided PBKDF2 implementation.
 * Callers are responsible for verifying the provider is byte-compatible
 * (e.g. against a known test vector) before installing it.
 */
export function setPbkdf2Provider(provider: Pbkdf2Provider | null): void {
  pbkdf2Provider = provider;
}

export * from './envelopeV4';
export * from './nativeKat';
export * from './wireAead';

/**
 * Derives a key with PBKDF2-HMAC-SHA256 and returns it hex-encoded.
 * Uses the installed provider when available, crypto-es otherwise.
 *
 * @param password - Password (UTF-8 string).
 * @param salt - Salt (UTF-8 string).
 * @param iterations - PBKDF2 iteration count.
 * @param keyLengthBytes - Derived key length in bytes.
 * @returns Lowercase hex-encoded derived key.
 */
export function pbkdf2Hex(
  password: string,
  salt: string,
  iterations: number,
  keyLengthBytes: number
): string {
  if (pbkdf2Provider) {
    return pbkdf2Provider(password, salt, iterations, keyLengthBytes);
  }
  return PBKDF2(password, salt, {
    keySize: keyLengthBytes / 4, // crypto-es keySize is in 32-bit words
    iterations,
    hasher: SHA256Algo,
  }).toString(Hex);
}

/**
 * Computes the SHA-256 digest of a UTF-8 string.
 *
 * @param message - Input string to hash.
 * @returns Lowercase hex-encoded digest.
 */
export function sha256(message: string): string {
  return SHA256(message).toString(Hex);
}

/**
 * Computes HMAC-SHA-256 over a message with the given key.
 *
 * @param key - HMAC key (UTF-8 string).
 * @param message - Message to authenticate (UTF-8 string).
 * @returns Lowercase hex-encoded HMAC.
 */
export function hmacSha256(key: string, message: string): string {
  return HmacSHA256(message, key).toString(Hex);
}

/**
 * Current PBKDF2 iteration count for new vaults (audit finding A4).
 *
 * Raised from 100 k → 600 k to align with OWASP 2023 recommendation for
 * PBKDF2-HMAC-SHA-256. With the native provider (`react-native-quick-crypto`)
 * this runs in <200 ms on modern devices; the pure-JS fallback used in tests
 * / web takes ~1 s but only runs once per login (cached thereafter).
 */
export const PBKDF2_ITERATIONS_V3 = 600_000;

/**
 * Legacy iteration count for pre-audit vaults (v2 envelope). Accepted at
 * unlock time when the stored `passwordHash` matches the 100 k derivation of
 * the entered master password; the vault is then transparently upgraded to
 * v3 on the next write.
 */
export const PBKDF2_ITERATIONS_LEGACY = 100_000;

/**
 * Derives a stable auth hash from a password and salt via PBKDF2-SHA256.
 * Defaults to the current strength ({@link PBKDF2_ITERATIONS_V3}); callers
 * that need the legacy 100 k derivation (backwards-compat during migration)
 * pass `iterations` explicitly. Results are cached in memory per process.
 *
 * @param password - Master password (plaintext).
 * @param salt - Per-vault salt string.
 * @param iterations - PBKDF2 iteration count. Defaults to
 *                     {@link PBKDF2_ITERATIONS_V3}.
 * @returns Hex-encoded derived key suitable for auth / session key material.
 */
export function deriveAuthHash(
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS_V3
): string {
  const cacheKey = pbkdf2CacheKey(password, salt, iterations);
  const cached = pbkdf2Cache.get(cacheKey);
  if (cached) return cached;

  const result = pbkdf2Hex(password, salt, iterations, 32);

  pbkdf2Cache.set(cacheKey, result);
  return result;
}

function pbkdf2CacheMac(): WordArray {
  if (!pbkdf2CacheMacKey) {
    pbkdf2CacheMacKey = WordArray.random(32);
  }
  return pbkdf2CacheMacKey;
}

/**
 * Cache lookup token. HMAC with an ephemeral process key so a heap dump of the
 * Map does not yield unsalted SHA-256(master password) (audit M2).
 */
function pbkdf2CacheKey(password: string, salt: string, iterations: number): string {
  return HmacSHA256(`${salt}:${iterations}:${password}`, pbkdf2CacheMac()).toString(Hex);
}

/**
 * HKDF-SHA-256 expand step over a 256-bit pseudorandom key (PRK).
 * Implements RFC 5869 §2.3 with T(0) = empty and one 32-byte block, which
 * covers all key material we ever need for a single envelope. `info` is
 * hashed as UTF-8 so that different infos give byte-different subkeys.
 *
 * Rationale (audit finding C5): the previous design reused the PBKDF2
 * output BOTH as the disk-encryption key AND as the auth verifier stored on
 * disk. A leak of the stored verifier equated to a leak of the encryption
 * key. HKDF-derived, info-tagged sub-keys break that equivalence: the
 * encryption key (`info="pkey-vault-enc-v1"`) and the auth verifier
 * (`info="pkey-auth-verify-v1"`) are distinct outputs of the same root PRK.
 */
export function hkdfExpand(prkHex: string, info: string, lengthBytes: number = 32): string {
  const prk = Hex.parse(prkHex);
  // Single-block HKDF-Expand (T = HMAC(PRK, info || 0x01)). For lengthBytes ≤ 32
  // this is exact; for longer outputs concatenate additional blocks.
  if (lengthBytes > 32) {
    throw new Error('hkdfExpand: lengthBytes > 32 is not supported (audit L1)');
  }
  const t = HmacSHA256(`${info}\u0001`, prk).toString(Hex);
  return t.slice(0, lengthBytes * 2);
}

/** HKDF info string for the vault disk-encryption key. */
export const HKDF_INFO_VAULT_ENC = 'pkey-vault-enc-v1';
/** HKDF info string for the vault auth verifier (stored on disk as `passwordHash`). */
export const HKDF_INFO_AUTH_VERIFY = 'pkey-auth-verify-v1';

/**
 * Derives the disk-encryption sub-key from the PBKDF2 root. See
 * {@link hkdfExpand} for the security rationale.
 */
export function deriveVaultEncryptionKey(rootKeyHex: string): string {
  return hkdfExpand(rootKeyHex, HKDF_INFO_VAULT_ENC, 32);
}

/**
 * Derives the auth verifier from the PBKDF2 root. This is what gets stored
 * on disk as `passwordHash` in v3 envelopes — leaking it does NOT reveal
 * the vault encryption key.
 */
export function deriveAuthVerifier(rootKeyHex: string): string {
  return hkdfExpand(rootKeyHex, HKDF_INFO_AUTH_VERIFY, 32);
}

/**
 * Seeds the PBKDF2 derivation cache with a pre-computed result, so the next
 * {@link deriveAuthHash} call for the same (password, salt) pair skips the
 * expensive derivation (e.g. fast unlock with a persisted root key).
 *
 * The optional `iterations` argument keys the cache by strength so v2 legacy
 * derivations do not collide with v3 (600 k) results.
 */
export function seedPbkdf2Cache(
  password: string,
  salt: string,
  derivedHex: string,
  iterations: number = PBKDF2_ITERATIONS_V3
): void {
  pbkdf2Cache.set(pbkdf2CacheKey(password, salt, iterations), derivedHex);
}

/**
 * Scheme for the on-disk / sync `passwordHash` shared secret.
 *
 * - `v3-hkdf` — PBKDF2 600k → HKDF auth verifier (current; matches mobile
 *   `LocalCipher.deriveAuthHash`). Sync and PWA login MUST use this once the
 *   vault has been unlocked on a post-audit mobile build.
 * - `v2-pbkdf2` — raw PBKDF2 100k (pre-audit vaults until first upgrade unlock).
 */
export type AuthHashScheme = 'v4-argon2' | 'v3-hkdf' | 'v2-pbkdf2';

/**
 * Derives the vault auth secret stored as `passwordHash` and used as the
 * sync challenge HMAC key. Must stay byte-identical to mobile
 * `LocalCipher.deriveAuthHash` for the given scheme.
 */
export function deriveVaultAuthSecret(
  password: string,
  salt: string,
  scheme: AuthHashScheme = 'v4-argon2'
): string {
  if (scheme === 'v2-pbkdf2') {
    return deriveAuthHash(password, salt, PBKDF2_ITERATIONS_LEGACY);
  }
  if (scheme === 'v3-hkdf') {
    const root = deriveAuthHash(password, salt, PBKDF2_ITERATIONS_V3);
    return deriveAuthVerifier(root);
  }
  const root = argon2idHex(password, salt);
  return deriveAuthVerifier(root);
}

/**
 * Derives a password hash for vault unlock / PWA login / sync.
 *
 * When a salt is present, returns the **v4 Argon2id auth verifier** (not the raw
 * KDF root). This matches the on-disk `passwordHash` written by mobile
 * after the v4 upgrade. Callers that need a specific legacy scheme pass
 * {@link deriveVaultAuthSecret} with `v3-hkdf` or `v2-pbkdf2` explicitly.
 *
 * @param password - Master password (plaintext).
 * @param salt - Optional vault salt; when omitted, falls back to SHA-256.
 * @param iterations - Ignored for the default path (kept for API compat).
 *                     Prefer {@link deriveVaultAuthSecret} with an explicit
 *                     {@link AuthHashScheme} instead of relying on iterations.
 * @returns Hex-encoded password hash / sync shared secret.
 */
export async function derivePasswordHash(
  password: string,
  salt?: string | null,
  iterations: number = PBKDF2_ITERATIONS_V3
): Promise<string> {
  if (!salt) return sha256(password);
  if (iterations === PBKDF2_ITERATIONS_LEGACY) {
    return deriveVaultAuthSecret(password, salt, 'v2-pbkdf2');
  }
  return deriveVaultAuthSecret(password, salt, 'v4-argon2');
}

/**
 * Clears the in-memory PBKDF2 derivation cache.
 * Call on logout or when switching vaults to avoid retaining key material.
 */
export function clearPbkdf2Cache(): void {
  pbkdf2Cache.clear();
  pbkdf2CacheMacKey = null;
}

/**
 * Constant-time string equality for secret comparisons (e.g. HMACs).
 * Length mismatch returns `false` immediately; equal-length compares without
 * short-circuiting on the first differing character.
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns `true` if both strings have identical length and content.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function syncSessionKey(passwordHash: string): string {
  return sha256(`${passwordHash}_sync_session_key`);
}

function deriveSyncKeys(sessionKeyHex: string, saltHex: string) {
  const sessionKey = Hex.parse(sessionKeyHex);
  return {
    encKey: HmacSHA256(`${saltHex}AES`, sessionKey),
    hmacKey: HmacSHA256(`${saltHex}HMAC`, sessionKey),
  };
}

/**
 * Encrypts an arbitrary JSON-serializable payload for sync transport.
 * Produces a JSON envelope with random salt/IV, AES-CBC ciphertext, and HMAC.
 *
 * @param payload - Value to encrypt (will be `JSON.stringify`'d).
 * @param passwordHash - Hex password hash used to derive the session key.
 * @returns JSON string envelope: `{ salt, iv, ciphertext, hmac }`.
 */
export function encryptSyncPayload(payload: unknown, passwordHash: string): string {
  const sessionKeyHex = syncSessionKey(passwordHash);
  const plainText = JSON.stringify(payload);
  const salt = WordArray.random(16);
  const iv = WordArray.random(16);
  const saltHex = salt.toString(Hex);
  const ivHex = iv.toString(Hex);
  const { encKey, hmacKey } = deriveSyncKeys(sessionKeyHex, saltHex);

  const encrypted = AES.encrypt(plainText, encKey, {
    iv,
    mode: CBC,
    padding: Pkcs7,
  });

  const ciphertextHex = encrypted.ciphertext!.toString(Hex);
  const hmac = HmacSHA256(ivHex + ciphertextHex, hmacKey).toString(Hex);

  return JSON.stringify({ salt: saltHex, iv: ivHex, ciphertext: ciphertextHex, hmac });
}

/**
 * Decrypts a sync envelope produced by {@link encryptSyncPayload}.
 * Verifies the HMAC in constant time before decrypting.
 *
 * @typeParam T - Expected plaintext type after JSON parse.
 * @param envelopeJson - JSON string envelope from {@link encryptSyncPayload}.
 * @param passwordHash - Hex password hash used at encryption time.
 * @returns Parsed plaintext, or `null` if the envelope is invalid, tampered, or decrypt fails.
 */
export function decryptSyncPayload<T = unknown>(
  envelopeJson: string,
  passwordHash: string
): T | null {
  if (!envelopeJson) return null;
  try {
    const envelope = JSON.parse(envelopeJson.trim());
    if (!envelope.salt || !envelope.iv || !envelope.ciphertext || !envelope.hmac) {
      return null;
    }

    const sessionKeyHex = syncSessionKey(passwordHash);
    const { encKey, hmacKey } = deriveSyncKeys(sessionKeyHex, envelope.salt);
    const computedHmac = HmacSHA256(envelope.iv + envelope.ciphertext, hmacKey).toString(Hex);

    if (!constantTimeEquals(computedHmac, envelope.hmac)) return null;

    const decrypted = AES.decrypt(
      CipherParams.create({ ciphertext: Hex.parse(envelope.ciphertext) }),
      encKey,
      { iv: Hex.parse(envelope.iv), mode: CBC, padding: Pkcs7 }
    );

    return JSON.parse(decrypted.toString(Utf8)) as T;
  } catch {
    return null;
  }
}

/**
 * Encrypts a payload and returns the envelope as a structured object
 * (equivalent to parsing {@link encryptSyncPayload}).
 *
 * @param payload - Value to encrypt.
 * @param passwordHash - Hex password hash.
 * @returns Envelope fields: `salt`, `iv`, `ciphertext`, `hmac` (all hex strings).
 */
export function encryptPayload(
  payload: unknown,
  passwordHash: string
): {
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
} {
  return JSON.parse(encryptSyncPayload(payload, passwordHash));
}

/**
 * Decrypts a structured sync envelope.
 *
 * @typeParam T - Expected plaintext type after JSON parse.
 * @param envelope - Envelope object with hex `salt`, `iv`, `ciphertext`, and `hmac`.
 * @param passwordHash - Hex password hash used at encryption time.
 * @returns Parsed plaintext, or `null` on failure.
 */
export function decryptPayload<T = unknown>(
  envelope: {
    salt?: string;
    iv?: string;
    ciphertext: string;
    hmac?: string;
    v?: number;
    nonce?: string;
  },
  passwordHash: string
): T | null {
  if (isAeadWireEnvelope(envelope)) return decryptWireAead<T>(envelope, passwordHash);
  return decryptSyncPayload<T>(JSON.stringify(envelope), passwordHash);
}
