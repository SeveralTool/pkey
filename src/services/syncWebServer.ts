/**
 * @fileoverview HTTPS + WebSocket server for browser-based web clients (port 7392).
 */
import { NativeModules } from 'react-native';
import PkeyWebAccess from 'pkey-web-access';
import {
  formatClientIp,
  isPersistableSourceId,
  sanitizeUserAgent,
  sealOutgoingControl,
} from '@pkey/core';
import { WebSyncClient } from '../types';
import { SyncServerCore, WsMessage } from './syncServerCore';
import { wsAcceptKey } from '../utils/sha1';
import { getPwaHtml, getPwaAsset } from '../web/index';
import { getNativeTcpSocket } from '../utils/nativeTcpSocket';
import {
  tryParseRequestWithConsumed,
  MAX_WS_PAYLOAD_BYTES,
  SOCKET_READ_TIMEOUT_MS,
  MAX_SOCKET_BUFFER_BYTES,
  type ParsedRequest,
} from './migrationHttpUtils';
import { getSecureRandomHex } from '../utils/secureRandom';
import { isAllowedWsOrigin } from './webWsOrigin';
import { buildMetaPayload } from './webMeta';
/** Default TCP port for the browser web-access server. */
export const WEB_SYNC_PORT = 7392;

/**
 * Identity inputs for `GET /pkey/meta`. Hosts and IP are getters because mDNS
 * may publish after the bind and the LAN IP changes with DHCP; both are read
 * synchronously when the request is served.
 */
export interface WebServerOptions {
  deviceId?: string;
  mdnsHost?: () => string;
  ipProvider?: () => string;
}

const GLOBAL_SERVER_KEY = '__PKEY_ACTIVE_SYNC_WEB_SERVER__';
const BOOT_ID_KEY = '__PKEY_WEB_SYNC_BOOT_ID__';

/** Stable boot id used to detect Fast Refresh / process restarts. */
export function getWebSyncBootId(): number {
  const g = globalThis as Record<string, unknown>;
  let id = g[BOOT_ID_KEY] as number | undefined;
  if (!id) {
    id = Date.now();
    g[BOOT_ID_KEY] = id;
  }
  return id;
}

let activeSyncWebServer: SyncWebServer | null = null;

function isServerLive(server: SyncWebServer | null | undefined): server is SyncWebServer {
  return !!server?.running && server.isLive();
}

function getRawGlobalWebServer(): SyncWebServer | null {
  return (
    ((globalThis as Record<string, unknown>)[GLOBAL_SERVER_KEY] as SyncWebServer | undefined) ??
    null
  );
}

function getGlobalWebServer(): SyncWebServer | null {
  const g = getRawGlobalWebServer();
  return isServerLive(g) ? g : null;
}

function setGlobalWebServer(server: SyncWebServer | null): void {
  if (server) {
    (globalThis as Record<string, unknown>)[GLOBAL_SERVER_KEY] = server;
  } else {
    delete (globalThis as Record<string, unknown>)[GLOBAL_SERVER_KEY];
  }
}

/** Returns the currently running sync web server, if any. */
export function getRunningSyncWebServer(): SyncWebServer | null {
  if (isServerLive(activeSyncWebServer)) return activeSyncWebServer;
  return getGlobalWebServer();
}

type PortReleaseDiag = {
  mapSize?: number;
  serverCount?: number;
  closedCount?: number;
  closedIds?: number[];
  source?: string;
};

/**
 * Process-level reclaim of listen sockets on [port] after JS reload.
 * Prefer pkey-web-access (closes against the static TcpSockets map).
 * Used by web sync (7392) and migration receiver/callback (7393/7394).
 */
export async function reclaimNativeTcpPort(port: number): Promise<PortReleaseDiag> {
  try {
    if (typeof PkeyWebAccess?.releaseWebSyncPort === 'function') {
      const result = await PkeyWebAccess.releaseWebSyncPort(port);
      return {
        mapSize: result?.mapSize,
        serverCount: result?.serverCount,
        closedCount: result?.closedCount,
        closedIds: result?.closedIds,
        source: 'pkey-web-access',
      };
    }
  } catch {
    /* fall through to TcpSockets */
  }

  try {
    const TcpSockets = (
      NativeModules as {
        TcpSockets?: { closeServersByPort?: (p: number) => Promise<PortReleaseDiag> };
      }
    ).TcpSockets;
    if (typeof TcpSockets?.closeServersByPort === 'function') {
      const result = await TcpSockets.closeServersByPort(port);
      return { ...result, source: 'TcpSockets' };
    }
  } catch {
    /* ignore */
  }

  return { source: 'none', closedCount: 0 };
}

