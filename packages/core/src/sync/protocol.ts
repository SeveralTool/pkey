/**
 * @fileoverview Sync protocol message shapes, version constants, and helpers.
 */

import type { PasswordCard, Tombstone, SyncIndex, AppSettings, PasswordHashScheme } from '../types';
import { SYNC_PROTOCOL_VERSION } from '../types';

/** Challenge issued by the master to authenticate a satellite client. */
export interface AuthChallenge {
  challenge: string;
  protocolVersion: number;
  /** Vault salt when the master uses PBKDF2 auth. */
  salt?: string;
  /**
   * How the satellite must derive the shared secret for the challenge HMAC.
   * Defaults to `v2-pbkdf2` when omitted (pre-audit masters).
   */
  authScheme?: PasswordHashScheme;
  /**
   * Proof that this master holds the *host pairing* secret, over the
   * `clientNonce` the satellite sent with its challenge request. Present only
   * when a nonce was given. Keyed by a random pairing secret — never the vault
   * auth verifier — so an anonymous LAN client cannot use it as a password
   * oracle. Satellites reconnecting to a discovered host must verify it before
   * answering the challenge.
   */
  serverProof?: string;
  /**
   * Distinguishes a pairing-key host proof from a legacy vault-HMAC proof.
   * Current masters send `host-pairing` whenever `serverProof` is present.
   */
  proofKind?: 'host-pairing';
  /**
   * Master's SPAKE2 share (uncompressed P-256 point hex). Present on protocol
   * v3 so the satellite can finish the PAKE instead of sending HMAC(passwordHash).
   */
  spakeShare?: string;
  /** `spake2` when {@link spakeShare} is set; omitted on HMAC-only masters. */
  authMode?: 'spake2' | 'hmac';
}

/** Client response to an {@link AuthChallenge}. */
export interface AuthRequest {
  sessionFingerprint: string;
  response: string;
  protocolVersion: number;
  /** Satellite SPAKE2 share; required for protocol v3 PAKE, omitted for HMAC grace. */
  spakeShare?: string;
}

/** Successful auth result returned to the client. */
export interface AuthResult {
  token: string;
  protocolVersion: number;
}

/** Payload pushed from satellite/master during sync. */
export interface SyncPushPayload {
  index: SyncIndex;
  upserts: PasswordCard[];
  deletions: string[];
  tombstones: Tombstone[];
  /** Optional settings patch from satellite (webTheme / webLanguage / webAutoLogout). */
  settings?: Partial<AppSettings>;
  /**
   * When true, the master replaces its vault cards with `upserts` instead of
   * LWW-merging. Only accepted after the master chose the browser session
   * in a vault-fork chooser (`allowVaultReplace`).
   */
  replaceVault?: boolean;
}

/** Exclusive chooser when the PWA's pinned salt does not match the master. */
export type VaultForkAction = 'use_pwa' | 'use_phone' | 'defer';

/** Satellite → master: pause incremental sync; the vaults are different generations. */
export const VAULT_FORK_TYPE = 'vault_fork' as const;
/** Master → satellite: which session wins. */
export const VAULT_FORK_DECISION_TYPE = 'vault_fork_decision' as const;
/** Master → satellite: hint to pull (no vault body). */
export const SERVER_PUSH_TYPE = 'server_push' as const;
/**
 * Satellite → master: index-only pull. Same encrypted envelope as `sync_push`
 * but the master must ignore upserts / settings (pull does not write).
 */
export const SYNC_PULL_REQUEST_TYPE = 'sync_pull_request' as const;

/**
 * Sensitive PWA actions that can be step-up confirmed on the phone after
 * the browser session is already authenticated. Login/re-login is not included.
 */
export type PwaActionConfirmKind =
  'edit' | 'delete' | 'reveal' | 'copy' | 'copy_otp' | 'reveal_otp' | 'copy_username';

/** Why the phone declined a PWA action confirm. */
export type ActionConfirmDenyReason =
  'denied' | 'timeout' | 'unavailable' | 'cancelled' | 'busy' | 'rate_limited';

/** Satellite → master: ask the phone user to confirm a sensitive PWA action. */
export const ACTION_CONFIRM_REQUEST_TYPE = 'action_confirm_request' as const;
/** Master → satellite: biometric/password decision for {@link ACTION_CONFIRM_REQUEST_TYPE}. */
export const ACTION_CONFIRM_RESULT_TYPE = 'action_confirm_result' as const;
/** Satellite → master: user cancelled the waiting UI or chose password fallback. */
export const ACTION_CONFIRM_CANCEL_TYPE = 'action_confirm_cancel' as const;

