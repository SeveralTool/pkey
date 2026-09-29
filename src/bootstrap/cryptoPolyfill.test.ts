/**
 * @fileoverview Shared crypto polyfill must leave a working CSPRNG on globalThis.
 */
import '../bootstrap/cryptoPolyfill';

describe('cryptoPolyfill', () => {
  it('exposes crypto.getRandomValues after import', () => {
    expect(typeof globalThis.crypto?.getRandomValues).toBe('function');
    const buf = new Uint8Array(16);
    const filled = globalThis.crypto.getRandomValues(buf);
    expect(filled).toBe(buf);
    expect(buf.length).toBe(16);
  });
});
