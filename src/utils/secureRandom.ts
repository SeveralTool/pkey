/**
 * @fileoverview Cryptographically secure random utilities backed by the OS CSPRNG.
 */
import * as Crypto from 'expo-crypto';

const MAX_UINT32 = 0x1_0000_0000;

/**
 * Returns a uniform random integer in [0, max) without modulo bias.
 */
export const getSecureRandomInt = (max: number): number => {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError('max must be a positive integer');
  }

  if (max === 1) return 0;

  const limit = MAX_UINT32 - (MAX_UINT32 % max);

  while (true) {
    const bytes = Crypto.getRandomBytes(4);
    const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;

    if (value < limit) {
      return value % max;
    }
  }
};

/** Picks one character from `pool` using the OS CSPRNG. */
export const pickSecureRandomChar = (pool: string): string => {
  return pool.charAt(getSecureRandomInt(pool.length));
};

/** Fisher–Yates shuffle using cryptographically secure indices. */
export const secureShuffle = <T>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const SECURE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a URL-safe internal identifier using CSPRNG bytes.
 */
export const generateSecureId = (length = 12): string => {
  let id = '';
  for (let i = 0; i < length; i++) {
    id += SECURE_ID_ALPHABET.charAt(getSecureRandomInt(SECURE_ID_ALPHABET.length));
  }
  return id;
};

/**
 * Generates a hex-encoded random string of the given byte length using CSPRNG.
 */
export const getSecureRandomHex = (bytes = 16): string => {
  const arr = Crypto.getRandomBytes(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
