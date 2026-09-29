import { describe, it, expect } from 'vitest';
import { computeHostProof } from '@pkey/core';
import { verifyMasterProof } from './masterProof';

const SALT = 'saltabcdefghijkl';
const SECRET = 'ab'.repeat(32);
const NONCE = 'a1b2c3d4';

const base = {
  clientNonce: NONCE,
  serverProof: computeHostProof(NONCE, SECRET),
  salt: SALT,
  pinnedSalt: SALT,
  hostProofSecret: SECRET,
};

describe('verifyMasterProof', () => {
  it('accepts a proof computed with the known pairing secret', () => {
    expect(verifyMasterProof(base)).toBe(true);
  });

  it('rejects a proof for a different nonce (replay)', () => {
    expect(verifyMasterProof({ ...base, serverProof: computeHostProof('other', SECRET) })).toBe(
      false
    );
  });

  it('rejects a proof computed with a different pairing secret', () => {
    const impostor = 'cd'.repeat(32);
    expect(verifyMasterProof({ ...base, serverProof: computeHostProof(NONCE, impostor) })).toBe(
      false
    );
  });

  it('rejects a salt that does not match the pinned one (chosen-salt attack)', () => {
    expect(verifyMasterProof({ ...base, salt: 'someotherslt1234' })).toBe(false);
  });

  it('still verifies the proof when no salt was pinned yet', () => {
    expect(verifyMasterProof({ ...base, pinnedSalt: '', salt: 'anything' })).toBe(true);
  });

  it('fails closed on a missing proof or nonce', () => {
    expect(verifyMasterProof({ ...base, serverProof: undefined })).toBe(false);
    expect(verifyMasterProof({ ...base, serverProof: '' })).toBe(false);
    expect(verifyMasterProof({ ...base, serverProof: 123 })).toBe(false);
    expect(verifyMasterProof({ ...base, clientNonce: '' })).toBe(false);
  });

  it('fails closed when there is no pairing secret to verify with', () => {
    expect(verifyMasterProof({ ...base, hostProofSecret: '' })).toBe(false);
    expect(verifyMasterProof({ ...base, hostProofSecret: 'short' })).toBe(false);
  });
});
