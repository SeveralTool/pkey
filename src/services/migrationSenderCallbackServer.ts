/**
 * @fileoverview Callback server on the source device during migration (v2 encrypted wipe).
 */

import { getNativeTcpSocket } from '../utils/nativeTcpSocket';
import { getTlsListenOptions } from './tlsCredentials';
import { MIGRATION_SENDER_CALLBACK_PORT } from './migrationProtocol';
import { reclaimNativeTcpPort } from './syncWebServer';
import {
  attachBoundedSocket,
  writeHttpError,
  writeHttpResponse,
  writeHttpEncryptedResponse,
} from './migrationHttpUtils';
import {
  decryptFrame,
  deriveChannelKeyHex,
  isMigrationV2ContentType,
  verifySenderWipeProof,
} from './migrationChannelCrypto';

export type WipeCallback = (migrationId: string) => Promise<void>;

export interface MigrationCallbackConfig {
  pairingSecret: string;
  receiverSessionId: string;
  migrationId: string;
  senderSessionId: string;
  expectedWipeProof: string;
}

export class MigrationSenderCallbackServer {
  private server: any = null;
  private _running = false;
  private config: MigrationCallbackConfig | null = null;
  private onWipe: WipeCallback | null = null;
  private wiped = false;

  static isAvailable(): boolean {
    return !!getNativeTcpSocket();
  }

  start(
    config: MigrationCallbackConfig,
    onWipe: WipeCallback,
    port = MIGRATION_SENDER_CALLBACK_PORT
  ): Promise<void> {
    this.config = config;
    this.onWipe = onWipe;
    this.wiped = false;
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

      void (async () => {
        try {
          const diag = await reclaimNativeTcpPort(port);
          if ((diag.closedCount ?? 0) > 0 || (diag.mapSize ?? 0) > 0) {
            await new Promise<void>((r) => setTimeout(r, 200));
          }
          const listenOpts = await getTlsListenOptions(port);
          this.server = Tcp.createTLSServer({ keystore: listenOpts.keystore }, (socket: any) => {
            attachBoundedSocket(socket, (req, sock) =>
              this.handleRequest(req, sock).catch(() => {
                writeHttpError(sock, 500, 'INTERNAL_ERROR', 'Server error');
              })
            );
            socket.on('error', () => {
              try {
                socket.destroy();
              } catch {
                /* ignore */
              }
            });
          });
          this.server.on('error', (err: Error) => {
            this._running = false;
            reject(err);
          });
          this.server.listen(
            { port: listenOpts.port, host: listenOpts.host, reuseAddress: listenOpts.reuseAddress },
            () => {
              this._running = true;
              resolve();
            }
          );
        } catch (err) {
          this._running = false;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  }

  stop(): void {
    if (this.server) {
      try {
        this.server.close();
      } catch {
        /* ignore */
      }
      this.server = null;
    }
    this._running = false;
    this.onWipe = null;
    this.config = null;
    this.wiped = false;
  }

  private async handleRequest(req: any, socket: any): Promise<void> {
    if (req.method === 'OPTIONS') {
      writeHttpResponse(socket, 200, {});
      return;
    }

    if (req.method === 'POST' && req.path === '/pkey/migrate/wipe') {
      if (!this.config || this.wiped) {
        writeHttpError(socket, 401, 'UNAUTHORIZED', 'Invalid session');
        return;
      }
      if (!isMigrationV2ContentType(req.headers['content-type'])) {
        writeHttpError(socket, 400, 'BAD_REQUEST', 'Encrypted body required');
        return;
      }

      const channelKeyHex = deriveChannelKeyHex(
        this.config.pairingSecret,
        this.config.receiverSessionId
      );
      let payload: { migrationId: string; wipeProof: string };
      try {
        payload = JSON.parse(decryptFrame(channelKeyHex, req.body));
      } catch {
        writeHttpError(socket, 400, 'BAD_JSON', 'Invalid encrypted body');
        return;
      }

      if (payload.migrationId !== this.config.migrationId) {
        writeHttpError(socket, 401, 'UNAUTHORIZED', 'Migration ID mismatch');
        return;
      }

      const proofOk = verifySenderWipeProof(
        channelKeyHex,
        payload.migrationId,
        this.config.senderSessionId,
        payload.wipeProof
      );
      if (!proofOk || payload.wipeProof !== this.config.expectedWipeProof) {
        writeHttpError(socket, 401, 'UNAUTHORIZED', 'Invalid wipe proof');
        return;
      }

      this.wiped = true;
      // Respond BEFORE wipe side-effects — onWipe closes migration UI / stops this server.
      writeHttpEncryptedResponse(socket, 200, channelKeyHex, { ok: true });
      const wipeCb = this.onWipe;
      this.onWipe = null;
      try {
        await wipeCb?.(payload.migrationId);
      } catch {
        /* wipe side-effects best-effort after ACK */
      }
      if (this.server || this._running) {
        this.stop();
      }
      return;
    }

    writeHttpError(socket, 404, 'NOT_FOUND', 'Unknown endpoint');
  }
}