/** @deprecated Prefer {@link reclaimNativeTcpPort}. */
async function reclaimOrphanNativeServers(port: number): Promise<PortReleaseDiag> {
  return reclaimNativeTcpPort(port);
}

/**
 * Force-stops every known sync web server instance, including stale ones that
 * still hold the native TCP port after Fast Refresh / boot-id mismatch.
 * @returns true if a native listen socket was closed via a JS Server wrapper.
 */
export function forceStopWebSyncServer(): boolean {
  const candidates = new Set<SyncWebServer>();
  if (activeSyncWebServer) candidates.add(activeSyncWebServer);
  const raw = getRawGlobalWebServer();
  if (raw) candidates.add(raw);
  let closedNative = false;
  for (const server of candidates) {
    try {
      if (server.hardClose()) closedNative = true;
    } catch {
      /* ignore */
    }
  }
  activeSyncWebServer = null;
  setGlobalWebServer(null);
  return closedNative;
}

/**
 * forceStop + process-level port reclaim (static TcpSockets map via pkey-web-access).
 */
export async function forceStopWebSyncServerAsync(_options?: {
  reclaimOrphanNative?: boolean;
}): Promise<void> {
  forceStopWebSyncServer();

  const diag = await reclaimOrphanNativeServers(WEB_SYNC_PORT);
  if ((diag.closedCount ?? 0) > 0 || (diag.mapSize ?? 0) > 0) {
    console.warn(
      `[SyncWebServer] port reclaim (source=${diag.source}, closed=${diag.closedCount ?? 0}, mapSize=${diag.mapSize ?? '?'}, servers=${diag.serverCount ?? '?'})`
    );
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 200));
}

const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Writes a full HTTP response. For large bodies (PWA HTML ~138KB), must wait for
 * react-native-tcp-socket's async native `written` callback before `end()` —
 * calling `end()`/`destroy()` immediately truncates and causes
 * ERR_CONTENT_LENGTH_MISMATCH in browsers.
 */
