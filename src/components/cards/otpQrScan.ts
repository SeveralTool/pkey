import { parseOtpAuthUri, type OtpAuthParsed } from '@pkey/core';

export type BarcodeScanResult = { kind: 'valid'; parsed: OtpAuthParsed } | { kind: 'invalid' };

/** Parses a scanned QR payload into a valid OTP auth result or invalid. */
export function processOtpBarcodeScan(data: string): BarcodeScanResult {
  const parsed = parseOtpAuthUri(data);
  if (!parsed) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', parsed };
}
