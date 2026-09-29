import { describe, expect, it } from 'vitest';
import {
  generateUnlockKeypair,
  computeUnlockSas,
  wrapUnlockGrant,
  unwrapUnlockGrant,
  parseUnlockRequest,
  parseUnlockOffer,
  parseUnlockGrant,
} from './unlockChannel';

describe('unlockChannel', () => {
  it('round-trips a grant wrap between two keypairs', () => {
    const client = generateUnlockKeypair();
    const server = generateUnlockKeypair();
    const envelope = wrapUnlockGrant(server.secretKey, client.publicKeyHex, {
      passwordHash: 'aa'.repeat(32),
      salt: 'devsalt1234567890',
      authScheme: 'v3-hkdf',
    });
    expect(envelope).not.toBeNull();
    const inner = unwrapUnlockGrant(client.secretKey, server.publicKeyHex, envelope!);
    expect(inner).toEqual({
      passwordHash: 'aa'.repeat(32),
      salt: 'devsalt1234567890',
      authScheme: 'v3-hkdf',
    });
  });

  it('returns null when the peer public key is swapped (SAS would also differ)', () => {
    const client = generateUnlockKeypair();
    const server = generateUnlockKeypair();
    const attacker = generateUnlockKeypair();
    const envelope = wrapUnlockGrant(server.secretKey, client.publicKeyHex, {
      passwordHash: 'aa'.repeat(32),
      salt: 's',
      authScheme: 'v3-hkdf',
    });
    expect(unwrapUnlockGrant(client.secretKey, attacker.publicKeyHex, envelope!)).toBeNull();
  });

  it('computes the same SAS on both sides regardless of pubkey order', () => {
    const a = '11'.repeat(32);
    const b = '22'.repeat(32);
    const nonce = 'ab'.repeat(16);
    expect(computeUnlockSas(a, b, nonce)).toBe(computeUnlockSas(b, a, nonce));
    expect(computeUnlockSas(a, b, nonce)).toMatch(/^\d{6}$/);
    expect(computeUnlockSas(a, b, nonce)).not.toBe(computeUnlockSas(a, b, 'cd'.repeat(16)));
  });

  it('parses well-formed request and offer inners', () => {
    const clientPub = 'ab'.repeat(32);
    expect(
      parseUnlockRequest({
        requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        clientPub,
        nonce: 'cd'.repeat(16),
      })
    ).toEqual({
      requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      clientPub,
      nonce: 'cd'.repeat(16),
    });
    expect(parseUnlockRequest({ requestId: 'short', clientPub, nonce: 'cd'.repeat(16) })).toBeNull();
    expect(
      parseUnlockOffer({
        requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        serverPub: 'ef'.repeat(32),
      })
    ).toEqual({
      requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      serverPub: 'ef'.repeat(32),
    });
  });

  it('parseUnlockGrant rejects a missing envelope', () => {
    expect(
      parseUnlockGrant({
        requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        serverPub: 'ab'.repeat(32),
      })
    ).toBeNull();
  });
});
