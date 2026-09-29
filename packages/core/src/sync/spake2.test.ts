import { describe, it, expect } from 'vitest';
import { spake2Start, spake2Finish, spake2Confirm } from './spake2';
import { buildSyncAuthProof, computeChallengeResponse } from './auth-client';

describe('SPAKE2 (protocol v3)', () => {
  it('agrees on a shared secret and confirmation', () => {
    const pw = 'a'.repeat(64);
    const a = spake2Start(pw, 'A');
    const b = spake2Start(pw, 'B');
    const sharedA = spake2Finish(pw, a, b.shareHex, 'A');
    const sharedB = spake2Finish(pw, b, a.shareHex, 'B');
    expect(sharedA).toBe(sharedB);
    expect(spake2Confirm(sharedA, 'challenge')).toBe(spake2Confirm(sharedB, 'challenge'));
    expect(spake2Finish('b'.repeat(64), a, b.shareHex, 'A')).not.toBe(sharedA);
  });
});

describe('buildSyncAuthProof', () => {
  const pw = 'c'.repeat(64);
  const challenge = 'nonce';

  it('falls back to HMAC when the master did not send a share', () => {
    const proof = buildSyncAuthProof(pw, challenge);
    expect(proof.spakeShare).toBeUndefined();
    expect(proof.response).toBe(computeChallengeResponse(challenge, pw));
  });

  it('completes SPAKE2 when the master sent a share', () => {
    const master = spake2Start(pw, 'A');
    const proof = buildSyncAuthProof(pw, challenge, master.shareHex);
    expect(proof.spakeShare).toBeTruthy();
    const shared = spake2Finish(pw, master, proof.spakeShare!, 'A');
    expect(proof.response).toBe(spake2Confirm(shared, challenge));
    expect(proof.response).not.toBe(computeChallengeResponse(challenge, pw));
  });
});
