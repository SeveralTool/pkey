/**
 * @fileoverview In-memory session root key — never persisted.
 */
import { clearSessionRootKey, getSessionRootKey, hasSessionKeyMaterial, setSessionRootKey } from './sessionKey';

describe('sessionKey', () => {
  afterEach(() => {
    clearSessionRootKey();
  });

  it('returns null when locked', () => {
    expect(getSessionRootKey()).toBeNull();
  });

  it('round-trips the derived root key and KDF salt', () => {
    setSessionRootKey('aa'.repeat(32), 'bb'.repeat(16));
    expect(getSessionRootKey()).toEqual({
      rootKeyHex: 'aa'.repeat(32),
      kdfSalt: 'bb'.repeat(16),
    });
  });

  it('clears on logout', () => {
    setSessionRootKey('aa'.repeat(32), 'bb'.repeat(16));
    clearSessionRootKey();
    expect(getSessionRootKey()).toBeNull();
  });

  it('does not treat a partial pair as unlocked', () => {
    setSessionRootKey('root', '');
    expect(getSessionRootKey()).toBeNull();
    expect(hasSessionKeyMaterial()).toBe(false);
  });

  it('reports key material when a hex session is live', () => {
    setSessionRootKey('aa'.repeat(32), 'bb'.repeat(16));
    expect(hasSessionKeyMaterial()).toBe(true);
  });
});
