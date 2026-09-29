/**
 * @fileoverview Minimal HTTP/1.1 client over TCP for LAN migration.
 * More reliable than fetch() to local IPs on some Android devices.
 */

import { getNativeTcpSocket } from '../utils/nativeTcpSocket';
import { getTlsClientOptions } from './tlsCredentials';
import { MigrationSendError } from './migrationErrors';

const REQUEST_TIMEOUT_MS = 15_000;

export interface MigrationHttpResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * Performs a single HTTP/1.1 request over a short-lived TLS TCP connection.
 *
 * @returns Status and response body (headers optional)
 */
export const migrationHttpRequest = (
  host: string,
  port: number,
  method: string,
  path: string,
  options?: { headers?: Record<string, string>; body?: string }
): Promise<MigrationHttpResponse> => {
  return new Promise((resolve, reject) => {
    const Tcp = getNativeTcpSocket();
    if (!Tcp) {
      reject(new MigrationSendError('TCP_UNAVAILABLE'));
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const body = options?.body ?? '';
    const extraHeaders = options?.headers ?? {};

    let client: any;
    const timer = setTimeout(() => {
      try {
        client?.destroy();
      } catch {
        /* ignore */
      }
      finish(() => reject(new MigrationSendError('TIMEOUT')));
    }, REQUEST_TIMEOUT_MS);

    try {
      client = Tcp.connectTLS(getTlsClientOptions(host, port), () => {
        const lines = [
          `${method} ${path} HTTP/1.1`,
          `Host: ${host}`,
          'Connection: close',
          'Accept: application/json',
        ];
        if (body) {
          lines.push('Content-Type: application/json; charset=utf-8');
          lines.push(`Content-Length: ${body.length}`);
        }
        for (const [k, v] of Object.entries(extraHeaders)) {
          lines.push(`${k}: ${v}`);
        }
        lines.push('', body);
        client.write(lines.join('\r\n'));
      });
    } catch {
      finish(() => reject(new MigrationSendError('RECEIVER_UNREACHABLE')));
      return;
    }

    let raw = '';
    client.on('data', (chunk: Buffer | string) => {
      raw += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    client.on('error', () => {
      finish(() => reject(new MigrationSendError('RECEIVER_UNREACHABLE')));
    });
    client.on('close', () => {
      finish(() => {
        const sep = '\r\n\r\n';
        const idx = raw.indexOf(sep);
        if (idx === -1) {
          reject(new MigrationSendError('RECEIVER_UNREACHABLE'));
          return;
        }
        const statusLine = raw.split('\r\n')[0] || '';
        const m = statusLine.match(/HTTP\/\d(?:\.\d)? (\d{3})/);
        const status = m ? parseInt(m[1], 10) : 0;
        resolve({ status, body: raw.slice(idx + sep.length) });
      });
    });
  });
};

/** Convenience GET wrapper around `migrationHttpRequest`. */
export const migrationHttpGet = (
  host: string,
  port: number,
  path: string,
  headers?: Record<string, string>
) => migrationHttpRequest(host, port, 'GET', path, { headers });

/** Convenience POST wrapper around `migrationHttpRequest`. */
export const migrationHttpPost = (
  host: string,
  port: number,
  path: string,
  body: string,
  headers?: Record<string, string>
) => migrationHttpRequest(host, port, 'POST', path, { headers, body });
