/**
 * @fileoverview CSPRNG helpers for passwords, shuffles, and ephemeral ids.
 */

const MAX_UINT32 = 0x1_0000_0000;

function getRandomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr);
    return arr;
  }
  throw new Error('CSPRNG unavailable');
}

/**
 * Uniform random integer in `[0, max)`.
 *
 * @param max - Exclusive upper bound (positive integer).
 * @returns Integer in range.
 * @throws {RangeError} If `max` is not a positive integer.
 * @throws {Error} If `crypto.getRandomValues` is unavailable.
 */
export function getSecureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError('max must be a positive integer');
  }
  if (max === 1) return 0;

  const limit = MAX_UINT32 - (MAX_UINT32 % max);
  while (true) {
    const bytes = getRandomBytes(4);
    const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    if (value < limit) return value % max;
  }
}

/**
 * Picks a uniformly random character from a non-empty pool.
 *
 * @param pool - Character pool string.
 * @returns One character from `pool`.
 * @throws {RangeError} If `pool` is empty (`max` becomes 0).
 */
export function pickSecureRandomChar(pool: string): string {
  return pool.charAt(getSecureRandomInt(pool.length));
}

/**
 * Fisher–Yates shuffle using a CSPRNG (returns a new array).
 *
 * @typeParam T - Element type.
 * @param items - Array to shuffle.
 * @returns New shuffled array (input is not mutated).
 */
export function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a hex string from CSPRNG bytes (used for handshake nonces).
 *
 * @param byteLength - Number of random bytes (output is twice as long).
 * @returns Lowercase hex string.
 * @throws {Error} If `crypto.getRandomValues` is unavailable.
 */
export function getSecureRandomHex(byteLength = 16): string {
  return Array.from(getRandomBytes(byteLength))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * RFC 4122 UUID v4 (random). Uses `crypto.randomUUID` when available.
 */
export function generateUuidV4(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generates a unique-ish id: `{prefix}-{base36Time}-{8 random chars}`.
 *
 * @param prefix - Id prefix (default `'web'`).
 * @returns Generated id string.
 */
export function generateSecureId(prefix = 'web'): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += alphabet.charAt(getSecureRandomInt(alphabet.length));
  }
  return `${prefix}-${Date.now().toString(36)}-${id}`;
}

/**
 * Returns a stable web client source id, persisted in `localStorage` when available.
 *
 * @returns Existing or newly generated source id.
 */
export function getSourceId(): string {
  if (typeof localStorage === 'undefined') return generateSecureId();
  let id = localStorage.getItem('pkey_web_source_id');
  if (!id) {
    id = generateSecureId();
    localStorage.setItem('pkey_web_source_id', id);
  }
  return id;
}
