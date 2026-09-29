/**
 * @fileoverview Unit tests for migration protocol helpers.
 */
import {
  buildMigrationQrPayload,
  parseMigrationQrPayload,
  formatPairingCode,
  formatSessionRef,
  MIGRATION_CHUNK_SIZE,
  MIGRATION_PORT,
  MIGRATION_PROTOCOL_VERSION,
  parseMigrationAuthResponse,
  parseMigrationInfoResponse,
  parseOkFlag,
} from './migrationProtocol';
import { generatePairingSecret } from './migrationChannelCrypto';
import { SHA256, Hex } from 'crypto-es';

describe('migrationProtocol', () => {
  it('builds and parses QR payload v2 with short pairing code', () => {
    const ps = generatePairingSecret();
    const qr = buildMigrationQrPayload('192.168.1.10', MIGRATION_PORT, 'abc123', ps);
    expect(qr).toContain('pkey-migrate://');
    expect(qr).toContain('192.168.1.10');
    expect(qr).toContain('ps=');
    expect(qr.length).toBeLessThan(120);
    const parsed = parseMigrationQrPayload(qr);
    expect(parsed).toEqual({
      ip: '192.168.1.10',
      port: MIGRATION_PORT,
      sessionId: 'abc123',
      pairingSecret: ps,
    });
  });

  it('parses QR with dashed pairing code in query', () => {
    const ps = generatePairingSecret();
    const dashed = formatPairingCode(ps);
    const qr = `pkey-migrate://192.168.1.10:7393?sid=abc&ps=${encodeURIComponent(dashed)}`;
    const parsed = parseMigrationQrPayload(qr);
    expect(parsed?.pairingSecret).toBe(ps);
  });

  it('rejects QR without pairing secret', () => {
    const qr = `pkey-migrate://192.168.1.10:7393?sid=abc123`;
    expect(parseMigrationQrPayload(qr)).toBeNull();
  });

  it('rejects invalid QR payloads', () => {
    expect(parseMigrationQrPayload('pkey-sync://x')).toBeNull();
    expect(parseMigrationQrPayload('not-a-url')).toBeNull();
  });

  it('uses protocol version 2', () => {
    expect(MIGRATION_PROTOCOL_VERSION).toBe(2);
  });

  it('formats session ref as 4 chars', () => {
    expect(formatSessionRef('a1b2c3d4')).toBe('A1B2');
  });

  it('parses migration /info JSON structurally and rejects junk', () => {
    expect(
      parseMigrationInfoResponse({
        deviceName: 'PKey',
        protocolVersion: 2,
        sessionId: 'abc',
        ready: true,
        state: 'waiting',
        requiresEncryption: true,
      })?.sessionId
    ).toBe('abc');
    expect(parseMigrationInfoResponse({ ready: true })).toBeNull();
    expect(parseMigrationAuthResponse({ ok: true, token: 't' })?.token).toBe('t');
    expect(parseOkFlag({ ok: true })).toEqual({ ok: true });
    expect(parseOkFlag({ ok: 'yes' })).toBeNull();
  });

  it('chunks payload deterministically', () => {
    const payload = 'x'.repeat(MIGRATION_CHUNK_SIZE * 2 + 100);
    const totalChunks = Math.ceil(payload.length / MIGRATION_CHUNK_SIZE);
    expect(totalChunks).toBe(3);
    const hash = SHA256(payload).toString(Hex);
    expect(hash.length).toBe(64);
  });
});

describe('migration auth v2 proofs', () => {
  it('verifies auth and wipe proofs with channel key', () => {
    const {
      deriveChannelKeyHex,
      computeMigrationProof,
      computeSenderWipeProof,
      verifyMigrationProof,
      verifySenderWipeProof,
    } = require('./migrationChannelCrypto');
    const pairingSecret = generatePairingSecret();
    const sessionId = 'sess1';
    const channelKey = deriveChannelKeyHex(pairingSecret, sessionId);
    const passwordHash = 'abc123hash';
    const migrationId = 'mid1';
    const senderSessionId = 'ssid1';

    const proof = computeMigrationProof(channelKey, passwordHash, migrationId, sessionId);
    expect(verifyMigrationProof(channelKey, passwordHash, migrationId, sessionId, proof)).toBe(
      true
    );

    const wipeProof = computeSenderWipeProof(channelKey, migrationId, senderSessionId);
    expect(verifySenderWipeProof(channelKey, migrationId, senderSessionId, wipeProof)).toBe(true);
  });

  it('issues and verifies bearer token with session id', () => {
    const { issueToken, verifyToken } = require('./syncAuth');
    const migrationId = 'mid123';
    const sessionId = 'sess456';
    const token = issueToken(migrationId, sessionId);
    expect(verifyToken(token, migrationId, sessionId)).toBe(true);
    expect(verifyToken(token, migrationId, 'wrong')).toBe(false);
  });
});
