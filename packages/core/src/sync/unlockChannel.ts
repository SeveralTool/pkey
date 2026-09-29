/**
 * @fileoverview Pre-auth PWA unlock via X25519 ECDH + short authentication string.
 *
 * The browser does not yet have `passwordHash`, so post-auth `encryptControlWire`
 * cannot wrap this handoff. Both sides show a 6-digit SAS derived from the
 * ephemeral public keys; after the phone user confirms Face ID, the master
 * wraps the vault auth hash under HKDF(ECDH shared).
 */

import { x25519 } from '@noble/curves/ed25519.js';
import {
  encryptPayload,
  decryptPayload,
  hkdfExpand,
  hmacSha256,
  sha256,
} from '../crypto/index';
import type { PasswordHashScheme } from '../types/index';
import type { SyncWireEnvelope } from './encryptedChannel';

/** HKDF info tag for the unlock wrap key (distinct from vault enc/auth). */
export const HKDF_INFO_UNLOCK_WRAP = 'pkey-unlock-wrap-v1';
/** HMAC key for the 6-digit SAS. */
const SAS_HMAC_KEY = 'pkey-sas-v1';

const PUB_HEX_RE = /^[0-9a-f]{64}$/;
const NONCE_HEX_RE = /^[0-9a-f]{32}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** Ephemeral X25519 pair; `secretKey` never leaves the process. */
export interface UnlockKeypair {
  secretKey: Uint8Array;
  publicKeyHex: string;
}

/** Inner of `unlock_grant` after ECDH unwrap. */
export interface UnlockGrantInner {
  passwordHash: string;
  salt: string;
  authScheme: PasswordHashScheme;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function asRecord(msg: unknown): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') return null;
  return msg as Record<string, unknown>;
}

/** Generates a fresh X25519 keypair for one unlock attempt. */
export function generateUnlockKeypair(): UnlockKeypair {
  const pair = x25519.keygen();
  return { secretKey: pair.secretKey, publicKeyHex: bytesToHex(pair.publicKey) };
}

/**
 * 6-digit short authentication string both screens must show. Independent of
 * Face ID — the human check is what stops a LAN MITM swapping pubkeys.
 */
export function computeUnlockSas(
  clientPubHex: string,
  serverPubHex: string,
  nonceHex: string
): string {
  const a = clientPubHex.toLowerCase();
  const b = serverPubHex.toLowerCase();
  const n = nonceHex.toLowerCase();
  const [left, right] = a < b ? [a, b] : [b, a];
  const digest = hmacSha256(SAS_HMAC_KEY, `${left}:${right}:${n}`);
  const num = Number.parseInt(digest.slice(0, 8), 16) % 1_000_000;
  return num.toString().padStart(6, '0');
}

function wrapKeyFromShared(shared: Uint8Array): string {
  return hkdfExpand(sha256(bytesToHex(shared)), HKDF_INFO_UNLOCK_WRAP);
}

function deriveSharedSecret(
  secretKey: Uint8Array,
  peerPubHex: string
): Uint8Array | null {
  const peer = hexToBytes(peerPubHex.toLowerCase());
  if (!peer || peer.length !== 32) return null;
  try {
    return x25519.getSharedSecret(secretKey, peer);
  } catch {
    return null;
  }
}

/** Encrypts the grant inner under the ECDH shared secret. */
export function wrapUnlockGrant(
  secretKey: Uint8Array,
  peerPubHex: string,
  inner: UnlockGrantInner
): SyncWireEnvelope | null {
  const shared = deriveSharedSecret(secretKey, peerPubHex);
  if (!shared) return null;
  return encryptPayload(inner, wrapKeyFromShared(shared));
}

/** Decrypts a grant envelope. Returns `null` on HMAC/ECDH failure. */
export function unwrapUnlockGrant(
  secretKey: Uint8Array,
  peerPubHex: string,
  envelope: SyncWireEnvelope
): UnlockGrantInner | null {
  const shared = deriveSharedSecret(secretKey, peerPubHex);
  if (!shared) return null;
  const inner = decryptPayload<UnlockGrantInner>(envelope, wrapKeyFromShared(shared));
  if (!inner || typeof inner.passwordHash !== 'string' || inner.passwordHash.length < 32) {
    return null;
  }
  if (typeof inner.salt !== 'string' || !inner.salt) return null;
  if (
    inner.authScheme !== 'v4-argon2' &&
    inner.authScheme !== 'v3-hkdf' &&
    inner.authScheme !== 'v2-pbkdf2'
  ) {
    return null;
  }
  return inner;
}

/** Parsed `unlock_request` fields. */
export interface UnlockRequestFields {
  requestId: string;
  clientPub: string;
  nonce: string;
}

/** Parses an untrusted `unlock_request` body. */
export function parseUnlockRequest(msg: unknown): UnlockRequestFields | null {
  const rec = asRecord(msg);
  if (!rec) return null;
  const requestId = typeof rec.requestId === 'string' ? rec.requestId.trim() : '';
  const clientPub = typeof rec.clientPub === 'string' ? rec.clientPub.trim().toLowerCase() : '';
  const nonce = typeof rec.nonce === 'string' ? rec.nonce.trim().toLowerCase() : '';
  if (!REQUEST_ID_RE.test(requestId) || !PUB_HEX_RE.test(clientPub) || !NONCE_HEX_RE.test(nonce)) {
    return null;
  }
  return { requestId, clientPub, nonce };
}

/** Parses an untrusted `unlock_offer` body. */
export function parseUnlockOffer(msg: unknown): { requestId: string; serverPub: string } | null {
  const rec = asRecord(msg);
  if (!rec) return null;
  const requestId = typeof rec.requestId === 'string' ? rec.requestId.trim() : '';
  const serverPub = typeof rec.serverPub === 'string' ? rec.serverPub.trim().toLowerCase() : '';
  if (!REQUEST_ID_RE.test(requestId) || !PUB_HEX_RE.test(serverPub)) return null;
  return { requestId, serverPub };
}

/** Parses requestId from cancel. */
export function parseUnlockCancel(msg: unknown): string | null {
  const rec = asRecord(msg);
  if (!rec) return null;
  const requestId = typeof rec.requestId === 'string' ? rec.requestId.trim() : '';
  return REQUEST_ID_RE.test(requestId) ? requestId : null;
}

function isWireEnvelope(value: unknown): value is SyncWireEnvelope {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.salt === 'string' &&
    typeof rec.iv === 'string' &&
    typeof rec.ciphertext === 'string' &&
    typeof rec.hmac === 'string' &&
    rec.salt.length > 0 &&
    rec.iv.length > 0 &&
    rec.ciphertext.length > 0 &&
    rec.hmac.length > 0
  );
}

/** Parses an untrusted `unlock_grant` body. HMAC is checked later by unwrap. */
export function parseUnlockGrant(msg: unknown): {
  requestId: string;
  serverPub: string;
  encryptedPayload: SyncWireEnvelope;
} | null {
  const rec = asRecord(msg);
  if (!rec) return null;
  const requestId = typeof rec.requestId === 'string' ? rec.requestId.trim() : '';
  const serverPub = typeof rec.serverPub === 'string' ? rec.serverPub.trim().toLowerCase() : '';
  if (!REQUEST_ID_RE.test(requestId) || !PUB_HEX_RE.test(serverPub)) return null;
  if (!isWireEnvelope(rec.encryptedPayload)) return null;
  return { requestId, serverPub, encryptedPayload: rec.encryptedPayload };
}
