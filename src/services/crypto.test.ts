jest.mock('expo-crypto', () => ({
  __esModule: true,
  getRandomBytes: (n: number) => {
    const arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
}));

import { LocalCipher } from './crypto';

describe('core crypto parity', () => {
  it('deriveAuthHash is the HKDF verifier of the Argon2id root (v4)', () => {
    const { deriveAuthVerifier } = require('@pkey/core');
    const password = 'test-password-parity';
    const salt = 'aabbccddeeff00112233445566778899';
    const root = LocalCipher.deriveRootKey(password, salt);
    expect(LocalCipher.deriveAuthHash(password, salt)).toBe(deriveAuthVerifier(root));
  });

  it('classifyFromRootKey matches a v4 verifier without deriving', () => {
    const password = 'test-password-parity';
    const salt = 'aabbccddeeff00112233445566778899';
    const root = LocalCipher.deriveRootKey(password, salt);
    const hash = LocalCipher.deriveAuthHash(password, salt);
    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    expect(LocalCipher.classifyFromRootKey(root, hash)).toBe('v4');
    expect(deriveSpy).not.toHaveBeenCalled();
    deriveSpy.mockRestore();
  });
});

describe('v4 envelope (current)', () => {
  const password = 'mi-clave-segura';
  const dbSalt = 'aabbccddeeff00112233445566778899';
  const plaintext = JSON.stringify({ cards: [{ id: '1', title: 'tarjeta ñ 漢字' }], salt: dbSalt });

  it('round-trips with stable kdfSalt and produces v4 format', () => {
    const env = LocalCipher.encrypt(plaintext, password, dbSalt);
    const parsed = JSON.parse(env);
    expect(parsed.v).toBe(4);
    expect(parsed.kdf).toBe('argon2id');
    expect(parsed.kdfSalt).toBe(dbSalt);
    expect(LocalCipher.decrypt(env, password)).toBe(plaintext);
  });

  it('rejects wrong password', () => {
    const env = LocalCipher.encrypt(plaintext, password, dbSalt);
    expect(LocalCipher.decrypt(env, 'wrong-password')).toBe('');
  });

  it('rejects tampered ciphertext', () => {
    const env = JSON.parse(LocalCipher.encrypt(plaintext, password, dbSalt));
    env.ciphertext = env.ciphertext.slice(0, -2) + (env.ciphertext.endsWith('00') ? '11' : '00');
    expect(LocalCipher.decrypt(JSON.stringify(env), password)).toBe('');
  });

  it('still decrypts v1 envelopes (migration path)', () => {
    const { WordArray, Hex, AES, CBC, Pkcs7, HmacSHA256 } = require('crypto-es');
    const salt = WordArray.random(16);
    const iv = WordArray.random(16);
    const { encKey, hmacKey } = LocalCipher.deriveKeys(password, salt);
    const encrypted = AES.encrypt(plaintext, encKey, { iv, mode: CBC, padding: Pkcs7 });
    const ciphertextHex = encrypted.ciphertext.toString(Hex);
    const ivHex = iv.toString(Hex);
    const hmac = HmacSHA256(ivHex + ciphertextHex, hmacKey).toString(Hex);
    const v1 = JSON.stringify({
      salt: salt.toString(Hex),
      iv: ivHex,
      ciphertext: ciphertextHex,
      hmac,
    });

    expect(LocalCipher.isLegacyEnvelope(v1)).toBe(true);
    expect(LocalCipher.decrypt(v1, password)).toBe(plaintext);

    const v4 = LocalCipher.encrypt(plaintext, password, dbSalt);
    expect(LocalCipher.isLegacyEnvelope(v4)).toBe(false);
  });

  it('still decrypts v2 envelopes (audit-C5 migration path)', () => {
    const { WordArray, Hex, AES, CBC, Pkcs7, HmacSHA256 } = require('crypto-es');
    const { deriveAuthHash: coreDeriveAuthHash } = require('@pkey/core');
    const rootLegacy = coreDeriveAuthHash(password, dbSalt, 100_000);
    const subSalt = WordArray.random(16).toString(Hex);
    const iv = WordArray.random(16);
    const { encKey, hmacKey } = LocalCipher.deriveSyncKeys(rootLegacy, subSalt);
    const encrypted = AES.encrypt(plaintext, encKey, { iv, mode: CBC, padding: Pkcs7 });
    const ivHex = iv.toString(Hex);
    const ciphertextHex = encrypted.ciphertext.toString(Hex);
    const hmac = HmacSHA256(ivHex + ciphertextHex, hmacKey).toString(Hex);
    const v2 = JSON.stringify({
      v: 2,
      kdfSalt: dbSalt,
      salt: subSalt,
      iv: ivHex,
      ciphertext: ciphertextHex,
      hmac,
    });

    expect(LocalCipher.isLegacyEnvelope(v2)).toBe(true);
    expect(LocalCipher.decrypt(v2, password)).toBe(plaintext);
  });
});

describe('fast unlock (cached root key)', () => {
  const password = 'mi-clave-segura';
  const dbSalt = 'aabbccddeeff00112233445566778899';
  const plaintext = JSON.stringify({
    version: '1.0.0',
    passwordHash: '',
    salt: dbSalt,
    cards: [],
  });

  it('decryptWithCachedRoot round-trips without deriveRootKey', () => {
    const rootKeyHex = LocalCipher.deriveRootKey(password, dbSalt);
    const env = LocalCipher.encrypt(plaintext, password, dbSalt);

    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    const decrypted = LocalCipher.decryptWithCachedRoot(env, rootKeyHex);

    expect(decrypted).toBe(plaintext);
    expect(deriveSpy).not.toHaveBeenCalled();
    deriveSpy.mockRestore();
  });

  it('decryptWithCachedRoot rejects v1 envelopes (must go through decrypt())', () => {
    const rootKeyHex = LocalCipher.deriveRootKey(password, dbSalt);
    const v1 = JSON.stringify({
      salt: 'aabbccddeeff00112233445566778899',
      iv: '00112233445566778899001122334455',
      ciphertext: 'deadbeef',
      hmac: 'deadbeef',
    });
    expect(LocalCipher.decryptWithCachedRoot(v1, rootKeyHex)).toBe('');
  });

  it('decryptWithCachedRoot rejects wrong root key', () => {
    const env = LocalCipher.encrypt(plaintext, password, dbSalt);
    const wrongRoot = '0'.repeat(64);
    expect(LocalCipher.decryptWithCachedRoot(env, wrongRoot)).toBe('');
  });
});
