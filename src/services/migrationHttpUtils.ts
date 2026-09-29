/**
 * @fileoverview Minimal HTTP/1.1 helpers for local migration and web sync servers.
 */

import { encryptFrame, MIGRATION_V2_CONTENT_TYPE } from './migrationChannelCrypto';

export const MAX_HTTP_HEADER_BYTES = 8 * 1024;
export const MAX_HTTP_BODY_BYTES = 2 * 1024 * 1024;
export const SOCKET_READ_TIMEOUT_MS = 5_000;
export const MAX_WS_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_SOCKET_BUFFER_BYTES = MAX_HTTP_HEADER_BYTES + MAX_HTTP_BODY_BYTES;

const SAFE_METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const SAFE_PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/%\-]*$/;

export interface ParsedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export type HttpParseResult =
  | { ok: true; req: ParsedRequest; consumed: number }
  | { ok: false; incomplete: true }
  | { ok: false; incomplete: false; status: number; code: string; msg: string };

const parseContentLength = (headers: Record<string, string>): number | 'invalid' | 'missing' => {
  const raw = headers['content-length'];
  if (raw === undefined || raw === '') return 0;
  if (!/^\d+$/.test(raw)) return 'invalid';
  const cl = Number(raw);
  if (!Number.isSafeInteger(cl)) return 'invalid';
  return cl;
};

/** Parses a complete HTTP request from a socket buffer, including bytes consumed. */
export const tryParseRequestWithConsumed = (raw: string): HttpParseResult => {
  if (raw.length > MAX_SOCKET_BUFFER_BYTES) {
    return {
      ok: false,
      incomplete: false,
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      msg: 'Request too large',
    };
  }

  const sep = '\r\n\r\n';
  const sepIdx = raw.indexOf(sep);
  if (sepIdx === -1) {
    if (raw.length > MAX_HTTP_HEADER_BYTES) {
      return {
        ok: false,
        incomplete: false,
        status: 400,
        code: 'HEADER_TOO_LARGE',
        msg: 'Header block too large',
      };
    }
    return { ok: false, incomplete: true };
  }

  const headerPart = raw.slice(0, sepIdx);
  if (headerPart.length > MAX_HTTP_HEADER_BYTES) {
    return {
      ok: false,
      incomplete: false,
      status: 400,
      code: 'HEADER_TOO_LARGE',
      msg: 'Header block too large',
    };
  }

  const lines = headerPart.split('\r\n');
  const firstLineParts = (lines[0] || '').split(' ');
  const method = firstLineParts[0] || '';
  const path = firstLineParts[1] || '';

  if (!SAFE_METHOD.test(method)) {
    return {
      ok: false,
      incomplete: false,
      status: 400,
      code: 'BAD_METHOD',
      msg: 'Invalid request method',
    };
  }
  if (!SAFE_PATH.test(path)) {
    return {
      ok: false,
      incomplete: false,
      status: 400,
      code: 'BAD_PATH',
      msg: 'Invalid request path',
    };
  }

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const ci = lines[i].indexOf(':');
    if (ci > 0) {
      headers[lines[i].slice(0, ci).toLowerCase().trim()] = lines[i].slice(ci + 1).trim();
    }
  }

  if (headers['transfer-encoding']?.toLowerCase().includes('chunked')) {
    return {
      ok: false,
      incomplete: false,
      status: 400,
      code: 'CHUNKED_NOT_SUPPORTED',
      msg: 'Chunked transfer encoding not supported',
    };
  }

  const clParsed = parseContentLength(headers);
  if (clParsed === 'invalid') {
    return {
      ok: false,
      incomplete: false,
      status: 400,
      code: 'BAD_CONTENT_LENGTH',
      msg: 'Invalid Content-Length',
    };
  }
  if (clParsed > MAX_HTTP_BODY_BYTES) {
    return {
      ok: false,
      incomplete: false,
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      msg: 'Payload too large',
    };
  }

  const bodyStart = sepIdx + sep.length;
  if (raw.length < bodyStart + clParsed) {
    if (raw.length > MAX_SOCKET_BUFFER_BYTES) {
      return {
        ok: false,
        incomplete: false,
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        msg: 'Payload too large',
      };
    }
    return { ok: false, incomplete: true };
  }

  return {
    ok: true,
    req: { method, path, headers, body: raw.slice(bodyStart, bodyStart + clParsed) },
    consumed: bodyStart + clParsed,
  };
};

/** Parses a complete HTTP request, or `null` if incomplete/invalid. */
export const tryParseRequest = (raw: string): ParsedRequest | null => {
  const parsed = tryParseRequestWithConsumed(raw);
  return parsed.ok ? parsed.req : null;
};

export const tryParseHttpResponse = (
  raw: string
): { status: number; body: string; consumed: number; headers: Record<string, string> } | null => {
  const sep = '\r\n\r\n';
  const sepIdx = raw.indexOf(sep);
  if (sepIdx === -1) return null;

  const headerPart = raw.slice(0, sepIdx);
  if (headerPart.length > MAX_HTTP_HEADER_BYTES) return null;

  const statusLine = headerPart.split('\r\n')[0] || '';
  const m = statusLine.match(/HTTP\/\d(?:\.\d)? (\d{3})/);
  const status = m ? parseInt(m[1], 10) : 0;

  const headers: Record<string, string> = {};
  for (const line of headerPart.split('\r\n').slice(1)) {
    const ci = line.indexOf(':');
    if (ci > 0) {
      headers[line.slice(0, ci).toLowerCase().trim()] = line.slice(ci + 1).trim();
    }
  }

  const clParsed = parseContentLength(headers);
  if (clParsed === 'invalid' || clParsed > MAX_HTTP_BODY_BYTES) return null;

  const bodyStart = sepIdx + sep.length;
  if (raw.length < bodyStart + clParsed) return null;

  return {
    status,
    body: raw.slice(bodyStart, bodyStart + clParsed),
    consumed: bodyStart + clParsed,
    headers,
  };
};

