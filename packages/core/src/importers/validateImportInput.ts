/**
 * @fileoverview Pre-parse gates for third-party import files (extension + binary sniff).
 */

import type { ImportFileInput } from './types';
import { isZipMagic } from './formatDetectors/utils';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.json', '.txt', '.1pif', '.zip']);

/** Sample size for printable-ratio / magic checks. */
const SNIFF_BYTES = 4096;

/**
 * Returns the lowercase file extension including the dot, or empty string.
 */
export function importFileExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot).toLowerCase();
}

function bytesFromInput(input: ImportFileInput): Uint8Array | null {
  if (input.bytes?.length) return input.bytes;
  if (!input.content) return null;
  // Encode a prefix for magic / printable sniff when only text is available.
  const slice = input.content.slice(0, SNIFF_BYTES);
  return new TextEncoder().encode(slice);
}

function hasNullByte(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, SNIFF_BYTES);
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

function printableRatio(bytes: Uint8Array): number {
  const n = Math.min(bytes.length, SNIFF_BYTES);
  if (n === 0) return 1;
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    // Tab, LF, CR, or printable ASCII / high UTF-8 continuation bytes
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b !== 0x7f) || b >= 0x80) {
      printable++;
    }
  }
  return printable / n;
}

/**
 * Detects common non-import binary containers (PDF, images, MP4, etc.).
 * ZIP (`PK`) is not treated as unsupported here — 1Password uses it.
 */
export function looksLikeUnsupportedBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (isZipMagic(bytes)) return false;

  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return true;
  }
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true;
  }
  // MP4 / ISO BMFF — "ftyp" at offset 4
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }
  // RIFF (AVI/WAV/WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return true;
  }

  if (hasNullByte(bytes)) return true;
  if (printableRatio(bytes) < 0.85) return true;

  return false;
}

export type ImportInputValidation =
  | { ok: true }
  | { ok: false; reason: 'unsupported_format' };

/**
 * Validates that an import file looks like an allowed password-manager export
 * before format detection / parsing.
 */
export function validateImportInput(input: ImportFileInput): ImportInputValidation {
  const ext = importFileExtension(input.name);
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'unsupported_format' };
  }

  // .1pif is JSON-lines text; skip binary sniff when extension is explicit.
  if (ext === '.1pif') {
    return { ok: true };
  }

  const bytes = bytesFromInput(input);
  // ZIP magic is treated as allowed inside looksLikeUnsupportedBinary.
  if (bytes && looksLikeUnsupportedBinary(bytes)) {
    return { ok: false, reason: 'unsupported_format' };
  }

  return { ok: true };
}
