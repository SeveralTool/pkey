/**
 * @fileoverview Unit tests for migration v2 channel crypto.
 */
import {
  generatePairingSecret,
  deriveChannelKeyHex,
  encryptFrame,
  decryptFrame,
  computeMigrationProof,
  computeSenderWipeProof,
  verifyMigrationProof,
  verifySenderWipeProof,
  channelKeyFingerprint,
  normalizePairingCode,
  formatPairingCode,
  encodeCrockfordBase32,
  PAIRING_CODE_LENGTH,
  PAIRING_SECRET_BYTES,
} from './migrationChannelCrypto';

describe('migrationChannelCrypto', () => {
  const pairingSecret = generatePairingSecret();
  const sessionId = 'abc12345';
  const channelKey = deriveChannelKeyHex(pairingSecret, sessionId);

  it('generates 24-char Crockford pairing codes (audit M8)', () => {
    // Post-M8 the code is 120 bits = 24 Crockford chars.
    const code = generatePairingSecret();
    expect(code).toHaveLength(PAIRING_CODE_LENGTH);
    expect(PAIRING_CODE_LENGTH).toBe(24);
    expect(normalizePairingCode(code)).toBe(code);
  });

  it('generates unique pairing secrets', () => {
    expect(generatePairingSecret()).not.toBe(generatePairingSecret());
  });

  it('normalizes dashed and spaced input', () => {
    const code = generatePairingSecret();
    const formatted = formatPairingCode(code);
    // 24 chars grouped in 6 blocks of 4 → 5 separators.
    expect(formatted).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/);
    expect(normalizePairingCode(formatted)).toBe(code);
    expect(normalizePairingCode(formatted.replace(/-/g, ' '))).toBe(code);
    expect(normalizePairingCode(formatted.replace(/-/g, ''))).toBe(code);
  });

  it('formats live pairing input with optional dashes', () => {
    const { formatPairingInput } = require('./migrationChannelCrypto');
    expect(formatPairingInput('abcd1234efgh5678')).toBe('ABCD-1234-EFGH-5678');
    expect(formatPairingInput('ABCD-1234')).toBe('ABCD-1234');
    expect(formatPairingInput('abo1')).toBe('AB01'); // O→0, I/L→1
  });

  it('rejects the retired 16-char (80-bit) pairing code', () => {
    const legacy16 = 'ABCDEF1234567890';
    expect(normalizePairingCode(legacy16)).toBeNull();
  });

  it('rejects invalid pairing codes', () => {
    expect(normalizePairingCode('TOO-SHORT')).toBeNull();
    // 24-char string with an illegal Crockford character (U is excluded).
    expect(normalizePairingCode('XXXX-XXXX-XXXX-XXXX-XXXX-XXXU')).toBeNull();
  });

  it('round-trips crockford base32', () => {
    const bytes = new Uint8Array(PAIRING_SECRET_BYTES).fill(0xab);
    const encoded = encodeCrockfordBase32(bytes);
    expect(normalizePairingCode(encoded)).toBe(encoded);
  });

  it('derives deterministic channel keys', () => {
    expect(deriveChannelKeyHex(pairingSecret, sessionId)).toBe(channelKey);
    expect(deriveChannelKeyHex(pairingSecret, 'other')).not.toBe(channelKey);
  });

  it('round-trips encrypt/decrypt', () => {
    const plain = JSON.stringify({ hello: 'world', n: 42 });
    const frame = encryptFrame(channelKey, plain);
    expect(decryptFrame(channelKey, frame)).toBe(plain);
  });

  it('rejects tampered frames', () => {
    const frame = encryptFrame(channelKey, '{"x":1}');
    const parsed = JSON.parse(frame);
    parsed.t = '0'.repeat(64);
    expect(() => decryptFrame(channelKey, JSON.stringify(parsed))).toThrow(
      'MIGRATION_FRAME_TAMPERED'
    );
  });

  it('rejects wrong channel key', () => {
    const frame = encryptFrame(channelKey, '{"x":1}');
    const otherKey = deriveChannelKeyHex(generatePairingSecret(), sessionId);
    expect(() => decryptFrame(otherKey, frame)).toThrow();
  });

  it('computes and verifies migration proof', () => {
    const proof = computeMigrationProof(channelKey, 'hash', 'mid', sessionId);
    expect(verifyMigrationProof(channelKey, 'hash', 'mid', sessionId, proof)).toBe(true);
    expect(verifyMigrationProof(channelKey, 'wrong', 'mid', sessionId, proof)).toBe(false);
  });

  it('computes and verifies wipe proof', () => {
    const wipeProof = computeSenderWipeProof(channelKey, 'mid', 'sid');
    expect(verifySenderWipeProof(channelKey, 'mid', 'sid', wipeProof)).toBe(true);
    expect(verifySenderWipeProof(channelKey, 'mid', 'other', wipeProof)).toBe(false);
  });

  it('produces stable fingerprint', () => {
    expect(channelKeyFingerprint(channelKey)).toHaveLength(8);
    expect(channelKeyFingerprint(channelKey)).toBe(channelKeyFingerprint(channelKey));
  });
});
