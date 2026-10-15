/**
 * @fileoverview Persistent TCP session for migration HTTP requests.
 * Reuses one connection (keep-alive) — avoids Android RN issues with rapid reconnects.
 */

import { SHA256, Hex, Base64 } from 'crypto-es';
import { getNativeTcpSocket } from '../utils/nativeTcpSocket';
import { formatTlsFingerprintHex, getTlsClientOptions } from './tlsCredentials';
import { MigrationSendError } from './migrationErrors';
import { tryParseHttpResponse } from './migrationHttpUtils';
import type { MigrationHttpResponse } from './migrationHttpClient';
import { parseJsonUnknown, tryParseJson } from '../utils/jsonUnknown';
import {
  decryptFrame,
  encryptFrame,
  isMigrationV2ContentType,
  MIGRATION_V2_CONTENT_TYPE,
} from './migrationChannelCrypto';

const REQUEST_TIMEOUT_MS = 30_000;

const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function sha256HexOfBytes(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return SHA256(Hex.parse(hex)).toString(Hex);
}

function sha256HexOfBase64Der(base64: string): string | null {
  const cleaned = base64.replace(/\s+/g, '');
  if (!cleaned || !BASE64_RE.test(cleaned)) return null;
  return SHA256(Base64.parse(cleaned)).toString(Hex);
}

/**
 * Formats a peer certificate object returned by `TLSSocket.getPeerCertificate()`
 * as the user-visible fingerprint (`formatTlsFingerprintHex` of SHA-256 over the
 * DER). Accepted shapes:
 *
 *  - `{ fingerprint256: "AA:BB:…" }` — Android (`react-native-tcp-socket`);
 *  - `{ raw: Buffer | Uint8Array | base64 string }`, a bare `Uint8Array`, a
 *    JSON-serialised Buffer (`{ type: 'Buffer', data: number[] }`) or a base64 string.
 *
 * Anything else — including a `Promise` (the native method is async), `null`,
 * or the iOS dictionary that only carries `pubkey` / `subject` / `issuer` —
 * returns `null`. Callers must abort: a missing observation is not a pin.
 */
export function peerCertificateFingerprint(peer: unknown): string | null {
  if (peer == null) return null;
  if (typeof peer === 'string') {
    const hex = sha256HexOfBase64Der(peer);
    return hex ? formatTlsFingerprintHex(hex) : null;
  }
  if (peer instanceof Uint8Array) {
    return peer.length ? formatTlsFingerprintHex(sha256HexOfBytes(peer)) : null;
  }
  if (typeof peer !== 'object' || typeof (peer as PromiseLike<unknown>).then === 'function') {
    return null;
  }
  const rec = peer as { fingerprint256?: unknown; raw?: unknown; type?: unknown; data?: unknown };
  if (typeof rec.fingerprint256 === 'string') {
    const hex = rec.fingerprint256.replace(/:/g, '').trim();
    return SHA256_HEX_RE.test(hex) ? formatTlsFingerprintHex(hex) : null;
  }
  if (rec.type === 'Buffer' && Array.isArray(rec.data)) {
    const bytes = Uint8Array.from(
      rec.data.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 255)
    );
    return bytes.length === rec.data.length && bytes.length > 0
      ? formatTlsFingerprintHex(sha256HexOfBytes(bytes))
      : null;
  }
  if (rec.raw !== undefined) {
    const raw = rec.raw;
    if (typeof raw === 'string') {
      const hex = sha256HexOfBase64Der(raw);
      return hex ? formatTlsFingerprintHex(hex) : null;
    }
    if (raw instanceof Uint8Array) {
      return raw.length ? formatTlsFingerprintHex(sha256HexOfBytes(raw)) : null;
    }
    if (raw && typeof raw === 'object') return peerCertificateFingerprint(raw);
  }
  return null;
}

