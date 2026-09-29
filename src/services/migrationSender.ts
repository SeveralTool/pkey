/**
 * @fileoverview HTTP client that pushes vault data from the source device (v2 encrypted channel).
 */

import { SHA256, Hex } from 'crypto-es';
import { computeChallengeResponse, signBody } from './syncAuth';
import { readEncryptedPayload } from './storage';
import { getLocalIp } from './networkUtils';
import {
  MIGRATION_CHUNK_SIZE,
  MIGRATION_PROTOCOL_VERSION,
  MIGRATION_SENDER_CALLBACK_PORT,
  DiscoveredMigrationDevice,
  MigrationInfoResponse,
  MigrationMetaPayload,
  parseMigrationAuthResponse,
  parseMigrationChallengeResponse,
  parseMigrationInfoResponse,
  parseMigrationStatusResponse,
  parseOkFlag,
} from './migrationProtocol';
import { parseJsonUnknown, tryParseJson } from '../utils/jsonUnknown';
import { getSecureRandomHex } from '../utils/secureRandom';
import { MigrationSendError } from './migrationErrors';
import { migrationHttpGet, migrationHttpPost } from './migrationHttpClient';
import { MigrationTcpSession } from './migrationTcpSession';
import {
  computeMigrationProof,
  computeSenderWipeProof,
  deriveChannelKeyHex,
  encryptFrame,
  isMigrationV2ContentType,
  decryptFrame,
  normalizePairingCode,
  MIGRATION_V2_CONTENT_TYPE,
} from './migrationChannelCrypto';

export interface MigrationSendOptions {
  device: DiscoveredMigrationDevice;
  passwordHash: string;
  sourceId: string;
  cardCount: number;
  onPhaseChange: (phase: string, progress: number, message?: string) => void;
  onFingerprint?: (fingerprint: string) => void;
  onTlsFingerprint?: (fingerprint: string) => void;
}

export interface MigrationSendResult {
  migrationId: string;
  senderSessionId: string;
  senderWipeProof: string;
  pairingSecret: string;
  receiverSessionId: string;
  token: string;
  senderIp: string;
  senderCallbackPort: number;
  fingerprint: string;
}

/** Fetches receiver `/info` without establishing a persistent migration session. */
export const fetchMigrationInfo = async (
  ip: string,
  port: number
): Promise<MigrationInfoResponse | null> => {
  try {
    const res = await migrationHttpGet(ip, port, '/pkey/migrate/info');
    if (res.status !== 200) return null;
    return parseMigrationInfoResponse(parseJsonUnknown(res.body));
  } catch {
    return null;
  }
};

/**
 * Authenticates to the receiver and pushes the encrypted vault in chunks over TLS.
 *
 * @returns Session identifiers and wipe proofs needed for sender cleanup
 */
