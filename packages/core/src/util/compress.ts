/**
 * @fileoverview Gzip + base64 payload compression for sync/transport.
 */

import { gzip, ungzip } from 'pako';

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Gzip-compresses a UTF-8 string and returns base64.
 *
 * @param json - UTF-8 payload (typically JSON text).
 * @returns Base64-encoded gzip bytes.
 */
export function compressPayload(json: string): string {
  const compressed = gzip(json);
  return bytesToBase64(compressed);
}

/**
 * Decompresses a base64 gzip payload back to UTF-8.
 *
 * @param compressed - Base64 string from {@link compressPayload}.
 * @returns Inflated UTF-8 string.
 */
export function decompressPayload(compressed: string): string {
  const bytes = base64ToBytes(compressed);
  const inflated = ungzip(bytes);
  return new TextDecoder().decode(inflated);
}
