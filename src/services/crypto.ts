// NOTE: crypto-es export names are `Pkcs7` and `Utf8` (NOT `PKCS7`/`UTF8`).
// Importing the wrong casing silently yields `undefined`, which corrupts the
// cipher config (broken padding) and makes toString() default to Hex.
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
  CipherParams,
} from 'crypto-es';
import {
  sha256 as coreSha256,
  deriveAuthHash as coreDeriveAuthHash,
  deriveVaultEncryptionKey,
  deriveAuthVerifier,
  constantTimeEquals as coreConstantTimeEquals,
  seedPbkdf2Cache as coreSeedPbkdf2Cache,
  clearPbkdf2Cache as coreClearPbkdf2Cache,
  PBKDF2_ITERATIONS_V3,
  PBKDF2_ITERATIONS_LEGACY,
  argon2idHex,
  encryptVaultV4,
  decryptVaultV4,
  isEnvelopeV4,
  ARGON2_MEMORY_KIB,
  ARGON2_TIME_COST,
  ARGON2_PARALLELISM,
} from '@pkey/core';

/**
 * @fileoverview High-level vault crypto used by mobile disk I/O and sync.
 *
 * Envelope versions:
 *   - **v1** (retired) – per-write PBKDF2, monolithic key. Not written any
 *     more; still readable at legacy paths for one-shot migration.
 *   - **v2** – shared PBKDF2 root (100 k) reused for BOTH encryption AND
 *     the auth verifier. Weakness: leaking the stored `passwordHash`
 *     equated to leaking the encryption key. Readable for migration.
 *   - **v4** *(current)* – Argon2id (64 MiB, t=3, p=1) → XChaCha20-Poly1305
 *     with AAD over the public header. Device secret optional.
 *     info-tagged sub-keys: `pkey-vault-enc-v1` for AES + HMAC, and
 *     `pkey-auth-verify-v1` for the on-disk verifier. Audit findings C5
 *     and A4.
 *
 * Legacy XOR (pre-v1) is gated behind {@link ACCEPT_LEGACY_XOR} and defaults
 * off (audit finding A9); flipping it on is a one-shot recovery escape hatch,
 * not a supported path.
 */

/**
 * When `false`, `decrypt()` refuses to fall back to the pre-v1 XOR reader.
 * The XOR helper is retained so users with old databases can still open them
 * by setting this flag to `true` from a dev build or explicit recovery flow.
 * See audit finding A9.
 */
export const ACCEPT_LEGACY_XOR = false;

/** Current envelope version written by {@link LocalCipher.encrypt}. */
export const CURRENT_ENVELOPE_VERSION = 4;

interface EnvelopeV1 {
  v?: undefined;
  // Legacy v1 payload had no `v` field. Salt is the AES sub-key salt
  // (32-byte hex WordArray), NOT the per-vault KDF salt. PBKDF2 was run
  // directly on this salt at 100 k iterations, producing a 64-byte key
  // that was split via `deriveKeys` into enc + hmac halves. Retained for
  // one-shot read migration.
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
}

interface EnvelopeV2 {
  v: 2;
  kdfSalt: string;
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
}

interface EnvelopeV3 {
  v: 3;
  kdfSalt: string;
  kdfIter: number;
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
}

interface EnvelopeV4Json {
  v: 4;
  kdf: 'argon2id';
  kdfMem: number;
  kdfTime: number;
  kdfPar: number;
  kdfSalt: string;
  nonce: string;
  ciphertext: string;
  deviceBound?: boolean;
}

type Envelope = EnvelopeV1 | EnvelopeV2 | EnvelopeV3 | EnvelopeV4Json;

