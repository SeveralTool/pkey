import { describe, it, expect } from 'vitest';
import {
  argon2idHex,
  encryptVaultV4,
  decryptVaultV4,
  ARGON2_MEMORY_KIB,
} from './envelopeV4';
import { hkdfExpand } from './index';

describe('envelope v4', () => {
  it('round-trips Argon2id + XChaCha20-Poly1305 with AAD', () => {
    const salt = '11'.repeat(16);
    const root = argon2idHex('correct horse battery', salt);
    const env = encryptVaultV4('{"cards":[]}', root, salt);
    expect(JSON.parse(env).v).toBe(4);
    expect(decryptVaultV4(env, root)).toBe('{"cards":[]}');
    expect(decryptVaultV4(env, argon2idHex('wrong', salt))).toBeNull();
  });

  it('uses reduced memory in tests', () => {
    expect(ARGON2_MEMORY_KIB).toBe(32);
  });
});

describe('hkdfExpand (L1)', () => {
  it('throws when lengthBytes > 32', () => {
    expect(() => hkdfExpand('ab'.repeat(32), 'info', 33)).toThrow(/lengthBytes/);
  });
});
