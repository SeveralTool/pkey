/**
 * @fileoverview Wire types and constants for one-shot device migration (v2).
 *
 * Security (v2): LAN traffic is encrypted with a channel key derived from a
 * pairingSecret (QR/manual) + sessionId. Does not use TLS; hostile WiFi or
 * malware on-device remain out of scope.
 *
 * Manual pairing: user enters IP + 16-char Crockford code; sessionId is fetched via /info.
 */
import { isRecord } from '../utils/jsonUnknown';
import { normalizePairingCode } from './migrationChannelCrypto';

export {
  formatPairingCode,
  formatPairingInput,
  normalizePairingCode,
  PAIRING_CODE_LENGTH,
} from './migrationChannelCrypto';
export const MIGRATION_PROTOCOL_VERSION = 2;
export const MIGRATION_PORT = 7393;
export const MIGRATION_SENDER_CALLBACK_PORT = 7394;
export const MIGRATION_CHUNK_SIZE = 32 * 1024;
/** Bonjour service type (without protocol suffix). */
export const MIGRATION_SERVICE_TYPE = '_pkey-migrate';
export const MIGRATION_SERVICE_PROTOCOL = 'tcp';
export const MIGRATION_SERVICE_DOMAIN = 'local.';
export const MIGRATION_SESSION_TTL_MS = 30 * 60_000;

export type MigrationPhase =
  | 'idle'
  | 'discovering'
  | 'connecting'
  | 'authenticating'
  | 'preparing'
  | 'transferring'
  | 'applying_cards'
  | 'applying_settings'
  | 'verifying'
  | 'ready_to_finalize'
  | 'finalizing'
  | 'wipe_complete'
  | 'migration_complete'
  | 'error';

export type MigrationRole = 'idle' | 'receiving' | 'sending';

export interface DiscoveredMigrationDevice {
  name: string;
  ip: string;
  port: number;
  sessionId: string;
  /** Channel fingerprint from mDNS (public). */
  fingerprint?: string;
  /** Only from QR or manual entry — never from mDNS TXT. */
  pairingSecret?: string;
}

export interface MigrationInfoResponse {
  deviceName: string;
  protocolVersion: number;
  sessionId: string;
  ready: boolean;
  state: 'waiting' | 'busy' | 'complete';
  requiresEncryption: boolean;
  tlsFingerprint?: string;
}

export interface MigrationChallengeResponse {
  challenge: string;
  protocolVersion: number;
}

export interface MigrationAuthRequestV2 {
  migrationId: string;
  response: string;
  proof: string;
  payloadSha256: string;
  senderWipeProof: string;
  senderSessionId: string;
  senderIp?: string;
  senderCallbackPort?: number;
}

export interface MigrationAuthResponse {
  ok: boolean;
  token?: string;
  error?: string;
  code?: string;
  fingerprint?: string;
}

export interface MigrationMetaPayload {
  migrationId: string;
  cardCount: number;
  payloadSize: number;
  payloadHash: string;
  totalChunks: number;
  signature?: string;
}

export interface MigrationPushChunk {
  migrationId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
  signature?: string;
}

export interface MigrationStatusResponse {
  phase: MigrationPhase;
  progress: number;
  message?: string;
  cardCount?: number;
  readyToFinalize?: boolean;
}

export interface MigrationWipeRequestV2 {
  migrationId: string;
  wipeProof: string;
}

/** Short visual session reference (first 4 chars, uppercase). */
export const formatSessionRef = (sessionId: string): string => sessionId.slice(0, 4).toUpperCase();

/** Builds QR payload for migration receiver pairing fallback. */
export const buildMigrationQrPayload = (
  ip: string,
  port: number,
  sessionId: string,
  pairingSecret: string
): string => {
  const ps = normalizePairingCode(pairingSecret) || pairingSecret;
  const params = new URLSearchParams({
    sid: sessionId,
    ps,
  });
  return `pkey-migrate://${ip}:${port}?${params.toString()}`;
};