export class MigrationTcpSession {
  private client: any = null;
  private raw = '';
  private host = '';
  private port = 0;
  private connected = false;
  private pending: {
    resolve: (res: MigrationHttpResponse) => void;
    reject: (err: Error) => void;
    path: string;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Fingerprint of the certificate the TLS peer actually presented, in the
   * same `formatTlsFingerprintHex` format used by `fingerprintTlsCertificatePem`.
   * `null` when the native TLS layer did not expose the DER or a SHA-256 of it
   * (iOS `react-native-tcp-socket` returns only pubkey / subject / issuer).
   * Callers abort the transfer; they do not fall back to the declared value.
   *
   * Audit finding A1: this closes the "self-reported fingerprint" loop by
   * cross-checking the fingerprint reported over the app protocol against
   * the certificate observed on the socket. An attacker who MITMs the
   * receiver must serve their own cert, which cannot match the fingerprint
   * pinned out-of-band (QR / manual comparison).
   */
  private tlsPeerFingerprint: string | null = null;

  /** Actual TLS certificate fingerprint captured on the secure connect event. */
  get peerFingerprint(): string | null {
    return this.tlsPeerFingerprint;
  }

  async connect(host: string, port: number): Promise<void> {
    const Tcp = getNativeTcpSocket();
    if (!Tcp) throw new MigrationSendError('TCP_UNAVAILABLE');

    this.host = host;
    this.port = port;
    this.raw = '';
    this.tlsPeerFingerprint = null;

    return new Promise((resolve, reject) => {
      let settled = false;
      const settleOk = () => {
        if (settled) return;
        settled = true;
        this.connected = true;
        // Best-effort: capture the actual peer certificate fingerprint before
        // the caller reads `peerFingerprint`. `getPeerCertificate()` is a
        // Promise on both native modules; a missing / unusable certificate
        // leaves `null` and lets the caller decide how to react.
        void this.captureTlsFingerprint().finally(resolve);
      };
      const settleErr = (err: Error) => {
        if (settled) return;
        settled = true;
        this.connected = false;
        try {
          this.client?.destroy?.();
        } catch {
          /* ignore */
        }
        this.client = null;
        reject(err);
      };

      try {
        this.client = Tcp.connectTLS(getTlsClientOptions(host, port), () => {
          settleOk();
        });
      } catch (e) {
        settleErr(new MigrationSendError('RECEIVER_UNREACHABLE', 'create_throw'));
        return;
      }

      this.client.on('data', (chunk: Buffer | string) => {
        this.raw += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        this.tryResolvePending();
      });
      this.client.on('error', () => {
        this.failPending(new MigrationSendError('RECEIVER_UNREACHABLE'));
        settleErr(new MigrationSendError('RECEIVER_UNREACHABLE', 'socket_error'));
      });
      this.client.on('close', () => {
        this.connected = false;
        if (this.pending) {
          this.failPending(new MigrationSendError('RECEIVER_UNREACHABLE'));
        }
      });
    });
  }

  /**
   * Resolves the SHA-256 fingerprint of the certificate the TLS peer served on
   * the current socket (see {@link peerCertificateFingerprint}). The native
   * `getPeerCertificate` is asynchronous; awaiting it here is what keeps the
   * sender from hashing a `Promise` object and aborting on a false mismatch.
   */
  private async captureTlsFingerprint(): Promise<void> {
    this.tlsPeerFingerprint = null;
    const client = this.client;
    if (!client || typeof client.getPeerCertificate !== 'function') return;
    try {
      const peer: unknown = await Promise.resolve(client.getPeerCertificate());
      this.tlsPeerFingerprint = peerCertificateFingerprint(peer);
    } catch {
      this.tlsPeerFingerprint = null;
    }
  }

  request(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body = ''
  ): Promise<MigrationHttpResponse> {
    if (!this.connected || !this.client) {
      return Promise.reject(new MigrationSendError('RECEIVER_UNREACHABLE', 'not_connected'));
    }
    if (this.pending) {
      return Promise.reject(new Error('MigrationTcpSession: request already in flight'));
    }

    const lines = [
      `${method} ${path} HTTP/1.1`,
      `Host: ${this.host}`,
      'Connection: keep-alive',
      'Accept: application/json',
    ];
    if (body) {
      const contentType =
        headers['Content-Type'] || headers['content-type'] || 'application/json; charset=utf-8';
      lines.push(`Content-Type: ${contentType}`);
      lines.push(`Content-Length: ${body.length}`);
    }
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'content-type') continue;
      lines.push(`${k}: ${v}`);
    }
    const payload = `${lines.join('\r\n')}\r\n\r\n${body}`;

    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, path };
      this.timer = setTimeout(() => {
        this.failPending(new MigrationSendError('TIMEOUT'));
      }, REQUEST_TIMEOUT_MS);

      try {
        this.client.write(payload);
        this.tryResolvePending();
      } catch {
        this.failPending(new MigrationSendError('RECEIVER_UNREACHABLE'));
      }
    });
  }

  get(path: string, headers?: Record<string, string>) {
    return this.request('GET', path, headers);
  }

  post(path: string, body: string, headers?: Record<string, string>) {
    return this.request('POST', path, headers, body);
  }

  postEncrypted(
    path: string,
    inner: unknown,
    channelKeyHex: string,
    headers?: Record<string, string>
  ) {
    const frame = encryptFrame(channelKeyHex, JSON.stringify(inner));
    return this.post(path, frame, {
      ...headers,
      'Content-Type': MIGRATION_V2_CONTENT_TYPE,
    });
  }

  parseJsonBody(body: string): unknown | null {
    return parseJsonUnknown(body);
  }

  decryptResponseBody(body: string, channelKeyHex: string, contentType?: string): unknown {
    const plain = isMigrationV2ContentType(contentType) ? decryptFrame(channelKeyHex, body) : body;
    const parsed = tryParseJson(plain);
    if (!parsed.ok) throw new Error('invalid_json');
    return parsed.value;
  }

  async postEncryptedJson(
    path: string,
    inner: unknown,
    channelKeyHex: string,
    headers?: Record<string, string>
  ): Promise<{ status: number; data: unknown; contentType?: string }> {
    const res = await this.postEncrypted(path, inner, channelKeyHex, headers);
    const contentType = this.extractContentType(res);
    return {
      status: res.status,
      data: this.decryptResponseBody(res.body, channelKeyHex, contentType),
      contentType,
    };
  }

  async getEncryptedJson(
    path: string,
    channelKeyHex: string,
    headers?: Record<string, string>
  ): Promise<{ status: number; data: unknown; contentType?: string }> {
    const res = await this.get(path, headers);
    const contentType = this.extractContentType(res);
    return {
      status: res.status,
      data: this.decryptResponseBody(res.body, channelKeyHex, contentType),
      contentType,
    };
  }

  private extractContentType(res: MigrationHttpResponse): string | undefined {
    return res.headers?.['content-type'];
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.pending = null;
    try {
      this.client?.destroy();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.connected = false;
    this.raw = '';
  }

  private tryResolvePending(): void {
    if (!this.pending) return;
    const parsed = tryParseHttpResponse(this.raw);
    if (!parsed) return;

    this.raw = this.raw.slice(parsed.consumed);
    const { resolve } = this.pending;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;

    resolve({ status: parsed.status, body: parsed.body, headers: parsed.headers });
  }

  private failPending(err: Error): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
  }
}
