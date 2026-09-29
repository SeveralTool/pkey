/**
 * @fileoverview CSPRNG helpers reject bad bounds and stay uniform-range safe.
 */

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) arr[i] = i + 1;
    return arr;
  },
}));

import { getSecureRandomHex, getSecureRandomInt, generateSecureId } from './secureRandom';

describe('secureRandom', () => {
  it('rejects a non-positive max', () => {
    expect(() => getSecureRandomInt(0)).toThrow(RangeError);
    expect(() => getSecureRandomInt(-1)).toThrow(RangeError);
  });

  it('returns 0 when the range is a single value', () => {
    expect(getSecureRandomInt(1)).toBe(0);
  });

  it('encodes CSPRNG bytes as hex', () => {
    expect(getSecureRandomHex(2)).toBe('0102');
  });

  it('generateSecureId has the requested length from the url-safe alphabet', () => {
    const id = generateSecureId(16);
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});
