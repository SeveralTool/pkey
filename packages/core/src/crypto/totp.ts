/**
 * @fileoverview TOTP/HOTP helpers (RFC 6238 / RFC 4226) and otpauth URI parsing.
 *
 * Used by vault cards that store Base32 OTP secrets for two-factor codes.
 */

import { HmacSHA1, HmacSHA256, HmacSHA512, Hex, WordArray } from 'crypto-es';
import type { OtpAlgorithm } from '../types/index';

export type { OtpAlgorithm };

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

/** Strips whitespace, hyphens, padding and uppercases a Base32 secret.
 *
 * @param secret - Raw Base32 secret.
 * @returns Normalized secret suitable for HOTP/TOTP.
 */
export function normalizeSecret(secret: string): string {
  return secret.replace(/[\s\-=]/g, '').toUpperCase();
}

/** Returns true when the secret contains only valid Base32 characters after normalization.
 *
 * @param secret - Raw or normalized secret.
 * @returns `true` if non-empty and alphabet is A–Z / 2–7 only.
 */
export function isValidBase32(secret: string): boolean {
  const clean = normalizeSecret(secret);
  return clean.length > 0 && /^[A-Z2-7]+$/.test(clean);
}

/** Decodes a base32 string (RFC 4648, padding optional).
 *
 * @param input - Base32-encoded secret.
 * @returns Decoded bytes (invalid characters are skipped).
 */
export function decodeBase32(input: string): Uint8Array {
  const cleaned = input.replace(/[\s=]/g, '').toUpperCase();
  if (!cleaned) return new Uint8Array(0);

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  let skippedInvalid = false;

  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      skippedInvalid = true;
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }

  if (skippedInvalid && isDev) {
    console.warn('[OTP] decodeBase32: skipped invalid Base32 characters');
  }

  return Uint8Array.from(out);
}

function bytesToWordArray(bytes: Uint8Array): WordArray {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return Hex.parse(hex);
}

function counterToBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  let n = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return buf;
}

