/**
 * @fileoverview SPAKE2 (RFC 9383 style) over P-256 for protocol v3.
 *
 * Both peers know `passwordHash` (KDF output). The transcript is a DH
 * exchange blinded by the password so a captured HMAC(passwordHash) is no
 * longer sitting on the wire. An offline dictionary attack on the transcript
 * still costs one Argon2 per guess; SAS-6 is the MITM check.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '../crypto/index';
import { hmacSha256 } from '../crypto/index';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.toLowerCase();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function curveOrder(): bigint {
  return p256.Point.Fn.ORDER;
}

function scalarFromPassword(passwordHash: string): bigint {
  const n = curveOrder();
  const h = sha256(`pkey-spake2-w|${passwordHash}`);
  let w = BigInt('0x' + h) % n;
  if (w === 0n) w = 1n;
  return w;
}

/** Protocol-specific M / N (hash of domain strings as scalars × G). */
function blindPoint(tag: string): typeof p256.Point.BASE {
  const n = curveOrder();
  let s = BigInt('0x' + sha256(`pkey-spake2-${tag}`)) % n;
  if (s === 0n) s = 1n;
  return p256.Point.BASE.multiply(s);
}

const M = blindPoint('M');
const N = blindPoint('N');

export interface Spake2Share {
  /** Uncompressed point hex (0x04 || X || Y). */
  shareHex: string;
  scalar: bigint;
}

export function spake2Start(passwordHash: string, role: 'A' | 'B'): Spake2Share {
  const w = scalarFromPassword(passwordHash);
  const x = p256.utils.randomSecretKey();
  const scalar = p256.Point.Fn.fromBytes(x);
  const X = p256.Point.BASE.multiply(scalar);
  const blinded = role === 'A' ? X.add(M.multiply(w)) : X.add(N.multiply(w));
  return { shareHex: bytesToHex(blinded.toBytes()), scalar };
}

export function spake2Finish(
  passwordHash: string,
  mine: Spake2Share,
  peerShareHex: string,
  role: 'A' | 'B'
): string {
  const w = scalarFromPassword(passwordHash);
  const peer = p256.Point.fromBytes(hexToBytes(peerShareHex));
  const unblind = role === 'A' ? peer.subtract(N.multiply(w)) : peer.subtract(M.multiply(w));
  const shared = unblind.multiply(mine.scalar);
  return sha256(bytesToHex(shared.toBytes()));
}

/** Confirmation MAC bound to the challenge nonce (not the password hash). */
export function spake2Confirm(sharedHex: string, challenge: string): string {
  return hmacSha256(sharedHex, `pkey-spake2-confirm|${challenge}`);
}
