/**
 * @fileoverview Authenticated encryption wrappers for sync wire messages (protocol v2+).
 */

import { encryptPayload, decryptPayload } from '../crypto/index';
import { encryptWireAead, decryptWireAead, isAeadWireEnvelope, type SyncAeadEnvelope } from '../crypto/wireAead';
import { isHostProofSecretHex } from './auth-client';
import {
  CONTROL_WIRE_INNER_VERSION,
  CONTROL_WIRE_SKEW_MS,
  CONTROL_WIRE_TTL_MS,
  isEncryptedControlType,
  type SyncPushPayload,
} from './protocol';
import { SYNC_PROTOCOL_VERSION } from '../types/index';

/** AES-CBC + HMAC envelope fields used on the WS wire (protocol v2). */
export interface SyncCbcEnvelope {
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
}

/** Wire envelope: AEAD (protocol v3) or CBC+HMAC (protocol v2 grace). */
export type SyncWireEnvelope = SyncCbcEnvelope | SyncAeadEnvelope;

/** Sealed post-auth control frame: type in the clear, body only as ciphertext. */
export interface ControlWireMessage {
  type: string;
  encryptedPayload: SyncWireEnvelope;
}

/** Minimum fields inside every control envelope (`v` / `exp` / `token`). */
export interface ControlWireInnerBase {
  v: number;
  exp: number;
  token: string;
}

/** Decrypted contents of an encrypted `auth_ok` envelope. */
export interface EncryptedAuthOkPayload {
  token: string;
  protocolVersion: number;
  /**
   * Random host-pairing secret. Present on current masters; omitted by
   * legacy peers. Never derived from the master password.
   */
  hostProofSecret?: string;
}

/** Decrypted sync push wire: push payload plus session token. */
export type EncryptedSyncPushWire = SyncPushPayload & { token: string };

/**
 * Encrypts an auth-success payload for the wire.
 *
 * @param token - Session token issued after challenge-response.
 * @param protocolVersion - Negotiated protocol version.
 * @param passwordHash - Hex password hash for envelope keys.
 * @param hostProofSecret - Optional random pairing secret delivered only
 *   after a successful password HMAC (never on the pre-auth challenge).
 * @returns Structured sync envelope (`salt`, `iv`, `ciphertext`, `hmac`).
 */
function encryptWire(payload: unknown, secretHex: string, protocolVersion: number): SyncWireEnvelope {
  if (protocolVersion >= 3) return encryptWireAead(payload, secretHex);
  return encryptPayload(payload, secretHex);
}

function decryptWire<T>(envelope: SyncWireEnvelope, secretHex: string): T | null {
  if (isAeadWireEnvelope(envelope)) return decryptWireAead<T>(envelope, secretHex);
  return decryptPayload<T>(envelope, secretHex);
}

export function usesAeadSyncWire(protocolVersion: number): boolean {
  return protocolVersion >= 3;
}
export function encryptAuthOk(
  token: string,
  protocolVersion: number,
  passwordHash: string,
  hostProofSecret?: string
): SyncWireEnvelope {
  const inner: EncryptedAuthOkPayload = { token, protocolVersion };
  if (isHostProofSecretHex(hostProofSecret)) {
    inner.hostProofSecret = hostProofSecret.toLowerCase();
  }
  return encryptWire(inner, passwordHash, protocolVersion);
}

/**
 * Decrypts an auth-success envelope.
 *
 * @param envelope - Wire envelope fields.
 * @param passwordHash - Hex password hash.
 * @returns Parsed payload, or `null` on failure.
 */
export function decryptAuthOk(
  envelope: SyncWireEnvelope,
  passwordHash: string
): EncryptedAuthOkPayload | null {
  const payload = decryptWire<EncryptedAuthOkPayload>(envelope, passwordHash);
  if (!payload || typeof payload.token !== 'string') return null;
  const hostProofSecret = isHostProofSecretHex(payload.hostProofSecret)
    ? payload.hostProofSecret.toLowerCase()
    : undefined;
  return {
    token: payload.token,
    protocolVersion: payload.protocolVersion,
    ...(hostProofSecret ? { hostProofSecret } : {}),
  };
}

/**
 * Encrypts a sync push (index + upserts/deletions) with the session token.
 *
 * @param token - Session token.
 * @param payload - Push payload fields.
 * @param passwordHash - Hex password hash.
 * @returns Structured sync envelope.
 */
export function encryptSyncPushWire(
  token: string,
  payload: SyncPushPayload,
  passwordHash: string,
  protocolVersion: number = SYNC_PROTOCOL_VERSION
): SyncWireEnvelope {
  return encryptWire({ token, ...payload }, passwordHash, protocolVersion);
}

