/**
 * @fileoverview Centralized type definitions for the PKEY project.
 */
export type {
  PasswordCard,
  CardIcon,
  AppSettings,
  Tombstone,
  SyncIndex,
  CardFingerprint,
  SyncDelta,
  EncryptedDatabase,
  DisplayCard,
  SyncEnvelope,
  OtpAlgorithm,
  HibpCheckResult,
} from '@pkey/core';

export { SYNC_PROTOCOL_VERSION } from '@pkey/core';

/**
 * Represents a web-browser client currently connected to the master
 * via the WebSocket web server (port 7392).
 */
export interface WebSyncClient {
  socketId: string;
  sourceId: string | null;
  authenticated: boolean;
  connectedAt: number;
  ip?: string;
  /** Sanitized User-Agent (header and/or `challenge_request`); untrusted. */
  userAgent?: string | null;
}

/**
 * A source that the master has explicitly blocked from connecting.
 */
export interface BlockedDevice {
  sourceId: string;
  blockedAt: string;
  label?: string;
}
