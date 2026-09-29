/**
 * @fileoverview Shared OTP field parsing (manual Base32 or otpauth:// URI).
 */

import { isValidBase32, normalizeSecret, parseOtpAuthUri, type OtpAlgorithm } from './totp';

/** Outcome of {@link processOtpInput}. */
export type OtpInputResult =
  | {
      kind: 'uri';
      secret: string;
      algorithm?: OtpAlgorithm;
      digits?: 6 | 8;
      period?: number;
    }
  | { kind: 'secret'; secret: string }
  | { kind: 'invalid_uri' }
  | { kind: 'invalid_secret' };

/**
 * Processes raw OTP field input (manual secret or otpauth:// URI).
 * Empty input clears the secret. Invalid Base32 / URIs are rejected.
 *
 * @param text - Raw field value.
 */
export function processOtpInput(text: string): OtpInputResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { kind: 'secret', secret: '' };
  }

  if (trimmed.startsWith('otpauth://')) {
    const parsed = parseOtpAuthUri(trimmed);
    if (!parsed) {
      return { kind: 'invalid_uri' };
    }
    return {
      kind: 'uri',
      secret: parsed.secret,
      algorithm: parsed.algorithm,
      digits: parsed.digits,
      period: parsed.period,
    };
  }

  const normalized = normalizeSecret(trimmed);
  if (!isValidBase32(normalized)) {
    return { kind: 'invalid_secret' };
  }

  return { kind: 'secret', secret: normalized };
}