/** How long both sides wait for a phone decision before falling back. */
export const ACTION_CONFIRM_TIMEOUT_MS = 30_000;
/** Max confirm requests per source inside {@link ACTION_CONFIRM_RATE_WINDOW_MS}. */
export const ACTION_CONFIRM_RATE_MAX = 10;
/** Sliding window for {@link ACTION_CONFIRM_RATE_MAX}. */
export const ACTION_CONFIRM_RATE_WINDOW_MS = 60_000;

/** PWA → phone payload (no secrets; phone looks up the card title locally). */
export interface ActionConfirmRequest {
  requestId: string;
  action: PwaActionConfirmKind;
  cardId?: string;
}

/** Phone → PWA decision. `reason` is set when `ok` is false. Echoes `action`/`cardId`. */
export interface ActionConfirmResult {
  requestId: string;
  action: PwaActionConfirmKind;
  cardId?: string;
  ok: boolean;
  reason?: ActionConfirmDenyReason;
}

/** Inner version for post-auth control envelopes (`encryptControlWire`). */
export const CONTROL_WIRE_INNER_VERSION = 1;
/** Clock skew allowed when checking a control-frame `exp` (unix ms). */
export const CONTROL_WIRE_SKEW_MS = 5_000;
/** Freshness window for a control frame (`exp = now + TTL` at encrypt time). */
export const CONTROL_WIRE_TTL_MS = ACTION_CONFIRM_TIMEOUT_MS;

/**
 * Post-auth WS types that MUST carry an AES-CBC+HMAC envelope. Pre-auth
 * `challenge*` / `auth` / `auth_error` / `ping` stay plaintext. `auth_ok` is
 * enveloped separately. `error` is only required after the session authenticated.
 */
export const ENCRYPTED_CONTROL_TYPES: ReadonlySet<string> = new Set([
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  ACTION_CONFIRM_CANCEL_TYPE,
  VAULT_FORK_TYPE,
  VAULT_FORK_DECISION_TYPE,
  SERVER_PUSH_TYPE,
  'error',
]);

/** True when `type` is a post-auth control frame that must not travel in the clear. */
export function isEncryptedControlType(type: unknown): type is string {
  return typeof type === 'string' && ENCRYPTED_CONTROL_TYPES.has(type);
}

/** PWA → phone: start a pre-auth biometric unlock (ECDH client pubkey). */
export const UNLOCK_REQUEST_TYPE = 'unlock_request' as const;
/** Phone → PWA: ECDH server pubkey so both sides can show the SAS. */
export const UNLOCK_OFFER_TYPE = 'unlock_offer' as const;
/** Phone → PWA: wrapped `passwordHash` after Face ID (keyed by ECDH, not vault hash). */
export const UNLOCK_GRANT_TYPE = 'unlock_grant' as const;
/** Either side: abort a pending unlock. */
export const UNLOCK_CANCEL_TYPE = 'unlock_cancel' as const;

/** How long both sides wait for a phone unlock decision. */
export const UNLOCK_TIMEOUT_MS = 30_000;
/** Max unlock requests per source inside {@link UNLOCK_RATE_WINDOW_MS}. */
export const UNLOCK_RATE_MAX = 3;
/** Sliding window for {@link UNLOCK_RATE_MAX}. */
export const UNLOCK_RATE_WINDOW_MS = 60_000;

/** Payload pulled by a client after comparing indexes. */
export interface SyncPullPayload {
  upserts: PasswordCard[];
  deletions: string[];
  tombstones: Tombstone[];
  versionHash: string;
  protocolVersion: number;
  settings?: AppSettings;
}

/** Machine-readable protocol error codes. */
export type ProtocolErrorCode =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'UNAUTHORIZED'
  | 'BAD_SIGNATURE'
  | 'PROTOCOL_MISMATCH'
  | 'SESSION_MISMATCH';

/** Error body returned on protocol failures. */
export interface ProtocolError {
  error: string;
  code: ProtocolErrorCode;
}

/** Current sync protocol version (alias of {@link SYNC_PROTOCOL_VERSION}). */
export const CURRENT_PROTOCOL = SYNC_PROTOCOL_VERSION;
/** Oldest protocol version this build still accepts. */
export const MIN_SUPPORTED_PROTOCOL = 1;

/**
 * Returns whether a peer protocol version is within the supported range.
 *
 * @param peerVersion - Version advertised by the peer.
 * @returns `true` if `MIN_SUPPORTED_PROTOCOL <= peerVersion <= CURRENT_PROTOCOL`.
 */
export const isProtocolCompatible = (peerVersion: number): boolean =>
  peerVersion >= MIN_SUPPORTED_PROTOCOL && peerVersion <= CURRENT_PROTOCOL;

/**
 * Creates an empty {@link SyncIndex} stamped with {@link CURRENT_PROTOCOL}.
 *
 * @returns Empty cards map and tombstones array.
 */
export const emptySyncIndex = (): SyncIndex => ({
  cards: {},
  tombstones: [],
  protocolVersion: CURRENT_PROTOCOL,
});
