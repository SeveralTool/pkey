/**
 * @fileoverview Encrypted channel for device migration v2 (PSK + HKDF + AES-CBC/HMAC).
 *
 * Threat model: mitigates passive LAN sniffing and replay of migration frames.
 * Does not replace TLS; pairingSecret must be exchanged out-of-band (QR / manual UI).
 *
 * Pairing codes (post-audit M8):
 *  - **New devices** generate 15 bytes (120 bits) as 24 Crockford Base32
 *    chars, shown as `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. 120 bits gives
 *    ~2^60 median-attempt cost against a captured migration frame, which
 *    is beyond feasibility on any hardware for the next several decades.
 *  - **Legacy compatibility**: `normalizePairingCode` and downstream
 *    accept the historic 10-byte (80-bit / 16-char) code so that a phone
 *    still running an older PKey build can pair with a new-build receiver.
 */
import { AES, CBC, CipherParams, Hex, HmacSHA256, Pkcs7, SHA256, Utf8, WordArray } from 'crypto-es';
import * as Crypto from 'expo-crypto';
import { hmacSha256, constantTimeEquals } from './syncAuth';

export const MIGRATION_V2_CONTENT_TYPE = 'application/pkey-migration-v2+json';
export const MIGRATION_HKDF_INFO = 'pkey-migration-v2';

/** New default: 15 bytes (120 bits) → 24 Crockford chars. */
export const PAIRING_SECRET_BYTES = 15;
export const PAIRING_CODE_LENGTH = 24;

/** Historic size accepted for backwards-compat reads. */
export const LEGACY_PAIRING_SECRET_BYTES = 10;
export const LEGACY_PAIRING_CODE_LENGTH = 16;

/** All secret byte lengths this build will accept as valid pairing codes. */
const ACCEPTED_PAIRING_SECRET_BYTES: readonly number[] = [PAIRING_SECRET_BYTES];

/** Crockford Base32 — no I/L/O/U to avoid confusion when typing. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CROCKFORD_DECODE: Record<string, number> = {};
for (let i = 0; i < CROCKFORD.length; i++) {
  CROCKFORD_DECODE[CROCKFORD[i]] = i;
}
['O', 'o'].forEach((c) => {
  CROCKFORD_DECODE[c] = 0;
});
['I', 'i', 'L', 'l'].forEach((c) => {
  CROCKFORD_DECODE[c] = 1;
});

export interface MigrationFrame {
  v: 2;
  n: string;
  c: string;
  t: string;
}

export const encodeCrockfordBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += CROCKFORD[(value << (5 - bits)) & 31];
  }
  return output;
};

export const decodeCrockfordBase32 = (input: string): Uint8Array | null => {
  const cleaned = input.replace(/[-\s]/g, '').toUpperCase();
  if (cleaned.length === 0) return null;

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of cleaned) {
    const idx = CROCKFORD_DECODE[char];
    if (idx === undefined) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
};

/**
 * Normalizes user input to the canonical Crockford code, or null if invalid.
 * Accepts both the new 24-char (120-bit) and the legacy 16-char (80-bit)
 * formats so a receiver running this build can still pair with a sender
 * running an older PKey.
 */
export const normalizePairingCode = (input: string): string | null => {
  const bytes = decodeCrockfordBase32(input);
  if (!bytes || !ACCEPTED_PAIRING_SECRET_BYTES.includes(bytes.length)) return null;
  return encodeCrockfordBase32(bytes);
};

/**
 * Formats a canonical pairing code for display, grouping in blocks of 4 chars.
 * Works for both the new 24-char (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`) and the
 * legacy 16-char (`XXXX-XXXX-XXXX-XXXX`) code lengths.
 */
export const formatPairingCode = (code: string): string => {
  const cleaned =
    normalizePairingCode(code) || code.replace(/[-\s]/g, '').toUpperCase();
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join('-') : cleaned;
};

/**
 * Live input helper: strips junk, uppercases, caps at the max accepted length,
 * inserts dashes for readability. Accepts codes with or without dashes —
 * `normalizePairingCode` handles both.
 */
export const formatPairingInput = (raw: string): string => {
  const cleaned = raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, '')
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, PAIRING_CODE_LENGTH);
  const parts = cleaned.match(/.{1,4}/g);
  return parts ? parts.join('-') : '';
};

/**
 * Generates a fresh 120-bit pairing secret (24 Crockford Base32 chars).
 * See {@link PAIRING_SECRET_BYTES}.
 */
