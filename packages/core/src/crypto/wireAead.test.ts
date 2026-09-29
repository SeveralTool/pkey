import { describe, it, expect } from 'vitest';
import { encryptWireAead, decryptWireAead, isAeadWireEnvelope } from './wireAead';

describe('sync wire AEAD', () => {
  const key = 'ab'.repeat(32);

  it('round-trips JSON and rejects a tampered nonce', () => {
    const env = encryptWireAead({ token: 't', n: 1 }, key);
    expect(isAeadWireEnvelope(env)).toBe(true);
    expect(decryptWireAead(env, key)).toEqual({ token: 't', n: 1 });
    expect(decryptWireAead({ ...env, nonce: '11'.repeat(24) }, key)).toBeNull();
    expect(decryptWireAead(env, 'cd'.repeat(32))).toBeNull();
  });
});
