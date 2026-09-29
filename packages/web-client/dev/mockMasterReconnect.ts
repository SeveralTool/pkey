/**
 * Programmable mock master for reconnect e2e: serves the built PWA, `/pkey/meta`,
 * and the sync WebSocket (with mutual proof). Two instances on different ports
 * stand in for a DHCP IP change — 127.0.0.2 is not assumed (missing on macOS
 * without an lo0 alias).
 *
 *   npx tsx dev/mockMasterReconnect.ts
 */
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  deriveVaultAuthSecret,
  computeChallengeResponse,
  computeHostProof,
  HOST_PROOF_KIND,
  encryptAuthOk,
  encryptPayload,
  decryptSyncPushWire,
  encryptControlWire,
  wrapControlInner,
  mergePullLocally,
  SYNC_PROTOCOL_VERSION,
  SYNC_PULL_REQUEST_TYPE,
  DEFAULT_VAULT_SETTINGS,
  type PasswordCard,
  type AppSettings,
} from '@pkey/core';

const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_HTML = join(HERE, '..', 'dist', 'index.html');

const PASSWORD = 'test';
const SALT = 'devsalt1234567890';
const AUTH_HASH = deriveVaultAuthSecret(PASSWORD, SALT, 'v3-hkdf');
const HOST_PROOF_SECRET = randomHex(32);

export interface MockMasterOptions {
  host?: string;
  port: number;
  deviceId?: string;
  /** Raw `/pkey/meta.mdnsHost` (not sanitized — e2e may pass `127.0.0.1:7393`). */
  mdnsHost?: string;
  ip?: string;
}

export interface MockMaster {
  port: number;
  host: string;
  /** WebSocket upgrades that sent `sourceId` starting with `probe-`. */
  probeHits: number;
  /** Authenticated (non-probe) sessions currently open. */
  authSessions: number;
  closeAllSockets: () => void;
  close: () => Promise<void>;
  getCards: () => PasswordCard[];
}

function loadPwaHtml(): string {
  if (!existsSync(DIST_HTML)) {
    throw new Error(
      `PWA build missing at ${DIST_HTML}. Run \`npm run build:web\` before reconnect e2e.`
    );
  }
  return readFileSync(DIST_HTML, 'utf8');
}

/**
 * Starts a mock master that serves the single-file PWA and the sync protocol.
 */
export function createMockMaster(opts: MockMasterOptions): Promise<MockMaster> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port;
  const deviceId = opts.deviceId ?? 'e2e-master';
  const mdnsHost = opts.mdnsHost ?? '';
  const ip = opts.ip ?? host;
  const html = loadPwaHtml();

  let cards: PasswordCard[] = [];
  let settings: AppSettings = { ...DEFAULT_VAULT_SETTINGS, language: 'ESP', theme: 'AUTO' };
  let probeHits = 0;
  const sockets = new Set<WebSocket>();
  let authSessions = 0;

  const server: Server = createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';
    if (req.method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && url === '/pkey/meta') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          metaVersion: 1,
          deviceId,
          mdnsHost,
          ip,
          generatedAt: Date.now(),
          language: settings.language,
          theme: settings.theme,
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: '/pkey/ws' });

  wss.on('connection', (ws) => {
    sockets.add(ws);
    let token: string | null = null;
    let challenge = '';
    let countedAuth = false;

    ws.on('close', () => {
      sockets.delete(ws);
      if (countedAuth) authSessions = Math.max(0, authSessions - 1);
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      switch (msg.type) {
        case 'challenge_request': {
          if (typeof msg.sourceId === 'string' && msg.sourceId.startsWith('probe-')) {
            probeHits += 1;
          }
          challenge = randomHex(32);
          ws.send(
            JSON.stringify({
              type: 'challenge',
              challenge,
              protocolVersion: SYNC_PROTOCOL_VERSION,
              salt: SALT,
              authScheme: 'v3-hkdf',
              ...(typeof msg.clientNonce === 'string' && msg.clientNonce
                ? {
                    serverProof: computeHostProof(msg.clientNonce, HOST_PROOF_SECRET),
                    proofKind: HOST_PROOF_KIND,
                  }
                : {}),
            })
          );
          break;
        }
        case 'auth': {
          const expected = computeChallengeResponse(challenge, AUTH_HASH);
          if (msg.response === expected) {
            token = randomHex(16);
            if (!countedAuth) {
              countedAuth = true;
              authSessions += 1;
            }
            ws.send(
              JSON.stringify({
                type: 'auth_ok',
                encryptedPayload: encryptAuthOk(
                  token,
                  SYNC_PROTOCOL_VERSION,
                  AUTH_HASH,
                  HOST_PROOF_SECRET
                ),
                protocolVersion: SYNC_PROTOCOL_VERSION,
              })
            );
            ws.send(
              JSON.stringify({
                type: 'sync_pull',
                encryptedPayload: encryptPayload(
                  {
                    upserts: cards,
                    deletions: [],
                    tombstones: [],
                    versionHash: '',
                    protocolVersion: SYNC_PROTOCOL_VERSION,
                    settings,
                  },
                  AUTH_HASH
                ),
              })
            );
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', error: 'Bad password' }));
          }
          break;
        }
        case 'sync_push':
        case SYNC_PULL_REQUEST_TYPE: {
          if (!token || !msg.encryptedPayload) {
            if (token) {
              ws.send(
                JSON.stringify(
                  encryptControlWire(
                    'error',
                    wrapControlInner(token, { code: 'UNAUTHORIZED', error: 'Unauthorized' }),
                    AUTH_HASH
                  )
                )
              );
            } else {
              ws.send(
                JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', error: 'Unauthorized' })
              );
            }
            return;
          }
          const wire = decryptSyncPushWire(msg.encryptedPayload as never, AUTH_HASH);
          if (!wire || wire.token !== token) {
            ws.send(
              JSON.stringify(
                encryptControlWire(
                  'error',
                  wrapControlInner(token, { code: 'UNAUTHORIZED', error: 'Unauthorized' }),
                  AUTH_HASH
                )
              )
            );
            return;
          }
          const { token: _t, ...payload } = wire;
          if (msg.type !== SYNC_PULL_REQUEST_TYPE) {
            cards = mergePullLocally(cards, {
              upserts: payload.upserts ?? [],
              deletions: payload.deletions ?? [],
              tombstones: payload.tombstones ?? [],
            }).cards;
            if (payload.settings) settings = { ...settings, ...payload.settings };
          }
          ws.send(
            JSON.stringify({
              type: 'sync_pull',
              encryptedPayload: encryptPayload(
                {
                  upserts: cards,
                  deletions: [],
                  tombstones: [],
                  versionHash: '',
                  protocolVersion: SYNC_PROTOCOL_VERSION,
                  settings,
                },
                AUTH_HASH
              ),
            })
          );
          break;
        }
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          break;
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        port,
        host,
        get probeHits() {
          return probeHits;
        },
        get authSessions() {
          return authSessions;
        },
        closeAllSockets() {
          for (const ws of sockets) {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          }
        },
        close() {
          return new Promise((res) => {
            for (const ws of sockets) {
              try {
                ws.terminate();
              } catch {
                /* ignore */
              }
            }
            wss.close();
            server.close(() => res());
          });
        },
        getCards() {
          return cards.map((c) => ({ ...c, tags: [...(c.tags ?? [])] }));
        },
      });
    });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT || 7392);
  createMockMaster({ port }).then((m) => {
    console.log(`Mock reconnect master on http://${m.host}:${m.port}`);
  });
}