export const attachBoundedSocket = (
  socket: any,
  onRequest: (req: ParsedRequest, socket: any) => void | Promise<void>
): void => {
  let buffer = '';

  const resetTimeout = () => {
    if (typeof socket.setTimeout === 'function') {
      socket.setTimeout(SOCKET_READ_TIMEOUT_MS);
    }
  };

  resetTimeout();

  socket.on('timeout', () => {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  });

  const processBuffer = async () => {
    while (buffer.length > 0) {
      const parsed = tryParseRequestWithConsumed(buffer);
      if (!parsed.ok) {
        if (parsed.incomplete) return;
        writeHttpError(socket, parsed.status, parsed.code, parsed.msg);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      buffer = buffer.slice(parsed.consumed);
      await onRequest(parsed.req, socket);
    }
  };

  socket.on('data', (data: Buffer | string) => {
    resetTimeout();
    const chunk = typeof data === 'string' ? data : data.toString('utf8');
    buffer += chunk;
    if (Buffer.byteLength(buffer, 'utf8') > MAX_SOCKET_BUFFER_BYTES) {
      writeHttpError(socket, 413, 'PAYLOAD_TOO_LARGE', 'Request too large');
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      return;
    }
    void processBuffer();
  });

  socket.on('end', () => {
    void processBuffer();
  });
};

/** Writes a JSON HTTP response to a TCP socket. */
export const writeHttpResponse = (
  socket: any,
  status: number,
  body: unknown,
  keepAlive = false
): void => {
  const json = JSON.stringify(body);
  const len = json.length;
  const statusText =
    status === 200
      ? 'OK'
      : status === 401
        ? 'Unauthorized'
        : status === 400
          ? 'Bad Request'
          : status === 413
            ? 'Payload Too Large'
            : 'Error';
  const response = [
    `HTTP/1.1 ${status} ${statusText}`,
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${len}`,
    keepAlive ? 'Connection: keep-alive' : 'Connection: close',
    'Access-Control-Allow-Origin: *',
    '',
    json,
  ].join('\r\n');
  try {
    socket.write(response);
    if (!keepAlive) {
      try {
        socket.end();
      } catch {
        try {
          if (typeof socket.destroy === 'function' && socket.writable !== undefined) {
            socket.destroy();
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    try {
      if (typeof socket.destroy === 'function' && socket.writable !== undefined) {
        socket.destroy();
      }
    } catch {
      /* ignore */
    }
  }
};

/** Writes a structured JSON error response. */
export const writeHttpError = (
  socket: any,
  status: number,
  code: string,
  msg: string,
  keepAlive = false
): void => {
  writeHttpResponse(socket, status, { error: msg, code }, keepAlive);
};

export const writeHttpEncryptedResponse = (
  socket: any,
  status: number,
  channelKeyHex: string,
  body: unknown,
  keepAlive = false
): void => {
  const frame = encryptFrame(channelKeyHex, JSON.stringify(body));
  const statusText =
    status === 200
      ? 'OK'
      : status === 401
        ? 'Unauthorized'
        : status === 400
          ? 'Bad Request'
          : status === 413
            ? 'Payload Too Large'
            : status === 429
              ? 'Too Many Requests'
              : 'Error';
  const response = [
    `HTTP/1.1 ${status} ${statusText}`,
    `Content-Type: ${MIGRATION_V2_CONTENT_TYPE}`,
    `Content-Length: ${frame.length}`,
    keepAlive ? 'Connection: keep-alive' : 'Connection: close',
    'Access-Control-Allow-Origin: *',
    '',
    frame,
  ].join('\r\n');
  try {
    socket.write(response);
    if (!keepAlive) {
      try {
        socket.end();
      } catch {
        try {
          // Only destroy client sockets — never call destroy on a Server handle.
          if (typeof socket.destroy === 'function' && socket.writable !== undefined) {
            socket.destroy();
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    try {
      if (typeof socket.destroy === 'function' && socket.writable !== undefined) {
        socket.destroy();
      }
    } catch {
      /* ignore */
    }
  }
};

export const writeHttpEncryptedError = (
  socket: any,
  status: number,
  channelKeyHex: string,
  code: string,
  msg: string,
  keepAlive = false
): void => {
  writeHttpEncryptedResponse(socket, status, channelKeyHex, { error: msg, code }, keepAlive);
};

/** Creates a native TCP server with bounded socket buffers. */
export const createTcpServer = (
  onRequest: (req: ParsedRequest, socket: any) => Promise<void>
): Promise<{ server: any; port: number }> => {
  const { getNativeTcpSocket } = require('../utils/nativeTcpSocket');
  const Tcp = getNativeTcpSocket();
  if (!Tcp) {
    return Promise.reject(
      new Error('react-native-tcp-socket is not available (requires dev build)')
    );
  }

  return new Promise((resolve, reject) => {
    const server = Tcp.createServer((socket: any) => {
      attachBoundedSocket(socket, (req, sock) =>
        onRequest(req, sock).catch(() => {
          writeHttpError(sock, 500, 'INTERNAL_ERROR', 'Server error');
        })
      );
    });

    server.on('error', (err: Error) => reject(err));
    resolve({ server, port: 0 });
  });
};

/** Start listening on a fixed port. */
export const listenTcpServer = (server: any, port: number, host = '0.0.0.0'): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.listen({ port, host, reuseAddress: true }, () => resolve());
    server.once('error', reject);
  });
};

/** Stops a TCP server if it is listening. */
export const stopTcpServer = (server: any): void => {
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
  }
};
