/**
 * @fileoverview Persistent TCP session for migration HTTP requests.
 * Reuses one connection (keep-alive) — avoids Android RN issues with rapid reconnects.
 */

import { SHA256, Hex, Base64 } from 'crypto-es';
import { getNativeTcpSocket } from '../utils/nativeTcpSocket';
import { getTlsClientOptions } from './tlsCredentials';
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
   * same "first 16 hex chars of SHA-256, uppercase" format used by
   * `fingerprintTlsCertificatePem`. `null` when the native TLS layer did not
   * expose `getPeerCertificate` (older `react-native-tcp-socket` builds) —
   * in that case callers fall back to comparing the receiver-declared
   * fingerprint and warning the user.
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
        // Best-effort: capture the actual peer certificate fingerprint. Some
        // react-native-tcp-socket builds return null; treat as "unknown" and
        // let the caller decide how to react.
        try {
          this.captureTlsFingerprint();
        } catch {
          /* ignore */
        }
        resolve();
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
   * Extracts the SHA-256 fingerprint of the certificate the TLS peer served
   * on the current socket, formatted the same way as
   * `fingerprintTlsCertificatePem` (first 16 hex chars uppercase). Returns
   * `null` when the underlying TLS layer does not expose the certificate.
   */
  private captureTlsFingerprint(): void {
    if (!this.client) return;
    const getter =
      typeof this.client.getPeerCertificate === 'function'
        ? this.client.getPeerCertificate.bind(this.client)
        : null;
    if (!getter) {
      this.tlsPeerFingerprint = null;
      return;
    }
    let peer: unknown;
    try {
      peer = getter({ raw: true }) ?? getter();
    } catch {
      this.tlsPeerFingerprint = null;
      return;
    }
    // Different implementations return either a Buffer (`raw: true`), a Node
    // `PeerCertificate` object with a `raw` field, or a `fingerprint256`
    // string that we can reformat.
    const anyPeer = peer as {
      raw?: Buffer | Uint8Array | string;
      fingerprint256?: string;
    };
    if (anyPeer?.fingerprint256 && typeof anyPeer.fingerprint256 === 'string') {
      this.tlsPeerFingerprint = anyPeer.fingerprint256.replace(/:/g, '').slice(0, 16).toUpperCase();
      return;
    }
    const raw = anyPeer?.raw ?? peer;
    if (raw == null) {
      this.tlsPeerFingerprint = null;
      return;
    }
    try {
      let derBase64: string;
      if (typeof raw === 'string') {
        // Some builds return base64 directly.
        derBase64 = raw;
      } else if (typeof (raw as { toString?: (enc: string) => string }).toString === 'function') {
        derBase64 = (raw as { toString: (enc: string) => string }).toString('base64');
      } else {
        this.tlsPeerFingerprint = null;
        return;
      }
      // Convert base64 → WordArray of DER bytes → SHA-256 → first 16 hex.
      // Matches `fingerprintTlsCertificatePem` exactly so the app-protocol
      // fingerprint and the socket-observed fingerprint are directly
      // comparable.
      const der = Base64.parse(derBase64.replace(/\s+/g, ''));
      this.tlsPeerFingerprint = SHA256(der).toString(Hex).slice(0, 16).toUpperCase();
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
