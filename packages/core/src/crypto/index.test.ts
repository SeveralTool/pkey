import { describe, it, expect, afterEach } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import {
  encryptSyncPayload,
  decryptSyncPayload,
  deriveAuthHash,
  hmacSha256,
  pbkdf2Hex,
  setPbkdf2Provider,
  seedPbkdf2Cache,
  clearPbkdf2Cache,
} from './index';
import { computeChallengeResponse } from '../sync/auth-client';

describe('crypto', () => {
  it('round-trips sync payload', () => {
    const hash = deriveAuthHash('test-pass', 'testsalt12345678');
    const payload = { upserts: [], deletions: [], tombstones: [] };
    const enc = encryptSyncPayload(payload, hash);
    const dec = decryptSyncPayload(enc, hash);
    expect(dec).toEqual(payload);
  });

  it('computes challenge response', () => {
    const hash = deriveAuthHash('pw', 'salt1234567890123');
    const challenge = 'abc123';
    expect(computeChallengeResponse(challenge, hash)).toBe(hmacSha256(hash, challenge));
  });
});

describe('pbkdf2 provider', () => {
  afterEach(() => {
    setPbkdf2Provider(null);
    clearPbkdf2Cache();
  });

  it('crypto-es fallback matches the PBKDF2-HMAC-SHA256 known-answer vector', () => {
    // P="password", S="salt", c=1, dkLen=32 — same vector used by the app's
    // native-provider self-test (src/bootstrap/nativePbkdf2.ts).
    expect(pbkdf2Hex('password', 'salt', 1, 32)).toBe(
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'
    );
  });

  it('crypto-es fallback is byte-identical to node:crypto pbkdf2Sync', () => {
    const password = 'contraseña-ñ-漢字';
    const salt = 'aabbccddeeff00112233445566778899';
    const nodeHex = pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
    expect(pbkdf2Hex(password, salt, 1000, 32)).toBe(nodeHex);
  });

  it('installed provider is used and removable', () => {
    let calls = 0;
    setPbkdf2Provider((password, salt, iterations, keyLengthBytes) => {
      calls++;
      return pbkdf2Sync(password, salt, iterations, keyLengthBytes, 'sha256').toString('hex');
    });

    clearPbkdf2Cache();
    const viaProvider = deriveAuthHash('provider-pass', 'providersalt1234');
    expect(calls).toBe(1);

    setPbkdf2Provider(null);
    clearPbkdf2Cache();
    const viaFallback = deriveAuthHash('provider-pass', 'providersalt1234');

    // Provider (node) and fallback (crypto-es) must produce the same bytes.
    expect(viaProvider).toBe(viaFallback);
  });

  it('seedPbkdf2Cache skips derivation for the seeded pair', () => {
    let calls = 0;
    setPbkdf2Provider(() => {
      calls++;
      return 'ab'.repeat(32);
    });

    seedPbkdf2Cache('seeded-pass', 'seededsalt123456', 'cd'.repeat(32));
    expect(deriveAuthHash('seeded-pass', 'seededsalt123456')).toBe('cd'.repeat(32));
    expect(calls).toBe(0);
  });
});
