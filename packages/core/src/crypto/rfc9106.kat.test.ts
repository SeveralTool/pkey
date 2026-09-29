/**
 * RFC 9106 Appendix A.3 Argon2id known-answer test (byte-for-byte).
 *
 * Production `argon2idHex` has no secret/AD; this vector uses the low-level
 * Argon2id API with K and X so a native provider cannot silently drift.
 */
import { describe, it, expect } from 'vitest';
import { argon2id } from '@noble/hashes/argon2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { envelopeV4AadUtf8 } from './envelopeV4';
import { hkdfExpand, HKDF_INFO_AUTH_VERIFY } from './index';
import {
  ARGON2ID_PROD_PROBE,
  HKDF_AUTH_KAT,
  RFC9106_ARGON2ID_EXPECTED,
  XCHACHA_KAT_AAD,
  XCHACHA_KAT_CIPHERTEXT,
  XCHACHA_KAT_KEY,
  XCHACHA_KAT_NONCE,
  XCHACHA_KAT_PLAINTEXT,
} from './nativeKat';

describe('RFC 9106 Argon2id KAT', () => {
  it('matches Appendix A.3 (t=3, m=32 KiB, p=4, tag=32, secret+AD)', () => {
    const password = new Uint8Array(32).fill(0x01);
    const salt = new Uint8Array(16).fill(0x02);
    const key = new Uint8Array(8).fill(0x03);
    const personalization = new Uint8Array(12).fill(0x04);
    const out = argon2id(password, salt, {
      t: 3,
      m: 32,
      p: 4,
      dkLen: 32,
      version: 0x13,
      key,
      personalization,
    });
    expect(bytesToHex(out)).toBe(RFC9106_ARGON2ID_EXPECTED);
  });

  it('stays stable for the production-shaped (no secret/AD) probe used by native self-test', () => {
    const out = argon2id(utf8ToBytes('password'), new Uint8Array(16).fill(0x02), {
      t: 3,
      m: 32,
      p: 1,
      dkLen: 32,
    });
    expect(bytesToHex(out)).toBe(ARGON2ID_PROD_PROBE);
  });
});

describe('XChaCha20-Poly1305 companion vector (native must match noble)', () => {
  it('matches the Android selfTestKat ciphertext', () => {
    const key = hexToBytes(XCHACHA_KAT_KEY);
    const nonce = hexToBytes(XCHACHA_KAT_NONCE);
    const aad = utf8ToBytes(XCHACHA_KAT_AAD);
    const ct = xchacha20poly1305(key, nonce, aad).encrypt(utf8ToBytes(XCHACHA_KAT_PLAINTEXT));
    expect(bytesToHex(ct)).toBe(XCHACHA_KAT_CIPHERTEXT);
  });
});

describe('HKDF-Expand companion vector (native must match crypto-es)', () => {
  it('matches HMAC-SHA256(PRK, info || 0x01) for a 32-byte PRK', () => {
    expect(hkdfExpand('11'.repeat(32), HKDF_INFO_AUTH_VERIFY)).toBe(HKDF_AUTH_KAT);
  });
});

describe('envelope v4 AAD', () => {
  it('serializes a stable JSON object for native/JS AEAD', () => {
    expect(
      envelopeV4AadUtf8({
        v: 4,
        kdf: 'argon2id',
        kdfMem: 32,
        kdfTime: 3,
        kdfPar: 1,
        kdfSalt: 'aa'.repeat(16),
        deviceBound: false,
      })
    ).toBe(
      '{"v":4,"kdf":"argon2id","kdfMem":32,"kdfTime":3,"kdfPar":1,"kdfSalt":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","deviceBound":false}'
    );
  });
});