function hmacDigest(algorithm: OtpAlgorithm, key: Uint8Array, message: Uint8Array): Uint8Array {
  const keyWa = bytesToWordArray(key);
  const msgWa = bytesToWordArray(message);
  let hex: string;
  switch (algorithm) {
    case 'SHA256':
      hex = HmacSHA256(msgWa, keyWa).toString(Hex);
      break;
    case 'SHA512':
      hex = HmacSHA512(msgWa, keyWa).toString(Hex);
      break;
    default:
      hex = HmacSHA1(msgWa, keyWa).toString(Hex);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Options shared by HOTP/TOTP generators. */
export interface TotpOptions {
  /** HMAC algorithm (default: `SHA1`). */
  algorithm?: OtpAlgorithm;
  /** Digits in the OTP code (default: `6`). */
  digits?: 6 | 8;
  /** TOTP time step in seconds (default: `30`). */
  period?: number;
  /** Wall-clock milliseconds used for the TOTP counter (default: `Date.now()`). */
  timestamp?: number;
}

/** Generates an HOTP code for a numeric counter (RFC 4226).
 *
 * @param secretBase32 - Base32-encoded shared secret.
 * @param counter - Moving factor / counter.
 * @param options - Algorithm and digit count (see {@link TotpOptions}).
 * @returns Zero-padded OTP string, or `''` if the secret is empty/invalid.
 */
export function generateHotp(
  secretBase32: string,
  counter: number,
  options: TotpOptions = {}
): string {
  if (!secretBase32?.trim()) return '';
  const algorithm = options.algorithm ?? 'SHA1';
  const digits = options.digits ?? 6;
  const key = decodeBase32(secretBase32);
  if (!key.length) return '';

  const digest = hmacDigest(algorithm, key, counterToBytes(counter));
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  return String(binary % mod).padStart(digits, '0');
}

/** Generates a TOTP code (RFC 6238). Returns empty string when secret is missing.
 *
 * @param secretBase32 - Base32-encoded shared secret.
 * @param options - Period, algorithm, digits, and optional timestamp.
 * @returns Zero-padded OTP string, or `''` on missing secret / error.
 */
export function generateTotp(secretBase32: string, options: TotpOptions = {}): string {
  if (!secretBase32?.trim()) return '';
  try {
    const period = options.period ?? 30;
    const timestamp = options.timestamp ?? Date.now();
    const counter = Math.floor(timestamp / 1000 / period);
    return generateHotp(secretBase32, counter, options);
  } catch (error) {
    if (isDev) {
      console.warn('[OTP] Error generating code:', error);
    }
    return '';
  }
}

/** Generates TOTP codes for offsets -window … +window (in period steps).
 *
 * @param secret - Base32 secret.
 * @param window - Half-window size in periods (default `1` → 3 codes).
 * @param options - Shared TOTP options.
 * @returns Codes ordered from `-window` to `+window`.
 */
export function generateTotpWithWindow(
  secret: string,
  window = 1,
  options: TotpOptions = {}
): string[] {
  const period = options.period ?? 30;
  const baseTs = options.timestamp ?? Date.now();
  const codes: string[] = [];
  for (let i = -window; i <= window; i++) {
    codes.push(generateTotp(secret, { ...options, timestamp: baseTs + i * period * 1000 }));
  }
  return codes;
}

/** Returns the TOTP code at a specific window offset (-window … +window).
 *
 * @param secret - Base32 secret.
 * @param windowOffset - Offset within `[-window, +window]`.
 * @param window - Half-window size (default `1`).
 * @param options - Shared TOTP options.
 * @returns Code at that offset, or `''` if out of range.
 */
export function getTotpAtOffset(
  secret: string,
  windowOffset: number,
  window = 1,
  options: TotpOptions = {}
): string {
  if (windowOffset === 0) return generateTotp(secret, options);
  const codes = generateTotpWithWindow(secret, window, options);
  return codes[windowOffset + window] ?? '';
}

/** Seconds remaining in the current TOTP period.
 *
 * @param period - Period length in seconds (default `30`).
 * @param timestamp - Wall-clock ms (default `Date.now()`).
 * @returns Seconds until the next period boundary (`1`…`period`).
 */
export function getRemainingSeconds(period = 30, timestamp = Date.now()): number {
  const elapsed = Math.floor(timestamp / 1000) % period;
  return period - elapsed;
}

/** Fields extracted from a valid `otpauth://` URI. */
export interface OtpAuthParsed {
  /** Normalized Base32 secret. */
  secret: string;
  /** Issuer label from query or path. */
  issuer?: string;
  /** Account name from the URI path. */
  account?: string;
  algorithm?: OtpAlgorithm;
  digits?: 6 | 8;
  period?: number;
}

function normalizeAlgorithm(param: string | null | undefined): OtpAlgorithm {
  const algo = param?.toUpperCase();
  if (algo === 'SHA256' || algo === 'SHA512') return algo;
  return 'SHA1';
}

function normalizeDigits(raw: string | null | undefined): 6 | 8 {
  const n = parseInt(raw ?? '6', 10);
  return n === 8 ? 8 : 6;
}

function normalizePeriod(raw: string | null | undefined): number {
  const n = parseInt(raw ?? '30', 10);
  return n > 0 ? n : 30;
}

/** Parses an otpauth://totp/... URI. Returns null on invalid input.
 *
 * @param uri - Full `otpauth://` URI (totp or hotp).
 * @returns Parsed fields, or `null` if protocol/secret/Base32 is invalid.
 */
export function parseOtpAuthUri(uri: string): OtpAuthParsed | null {
  try {
    const url = new URL(uri.trim());
    if (url.protocol !== 'otpauth:') return null;
    const type = url.hostname.toLowerCase();
    if (type !== 'totp' && type !== 'hotp') return null;

    const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const [issuerFromPath, account] = path.includes(':') ? path.split(':', 2) : [undefined, path];

    const rawSecret = url.searchParams.get('secret');
    if (!rawSecret) return null;

    const secret = normalizeSecret(rawSecret);
    if (!isValidBase32(secret)) return null;

    const algorithm = normalizeAlgorithm(url.searchParams.get('algorithm'));
    const digits = normalizeDigits(url.searchParams.get('digits'));
    const period = normalizePeriod(url.searchParams.get('period'));
    const issuer = url.searchParams.get('issuer') ?? issuerFromPath;

    return { secret, issuer, account, algorithm, digits, period };
  } catch {
    return null;
  }
}