export const generatePairingSecret = (): string => {
  return encodeCrockfordBase32(Crypto.getRandomBytes(PAIRING_SECRET_BYTES));
};

/** HKDF-SHA256 expand to a 256-bit channel key (hex). */
export const deriveChannelKeyHex = (pairingSecret: string, sessionId: string): string => {
  const prk = hmacSha256(sessionId, pairingSecret);
  return hmacSha256(prk, `${MIGRATION_HKDF_INFO}\x01`);
};

const deriveFrameKeys = (channelKeyHex: string, nonceHex: string) => {
  const channelKey = Hex.parse(channelKeyHex);
  const encKey = HmacSHA256(`${nonceHex}:AES`, channelKey);
  const macKey = HmacSHA256(`${nonceHex}:MAC`, channelKey);
  return { encKey, macKey };
};

/** Encrypts plaintext into a v2 migration frame JSON string. */
export const encryptFrame = (channelKeyHex: string, plaintext: string): string => {
  const nonce = WordArray.random(16);
  const nonceHex = nonce.toString(Hex);
  const { encKey, macKey } = deriveFrameKeys(channelKeyHex, nonceHex);

  const encrypted = AES.encrypt(plaintext, encKey, {
    iv: nonce,
    mode: CBC,
    padding: Pkcs7,
  });
  const ciphertextHex = encrypted.ciphertext!.toString(Hex);
  const tag = HmacSHA256(nonceHex + ciphertextHex, macKey).toString(Hex);

  const frame: MigrationFrame = { v: 2, n: nonceHex, c: ciphertextHex, t: tag };
  return JSON.stringify(frame);
};

/** Decrypts a v2 migration frame; throws on tampering or bad format. */
export const decryptFrame = (channelKeyHex: string, frameJson: string): string => {
  let frame: MigrationFrame;
  try {
    frame = JSON.parse(frameJson.trim()) as MigrationFrame;
  } catch {
    throw new Error('MIGRATION_FRAME_INVALID');
  }
  if (frame.v !== 2 || !frame.n || !frame.c || !frame.t) {
    throw new Error('MIGRATION_FRAME_INVALID');
  }

  const { encKey, macKey } = deriveFrameKeys(channelKeyHex, frame.n);
  const expectedTag = HmacSHA256(frame.n + frame.c, macKey).toString(Hex);
  if (!constantTimeEquals(expectedTag, frame.t)) {
    throw new Error('MIGRATION_FRAME_TAMPERED');
  }

  const cipherParams = CipherParams.create({ ciphertext: Hex.parse(frame.c) });
  const decrypted = AES.decrypt(cipherParams, encKey, {
    iv: Hex.parse(frame.n),
    mode: CBC,
    padding: Pkcs7,
  });
  const plain = decrypted.toString(Utf8);
  if (!plain) throw new Error('MIGRATION_FRAME_DECRYPT_FAILED');
  return plain;
};

export const isMigrationV2ContentType = (contentType: string | undefined): boolean =>
  !!contentType && contentType.includes('pkey-migration-v2');

/** Short hex fingerprint for anti-MITM UI (first 8 chars of SHA-256(channelKey)). */
export const channelKeyFingerprint = (channelKeyHex: string): string =>
  SHA256(channelKeyHex).toString(Hex).slice(0, 8).toUpperCase();

export const computeMigrationProof = (
  channelKeyHex: string,
  passwordHash: string,
  migrationId: string,
  sessionId: string
): string => hmacSha256(channelKeyHex, `${passwordHash}:${migrationId}:${sessionId}`);

export const computeSenderWipeProof = (
  channelKeyHex: string,
  migrationId: string,
  senderSessionId: string
): string => hmacSha256(channelKeyHex, `wipe:${migrationId}:${senderSessionId}`);

export const verifyMigrationProof = (
  channelKeyHex: string,
  passwordHash: string,
  migrationId: string,
  sessionId: string,
  proof: string
): boolean =>
  constantTimeEquals(
    computeMigrationProof(channelKeyHex, passwordHash, migrationId, sessionId),
    proof
  );

export const verifySenderWipeProof = (
  channelKeyHex: string,
  migrationId: string,
  senderSessionId: string,
  wipeProof: string
): boolean =>
  constantTimeEquals(
    computeSenderWipeProof(channelKeyHex, migrationId, senderSessionId),
    wipeProof
  );