export const sendMigration = async (
  options: MigrationSendOptions
): Promise<MigrationSendResult> => {
  const {
    device,
    passwordHash,
    sourceId,
    cardCount,
    onPhaseChange,
    onFingerprint,
    onTlsFingerprint,
  } = options;
  const { ip, port, sessionId, pairingSecret } = device;

  if (!pairingSecret) {
    throw new MigrationSendError('AUTH_FAILED');
  }

  const normalizedSecret = normalizePairingCode(pairingSecret);
  if (!normalizedSecret) {
    throw new MigrationSendError('AUTH_FAILED');
  }

  const migrationId = getSecureRandomHex(16);
  const senderSessionId = getSecureRandomHex(16);
  const senderIp = (await getLocalIp()) || '127.0.0.1';
  const senderCallbackPort = MIGRATION_SENDER_CALLBACK_PORT;

  onPhaseChange('connecting', 5, device.name);

  const session = new MigrationTcpSession();
  await session.connect(ip, port);

  try {
    let info: MigrationInfoResponse | null = null;
    try {
      const res = await session.get('/pkey/migrate/info');
      if (res.status !== 200) {
        throw new MigrationSendError('RECEIVER_UNREACHABLE', `HTTP ${res.status}`);
      }
      info = parseMigrationInfoResponse(parseJsonUnknown(res.body));
    } catch (e) {
      if (e instanceof MigrationSendError) throw e;
      throw new MigrationSendError('RECEIVER_UNREACHABLE', 'info_catch');
    }

    if (!info) {
      throw new MigrationSendError('RECEIVER_UNREACHABLE', 'info_null');
    }

    if (sessionId.trim() && info.sessionId.toLowerCase() !== sessionId.trim().toLowerCase()) {
      throw new MigrationSendError('SESSION_MISMATCH');
    }

    if (!info.ready) {
      throw new MigrationSendError(
        info.state === 'busy' ? 'RECEIVER_BUSY' : 'RECEIVER_UNREACHABLE',
        `state_${info.state || 'none'}`
      );
    }

    // Real pinning (audit finding A1): the receiver reports its cert
    // fingerprint over the app protocol; the sender must cross-check that
    // against the certificate the TLS peer actually presented. If they
    // differ, we're either being MITM'd or the receiver mis-reported —
    // either way, abort loudly rather than trusting the self-reported value.
    const observedTlsFingerprint = session.peerFingerprint;
    const declaredTlsFingerprint = info.tlsFingerprint?.toUpperCase() || '';

    // Prefer the observed fingerprint for the UI when available — that's the
    // one that actually proves nobody sat in the middle. Fall back to the
    // declared one so older builds without `getPeerCertificate` still show
    // *something* to the user for out-of-band verification.
    onTlsFingerprint?.(observedTlsFingerprint || declaredTlsFingerprint || '');

    if (observedTlsFingerprint && declaredTlsFingerprint) {
      if (observedTlsFingerprint !== declaredTlsFingerprint) {
        throw new MigrationSendError(
          'RECEIVER_UNREACHABLE',
          `TLS pinning failed: declared=${declaredTlsFingerprint} observed=${observedTlsFingerprint}`
        );
      }
    } else if (!observedTlsFingerprint) {
      // The native TLS layer did not expose peer cert introspection. Log a
      // warning so the user knows the anti-MITM check degraded to visual
      // verification only.
      console.warn(
        '[migration] TLS peer certificate unavailable — falling back to visual fingerprint check'
      );
    }

    if (info.protocolVersion !== MIGRATION_PROTOCOL_VERSION) {
      throw new MigrationSendError('PROTOCOL_MISMATCH');
    }

    if (!info.requiresEncryption) {
      throw new MigrationSendError('PROTOCOL_MISMATCH');
    }

    const resolvedSessionId = info.sessionId;
    const channelKeyHex = deriveChannelKeyHex(normalizedSecret, resolvedSessionId);
    const senderWipeProof = computeSenderWipeProof(channelKeyHex, migrationId, senderSessionId);

    onPhaseChange('authenticating', 10);

    const challengeRes = await session.get('/pkey/migrate/challenge', { 'X-Source-Id': sourceId });
    if (challengeRes.status !== 200) {
      throw new MigrationSendError('CHALLENGE_FAILED', `HTTP ${challengeRes.status}`);
    }
    let challengeData: { challenge: string; protocolVersion: number };
    try {
      const parsed = parseMigrationChallengeResponse(
        session.decryptResponseBody(
          challengeRes.body,
          channelKeyHex,
          challengeRes.headers?.['content-type']
        )
      );
      if (!parsed) throw new Error('challenge_shape');
      challengeData = parsed;
    } catch {
      throw new MigrationSendError('CHALLENGE_FAILED', 'decrypt');
    }
    if (challengeData.protocolVersion !== MIGRATION_PROTOCOL_VERSION) {
      throw new MigrationSendError('PROTOCOL_MISMATCH');
    }

    const response = computeChallengeResponse(challengeData.challenge, passwordHash);
    const proof = computeMigrationProof(
      channelKeyHex,
      passwordHash,
      migrationId,
      resolvedSessionId
    );

    const encryptedPayload = await readEncryptedPayload();
    if (!encryptedPayload) throw new MigrationSendError('NO_LOCAL_DB');
    const payloadHash = SHA256(encryptedPayload).toString(Hex);

    const authRes = await session.postEncryptedJson(
      '/pkey/migrate/auth',
      {
        migrationId,
        response,
        proof,
        payloadSha256: payloadHash,
        senderWipeProof,
        senderSessionId,
        senderIp,
        senderCallbackPort,
      },
      channelKeyHex,
      { 'X-Source-Id': sourceId }
    );

    const authData = parseMigrationAuthResponse(authRes.data);
    if (!authData?.ok || !authData.token) {
      throw new MigrationSendError('AUTH_FAILED');
    }
    const token = authData.token;
    const fingerprint = authData.fingerprint || '';
    onFingerprint?.(fingerprint);

    onPhaseChange('preparing', 15);

    const totalChunks = Math.ceil(encryptedPayload.length / MIGRATION_CHUNK_SIZE);

    const metaBody = {
      migrationId,
      cardCount,
      payloadSize: encryptedPayload.length,
      payloadHash,
      totalChunks,
    };
    const metaSignBody = JSON.stringify(metaBody);
    const meta: MigrationMetaPayload = {
      ...metaBody,
      signature: signBody(metaSignBody, token),
    };

    const metaRes = await session.postEncryptedJson('/pkey/migrate/meta', meta, channelKeyHex, {
      Authorization: `Bearer ${token}`,
    });
    if (metaRes.status !== 200) {
      throw new MigrationSendError('META_FAILED', `HTTP ${metaRes.status}`);
    }

    onPhaseChange('transferring', 20);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * MIGRATION_CHUNK_SIZE;
      const chunkData = encryptedPayload.slice(start, start + MIGRATION_CHUNK_SIZE);
      const chunkBody = {
        migrationId,
        chunkIndex: i,
        totalChunks,
        data: chunkData,
      };
      const chunkSignBody = JSON.stringify(chunkBody);
      const pushRes = await session.postEncryptedJson(
        '/pkey/migrate/push',
        { ...chunkBody, signature: signBody(chunkSignBody, token) },
        channelKeyHex,
        { Authorization: `Bearer ${token}` }
      );
      if (pushRes.status !== 200) {
        throw new MigrationSendError('CHUNK_FAILED', `${i + 1}/${totalChunks}`);
      }
      const pct = 20 + Math.round(((i + 1) / totalChunks) * 65);
      onPhaseChange('transferring', pct, `${i + 1}/${totalChunks}`);
    }

    onPhaseChange('verifying', 90);

    for (let attempt = 0; attempt < 60; attempt++) {
      const statusRes = await session.get('/pkey/migrate/status', {
        Authorization: `Bearer ${token}`,
      });
      if (statusRes.status === 200) {
        let status: { readyToFinalize?: boolean; phase?: string; message?: string } = {};
        if (isMigrationV2ContentType(statusRes.headers?.['content-type'])) {
          const parsed = tryParseJson(decryptFrame(channelKeyHex, statusRes.body));
          status = (parsed.ok ? parseMigrationStatusResponse(parsed.value) : null) ?? {};
        } else {
          status = parseMigrationStatusResponse(parseJsonUnknown(statusRes.body)) ?? {};
        }
        if (status?.readyToFinalize) break;
        if (status?.phase === 'error') {
          throw new MigrationSendError('RECEIVER_ERROR');
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return {
      migrationId,
      senderSessionId,
      senderWipeProof,
      pairingSecret: normalizedSecret,
      receiverSessionId: resolvedSessionId,
      token,
      senderIp,
      senderCallbackPort,
      fingerprint,
    };
  } finally {
    session.close();
  }
};

/**
 * Asks the sender callback server to wipe local data after a successful migration.
 * Tries primary IP then optional alternates (reported LAN IP vs TCP peer).
 *
 * @returns `true` when the sender acknowledges a successful wipe
 */
export const requestSenderWipe = async (
  senderIp: string,
  senderCallbackPort: number,
  migrationId: string,
  pairingSecret: string,
  receiverSessionId: string,
  wipeProof: string,
  alternateIps: string[] = []
): Promise<boolean> => {
  const channelKeyHex = deriveChannelKeyHex(pairingSecret, receiverSessionId);
  const inner = { migrationId, wipeProof };
  const frame = encryptFrame(channelKeyHex, JSON.stringify(inner));
  const hosts = [senderIp, ...alternateIps]
    .map((h) => (h || '').trim())
    .filter((h, i, arr) => !!h && h !== '127.0.0.1' && arr.indexOf(h) === i);

  for (const host of hosts) {
    try {
      const res = await migrationHttpPost(host, senderCallbackPort, '/pkey/migrate/wipe', frame, {
        'Content-Type': MIGRATION_V2_CONTENT_TYPE,
      });
      if (res.status !== 200) continue;
      const plain = decryptFrame(channelKeyHex, res.body);
      const data = parseOkFlag(parseJsonUnknown(plain));
      if (data?.ok) return true;
    } catch {
      /* try next host */
    }
  }
  return false;
};