/** Parses a migration QR payload. */
export const parseMigrationQrPayload = (
  qr: string
): { ip: string; port: number; sessionId: string; pairingSecret: string } | null => {
  const trimmed = (qr || '').trim();
  if (!trimmed) return null;

  const fromParts = (
    ip: string,
    portRaw: string | null | undefined,
    sessionId: string,
    rawPs: string
  ) => {
    const port = parseInt(portRaw || String(MIGRATION_PORT), 10);
    const pairingSecret = normalizePairingCode(rawPs);
    if (!ip || !sessionId || !pairingSecret || !Number.isFinite(port)) return null;
    return { ip, port, sessionId, pairingSecret };
  };

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'pkey-migrate:') {
      const parsed = fromParts(
        url.hostname,
        url.port,
        decodeURIComponent(url.searchParams.get('sid') || ''),
        decodeURIComponent(url.searchParams.get('ps') || '')
      );
      if (parsed) return parsed;
    }
  } catch {
    /* fall through to regex */
  }

  // Some camera pipelines mangle URL parsing for custom schemes; accept a direct match.
  const m = trimmed.match(/^pkey-migrate:\/\/([^:/?\s]+)(?::(\d+))?\/?\?([^#\s]+)$/i);
  if (!m) return null;
  const params = new URLSearchParams(m[3]);
  return fromParts(
    m[1],
    m[2],
    decodeURIComponent(params.get('sid') || ''),
    decodeURIComponent(params.get('ps') || '')
  );
};

/** Structural parse of receiver `/info` JSON. */
export function parseMigrationInfoResponse(input: unknown): MigrationInfoResponse | null {
  if (!isRecord(input)) return null;
  if (typeof input.deviceName !== 'string') return null;
  if (typeof input.protocolVersion !== 'number') return null;
  if (typeof input.sessionId !== 'string') return null;
  if (typeof input.ready !== 'boolean') return null;
  if (input.state !== 'waiting' && input.state !== 'busy' && input.state !== 'complete') {
    return null;
  }
  if (typeof input.requiresEncryption !== 'boolean') return null;
  return {
    deviceName: input.deviceName,
    protocolVersion: input.protocolVersion,
    sessionId: input.sessionId,
    ready: input.ready,
    state: input.state,
    requiresEncryption: input.requiresEncryption,
    tlsFingerprint: typeof input.tlsFingerprint === 'string' ? input.tlsFingerprint : undefined,
  };
}

/** Structural parse of `/challenge` JSON. */
export function parseMigrationChallengeResponse(input: unknown): MigrationChallengeResponse | null {
  if (!isRecord(input)) return null;
  if (typeof input.challenge !== 'string' || typeof input.protocolVersion !== 'number') return null;
  return { challenge: input.challenge, protocolVersion: input.protocolVersion };
}

/** Structural parse of `/auth` JSON. */
export function parseMigrationAuthResponse(input: unknown): MigrationAuthResponse | null {
  if (!isRecord(input)) return null;
  if (typeof input.ok !== 'boolean') return null;
  return {
    ok: input.ok,
    token: typeof input.token === 'string' ? input.token : undefined,
    error: typeof input.error === 'string' ? input.error : undefined,
    code: typeof input.code === 'string' ? input.code : undefined,
    fingerprint: typeof input.fingerprint === 'string' ? input.fingerprint : undefined,
  };
}

/** Structural parse of `/status` JSON (partial fields used by the sender). */
export function parseMigrationStatusResponse(
  input: unknown
): Pick<MigrationStatusResponse, 'phase' | 'message' | 'readyToFinalize'> | null {
  if (!isRecord(input)) return null;
  const phase =
    typeof input.phase === 'string' ? (input.phase as MigrationStatusResponse['phase']) : undefined;
  return {
    phase,
    message: typeof input.message === 'string' ? input.message : undefined,
    readyToFinalize: typeof input.readyToFinalize === 'boolean' ? input.readyToFinalize : undefined,
  };
}

/** Structural parse of `{ ok: boolean }` wipe acknowledgements. */
export function parseOkFlag(input: unknown): { ok: boolean } | null {
  if (!isRecord(input) || typeof input.ok !== 'boolean') return null;
  return { ok: input.ok };
}