function parseEnvelope(text: string): Envelope | null {
  try {
    const parsed = JSON.parse(text) as Partial<EnvelopeV2 & EnvelopeV3 & EnvelopeV4Json> & {
      v?: unknown;
    };
    if (parsed.v === 4 && isEnvelopeV4(parsed)) {
      return parsed as EnvelopeV4Json;
    }
    if (parsed.v === 3) {
      if (
        !parsed.kdfSalt ||
        !parsed.kdfIter ||
        !parsed.salt ||
        !parsed.iv ||
        !parsed.ciphertext ||
        !parsed.hmac
      ) {
        return null;
      }
      return parsed as EnvelopeV3;
    }
    if (parsed.v === 2) {
      if (!parsed.kdfSalt || !parsed.salt || !parsed.iv || !parsed.ciphertext || !parsed.hmac) {
        return null;
      }
      return parsed as EnvelopeV2;
    }
    if (parsed.v === undefined) {
      // Possible v1 envelope: has salt/iv/ciphertext/hmac, no versioning.
      if (parsed.salt && parsed.iv && parsed.ciphertext && parsed.hmac) {
        return parsed as EnvelopeV1;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export class LocalCipher {
  /** Standard SHA-256 hash of a string, hex-encoded. */
  static sha256(message: string): string {
    return coreSha256(message);
  }

  /**
   * Derives the 256-bit PBKDF2 root key from a password + salt using the
   * current strength ({@link PBKDF2_ITERATIONS_V3}). Delegates to the
   * shared @pkey/core cache. This is the ROOT for HKDF; the vault
   * encryption key is HKDF-derived from it, NOT this value directly.
   */
  static deriveRootKey(password: string, salt: string): string {
    return argon2idHex(password, salt, {
      t: ARGON2_TIME_COST,
      m: ARGON2_MEMORY_KIB,
      p: ARGON2_PARALLELISM,
    });
  }

  /** PBKDF2 v3 root — used only when reading v3 envelopes. */
  static deriveRootKeyPbkdf2(password: string, salt: string): string {
    return coreDeriveAuthHash(password, salt, PBKDF2_ITERATIONS_V3);
  }

  /**
   * Derives the auth verifier stored on disk (as `passwordHash`) for v3
   * vaults. HKDF-separated from the encryption key so a leak of the disk
   * verifier does not expose the encryption key. See audit finding C5.
   */
  static deriveAuthHash(password: string, salt: string): string {
    const root = this.deriveRootKey(password, salt);
    return deriveAuthVerifier(root);
  }

  /**
   * Legacy v2 auth hash — PBKDF2(100 k) directly, no HKDF. Used during
   * unlock to detect a v2 vault whose stored `passwordHash` still matches
   * the pre-audit format. When the match succeeds we upgrade the DB to v3
   * on the next write.
   */
  static deriveAuthHashV2Legacy(password: string, salt: string): string {
    return coreDeriveAuthHash(password, salt, PBKDF2_ITERATIONS_LEGACY);
  }

  /**
   * Classifies a vault from an already-derived Argon2id root (no KDF).
   * Mobile unlock must use this or the envelope header — never a second derive.
   */
  static classifyFromRootKey(rootKeyHex: string, storedPasswordHash: string): 'v4' | null {
    if (coreConstantTimeEquals(deriveAuthVerifier(rootKeyHex), storedPasswordHash)) {
      return 'v4';
    }
    return null;
  }

  /**
   * Given a candidate password + salt + on-disk verifier, returns which
   * envelope generation the vault uses. Returns `null` if the password is
   * wrong. Starts with Argon2id — **do not call on the mobile unlock hot path**.
   */
  static classifyVaultForPassword(
    password: string,
    salt: string,
    storedPasswordHash: string
  ): 'v4' | 'v3' | 'v2-upgradeable' | null {
    const rootV4 = this.deriveRootKey(password, salt);
    if (coreConstantTimeEquals(deriveAuthVerifier(rootV4), storedPasswordHash)) {
      return 'v4';
    }
    const rootV3 = coreDeriveAuthHash(password, salt, PBKDF2_ITERATIONS_V3);
    if (coreConstantTimeEquals(deriveAuthVerifier(rootV3), storedPasswordHash)) {
      return 'v3';
    }
    const legacyHash = coreDeriveAuthHash(password, salt, PBKDF2_ITERATIONS_LEGACY);
    if (coreConstantTimeEquals(legacyHash, storedPasswordHash)) {
      return 'v2-upgradeable';
    }
    return null;
  }

  /**
   * Seeds the shared derivation cache so the next
   * {@link deriveRootKey}/{@link deriveAuthHash} call for the same
   * (password, salt) pair skips PBKDF2. Used after a fast biometric
   * unlock loads a persisted root key from SecureStore.
   */
  static seedRootKeyCache(password: string, salt: string, rootKeyHex: string): void {
    coreSeedPbkdf2Cache(password, salt, rootKeyHex, PBKDF2_ITERATIONS_V3);
  }

  /** Clears the shared in-memory PBKDF2 / root-key cache (logout). */
  static clearPbkdf2Cache(): void {
    coreClearPbkdf2Cache();
  }

  /**
   * Decrypts a v2/v3 envelope using a pre-derived root key (no PBKDF2).
   * Returns empty string on any failure so callers can treat it as
   * "wrong key / unknown format" without leaking the failure mode.
   */
  static decryptWithCachedRoot(cipherText: string, rootKeyHex: string): string {
    if (!cipherText) return '';
    const trimmed = cipherText.trim();
    if (!trimmed.startsWith('{')) return '';

    const env = parseEnvelope(trimmed);
    if (!env) return '';
    if (env.v === 4) return decryptVaultV4(trimmed, rootKeyHex) ?? '';
    if (env.v !== 2 && env.v !== 3) return '';
    return this.decryptEnvelopeWithRoot(env, rootKeyHex);
  }

  /** Constant-time string comparison for password/credential checks. */
  static secureCompare(a: string, b: string): boolean {
    return this.constantTimeEquals(a, b);
  }

  /**
   * Verifies a password against a stored `passwordHash`. Accepts BOTH v3
   * (HKDF verifier) and legacy v2 (PBKDF2 100 k) forms, so an app freshly
   * upgraded to the v3 crypto can still open a pre-existing vault.
   */
  static verifyPasswordHash(password: string, storedHash: string, salt?: string): boolean {
    if (!salt) {
      return this.constantTimeEquals(this.sha256(password), storedHash);
    }
    return this.classifyVaultForPassword(password, salt, storedHash) !== null;
  }

  /**
   * v1-envelope legacy key derivation — kept for one-shot migration reads.
   * Not called by the v3 path.
   */
  static deriveKeys(password: string, salt: WordArray) {
    const derived = PBKDF2(password, salt, {
      keySize: 512 / 32,
      iterations: PBKDF2_ITERATIONS_LEGACY,
      hasher: SHA256Algo,
    });
    const encKey = WordArray.create(derived.words.slice(0, 8));
    const hmacKey = WordArray.create(derived.words.slice(8, 16));
    return { encKey, hmacKey };
  }

  /**
   * Fast HMAC-based sub-key derivation used by sync payloads AND by v2
   * envelope decryption. For NEW v3 envelopes the sub-keys come from the
   * HKDF-separated `deriveVaultEncryptionKey` output, then further split
   * by this same helper so per-write random salts still rotate.
   */
  static deriveSyncKeys(sessionKeyHex: string, saltHex: string) {
    const sessionKey = Hex.parse(sessionKeyHex);
    const encKey = HmacSHA256(saltHex + 'AES', sessionKey);
    const hmacKey = HmacSHA256(saltHex + 'HMAC', sessionKey);
    return { encKey, hmacKey };
  }

  /**
   * Encrypts a sync payload (transient, per-request) using AES-CBC + HMAC.
   * Unchanged across the v3 disk-envelope migration — sync sessions
   * negotiate their own session key.
   */
  static encryptSync(plainText: string, sessionKeyHex: string): string {
    const salt = WordArray.random(16);
    const iv = WordArray.random(16);
    const saltHex = salt.toString(Hex);

    const { encKey, hmacKey } = this.deriveSyncKeys(sessionKeyHex, saltHex);

    const encrypted = AES.encrypt(plainText, encKey, {
      iv,
      mode: CBC,
      padding: Pkcs7,
    });

    const ciphertextHex = encrypted.ciphertext!.toString(Hex);
    const ivHex = iv.toString(Hex);
    const hmac = HmacSHA256(ivHex + ciphertextHex, hmacKey).toString(Hex);

    return JSON.stringify({
      salt: saltHex,
      iv: ivHex,
      ciphertext: ciphertextHex,
      hmac,
    });
  }

  static decryptSync(envelopeJson: string, sessionKeyHex: string): string {
    if (!envelopeJson) return '';
    const trimmed = envelopeJson.trim();
    try {
      const envelope = JSON.parse(trimmed);
      if (!envelope.salt || !envelope.iv || !envelope.ciphertext || !envelope.hmac) {
        return '';
      }

      const iv = Hex.parse(envelope.iv);
      const ciphertext = Hex.parse(envelope.ciphertext);

      const { encKey, hmacKey } = this.deriveSyncKeys(sessionKeyHex, envelope.salt);
      const computedHmac = HmacSHA256(envelope.iv + envelope.ciphertext, hmacKey).toString(Hex);

      if (!this.constantTimeEquals(computedHmac, envelope.hmac)) {
        console.warn('[LocalCipher] Sync decryption failed: HMAC mismatch (tampering detected)');
        return '';
      }

      const cipherParams = CipherParams.create({ ciphertext });
      const decrypted = AES.decrypt(cipherParams, encKey, {
        iv,
        mode: CBC,
        padding: Pkcs7,
      });

      return decrypted.toString(Utf8);
    } catch (e) {
      console.error('[LocalCipher] Sync decryption failed:', e);
      return '';
    }
  }

  /**
   * Encrypts a plaintext string using the current envelope format (v3).
   *
   * @param plainText - Plaintext to encrypt.
   * @param key - Master password (plaintext).
   * @param kdfSaltHex - Stable per-vault salt for the root derivation.
   */
  static encrypt(plainText: string, key: string, kdfSaltHex?: string): string {
    const kdfSalt =
      kdfSaltHex && kdfSaltHex.length > 0 ? kdfSaltHex : WordArray.random(16).toString(Hex);
    const rootKey = this.deriveRootKey(key, kdfSalt);
    return this.encryptWithCachedRoot(plainText, rootKey, kdfSalt);
  }

  /**
   * Encrypts using a pre-derived PBKDF2 root key. Writes a v3 envelope with
   * HKDF-derived encryption sub-key.
   */
  static encryptWithCachedRoot(
    plainText: string,
    rootKeyHex: string,
    kdfSaltHex: string,
    opts?: { deviceBound?: boolean }
  ): string {
    return encryptVaultV4(plainText, rootKeyHex, kdfSaltHex, {
      t: ARGON2_TIME_COST,
      m: ARGON2_MEMORY_KIB,
      p: ARGON2_PARALLELISM,
      deviceBound: opts?.deviceBound === true,
    });
  }

  /**
   * Returns `true` when the stored payload is not yet a v3 envelope and
   * should be rewritten on the next save (transparent upgrade).
   */
  static isLegacyEnvelope(payload: string): boolean {
    if (!payload) return false;
    const trimmed = payload.trim();
    if (!trimmed.startsWith('{')) return true;
    try {
      return JSON.parse(trimmed).v !== CURRENT_ENVELOPE_VERSION;
    } catch {
      return true;
    }
  }

  /**
   * Decrypts an encrypted payload. Accepts v2 and v3 envelopes natively.
   *
   * Pre-v1 XOR is only attempted when {@link ACCEPT_LEGACY_XOR} is true —
   * default is `false` after audit finding A9. Users who need to recover
   * an ancient vault must flip the flag from a dev build.
   */
  static decrypt(cipherText: string, key: string): string {
    if (!cipherText) return '';
    const trimmed = cipherText.trim();

    if (!trimmed.startsWith('{')) {
      if (!ACCEPT_LEGACY_XOR) {
        console.warn(
          '[LocalCipher] Refused to decrypt legacy XOR envelope (ACCEPT_LEGACY_XOR=false). ' +
            'Enable the flag in services/crypto.ts to recover pre-v1 vaults.'
        );
        return '';
      }
      console.info('[LocalCipher] Reading legacy XOR envelope (recovery mode).');
      return this.decryptLegacyXor(cipherText, key);
    }

    const env = parseEnvelope(trimmed);
    if (!env) return '';

    if (env.v === 4) {
      const rootKey = argon2idHex(key, env.kdfSalt, {
        t: env.kdfTime,
        m: env.kdfMem,
        p: env.kdfPar,
      });
      return decryptVaultV4(trimmed, rootKey) ?? '';
    }

    if (env.v === 3) {
      const rootKey = coreDeriveAuthHash(key, env.kdfSalt, env.kdfIter);
      return this.decryptEnvelopeWithRoot(env, rootKey);
    }

    if (env.v === 2) {
      // v2: derive with legacy iteration count, then decrypt using the
      // legacy scheme where the PBKDF2 output was used directly (no HKDF).
      const rootKeyLegacy = coreDeriveAuthHash(key, env.kdfSalt, PBKDF2_ITERATIONS_LEGACY);
      return this.decryptV2WithRoot(env, rootKeyLegacy);
    }

    // v1 (no `v` field): PBKDF2(pass, env.salt, 100 k, 64 B) split into
    // enc+hmac via deriveKeys. Retained purely as a migration read path
    // so users with pre-v2 vaults can be upgraded on next write.
    return this.decryptV1(env, key);
  }

  private static decryptV1(env: EnvelopeV1, key: string): string {
    try {
      const salt = Hex.parse(env.salt);
      const iv = Hex.parse(env.iv);
      const ciphertext = Hex.parse(env.ciphertext);
      const { encKey, hmacKey } = this.deriveKeys(key, salt);

      const computedHmac = HmacSHA256(env.iv + env.ciphertext, hmacKey).toString(Hex);
      if (!this.constantTimeEquals(computedHmac, env.hmac)) {
        console.warn('[LocalCipher] v1 decryption failed: HMAC mismatch (wrong key)');
        return '';
      }
      const cipherParams = CipherParams.create({ ciphertext });
      const decrypted = AES.decrypt(cipherParams, encKey, {
        iv,
        mode: CBC,
        padding: Pkcs7,
      });
      return decrypted.toString(Utf8);
    } catch (e) {
      console.error('[LocalCipher] v1 decryption failed:', e);
      return '';
    }
  }

  /**
   * Decrypts a v3 envelope with an already-derived PBKDF2 root key.
   * Applies HKDF to derive the encryption sub-key, then verifies HMAC in
   * constant time before running AES decrypt.
   */
  private static decryptEnvelopeWithRoot(env: EnvelopeV2 | EnvelopeV3, rootKeyHex: string): string {
    if (env.v === 3) {
      const encRoot = deriveVaultEncryptionKey(rootKeyHex);
      return this.decryptCbcHmac(env, encRoot);
    }
    return this.decryptV2WithRoot(env, rootKeyHex);
  }

  private static decryptV2WithRoot(env: EnvelopeV2, rootKeyHex: string): string {
    return this.decryptCbcHmac(env, rootKeyHex);
  }

  private static decryptCbcHmac(env: EnvelopeV2 | EnvelopeV3, subKeyRootHex: string): string {
    try {
      const { encKey, hmacKey } = this.deriveSyncKeys(subKeyRootHex, env.salt);

      const hmacInput = env.iv + env.ciphertext;
      const computedHmac = HmacSHA256(hmacInput, hmacKey).toString(Hex);
      if (!this.constantTimeEquals(computedHmac, env.hmac)) {
        console.warn('[LocalCipher] Decryption failed: HMAC mismatch (tampering or wrong key)');
        return '';
      }

      const cipherParams = CipherParams.create({ ciphertext: Hex.parse(env.ciphertext) });
      const decrypted = AES.decrypt(cipherParams, encKey, {
        iv: Hex.parse(env.iv),
        mode: CBC,
        padding: Pkcs7,
      });
      return decrypted.toString(Utf8);
    } catch (e) {
      console.error('[LocalCipher] Decryption failed:', e);
      return '';
    }
  }

  /**
   * Pre-v1 XOR helper. Gated behind {@link ACCEPT_LEGACY_XOR}; NOT
   * exercised on default builds.
   */
  private static decryptLegacyXor(cipherTextBase64: string, key: string): string {
    const stretchedKey = this.sha256(key + '_saltPKEY_stretch_9921');
    let rawCipher = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { atob } = require('../utils');
      rawCipher = atob(cipherTextBase64);
    } catch {
      return '';
    }
    let result = '';
    for (let i = 0; i < rawCipher.length; i++) {
      const charCode = rawCipher.charCodeAt(i);
      const keyIndex = i % stretchedKey.length;
      const keyCode = stretchedKey.charCodeAt(keyIndex);
      const prevFeedback = i > 0 ? rawCipher.charCodeAt(i - 1) % 127 : 19;
      const enc = charCode ^ keyCode ^ prevFeedback;
      result += String.fromCharCode(enc);
    }
    try {
      return decodeURIComponent(escape(result));
    } catch {
      return result;
    }
  }

  /** Constant-time string comparison. */
  private static constantTimeEquals(a: string, b: string): boolean {
    return coreConstantTimeEquals(a, b);
  }
}
