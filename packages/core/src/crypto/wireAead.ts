/**
 * @fileoverview XChaCha20-Poly1305 envelopes for sync protocol v3 (audit H3/H4).
 *
 * Protocol v2 keeps AES-CBC + HMAC via {@link encryptPayload}. Decrypt accepts both.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { utf8ToBytes, bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { HmacSHA256, Hex } from 'crypto-es';

/** HKDF info for the LAN wire AEAD key. Must match callers of {@link deriveSyncAeadKey}. */
export const HKDF_INFO_SYNC_AEAD = 'pkey-sync-aead-v1';

/** AAD bound into every v3 sync frame. */
export const SYNC_AEAD_AAD = utf8ToBytes('pkey-sync-aead-v1');

export interface SyncAeadEnvelope {
  v: 4;
  nonce: string;
  ciphertext: string;
}

export function isAeadWireEnvelope(value: unknown): value is SyncAeadEnvelope {
  if (!value || typeof value !== 'object') return false;
  const rec = value as SyncAeadEnvelope;
  return (
    rec.v === 4 &&
    typeof rec.nonce === 'string' &&
    rec.nonce.length === 48 &&
    typeof rec.ciphertext === 'string' &&
    rec.ciphertext.length > 0
  );
}

/**
 * HKDF-SHA-256 expand (single 32-byte block) of a 256-bit secret into the AEAD key.
 * Byte-identical to {@link hkdfExpand}(secret, {@link HKDF_INFO_SYNC_AEAD}).
 */
export function deriveSyncAeadKey(secretHex: string): string {
  return HmacSHA256(`${HKDF_INFO_SYNC_AEAD}\u0001`, Hex.parse(secretHex)).toString(Hex);
}

export function encryptWireAead(payload: unknown, secretHex: string): SyncAeadEnvelope {
  const key = hexToBytes(deriveSyncAeadKey(secretHex));
  const nonce = randomBytes(24);
  const pt = utf8ToBytes(JSON.stringify(payload));
  const ct = xchacha20poly1305(key, nonce, SYNC_AEAD_AAD).encrypt(pt);
  return { v: 4, nonce: bytesToHex(nonce), ciphertext: bytesToHex(ct) };
}

export function decryptWireAead<T = unknown>(
  envelope: SyncAeadEnvelope,
  secretHex: string
): T | null {
  try {
    const key = hexToBytes(deriveSyncAeadKey(secretHex));
    const pt = xchacha20poly1305(key, hexToBytes(envelope.nonce), SYNC_AEAD_AAD).decrypt(
      hexToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    return null;
  }
}
