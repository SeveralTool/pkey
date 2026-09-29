/**
 * Mock master for local PWA development (protocol v2 + encrypted envelopes).
 * Run: npx tsx dev/mockMaster.ts
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  deriveVaultAuthSecret,
  computeChallengeResponse,
  spake2Start,
  spake2Finish,
  spake2Confirm,
  computeHostProof,
  HOST_PROOF_KIND,
  encryptAuthOk,
  encryptWireAead,
  decryptSyncPushWire,
  encryptControlWire,
  decryptControlWire,
  wrapControlInner,
  mergePullLocally,
  parseActionConfirmRequest,
  SYNC_PROTOCOL_VERSION,
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  SYNC_PULL_REQUEST_TYPE,
  UNLOCK_REQUEST_TYPE,
  UNLOCK_OFFER_TYPE,
  UNLOCK_GRANT_TYPE,
  DEFAULT_VAULT_SETTINGS,
  generateUnlockKeypair,
  wrapUnlockGrant,
  parseUnlockRequest,
  type PasswordCard,
  type AppSettings,
} from '@pkey/core';

const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');

const PORT = 7392;
const PASSWORD = 'test';
const SALT = 'devsalt1234567890';
const AUTH_HASH = deriveVaultAuthSecret(PASSWORD, SALT, 'v3-hkdf');
const HOST_PROOF_SECRET = randomHex(32);

let cards: PasswordCard[] = [];
let settings: AppSettings = {
  ...DEFAULT_VAULT_SETTINGS,
  language: 'ESP',
  theme: 'AUTO',
  webLoginOnPhone: true,
};

const pullBody = () => ({
  upserts: cards,
  deletions: [] as string[],
  tombstones: [] as [],
  versionHash: '',
  protocolVersion: SYNC_PROTOCOL_VERSION,
  settings,
});

const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><p>Use vite dev server for UI; this is WS only.</p></body></html>');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/pkey/ws' });

wss.on('connection', (ws) => {
  let token: string | null = null;
  let challenge = '';
  let spake = spake2Start(AUTH_HASH, 'A');

  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    switch (msg.type) {
      case 'challenge_request':
        challenge = randomHex(32);
        spake = spake2Start(AUTH_HASH, 'A');
        ws.send(
          JSON.stringify({
            type: 'challenge',
            challenge,
            protocolVersion: SYNC_PROTOCOL_VERSION,
            salt: SALT,
            authScheme: 'v3-hkdf',
            spakeShare: spake.shareHex,
            authMode: 'spake2',
            ...(typeof msg.clientNonce === 'string' && msg.clientNonce
              ? {
                  serverProof: computeHostProof(msg.clientNonce, HOST_PROOF_SECRET),
                  proofKind: HOST_PROOF_KIND,
                }
              : {}),
          })
        );
        break;
      case 'auth': {
        let ok = false;
        if (typeof msg.spakeShare === 'string' && msg.spakeShare) {
          try {
            const shared = spake2Finish(AUTH_HASH, spake, msg.spakeShare, 'A');
            ok = msg.response === spake2Confirm(shared, challenge);
          } catch {
            ok = false;
          }
        } else {
          ok = msg.response === computeChallengeResponse(challenge, AUTH_HASH);
        }
        if (ok) {
          token = randomHex(16);
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
              encryptedPayload: encryptWireAead(pullBody(), AUTH_HASH),
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
            ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', error: 'Unauthorized' }));
          }
          return;
        }
        const wire = decryptSyncPushWire(msg.encryptedPayload, AUTH_HASH);
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
            encryptedPayload: encryptPayload(pullBody(), AUTH_HASH),
          })
        );
        break;
      }
      case ACTION_CONFIRM_REQUEST_TYPE: {
        if (!token) return;
        const inner = decryptControlWire(msg, AUTH_HASH);
        if (!inner || inner.token !== token) return;
        const parsed = parseActionConfirmRequest(inner);
        if (!parsed) return;
        ws.send(
          JSON.stringify(
            encryptControlWire(
              ACTION_CONFIRM_RESULT_TYPE,
              wrapControlInner(token, {
                requestId: parsed.requestId,
                action: parsed.action,
                ...(parsed.cardId ? { cardId: parsed.cardId } : {}),
                ok: true,
              }),
              AUTH_HASH
            )
          )
        );
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case UNLOCK_REQUEST_TYPE: {
        const parsed = parseUnlockRequest(msg);
        if (!parsed) break;
        const kp = generateUnlockKeypair();
        ws.send(
          JSON.stringify({
            type: UNLOCK_OFFER_TYPE,
            requestId: parsed.requestId,
            serverPub: kp.publicKeyHex,
          })
        );
        const envelope = wrapUnlockGrant(kp.secretKey, parsed.clientPub, {
          passwordHash: AUTH_HASH,
          salt: SALT,
          authScheme: 'v3-hkdf',
        });
        if (envelope) {
          ws.send(
            JSON.stringify({
              type: UNLOCK_GRANT_TYPE,
              requestId: parsed.requestId,
              serverPub: kp.publicKeyHex,
              encryptedPayload: envelope,
            })
          );
        }
        break;
      }
      default:
        break;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Mock master v2 on http://localhost:${PORT}`);
});