const writeHttp = (
  socket: any,
  status: number,
  contentType: string,
  body: string | Buffer,
  extraHeaders: Record<string, string> = {}
): void => {
  const statusText =
    status === 200
      ? 'OK'
      : status === 101
        ? 'Switching Protocols'
        : status === 400
          ? 'Bad Request'
          : status === 403
            ? 'Forbidden'
            : 'Not Found';
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const headers = { ...DEFAULT_SECURITY_HEADERS, ...extraHeaders };
  const headerLines = [
    `HTTP/1.1 ${status} ${statusText}`,
    `Content-Type: ${contentType}`,
    `Content-Length: ${bodyBuf.length}`,
    'Connection: close',
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
    '',
    '',
  ];
  try {
    // Idle read timeout must not fire while the large body is flushing to native.
    if (typeof socket.setTimeout === 'function') {
      socket.setTimeout(0);
    }
    const headerBuf = Buffer.from(headerLines.join('\r\n'), 'utf8');
    const payload = Buffer.concat([headerBuf, bodyBuf]);
    // react-native-tcp-socket signature is write(buffer, encoding, cb) — not write(buffer, cb).
    // Use binary (latin1) so PNG icon bytes and UTF-8 HTML are both preserved.
    socket.write(payload, 'binary', (err?: Error) => {
      if (err) {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      if (status === 101) return;
      try {
        socket.end();
      } catch {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
};

const encodeWsFrame = (text: string): Buffer => {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;

  let header: Buffer;
  if (len <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
};

const encodePingFrame = (): Buffer => {
  const f = Buffer.alloc(2);
  f[0] = 0x89;
  f[1] = 0x00;
  return f;
};

const encodePongFrame = (payload: Buffer): Buffer => {
  const header = Buffer.alloc(2);
  header[0] = 0x8a;
  header[1] = payload.length;
  return Buffer.concat([header, payload]);
};

const encodeCloseFrame = (): Buffer => {
  const f = Buffer.alloc(2);
  f[0] = 0x88;
  f[1] = 0x00;
  return f;
};

export interface WsFrame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  consumed: number;
}

/** Exported for tests. Decodes one client frame; see RFC 6455 section 5.2. */
export const tryDecodeWsFrame = (buf: Buffer): WsFrame | null | 'too_large' | 'unmasked' => {
  if (buf.length < 2) return null;

  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  // RFC 6455: client→server frames MUST be masked
  if (!masked) return 'unmasked';
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  if (payloadLen > MAX_WS_PAYLOAD_BYTES) return 'too_large';

  const maskLen = 4;
  if (buf.length < offset + maskLen + payloadLen) return null;

  const mask = buf.slice(offset, offset + 4);
  const raw = buf.slice(offset + 4, offset + 4 + payloadLen);
  const payload = Buffer.alloc(payloadLen);
  for (let i = 0; i < payloadLen; i++) {
    payload[i] = raw[i] ^ mask[i % 4];
  }
  offset += 4 + payloadLen;

  return { fin, opcode, payload, consumed: offset };
};

interface WsConnection {
  socket: any;
  buffer: Buffer;
  httpBuffer: string;
  handshakeDone: boolean;
  session: ReturnType<SyncServerCore['createWsSession']> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  socketId: string;
  connectedAt: number;
  /** User-Agent from the HTTP upgrade request (untrusted display only). */
  handshakeUserAgent: string | null;
  /** RFC 6455 fragmented message reassembly (text/binary). */
  fragOpcode: number | null;
  fragParts: Buffer[];
  fragBytes: number;
}

let _nextSocketId = 1;
const makeSocketId = () => `ws-${Date.now()}-${_nextSocketId++}`;

/**
 * True when a live WS session should appear in the master's connected-client UI.
 * Unidentified upgrades, discovery probes, and blocked source ids must not flash
 * a connecting count.
 */
export function shouldPublishWebClient(
  handshakeDone: boolean,
  sourceId: string | null | undefined,
  isBlocked: (sourceId: string) => boolean
): boolean {
  if (!handshakeDone) return false;
  if (!isPersistableSourceId(sourceId)) return false;
  return !isBlocked(sourceId);
}

/** True when two client snapshots would paint the same connected/pending UI. */
export function webClientsUiEqual(
  a: ReadonlyArray<Pick<WebSyncClient, 'socketId' | 'sourceId' | 'authenticated'>>,
  b: ReadonlyArray<Pick<WebSyncClient, 'socketId' | 'sourceId' | 'authenticated'>>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.socketId !== right.socketId ||
      (left.sourceId ?? '') !== (right.sourceId ?? '') ||
      left.authenticated !== right.authenticated
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Local HTTP + WebSocket server that serves the embedded web vault and sync protocol
 * to browsers on the LAN (default port {@link WEB_SYNC_PORT}).
 */
export class SyncWebServer {
  private server: any = null;
  private _port: number = WEB_SYNC_PORT;
  private _running = false;
  private connections = new Map<string, WsConnection>();
  private _onClientsChanged?: (clients: WebSyncClient[]) => void;
  private readonly bootId = getWebSyncBootId();
  private _deviceId = '';
  private _mdnsHost: () => string = () => '';
  private _ipProvider: () => string = () => '';
  private _core: SyncServerCore | null = null;
  private _lastClientSig = '';

  get port() {
    return this._port;
  }
  get running() {
    return this._running;
  }

  isLive(): boolean {
    return this._running && this.bootId === getWebSyncBootId();
  }

  static isAvailable(): boolean {
    return !!getNativeTcpSocket();
  }

  setOnClientsChanged(cb: (clients: WebSyncClient[]) => void) {
    this._onClientsChanged = cb;
  }

  republishClients(): void {
    this.emitClients();
  }

  getClientSnapshot(): WebSyncClient[] {
    // Only identified WebSocket sessions count as "devices" — ephemeral HTTP GETs
    // and pre-challenge upgrades must not inflate the connected list.
    const isBlocked = (sourceId: string) => !!this._core?.isBlockedSource(sourceId);
    return Array.from(this.connections.values())
      .filter((c) => shouldPublishWebClient(c.handshakeDone, c.session?.sourceId, isBlocked))
      .map((c) => ({
        socketId: c.socketId,
        sourceId: c.session?.sourceId ?? null,
        authenticated: c.session?.authenticated ?? false,
        connectedAt: c.connectedAt,
        ip: c.socket?.remoteAddress,
        userAgent: c.session?.userAgent ?? c.handshakeUserAgent,
      }));
  }

  private emitClients() {
    if (!this._onClientsChanged) return;
    const clients = this.getClientSnapshot();
    const sig = clients
      .map((c) => `${c.socketId}:${c.sourceId ?? ''}:${c.authenticated ? 1 : 0}`)
      .join('|');
    if (sig === this._lastClientSig) return;
    this._lastClientSig = sig;
    this._onClientsChanged(clients);
  }

  pushToAll(msg: WsMessage, skipSourceId?: string): void {
    for (const conn of this.connections.values()) {
      if (conn.handshakeDone && conn.session?.authenticated) {
        if (skipSourceId && conn.session?.sourceId === skipSourceId) continue;
        const sid = conn.session?.sourceId;
        if (sid && this._core?.isVaultForkPending(sid)) continue;
        this.wsSend(conn, msg);
      }
    }
  }

  /** Session bearer for an authenticated satellite, if connected. */
  getTokenForSource(sourceId: string): string | null {
    if (!sourceId) return null;
    for (const conn of this.connections.values()) {
      if (conn.handshakeDone && conn.session?.authenticated && conn.session.sourceId === sourceId) {
        return conn.session.token;
      }
    }
    return null;
  }

  /** Send a protocol message to one authenticated satellite. */
  sendToSource(sourceId: string, msg: WsMessage): boolean {
    if (!sourceId) return false;
    for (const conn of this.connections.values()) {
      if (conn.handshakeDone && conn.session?.authenticated && conn.session.sourceId === sourceId) {
        this.wsSend(conn, msg);
        return true;
      }
    }
    return false;
  }

  /**
   * Send to a live socket for `sourceId` even before auth. Used for pre-auth
   * `unlock_grant` / `unlock_cancel` (ECDH wrap, not control-plane AEAD).
   */
  sendToSourceAny(sourceId: string, msg: WsMessage): boolean {
    if (!sourceId) return false;
    for (const conn of this.connections.values()) {
      if (conn.handshakeDone && conn.session?.sourceId === sourceId) {
        this.wsSend(conn, msg);
        return true;
      }
    }
    return false;
  }

  /** Close live WS sessions matching a blocked source id. */
  disconnectBySourceId(sourceId: string): void {
    if (!sourceId) return;
    for (const conn of [...this.connections.values()]) {
      if (conn.session?.sourceId === sourceId) this.closeConn(conn);
    }
  }

  /** Close live WS sessions matching a blocked client IP. */
  disconnectByIp(ip: string): void {
    const want = formatClientIp(ip);
    if (!want) return;
    for (const conn of [...this.connections.values()]) {
      if (formatClientIp(conn.socket?.remoteAddress) === want) this.closeConn(conn);
    }
  }

  start(
    core: SyncServerCore,
    port: number = WEB_SYNC_PORT,
    opts?: WebServerOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const Tcp = getNativeTcpSocket();
      if (!Tcp) {
        reject(new Error('react-native-tcp-socket unavailable'));
        return;
      }
      if (this._running) {
        resolve();
        return;
      }

      this._port = port;
      this._core = core;
      if (opts?.deviceId) this._deviceId = opts.deviceId;
      if (opts?.mdnsHost) this._mdnsHost = opts.mdnsHost;
      if (opts?.ipProvider) this._ipProvider = opts.ipProvider;

      const onSocket = (socket: any) => {
        const remoteIp = socket.remoteAddress;
        if (remoteIp && core.isIpBlocked(remoteIp)) {
          try {
            socket.destroy();
          } catch {}
          return;
        }

        const socketId = makeSocketId();
        const conn: WsConnection = {
          socket,
          buffer: Buffer.alloc(0),
          httpBuffer: '',
          handshakeDone: false,
          session: null,
          pingTimer: null,
          socketId,
          connectedAt: Date.now(),
          handshakeUserAgent: null,
          fragOpcode: null,
          fragParts: [],
          fragBytes: 0,
        };
        this.connections.set(socketId, conn);
        // Do not emitClients here — wait until WS upgrade (handshakeDone).
        this.reapStaleHttpConns();

        if (typeof socket.setTimeout === 'function') {
          socket.setTimeout(SOCKET_READ_TIMEOUT_MS);
        }
        socket.on('timeout', () => {
          this.closeConn(conn);
        });

        socket.on('data', (data: Buffer | string) => {
          if (!conn.handshakeDone && typeof socket.setTimeout === 'function') {
            socket.setTimeout(SOCKET_READ_TIMEOUT_MS);
          }
          const chunk = typeof data === 'string' ? Buffer.from(data, 'binary') : data;
          if (!conn.handshakeDone) {
            conn.httpBuffer += chunk.toString('utf8');
            if (Buffer.byteLength(conn.httpBuffer, 'utf8') > MAX_SOCKET_BUFFER_BYTES) {
              this.closeConn(conn);
              return;
            }
            try {
              this.handleHttpHandshake(conn, core);
            } catch (err) {
              console.warn('[SyncWebServer] HTTP handler failed:', err);
              this.detachHttpConn(conn);
              writeHttp(conn.socket, 500, 'text/plain', 'Internal error');
            }
          } else {
            conn.buffer = Buffer.concat([conn.buffer, chunk]);
            if (conn.buffer.length > MAX_SOCKET_BUFFER_BYTES) {
              this.closeConn(conn);
              return;
            }
            this.handleWsData(conn);
          }
        });

        socket.on('close', () => {
          this.closeConn(conn);
        });
        socket.on('error', () => {
          this.closeConn(conn);
        });
      };

      this.server = Tcp.createServer(onSocket);
      const onListenError = (err: Error) => {
        this._running = false;
        const failedServer = this.server;
        this.server = null;
        if (failedServer) {
          try {
            failedServer.close();
          } catch {
            /* ignore */
          }
        }
        reject(err);
      };
      this.server.once('error', onListenError);
      this.server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
        this.server?.removeListener('error', onListenError);
        this._running = true;
        activeSyncWebServer = this;
        setGlobalWebServer(this);
        console.log('[SyncWebServer] listening on HTTP/WS', port);
        resolve();
      });
    });
  }

  /** Drop idle non-WS sockets that never completed an HTTP request / upgrade. */
  private reapStaleHttpConns(): void {
    const now = Date.now();
    const maxAgeMs = SOCKET_READ_TIMEOUT_MS + 1000;
    for (const conn of [...this.connections.values()]) {
      if (conn.handshakeDone) continue;
      if (now - conn.connectedAt < maxAgeMs) continue;
      this.closeConn(conn);
    }
  }

  /**
   * Always releases the native listen socket and connections, even when this
   * instance is stale (!isLive). Required to reclaim the port after reload.
   * @returns true if a native listen socket was closed (caller must not close the same id again).
   */
  hardClose(): boolean {
    for (const conn of [...this.connections.values()]) {
      if (conn.pingTimer) {
        clearInterval(conn.pingTimer);
        conn.pingTimer = null;
      }
      try {
        conn.session?.onClose();
      } catch {
        /* ignore */
      }
      try {
        conn.socket?.destroy?.();
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
    let closedNative = false;
    if (this.server) {
      // Only treat as a native close when we were actually listening — otherwise
      // TcpSockets.close(id) was never registered and a later reclaim would crash.
      const wasListening = this._running || !!this.server.listening;
      try {
        this.server.close();
      } catch {
        /* ignore */
      }
      try {
        this.server.removeAllListeners?.();
      } catch {
        /* ignore */
      }
      this.server = null;
      if (wasListening) {
        closedNative = true;
      }
    }
    this._running = false;
    if (activeSyncWebServer === this) activeSyncWebServer = null;
    if ((globalThis as Record<string, unknown>)[GLOBAL_SERVER_KEY] === this) {
      setGlobalWebServer(null);
    }
    return closedNative;
  }

  stop(): void {
    this.hardClose();
  }

  private closeConn(conn: WsConnection): void {
    if (conn.pingTimer) {
      clearInterval(conn.pingTimer);
      conn.pingTimer = null;
    }
    this.clearFragmentState(conn);
    try {
      conn.session?.onClose();
    } catch {
      /* ignore */
    }
    try {
      conn.socket?.destroy?.();
    } catch {
      /* ignore */
    }
    this.connections.delete(conn.socketId);
    this.emitClients();
  }

  /** Reads an identity getter without letting a caller bug break the response. */
  private safeGet(getter: () => string): string {
    try {
      return getter() || '';
    } catch {
      return '';
    }
  }

  /** Untrack an HTTP response socket without destroy — writeHttp finishes via end(). */
  private detachHttpConn(conn: WsConnection): void {
    this.connections.delete(conn.socketId);
    this.emitClients();
  }

  private handleHttpHandshake(conn: WsConnection, core: SyncServerCore): void {
    const parsed = tryParseRequestWithConsumed(conn.httpBuffer);
    if (!parsed.ok) {
      if (!parsed.incomplete) {
        try {
          conn.socket.destroy();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const req = parsed.req;
    conn.httpBuffer = '';

    if (req.method === 'GET' && req.path === '/') {
      const nonce = getSecureRandomHex(16);
      const hostHeader = (req.headers['host'] || '').trim();
      const requestHost = hostHeader.split(':')[0] || '127.0.0.1';
      const bootUi = typeof core.getPublicUiPrefs === 'function' ? core.getPublicUiPrefs() : null;
      const html = getPwaHtml(this._port, requestHost, nonce, bootUi ?? undefined);
      const csp = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'nonce-${nonce}'`,
        // `ws:` (any host) lets the PWA rotate its socket to the master's new
        // address after a DHCP change; `/pkey/meta` is same-origin, so 'self'
        // covers it. No `http:`/`https:` — keeping plain fetch same-origin
        // limits what an injected script could reach.
        "connect-src 'self' ws:",
        // Preset icons are bundled as data: URIs; https: remains for optional favicon URLs.
        "img-src 'self' data: https:",
        "font-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      // writeHttp ends the socket after native flush; do not destroy here.
      this.detachHttpConn(conn);
      writeHttp(conn.socket, 200, 'text/html; charset=utf-8', html, {
        'Content-Security-Policy': csp,
      });
      return;
    }

    if (req.method === 'GET') {
      const staticAsset = getPwaAsset(req.path);
      if (staticAsset) {
        this.detachHttpConn(conn);
        writeHttp(conn.socket, 200, staticAsset.mime, staticAsset.body);
        return;
      }
    }

    if (req.method === 'GET' && req.path === '/pkey/meta') {
      const prefs = typeof core.getPublicUiPrefs === 'function' ? core.getPublicUiPrefs() : null;
      const meta = buildMetaPayload({
        deviceId: this._deviceId,
        mdnsHost: this.safeGet(this._mdnsHost),
        ip: this.safeGet(this._ipProvider),
        ...(prefs ?? {}),
      });
      this.detachHttpConn(conn);
      writeHttp(conn.socket, 200, 'application/json; charset=utf-8', JSON.stringify(meta));
      return;
    }

    if (
      req.method === 'GET' &&
      req.path === '/pkey/ws' &&
      req.headers['upgrade']?.toLowerCase() === 'websocket'
    ) {
      this.upgradeWebSocket(conn, core, req);
      return;
    }

    this.detachHttpConn(conn);
    writeHttp(conn.socket, 404, 'text/plain', 'Not found');
  }

  private upgradeWebSocket(conn: WsConnection, core: SyncServerCore, _req: ParsedRequest): void {
    const clientKey = (_req.headers['sec-websocket-key'] || '').trim();
    if (!clientKey) {
      this.detachHttpConn(conn);
      writeHttp(conn.socket, 400, 'text/plain', 'Missing Sec-WebSocket-Key');
      return;
    }

    const origin = _req.headers['origin'];
    const host = _req.headers['host'];
    if (!isAllowedWsOrigin(origin, host)) {
      this.detachHttpConn(conn);
      writeHttp(conn.socket, 403, 'text/plain', 'Origin not allowed');
      return;
    }

    const acceptKey = wsAcceptKey(clientKey);
    const res = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');
    try {
      conn.socket.write(res);
    } catch {
      this.closeConn(conn);
      return;
    }

    conn.handshakeDone = true;
    conn.buffer = Buffer.alloc(0);
    conn.handshakeUserAgent = sanitizeUserAgent(_req.headers['user-agent']);
    conn.session = core.createWsSession(
      (msg) => this.wsSend(conn, msg),
      formatClientIp(conn.socket?.remoteAddress) || conn.socket?.remoteAddress || ''
    );
    // HTTP migration uses SOCKET_READ_TIMEOUT_MS (5s); idle WebSockets must not —
    // server ping is every 30s and would otherwise be killed after 5s of client silence.
    if (typeof conn.socket.setTimeout === 'function') {
      conn.socket.setTimeout(0);
    }

    conn.pingTimer = setInterval(() => {
      try {
        conn.socket.write(encodePingFrame());
      } catch {
        this.closeConn(conn);
      }
    }, 25_000);
  }

  private handleWsData(conn: WsConnection): void {
    while (conn.buffer.length > 0) {
      const frame = tryDecodeWsFrame(conn.buffer);
      if (frame === 'too_large' || frame === 'unmasked') {
        this.closeConn(conn);
        return;
      }
      if (!frame) break;
      conn.buffer = conn.buffer.slice(frame.consumed);
      this.handleWsFrame(conn, frame);
    }
  }

  private clearFragmentState(conn: WsConnection): void {
    conn.fragOpcode = null;
    conn.fragParts = [];
    conn.fragBytes = 0;
  }

  private handleWsFrame(conn: WsConnection, frame: WsFrame): void {
    const { fin, opcode, payload } = frame;

    // Control frames may appear between data fragments (RFC 6455 §5.4).
    if (opcode === 0x8) {
      try {
        conn.socket.write(encodeCloseFrame());
      } catch {
        /* ignore */
      }
      this.closeConn(conn);
      return;
    }
    if (opcode === 0x9) {
      try {
        conn.socket.write(encodePongFrame(payload));
      } catch {
        /* ignore */
      }
      return;
    }
    if (opcode === 0xa) {
      return; // pong
    }

    // Continuation or start of a data message (text=0x1, binary=0x2).
    if (opcode === 0x0) {
      if (conn.fragOpcode == null) {
        this.closeConn(conn);
        return;
      }
      conn.fragBytes += payload.length;
      if (conn.fragBytes > MAX_WS_PAYLOAD_BYTES) {
        this.clearFragmentState(conn);
        this.closeConn(conn);
        return;
      }
      conn.fragParts.push(payload);
      if (fin) {
        const full = Buffer.concat(conn.fragParts);
        const msgOpcode = conn.fragOpcode;
        this.clearFragmentState(conn);
        this.dispatchWsDataMessage(conn, msgOpcode, full);
      }
      return;
    }

    if (opcode === 0x1 || opcode === 0x2) {
      if (conn.fragOpcode != null) {
        // New data message while still assembling — protocol violation.
        this.clearFragmentState(conn);
        this.closeConn(conn);
        return;
      }
      if (!fin) {
        if (payload.length > MAX_WS_PAYLOAD_BYTES) {
          this.closeConn(conn);
          return;
        }
        conn.fragOpcode = opcode;
        conn.fragParts = [payload];
        conn.fragBytes = payload.length;
        return;
      }
      this.dispatchWsDataMessage(conn, opcode, payload);
      return;
    }

    // Unknown opcode — ignore.
  }

  private dispatchWsDataMessage(conn: WsConnection, opcode: number, payload: Buffer): void {
    if (opcode !== 0x1) {
      // Binary sync is unused; reject unexpected binary payloads.
      this.wsSend(conn, { type: 'error', code: 'UNAUTHORIZED', error: 'Unsupported frame' });
      return;
    }
    let msg: WsMessage;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch {
      this.wsSend(conn, { type: 'error', code: 'UNAUTHORIZED', error: 'Invalid JSON' });
      return;
    }
    conn.session
      ?.onMessage(msg)
      .then(() => {
        if (conn.session?.forceClose) {
          this.closeConn(conn);
          return;
        }
        this.emitClients();
      })
      .catch(() => {
        this.wsSend(conn, { type: 'error', code: 'INTERNAL_ERROR', error: 'Server error' });
      });
  }

  private wsSend(conn: WsConnection, msg: WsMessage): void {
    let out: ReturnType<typeof sealOutgoingControl> = msg;
    if (conn.session?.authenticated) {
      out = sealOutgoingControl(
        msg,
        conn.session.token,
        this._core?.getControlPasswordHash() ?? null
      );
      if (!out) return;
    }
    try {
      conn.socket.write(encodeWsFrame(JSON.stringify(out)));
    } catch {
      this.closeConn(conn);
    }
  }
}
