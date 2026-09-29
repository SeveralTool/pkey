/**
 * @fileoverview Pure-JS SHA-1 (RFC 3174).
 *
 * Used exclusively for the WebSocket HTTP-upgrade handshake (RFC 6455 §4.2.2),
 * where the accept key is derived as:
 *   base64( sha1( clientKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11" ) )
 *
 * SHA-1 is NOT used for any security-sensitive operation in PKEY — all auth
 * uses HMAC-SHA-256 (from expo-crypto). This implementation is intentionally
 * minimal: no streaming, inputs limited to ASCII strings up to a few KB.
 */

/** Returns a Uint8Array (20 bytes) SHA-1 digest of an ASCII string. */
export function sha1Bytes(input: string): Uint8Array {
  // Encode as UTF-8 bytes.
  const msg = utf8Encode(input);
  const len = msg.length;

  // Pre-processing: padding.
  // Append 0x80, then zeros, then 64-bit big-endian bit-length.
  const bitLen = len * 8;
  const padLen = len % 64 < 56 ? 56 - (len % 64) : 120 - (len % 64);
  const padded = new Uint8Array(len + padLen + 8);
  padded.set(msg);
  padded[len] = 0x80;
  // Write 64-bit big-endian bit length (JS numbers are safe up to 2^53 bits).
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  // Initial hash values (H0..H4).
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  // Process each 512-bit block.
  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Uint32Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = rol32(x, 1);
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rol32(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rol32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const result = new Uint8Array(20);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0, false);
  rv.setUint32(4, h1, false);
  rv.setUint32(8, h2, false);
  rv.setUint32(12, h3, false);
  rv.setUint32(16, h4, false);
  return result;
}

/** Returns a base64 string from raw bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += chars[(b0 >> 2) & 0x3f];
    out += chars[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0f)];
    out += i + 1 < bytes.length ? chars[((b1 & 0x0f) << 2) | ((b2 >> 6) & 0x03)] : '=';
    out += i + 2 < bytes.length ? chars[b2 & 0x3f] : '=';
  }
  return out;
}

/** Computes the Sec-WebSocket-Accept header value for a given client key. */
export function wsAcceptKey(clientKey: string): string {
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  return bytesToBase64(sha1Bytes(clientKey + GUID));
}

// ---- helpers ----

function rol32(n: number, bits: number): number {
  return ((n << bits) | (n >>> (32 - bits))) >>> 0;
}

function utf8Encode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i)!;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
      i++; // surrogate pair consumed
    }
  }
  return new Uint8Array(bytes);
}