/**
 * Decrypts a sync push wire envelope.
 *
 * @param envelope - Wire envelope fields.
 * @param passwordHash - Hex password hash.
 * @returns Parsed push + token, or `null` on failure.
 */
export function decryptSyncPushWire(
  envelope: SyncWireEnvelope,
  passwordHash: string
): EncryptedSyncPushWire | null {
  return decryptWire<EncryptedSyncPushWire>(envelope, passwordHash);
}

/**
 * Whether the peer should use encrypted envelopes instead of plaintext tokens.
 * v2+ web clients use encrypted envelopes; v1 used a plaintext top-level token.
 *
 * @param protocolVersion - Peer protocol version.
 * @returns `true` when `protocolVersion >= 2`.
 */
export function usesEncryptedSyncWire(protocolVersion: number): boolean {
  return protocolVersion >= 2;
}

/** True when `value` looks like a sync envelope (CBC or AEAD). */
export function isSyncWireEnvelope(value: unknown): value is SyncWireEnvelope {
  if (isAeadWireEnvelope(value)) return true;
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.salt === 'string' &&
    rec.salt.length > 0 &&
    typeof rec.iv === 'string' &&
    rec.iv.length > 0 &&
    typeof rec.ciphertext === 'string' &&
    rec.ciphertext.length > 0 &&
    typeof rec.hmac === 'string' &&
    rec.hmac.length > 0
  );
}

/**
 * Unix-ms expiry stamped on a control inner (`now + {@link CONTROL_WIRE_TTL_MS}`).
 */
export function controlWireExpiry(now = Date.now()): number {
  return now + CONTROL_WIRE_TTL_MS;
}

/**
 * True when `exp` is neither stale nor implausibly far in the future.
 */
export function isControlWireFresh(exp: number, now = Date.now()): boolean {
  if (!Number.isFinite(exp)) return false;
  if (now > exp + CONTROL_WIRE_SKEW_MS) return false;
  if (exp > now + CONTROL_WIRE_TTL_MS + CONTROL_WIRE_SKEW_MS) return false;
  return true;
}

/**
 * Builds the inner object for {@link encryptControlWire}. `v` / `exp` / `token`
 * always win over colliding keys in `fields`.
 */
export function wrapControlInner(
  token: string,
  fields: Record<string, unknown> = {},
  now = Date.now()
): Record<string, unknown> {
  return {
    ...fields,
    v: CONTROL_WIRE_INNER_VERSION,
    exp: controlWireExpiry(now),
    token,
  };
}

/**
 * Encrypts a post-auth control message. Callers put bind fields in `inner`
 * (after {@link wrapControlInner}); nothing sensitive belongs on the outer type.
 */
export function encryptControlWire(
  type: string,
  inner: Record<string, unknown>,
  passwordHash: string
): ControlWireMessage {
  return { type, encryptedPayload: encryptWire(inner, passwordHash, SYNC_PROTOCOL_VERSION) };
}

/**
 * Decrypts a control envelope. Returns the inner object, or `null` on HMAC
 * failure, missing envelope, bad `v`/`exp`/`token`, or stale `exp`.
 */
export function decryptControlWire(
  msg: unknown,
  passwordHash: string,
  now = Date.now()
): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') return null;
  const rec = msg as Record<string, unknown>;
  if (!isSyncWireEnvelope(rec.encryptedPayload)) return null;
  const inner = decryptWire<Record<string, unknown>>(rec.encryptedPayload, passwordHash);
  if (!inner || typeof inner !== 'object') return null;
  if (inner.v !== CONTROL_WIRE_INNER_VERSION) return null;
  if (typeof inner.token !== 'string' || inner.token.length < 8) return null;
  if (typeof inner.exp !== 'number' || !isControlWireFresh(inner.exp, now)) return null;
  return inner;
}

/**
 * Seals a plaintext control object for the wire. Already-enveloped frames pass
 * through. Returns `null` when a control type cannot be sealed (drop — never
 * send the inner in the clear).
 */
export function sealOutgoingControl(
  msg: { type: string; encryptedPayload?: unknown; [key: string]: unknown },
  token: string | null | undefined,
  passwordHash: string | null | undefined,
  now = Date.now()
): ControlWireMessage | { type: string; [key: string]: unknown } | null {
  if (!isEncryptedControlType(msg.type)) return msg;
  if (isSyncWireEnvelope(msg.encryptedPayload)) {
    return { type: msg.type, encryptedPayload: msg.encryptedPayload };
  }
  if (!token || !passwordHash) return null;
  const { type, encryptedPayload: _ignored, ...fields } = msg;
  return encryptControlWire(type, wrapControlInner(token, fields, now), passwordHash);
}
