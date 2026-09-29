/**
 * @fileoverview HTTP migration receiver server (port 7393) — protocol v2.
 */

import { getNativeTcpSocket } from '../utils/nativeTcpSocket';
import { getTlsListenOptions, fingerprintTlsCertificatePem } from './tlsCredentials';
import {
  ChallengeStore,
  computeChallengeResponse,
  issueToken,
  RateLimiter,
  signBody,
  verifyBodySignature,
  verifyToken,
} from './syncAuth';
import { SHA256, Hex } from 'crypto-es';
import {
  MIGRATION_PORT,
  MIGRATION_PROTOCOL_VERSION,
  MIGRATION_SESSION_TTL_MS,
  MigrationAuthRequestV2,
  MigrationMetaPayload,
  MigrationPhase,
  MigrationPushChunk,
  MigrationStatusResponse,
} from './migrationProtocol';
import {
  ParsedRequest,
  attachBoundedSocket,
  writeHttpError,
  writeHttpResponse,
  writeHttpEncryptedResponse,
  writeHttpEncryptedError,
} from './migrationHttpUtils';
import {
  channelKeyFingerprint,
  decryptFrame,
  deriveChannelKeyHex,
  generatePairingSecret,
  isMigrationV2ContentType,
  verifyMigrationProof,
} from './migrationChannelCrypto';
import { getSecureRandomHex } from '../utils/secureRandom';
import { createChunkState, storeChunk, assembleChunks } from './migration/MigrationHandler';
import { reclaimNativeTcpPort } from './syncWebServer';

export interface MigrationReceiverCallbacks {
  onPhaseChange: (phase: MigrationPhase, progress: number, message?: string) => void;
  onMigrationComplete: (encryptedPayload: string, cardCount: number) => Promise<void>;
  getSenderIpForFinalize: () => string | null;
}

interface ActiveMigration {
  migrationId: string;
  token: string;
  meta: MigrationMetaPayload | null;
  chunks: Map<number, string>;
  startedAt: number;
  senderIp: string | null;
  senderIpAlternates: string[];
  senderCallbackPort: number;
  senderWipeProof: string | null;
  usedNonces: Set<string>;
}

class RequestRateLimiter {
  private hits = new Map<string, number[]>();

  isLimited(key: string, maxPerMinute: number, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const times = (this.hits.get(key) || []).filter((t) => t > windowStart);
    if (times.length >= maxPerMinute) return true;
    times.push(now);
    this.hits.set(key, times);
    return false;
  }
}

const getClientIp = (socket: any): string => {
  const raw = String(socket?.remoteAddress || socket?.address?.()?.address || '');
  if (!raw || raw === 'unknown') return '';
  // Node / RN often report IPv4 as :ffff:192.168.x.x
  const v4 = raw.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];
  return raw.replace(/^::ffff:/i, '');
};

export class MigrationReceiverServer {
  private server: any = null;
  private _running = false;
  private _port = MIGRATION_PORT;
  private sessionId = getSecureRandomHex(4);
  private pairingSecret = generatePairingSecret();
  private deviceName = 'PKEY Device';
  private localPasswordHash: string | null = null;
  private channelKeyHex = '';
  private challenges = new ChallengeStore();
  private authLimiter = new RateLimiter(5, 10 * 60_000);
  private requestLimiter = new RequestRateLimiter();
  private preAuthNonces = new Set<string>();
  private active: ActiveMigration | null = null;
  private phase: MigrationPhase = 'idle';
  private progress = 0;
  private cardCount = 0;
  private readyToFinalize = false;
  private callbacks: MigrationReceiverCallbacks | null = null;
  private tlsCertFingerprint = '';
  /** True after `prepareSession()` until `stop()`, so `start()` does not rotate the pairing code. */
  private sessionReadyForListen = false;

  get port() {
    return this._port;
  }
  get running() {
    return this._running;
  }
  get currentSessionId() {
    return this.sessionId;
  }
  get currentPairingSecret() {
    return this.pairingSecret;
  }
  get channelFingerprint() {
    return this.channelKeyHex ? channelKeyFingerprint(this.channelKeyHex) : '';
  }
  get tlsFingerprint() {
    return this.tlsCertFingerprint;
  }

