import { describe, it, expect } from 'vitest';
import {
  computeChallengeResponse,
  computeServerProof,
  computeHostProof,
  generateHostProofSecret,
  isHostProofSecretHex,
  normalizeHostProofSecret,
  HOST_PROOF_SECRET_HEX_LENGTH,
} from './auth-client';
import { deriveAuthHash, hmacSha256 } from '../crypto';

describe('auth-client', () => {
  it('challenge response matches HMAC of hash and challenge', () => {
    const hash = deriveAuthHash('master', 'saltabcdefghijkl');
    const challenge = 'deadbeef';
    expect(computeChallengeResponse(challenge, hash)).toBe(hmacSha256(hash, challenge));
  });
});

describe('computeServerProof', () => {
  const hash = deriveAuthHash('master', 'saltabcdefghijkl');

  it('is deterministic per nonce and secret', () => {
    expect(computeServerProof('n1', hash)).toBe(computeServerProof('n1', hash));
    expect(computeServerProof('n1', hash)).not.toBe(computeServerProof('n2', hash));
  });

  it('changes with the secret', () => {
    const other = deriveAuthHash('other', 'saltabcdefghijkl');
    expect(computeServerProof('n1', hash)).not.toBe(computeServerProof('n1', other));
  });

  it('is domain-separated from a challenge response (not interchangeable)', () => {
    const nonce = 'deadbeef';
    expect(computeServerProof(nonce, hash)).not.toBe(computeChallengeResponse(nonce, hash));
  });

  it('empty nonce still produces a stable proof (caller must send a real nonce)', () => {
    expect(computeServerProof('', hash)).toHaveLength(64);
    expect(computeServerProof('', hash)).toBe(computeServerProof('', hash));
  });
});

describe('computeHostProof', () => {
  const secret = 'ab'.repeat(32);

  it('is deterministic per nonce and pairing secret', () => {
    expect(computeHostProof('n1', secret)).toBe(computeHostProof('n1', secret));
    expect(computeHostProof('n1', secret)).not.toBe(computeHostProof('n2', secret));
  });

  it('changes with the pairing secret', () => {
    expect(computeHostProof('n1', secret)).not.toBe(computeHostProof('n1', 'cd'.repeat(32)));
  });

  it('is domain-separated from a vault-keyed server proof and from a challenge response', () => {
    const nonce = 'deadbeef';
    expect(computeHostProof(nonce, secret)).not.toBe(computeServerProof(nonce, secret));
    expect(computeHostProof(nonce, secret)).not.toBe(computeChallengeResponse(nonce, secret));
  });
});

describe('host proof secret shape', () => {
  it('accepts a 32-byte hex string and lowercases it', () => {
    const mixed = 'AB'.repeat(32);
    expect(isHostProofSecretHex(mixed)).toBe(true);
    expect(normalizeHostProofSecret(mixed)).toBe('ab'.repeat(32));
  });

  it('rejects the wrong length or non-hex', () => {
    expect(isHostProofSecretHex('ab'.repeat(16))).toBe(false);
    expect(isHostProofSecretHex('gg'.repeat(32))).toBe(false);
    expect(normalizeHostProofSecret(123)).toBeUndefined();
  });

  it('generateHostProofSecret returns a valid secret', () => {
    const generated = generateHostProofSecret();
    expect(generated).toHaveLength(HOST_PROOF_SECRET_HEX_LENGTH);
    expect(isHostProofSecretHex(generated)).toBe(true);
  });
});