  static isAvailable(): boolean {
    return !!getNativeTcpSocket();
  }

  setDeviceName(name: string): void {
    this.deviceName = name;
  }

  setLocalPasswordHash(hash: string | null): void {
    this.localPasswordHash = hash;
  }

  setCallbacks(callbacks: MigrationReceiverCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Pins pairing/session before `start()`. The receive UI can show the code while
   * TLS keygen and listen are still running (slow on first launch / older phones).
   */
  prepareSession(): void {
    this.sessionId = getSecureRandomHex(4);
    this.pairingSecret = generatePairingSecret();
    this.channelKeyHex = deriveChannelKeyHex(this.pairingSecret, this.sessionId);
    this.preAuthNonces.clear();
    this.sessionReadyForListen = true;
  }

  getStatus(): MigrationStatusResponse {
    return {
      phase: this.phase,
      progress: this.progress,
      cardCount: this.cardCount,
      readyToFinalize: this.readyToFinalize,
    };
  }

  private setPhase(phase: MigrationPhase, progress: number, message?: string): void {
    this.phase = phase;
    this.progress = progress;
    this.callbacks?.onPhaseChange(phase, progress, message);
  }

  private teardownServer(): void {
    if (this.server) {
      try {
        // Servers must use close() — destroy()/end() go through getTcpClient() and crash
        // with "Socket with id N is not a client".
        this.server.close();
      } catch {
        /* ignore */
      }
      this.server = null;
    }
  }

  private trackNonce(nonce: string, store: Set<string>): boolean {
    if (store.has(nonce)) return false;
    store.add(nonce);
    if (store.size > 256) {
      const first = store.values().next().value;
      if (first) store.delete(first);
    }
    return true;
  }

  private parseEncryptedBody(req: ParsedRequest, nonces: Set<string>): unknown {
    if (!isMigrationV2ContentType(req.headers['content-type'])) {
      throw new Error('PLAINTEXT_REJECTED');
    }
    let frame: { n?: string };
    try {
      frame = JSON.parse(req.body);
    } catch {
      throw new Error('BAD_FRAME');
    }
    if (!frame.n || !this.trackNonce(frame.n, nonces)) {
      throw new Error('NONCE_REPLAY');
    }
    const plain = decryptFrame(this.channelKeyHex, req.body);
    return JSON.parse(plain);
  }

  start(port: number = MIGRATION_PORT): Promise<void> {
    return new Promise((resolve, reject) => {
      const Tcp = getNativeTcpSocket();
      if (!Tcp) {
        reject(new Error('react-native-tcp-socket is not available'));
        return;
      }
      if (this._running) {
        resolve();
        return;
      }

      this.teardownServer();
      this._port = port;
      if (!this.sessionReadyForListen) {
        this.prepareSession();
      }
      this.setPhase('discovering', 0);

      void (async () => {
        try {
          // Same orphan-port problem as web sync on 7392: Metro/JS reload leaves the
          // native ServerSocket bound while the JS MigrationReceiverServer is gone.
          const diag = await reclaimNativeTcpPort(port);
          if ((diag.closedCount ?? 0) > 0 || (diag.mapSize ?? 0) > 0) {
            // Native close runs on a worker thread; brief settle before rebind.
            await new Promise<void>((r) => setTimeout(r, 200));
          }

          const listenOpts = await getTlsListenOptions(port);
          this.tlsCertFingerprint = fingerprintTlsCertificatePem(listenOpts.cert);

          // Must use createTLSServer + PKCS12 keystore — listen({ tls: true }) crashes
          // native with "cannot be cast from Boolean to ReadableNativeMap".
          this.server = Tcp.createTLSServer({ keystore: listenOpts.keystore }, (socket: any) => {
            attachBoundedSocket(socket, async (req, sock) => {
              await this.handleRequest(req, sock, getClientIp(sock), true);
            });
            socket.on('error', () => {
              try {
                socket.destroy();
              } catch {
                /* ignore */
              }
            });
          });

          const onListenError = (err: unknown) => {
            this._running = false;
            this.teardownServer();
            reject(err instanceof Error ? err : new Error(String(err)));
          };

          this.server.once('error', onListenError);
          this.server.listen(
            { port: listenOpts.port, host: listenOpts.host, reuseAddress: listenOpts.reuseAddress },
            () => {
              this.server?.removeListener('error', onListenError);
              this._running = true;
              this.setPhase('discovering', 5);
              resolve();
            }
          );
        } catch (err) {
          this._running = false;
          this.teardownServer();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  }

  stop(): void {
    this.teardownServer();
    this._running = false;
    this.active = null;
    this.readyToFinalize = false;
    this.phase = 'idle';
    this.progress = 0;
    this.preAuthNonces.clear();
    this.sessionReadyForListen = false;
  }

  markReadyToFinalize(): void {
    this.readyToFinalize = true;
    this.setPhase('ready_to_finalize', 100);
  }

  getFinalizeTarget(): {
    senderIp: string;
    senderIpAlternates: string[];
    senderCallbackPort: number;
    migrationId: string;
    pairingSecret: string;
    sessionId: string;
    senderWipeProof: string;
  } | null {
    if (!this.active?.senderIp || !this.active.senderWipeProof) return null;
    return {
      senderIp: this.active.senderIp,
      senderIpAlternates: this.active.senderIpAlternates || [],
      senderCallbackPort: this.active.senderCallbackPort,
      migrationId: this.active.migrationId,
      pairingSecret: this.pairingSecret,
      sessionId: this.sessionId,
      senderWipeProof: this.active.senderWipeProof,
    };
  }

  private refreshActiveSession(): void {
    if (!this.active) return;
    // Keep finalize target available until wipe/cancel — user may wait on the confirm UI.
    if (this.readyToFinalize) return;
    const age = Date.now() - this.active.startedAt;
    const idleWithoutData = this.active.chunks.size === 0 && age > 30_000;
    const expired = age > MIGRATION_SESSION_TTL_MS;
    if (idleWithoutData || expired) {
      this.active = null;
    }
  }

  private async handleRequest(
    req: ParsedRequest,
    socket: any,
    clientIp: string,
    keepAlive = false
  ): Promise<void> {
    this.refreshActiveSession();
    if (req.method === 'OPTIONS') {
      writeHttpResponse(socket, 200, {}, keepAlive);
      return;
    }

    if (req.method === 'GET' && req.path === '/pkey/migrate/info') {
      writeHttpResponse(
        socket,
        200,
        {
          deviceName: this.deviceName,
          protocolVersion: MIGRATION_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          ready: !this.active || this.readyToFinalize,
          state:
            this.active && !this.readyToFinalize
              ? 'busy'
              : this.readyToFinalize
                ? 'complete'
                : 'waiting',
          requiresEncryption: true,
          tlsFingerprint: this.tlsCertFingerprint,
        },
        keepAlive
      );
      return;
    }

    if (req.method === 'GET' && req.path === '/pkey/migrate/status') {
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (this.active && verifyToken(token, this.active.migrationId, this.sessionId)) {
        writeHttpEncryptedResponse(socket, 200, this.channelKeyHex, this.getStatus(), keepAlive);
      } else {
        writeHttpResponse(socket, 200, this.getStatus(), keepAlive);
      }
      return;
    }

    if (req.method === 'GET' && req.path === '/pkey/migrate/challenge') {
      const sourceId = req.headers['x-source-id'] || 'sender';
      if (this.authLimiter.isBlocked(clientIp)) {
        writeHttpEncryptedError(
          socket,
          429,
          this.channelKeyHex,
          'RATE_LIMITED',
          'Too many attempts',
          keepAlive
        );
        return;
      }
      const challenge = this.challenges.create(sourceId);
      writeHttpEncryptedResponse(
        socket,
        200,
        this.channelKeyHex,
        {
          challenge,
          protocolVersion: MIGRATION_PROTOCOL_VERSION,
        },
        keepAlive
      );
      return;
    }

    if (req.method === 'POST' && req.path === '/pkey/migrate/auth') {
      if (this.authLimiter.isBlocked(clientIp)) {
        writeHttpEncryptedError(
          socket,
          429,
          this.channelKeyHex,
          'RATE_LIMITED',
          'Too many attempts',
          keepAlive
        );
        return;
      }
      if (this.requestLimiter.isLimited(`${clientIp}:auth`, 5)) {
        writeHttpEncryptedError(
          socket,
          429,
          this.channelKeyHex,
          'RATE_LIMITED',
          'Too many attempts',
          keepAlive
        );
        return;
      }

      let payload: MigrationAuthRequestV2;
      try {
        payload = this.parseEncryptedBody(req, this.preAuthNonces) as MigrationAuthRequestV2;
      } catch {
        this.authLimiter.recordFailure(clientIp);
        writeHttpEncryptedResponse(
          socket,
          200,
          this.channelKeyHex,
          {
            ok: false,
            error: 'Invalid encrypted request',
            code: 'AUTH_FAILED',
          },
          keepAlive
        );
        return;
      }

      const sourceId = req.headers['x-source-id'] || 'sender';

      if (this.localPasswordHash) {
        const challengeOk = this.challenges.verify(
          sourceId,
          payload.response,
          this.localPasswordHash
        );
        const proofOk = verifyMigrationProof(
          this.channelKeyHex,
          this.localPasswordHash,
          payload.migrationId,
          this.sessionId,
          payload.proof
        );
        if (!challengeOk || !proofOk) {
          this.authLimiter.recordFailure(clientIp);
          writeHttpEncryptedResponse(
            socket,
            200,
            this.channelKeyHex,
            {
              ok: false,
              error: 'Authentication failed',
              code: 'AUTH_FAILED',
            },
            keepAlive
          );
          return;
        }
      } else {
        this.challenges.consume(sourceId);
      }

      this.authLimiter.recordSuccess(clientIp);
      const token = issueToken(payload.migrationId, this.sessionId);
      const reported = typeof payload.senderIp === 'string' ? payload.senderIp.trim() : '';
      const peer = clientIp && clientIp !== 'unknown' ? clientIp : '';
      const isV4 = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
      const primary = (isV4(peer) ? peer : '') || (isV4(reported) ? reported : '') || peer || reported || null;
      const alternates = [peer, reported].filter(
        (h, i, arr) => !!h && h !== primary && arr.indexOf(h) === i
      );
      this.active = {
        migrationId: payload.migrationId,
        token,
        meta: null,
        chunks: new Map(),
        startedAt: Date.now(),
        senderIp: primary,
        senderIpAlternates: alternates,
        senderCallbackPort: payload.senderCallbackPort || 7394,
        senderWipeProof: payload.senderWipeProof,
        usedNonces: new Set(this.preAuthNonces),
      };
      this.setPhase('authenticating', 15);
      writeHttpEncryptedResponse(
        socket,
        200,
        this.channelKeyHex,
        {
          ok: true,
          token,
          fingerprint: channelKeyFingerprint(this.channelKeyHex),
        },
        keepAlive
      );
      return;
    }

    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!this.active || !verifyToken(token, this.active.migrationId, this.sessionId)) {
      writeHttpEncryptedError(
        socket,
        401,
        this.channelKeyHex,
        'UNAUTHORIZED',
        'Invalid or expired token',
        keepAlive
      );
      return;
    }

    if (Date.now() - this.active.startedAt > MIGRATION_SESSION_TTL_MS) {
      writeHttpEncryptedError(
        socket,
        401,
        this.channelKeyHex,
        'SESSION_EXPIRED',
        'Migration session expired',
        keepAlive
      );
      return;
    }

    if (req.method === 'POST' && req.path === '/pkey/migrate/meta') {
      let meta: MigrationMetaPayload;
      try {
        meta = this.parseEncryptedBody(req, this.active.usedNonces) as MigrationMetaPayload;
      } catch {
        writeHttpEncryptedError(
          socket,
          400,
          this.channelKeyHex,
          'BAD_JSON',
          'Invalid encrypted body',
          keepAlive
        );
        return;
      }
      if (meta.migrationId !== this.active.migrationId) {
        writeHttpEncryptedError(
          socket,
          400,
          this.channelKeyHex,
          'MIGRATION_MISMATCH',
          'Migration ID mismatch',
          keepAlive
        );
        return;
      }
      const bodyForSign = JSON.stringify({
        migrationId: meta.migrationId,
        cardCount: meta.cardCount,
        payloadSize: meta.payloadSize,
        payloadHash: meta.payloadHash,
        totalChunks: meta.totalChunks,
      });
      if (meta.signature && !verifyBodySignature(bodyForSign, meta.signature, token)) {
        writeHttpEncryptedError(
          socket,
          401,
          this.channelKeyHex,
          'BAD_SIGNATURE',
          'Body signature mismatch',
          keepAlive
        );
        return;
      }
      this.active.meta = meta;
      this.cardCount = meta.cardCount;
      this.setPhase('preparing', 20, `${meta.cardCount} cards`);
      writeHttpEncryptedResponse(socket, 200, this.channelKeyHex, { ok: true }, keepAlive);
      return;
    }

    if (req.method === 'POST' && req.path === '/pkey/migrate/push') {
      if (this.requestLimiter.isLimited(`${clientIp}:chunk`, 120)) {
        writeHttpEncryptedError(
          socket,
          429,
          this.channelKeyHex,
          'RATE_LIMITED',
          'Too many chunk requests',
          keepAlive
        );
        return;
      }
      let chunk: MigrationPushChunk;
      try {
        chunk = this.parseEncryptedBody(req, this.active.usedNonces) as MigrationPushChunk;
      } catch {
        writeHttpEncryptedError(
          socket,
          400,
          this.channelKeyHex,
          'BAD_JSON',
          'Invalid encrypted body',
          keepAlive
        );
        return;
      }
      if (chunk.migrationId !== this.active.migrationId) {
        writeHttpEncryptedError(
          socket,
          400,
          this.channelKeyHex,
          'MIGRATION_MISMATCH',
          'Migration ID mismatch',
          keepAlive
        );
        return;
      }
      const bodyForSign = JSON.stringify({
        migrationId: chunk.migrationId,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        data: chunk.data,
      });
      if (chunk.signature && !verifyBodySignature(bodyForSign, chunk.signature, token)) {
        writeHttpEncryptedError(
          socket,
          401,
          this.channelKeyHex,
          'BAD_SIGNATURE',
          'Body signature mismatch',
          keepAlive
        );
        return;
      }
      this.active.chunks.set(chunk.chunkIndex, chunk.data);
      const received = this.active.chunks.size;
      const pct = Math.round((received / chunk.totalChunks) * 60) + 20;
      this.setPhase('transferring', pct, `${received}/${chunk.totalChunks}`);

      if (received >= chunk.totalChunks) {
        await this.assembleAndApply();
      }
      writeHttpEncryptedResponse(
        socket,
        200,
        this.channelKeyHex,
        { ok: true, received },
        keepAlive
      );
      return;
    }

    writeHttpEncryptedError(
      socket,
      404,
      this.channelKeyHex,
      'NOT_FOUND',
      `Unknown endpoint: ${req.method} ${req.path}`,
      keepAlive
    );
  }

  private async assembleAndApply(): Promise<void> {
    if (!this.active?.meta) return;
    const { meta } = this.active;
    let state = createChunkState();
    for (const [idx, data] of this.active.chunks.entries()) {
      state = storeChunk(state, idx, data, meta);
    }
    const payload = assembleChunks(state);
    if (!payload) throw new Error('Missing migration chunks');
    this.setPhase('verifying', 85);
    const hash = SHA256(payload).toString(Hex);
    if (hash !== meta.payloadHash) {
      this.setPhase('error', 0, 'Integrity check failed');
      throw new Error('Payload hash mismatch');
    }
    this.setPhase('applying_cards', 90, String(meta.cardCount));
    await new Promise((r) => setTimeout(r, 300));
    this.setPhase('applying_settings', 95);
    await this.callbacks?.onMigrationComplete(payload, meta.cardCount);
    this.setPhase('ready_to_finalize', 100);
    this.readyToFinalize = true;
  }
}

/** Builds challenge response for tests. */
export const buildMigrationAuthResponse = (challenge: string, passwordHash: string): string =>
  computeChallengeResponse(challenge, passwordHash);
