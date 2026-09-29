/**
 * @fileoverview Transport-agnostic master-side sync logic.
 *
 * This is the brain of the "master" device. It is intentionally decoupled from
 * any network library: it operates on plain request/response objects. Both the
 * TCP mobile server and the WebSocket web server delegate to this exact same
 * core, guaranteeing identical behaviour and a single test surface.
 */
import { EncryptedDatabase } from '../types';
import { LocalCipher } from './crypto';
import {
  AuthChallenge,
  AuthRequest,
  AuthResult,
  SyncPushPayload,
  SyncPullPayload,
  ProtocolError,
  CURRENT_PROTOCOL,
  isProtocolCompatible,
  SYNC_PULL_REQUEST_TYPE,
} from './syncProtocol';
import {
  decryptSyncPushWire,
  encryptAuthOk,
  encryptPayload,
  encryptWireAead,
  encryptControlWire,
  decryptControlWire,
  wrapControlInner,
  sealOutgoingControl,
  usesEncryptedSyncWire,
  normalizeTheme,
  normalizeLanguage,
  mergeVaultSettings,
  stripSatelliteMasterOnlySettings,
  vaultContentChanged,
  computeHostProof,
  HOST_PROOF_KIND,
  sanitizeUserAgent,
  replaceVaultCards,
  parseVaultForkInner,
  VAULT_FORK_TYPE,
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  ACTION_CONFIRM_CANCEL_TYPE,
  ACTION_CONFIRM_RATE_MAX,
  ACTION_CONFIRM_RATE_WINDOW_MS,
  parseActionConfirmRequest,
  parseActionConfirmCancel,
  sanitizePublicSessionId,
  sanitizeSessionCreatedAt,
  formatClientIp,
  constantTimeEquals,
  isEncryptedControlType,
  type PwaActionConfirmKind,
  type ControlWireMessage,
  UNLOCK_REQUEST_TYPE,
  UNLOCK_OFFER_TYPE,
  UNLOCK_GRANT_TYPE,
  UNLOCK_CANCEL_TYPE,
  UNLOCK_RATE_MAX,
  UNLOCK_RATE_WINDOW_MS,
  generateUnlockKeypair,
  computeUnlockSas,
  wrapUnlockGrant,
  parseUnlockRequest,
  parseUnlockCancel,
} from '@pkey/core';
import {
  ChallengeStore,
  RateLimiter,
  issueToken,
  verifyToken,
  verifyBodySignature,
  computeChallengeResponse,
} from './syncAuth';
import { mergeCards, mergeTombstones } from '../utils/dbMerge';
import type { CardFieldOverwrite } from '@pkey/core';
import { buildSyncIndex, computeOutgoingDelta, computeDbVersionHash } from '../utils/syncDelta';
import { generateNonce } from './syncAuth';

export interface SyncServerHooks {
  /** Returns the current decrypted database (master's source of truth). */
  getDb: () => EncryptedDatabase;
  /** Persists the merged database (encrypt + write happens in the impl). */
  setDb: (db: EncryptedDatabase, sourceId?: string) => Promise<void> | void;
  /** Optional audit sink. */
  onEvent?: (event: SyncAuditEvent) => void;
  /**
   * Optional UI notice when sync overwrote conflicting non-empty fields.
   * Fires ONCE per conflicted merge with the list of overwrites AND a
   * snapshot of the pre-merge state of only the affected cards. Consumers
   * can wire the snapshot into an "Undo" affordance (audit finding M2).
   */
  onFieldOverwrites?: (
    overwrites: CardFieldOverwrite[],
    sourceId: string,
    preMergeSnapshot: SyncPreMergeSnapshot
  ) => void;
  /** PWA reported a different vault salt with local cards — show the chooser. */
  onVaultFork?: (info: { sourceId: string; pwaCardCount: number; encryptedOnly: boolean }) => void;
  /** The forking client disconnected before the user chose. */
  onVaultForkCancelled?: (sourceId: string) => void;
  /** Authenticated PWA asked the phone to confirm a sensitive action. */
  onActionConfirm?: (info: {
    sourceId: string;
    requestId: string;
    action: PwaActionConfirmKind;
    cardId?: string;
  }) => void;
  /** Pending confirm was replaced, cancelled, or the client disconnected. */
  onActionConfirmCancelled?: (info: { sourceId: string; requestId: string }) => void;
  /** Pre-auth PWA asked this phone to unlock with biometrics (SAS already computed). */
  onUnlockRequest?: (info: { sourceId: string; requestId: string; sas: string }) => void;
  /** Pending unlock was replaced, cancelled, or the client disconnected. */
  onUnlockCancelled?: (info: { sourceId: string; requestId: string }) => void;
  /**
   * Random host-pairing secret for pre-auth `serverProof`. Never the vault
   * auth verifier. Tests may omit it; the core then uses a per-instance ephemeral.
   */
  getHostProofSecret?: () => string;
}

/**
 * Minimal snapshot captured just before `mergeCards` runs, containing ONLY
 * the cards whose IDs appear in the overwrite list. This keeps the undo
 * data structure small and cheap to hold in memory for the 5-minute TTL
 * without duplicating the entire vault.
 */
export interface SyncPreMergeSnapshot {
  /** ISO-8601 timestamp of when the snapshot was taken. */
  capturedAt: string;
  /** Deep-cloned cards keyed by id, exactly as they were before the merge. */
  cardsById: Record<string, unknown>;
}

export interface SyncAuditEvent {
  type:
    | 'challenge_issued'
    | 'auth_success'
    | 'auth_failure'
    | 'sync_received'
    | 'rate_limited'
    | 'protocol_mismatch'
    | 'blocked';
  sourceId: string;
  at: number;
}

/* ------------------------------------------------------------------ *
 * WebSocket session handler (returned by createWsSession)
 * ------------------------------------------------------------------ */

export type WsOutgoing = (msg: WsMessage) => void;

export interface WsSession {
  /** Feed a parsed incoming JSON message from the client. */
  onMessage: (msg: WsMessage) => Promise<void>;
  /** Clean up when the WebSocket closes. */
  onClose: () => void;
  readonly sourceId: string | null;
  readonly authenticated: boolean;
  /** Session bearer after successful auth; `null` before that. */
  readonly token: string | null;
  /** When true, transport should close the socket (e.g. mid-session block). */
  readonly forceClose: boolean;
  /** Sanitized UA from `challenge_request` (untrusted display only). */
  readonly userAgent: string | null;
}

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

const isError = (x: unknown): x is ProtocolError =>
  !!x && typeof x === 'object' && 'code' in (x as object);

/**
 * Holds master-side authentication + merge state for one active server.
 * One instance per running master server — shared across TCP and WS transports.
 */
export class SyncServerCore {
  private challenges = new ChallengeStore();
  private rateLimiter = new RateLimiter();
  // Tightened after audit finding M7: 3 failures per 15 min matches the
  // primary sourceId-scoped limiter. IPs on LAN are trivially rotatable, so
  // this is defense-in-depth, not the main gate.
  private ipRateLimiter = new RateLimiter(3, 15 * 60_000);
  /** Per-process random secret used to derive stateless bearer tokens. */
  private readonly serverSecret = generateNonce(32);
  /**
   * Fallback pairing secret when the host does not inject one (unit tests).
   * Still random — never `passwordHash`.
   */
  private readonly fallbackHostProofSecret = generateNonce(32);
  /** Simple FIFO mutex so concurrent syncs don't interleave merges. */
  private syncChain: Promise<unknown> = Promise.resolve();
  /** Manually blocked source IDs (logical client id). */
  private blockedSources = new Set<string>();
  /** Manually blocked client IPs. */
  private blockedIps = new Set<string>();
  /** Source ids allowed to send `replaceVault` after the user picked the PWA. */
  private replaceVaultSources = new Set<string>();
  /** Source ids waiting on the vault-fork chooser. */
  private pendingForkSources = new Set<string>();
  /** At most one phone-side action confirm at a time. */
  private pendingActionConfirm: {
    sourceId: string;
    requestId: string;
    action: PwaActionConfirmKind;
    cardId?: string;
  } | null = null;
  /** Sliding-window timestamps of action-confirm requests per sourceId. */
  private actionConfirmHits = new Map<string, number[]>();
  /** At most one pre-auth phone unlock at a time. */
  private pendingUnlock: {
    sourceId: string;
    requestId: string;
    clientPub: string;
    nonce: string;
    serverSecret: Uint8Array;
    serverPub: string;
    sas: string;
  } | null = null;
  /** Sliding-window timestamps of unlock requests per sourceId. */
  private unlockHits = new Map<string, number[]>();

  private consumeActionConfirmQuota(sourceId: string, now = Date.now()): boolean {
    const prev = (this.actionConfirmHits.get(sourceId) ?? []).filter(
      (t) => now - t < ACTION_CONFIRM_RATE_WINDOW_MS
    );
    if (prev.length >= ACTION_CONFIRM_RATE_MAX) {
      this.actionConfirmHits.set(sourceId, prev);
      return false;
    }
    prev.push(now);
    this.actionConfirmHits.set(sourceId, prev);
    return true;
  }

  private cancelPendingActionConfirm(
    sourceId: string | null,
    requestId?: string
  ): { sourceId: string; requestId: string } | null {
    const pending = this.pendingActionConfirm;
    if (!pending) return null;
    if (sourceId && pending.sourceId !== sourceId) return null;
    if (requestId && pending.requestId !== requestId) return null;
    this.pendingActionConfirm = null;
    return { sourceId: pending.sourceId, requestId: pending.requestId };
  }

  private consumeUnlockQuota(sourceId: string, now = Date.now()): boolean {
    const prev = (this.unlockHits.get(sourceId) ?? []).filter(
      (t) => now - t < UNLOCK_RATE_WINDOW_MS
    );
    if (prev.length >= UNLOCK_RATE_MAX) {
      this.unlockHits.set(sourceId, prev);
      return false;
    }
    prev.push(now);
    this.unlockHits.set(sourceId, prev);
    return true;
  }

  private wipeUnlockSecret(): void {
    this.pendingUnlock?.serverSecret.fill(0);
  }

  private cancelPendingUnlock(
    sourceId: string | null,
    requestId?: string
  ): { sourceId: string; requestId: string } | null {
    const pending = this.pendingUnlock;
    if (!pending) return null;
    if (sourceId && pending.sourceId !== sourceId) return null;
    if (requestId && pending.requestId !== requestId) return null;
    this.wipeUnlockSecret();
    this.pendingUnlock = null;
    return { sourceId: pending.sourceId, requestId: pending.requestId };
  }

  private isRateLimited(sourceId: string, clientIp?: string): boolean {
    if (clientIp && this.ipRateLimiter.isBlocked(clientIp)) return true;
    if (this.rateLimiter.isBlocked(sourceId)) return true;
    return false;
  }

  private recordAuthFailure(sourceId: string, clientIp?: string): void {
    this.rateLimiter.recordFailure(sourceId);
    if (clientIp) this.ipRateLimiter.recordFailure(clientIp);
  }

  private recordAuthSuccess(sourceId: string, clientIp?: string): void {
    this.rateLimiter.recordSuccess(sourceId);
    if (clientIp) this.ipRateLimiter.recordSuccess(clientIp);
  }

  constructor(private hooks: SyncServerHooks) {}

  /**
   * Non-secret UI prefs safe to advertise on unauthenticated `GET /pkey/meta`
   * so the PWA login chrome can match the master before unlock.
   */
  getPublicUiPrefs(): {
    language: 'ESP' | 'ING' | 'AUTO';
    theme: 'LIGHT' | 'DARK' | 'AUTO';
    sessionId?: string;
    sessionCreatedAt?: string;
    webLoginOnPhone?: boolean;
  } | null {
    try {
      const db = this.hooks.getDb();
      const settings = db?.settings;
      if (!settings) return null;
      const sessionId = sanitizePublicSessionId(db.sessionId);
      const sessionCreatedAt = sanitizeSessionCreatedAt(db.creation_date);
      return {
        language: normalizeLanguage(settings.webLanguage ?? settings.language),
        theme: normalizeTheme(settings.webTheme ?? settings.theme),
        ...(sessionId ? { sessionId } : {}),
        ...(sessionCreatedAt ? { sessionCreatedAt } : {}),
        ...(settings.webLoginOnPhone === true ? { webLoginOnPhone: true } : {}),
      };
    } catch {
      return null;
    }
  }

  private emit(type: SyncAuditEvent['type'], sourceId: string) {
    this.hooks.onEvent?.({ type, sourceId, at: Date.now() });
  }

  private get sessionId(): string {
    return this.hooks.getDb().sessionId || '';
  }

  private get passwordHash(): string {
    return this.hooks.getDb().passwordHash;
  }

  private hostProofSecret(): string {
    const fromHook = this.hooks.getHostProofSecret?.();
    if (typeof fromHook === 'string' && fromHook.length === 64) return fromHook;
    return this.fallbackHostProofSecret;
  }

  /** Vault auth hash used to seal post-auth control frames at the transport edge. */
  getControlPasswordHash(): string {
    return this.passwordHash;
  }

  /**
   * Seals a post-auth control inner for one session token. Used by SyncContext
   * before `sendToSource` so result / fork / push never leave the phone in the clear.
   */
  encryptOutgoingControl(
    type: string,
    fields: Record<string, unknown>,
    token: string
  ): ControlWireMessage {
    return encryptControlWire(type, wrapControlInner(token, fields), this.passwordHash);
  }

  /* ------------------------------------------------------------------ *
   * Blocking API
   * ------------------------------------------------------------------ */

  blockSource(sourceId: string): void {
    this.blockedSources.add(sourceId);
    this.emit('blocked', sourceId);
  }

  unblockSource(sourceId: string): void {
    this.blockedSources.delete(sourceId);
    this.rateLimiter.recordSuccess(sourceId);
  }

  /** Authorizes the next exclusive vault replace from this satellite. */
  allowVaultReplace(sourceId: string): void {
    if (!sourceId) return;
    this.replaceVaultSources.add(sourceId);
  }

  /** Drops fork/replace flags for a client (`use_phone`, disconnect, or server stop). */
  clearVaultFork(sourceId: string): void {
    if (!sourceId) return;
    this.pendingForkSources.delete(sourceId);
    this.replaceVaultSources.delete(sourceId);
  }

  /** True while this satellite must not LWW-merge (chooser open or deferred). */
  isVaultForkPending(sourceId: string): boolean {
    return !!sourceId && this.pendingForkSources.has(sourceId);
  }

  /**
   * Marks a pending action confirm as finished so a new request can arrive.
   * When `bind` is passed, `action` and `cardId` must match the live challenge.
   */
  completeActionConfirm(
    sourceId: string,
    requestId: string,
    bind?: { action: PwaActionConfirmKind; cardId?: string }
  ): boolean {
    const pending = this.pendingActionConfirm;
    if (!pending || pending.sourceId !== sourceId || pending.requestId !== requestId) {
      return false;
    }
    if (bind) {
      if (pending.action !== bind.action) return false;
      if ((pending.cardId ?? '') !== (bind.cardId ?? '')) return false;
    }
    this.pendingActionConfirm = null;
    return true;
  }

  /** Drops a pending action confirm (disconnect or UI dismiss). */
  clearActionConfirm(sourceId: string, requestId?: string): void {
    this.cancelPendingActionConfirm(sourceId, requestId);
  }

  /**
   * Wraps `passwordHash` under the pending ECDH session and clears it.
   * Returns the plaintext `unlock_grant` wire message (already ECDH-sealed).
   */
  buildUnlockGrant(sourceId: string, requestId: string): WsMessage | null {
    const pending = this.pendingUnlock;
    if (!pending || pending.sourceId !== sourceId || pending.requestId !== requestId) {
      return null;
    }
    const db = this.hooks.getDb();
    const authScheme =
      db.passwordHashScheme === 'v2-pbkdf2'
        ? 'v2-pbkdf2'
        : db.passwordHashScheme === 'v3-hkdf'
          ? 'v3-hkdf'
          : 'v4-argon2';
    const envelope = wrapUnlockGrant(pending.serverSecret, pending.clientPub, {
      passwordHash: db.passwordHash,
      salt: typeof db.salt === 'string' ? db.salt : '',
      authScheme,
    });
    const serverPub = pending.serverPub;
    this.wipeUnlockSecret();
    this.pendingUnlock = null;
    if (!envelope) return null;
    return {
      type: UNLOCK_GRANT_TYPE,
      requestId,
      serverPub,
      encryptedPayload: envelope,
    };
  }

  /** Drops a pending unlock (deny, timeout, or disconnect). */
  clearUnlock(
    sourceId: string,
    requestId?: string
  ): { sourceId: string; requestId: string } | null {
    return this.cancelPendingUnlock(sourceId, requestId);
  }

  blockIp(ip: string): void {
    const key = formatClientIp(ip);
    if (key) this.blockedIps.add(key);
  }

  unblockIp(ip: string): void {
    const key = formatClientIp(ip);
    if (!key) return;
    this.blockedIps.delete(key);
    this.ipRateLimiter.recordSuccess(key);
  }

  isBlockedSource(sourceId: string): boolean {
    return this.blockedSources.has(sourceId);
  }

  isIpBlocked(ip: string): boolean {
    const key = formatClientIp(ip);
    return !!key && this.blockedIps.has(key);
  }

  /** @deprecated Use isBlockedSource or isIpBlocked */
  isBlocked(id: string): boolean {
    return this.blockedSources.has(id) || this.isIpBlocked(id);
  }

  get blockedSourceIds(): string[] {
    return Array.from(this.blockedSources);
  }

  get blockedIpIds(): string[] {
    return Array.from(this.blockedIps);
  }

  /**
   * Step 1: issue a single-use challenge for a given source.
   *
   * @param clientNonce - Optional client nonce; when present the reply carries a
   *   `serverProof` HMAC under the host pairing secret (not the vault verifier)
   *   so the satellite can verify this master before answering.
   */
  handleChallenge(
    sourceId: string,
    clientIp?: string,
    clientNonce?: string
  ): AuthChallenge | ProtocolError {
    if (this.blockedSources.has(sourceId)) {
      this.emit('blocked', sourceId);
      return { error: 'Connection blocked by master', code: 'RATE_LIMITED' };
    }
    if (this.isIpBlocked(clientIp || '')) {
      this.emit('blocked', sourceId);
      return { error: 'Connection blocked by master', code: 'RATE_LIMITED' };
    }
    if (this.isRateLimited(sourceId, clientIp)) {
      this.emit('rate_limited', sourceId);
      return { error: 'Too many attempts', code: 'RATE_LIMITED' };
    }
    const challenge = this.challenges.create(sourceId, Date.now(), this.passwordHash);
    this.emit('challenge_issued', sourceId);
    const db = this.hooks.getDb();
    const authScheme =
      db.passwordHashScheme === 'v2-pbkdf2'
        ? 'v2-pbkdf2'
        : db.passwordHashScheme === 'v3-hkdf'
          ? 'v3-hkdf'
          : 'v4-argon2';
    const nonce = clientNonce || '';
    const spakeShare = this.challenges.spakeShareOf(sourceId);
    return {
      challenge,
      protocolVersion: CURRENT_PROTOCOL,
      salt: db.salt,
      authScheme,
      ...(spakeShare ? { spakeShare, authMode: 'spake2' as const } : {}),
      ...(nonce
        ? {
            serverProof: computeHostProof(nonce, this.hostProofSecret()),
            proofKind: HOST_PROOF_KIND,
          }
        : {}),
    };
  }

  /** Step 2: verify the response and issue a bearer token. */
  handleAuth(sourceId: string, req: AuthRequest, clientIp?: string): AuthResult | ProtocolError {
    if (this.blockedSources.has(sourceId)) {
      this.emit('blocked', sourceId);
      return { error: 'Connection blocked by master', code: 'RATE_LIMITED' };
    }
    if (this.isIpBlocked(clientIp || '')) {
      this.emit('blocked', sourceId);
      return { error: 'Connection blocked by master', code: 'RATE_LIMITED' };
    }
    if (this.isRateLimited(sourceId, clientIp)) {
      this.emit('rate_limited', sourceId);
      return { error: 'Too many attempts', code: 'RATE_LIMITED' };
    }
    if (!isProtocolCompatible(req.protocolVersion)) {
      this.emit('protocol_mismatch', sourceId);
      return { error: 'Incompatible protocol version', code: 'PROTOCOL_MISMATCH' };
    }
    const ok = req.spakeShare
      ? this.challenges.verifySpake2(sourceId, req.spakeShare, req.response, this.passwordHash) !==
        null
      : this.challenges.verify(sourceId, req.response, this.passwordHash);
    if (!ok) {
      this.recordAuthFailure(sourceId, clientIp);
      this.emit('auth_failure', sourceId);
      return { error: 'Authentication failed', code: 'AUTH_FAILED' };
    }
    this.recordAuthSuccess(sourceId, clientIp);
    this.emit('auth_success', sourceId);
    return {
      token: issueToken(this.sessionId, this.serverSecret),
      protocolVersion: CURRENT_PROTOCOL,
    };
  }

  /** Step 2.5: return the master's current index so the satellite can diff. */
  handleIndex(token: string) {
    if (!verifyToken(token, this.sessionId, this.serverSecret)) {
      return { error: 'Invalid or expired token', code: 'UNAUTHORIZED' as const };
    }
    return buildSyncIndex(this.hooks.getDb());
  }

  /**
   * Step 3: process a sync push. Serialised through a mutex so simultaneous
   * syncs from multiple satellites don't corrupt the merge.
   */
  handleSync(
    sourceId: string,
    token: string,
    bodyRaw: string,
    signature: string,
    payload: any
  ): Promise<any | ProtocolError> {
    const run = this.syncChain.then(() =>
      this.processSync(sourceId, token, bodyRaw, signature, payload)
    );
    this.syncChain = run.catch(() => undefined);
    return run;
  }

  private async processSync(
    sourceId: string,
    token: string,
    bodyRaw: string,
    signature: string,
    payload: any
  ): Promise<any | ProtocolError> {
    if (!verifyToken(token, this.sessionId, this.serverSecret)) {
      return { error: 'Invalid or expired token', code: 'UNAUTHORIZED' };
    }

    // 1. Check if payload is encrypted (contains ciphertext and iv)
    let isEncrypted = false;
    let decryptedPayload: SyncPushPayload = payload;
    let sessionKey = '';

    if (payload && typeof payload === 'object' && 'ciphertext' in payload && 'iv' in payload) {
      isEncrypted = true;
      sessionKey = LocalCipher.sha256(this.passwordHash + '_sync_session_key');
      const decryptedStr = LocalCipher.decryptSync(bodyRaw, sessionKey);
      if (!decryptedStr) {
        return { error: 'Failed to decrypt sync payload', code: 'UNAUTHORIZED' };
      }
      try {
        decryptedPayload = JSON.parse(decryptedStr);
      } catch {
        return { error: 'Invalid JSON in decrypted payload', code: 'UNAUTHORIZED' };
      }
    }

    // Web clients send an empty signature (token-in-band auth is sufficient for WS).
    // Only validate when a signature is actually provided (native satellite clients).
    // Note: if encrypted, we validate signature on the encrypted bodyRaw, which is perfect!
    if (signature && !verifyBodySignature(bodyRaw, signature, token)) {
      return { error: 'Body signature mismatch', code: 'BAD_SIGNATURE' };
    }

    // Guard against malformed payloads (e.g. null/primitive) before field access.
    if (!decryptedPayload || typeof decryptedPayload !== 'object') {
      return { error: 'Malformed sync payload', code: 'UNAUTHORIZED' };
    }

    if (!isProtocolCompatible(decryptedPayload.index?.protocolVersion ?? 0)) {
      this.emit('protocol_mismatch', sourceId);
      return { error: 'Incompatible protocol version', code: 'PROTOCOL_MISMATCH' };
    }

    const localDb = this.hooks.getDb();
    const nowIso = new Date().toISOString();
    const deletionTombstones = (decryptedPayload.deletions || []).map((id) => ({
      id,
      deletedAt: nowIso,
    }));

    const wantsReplace = decryptedPayload.replaceVault === true;
    if (this.pendingForkSources.has(sourceId) && !wantsReplace) {
      return { error: 'Vault fork unresolved', code: 'SESSION_MISMATCH' };
    }
    if (wantsReplace && !this.replaceVaultSources.has(sourceId)) {
      return { error: 'Vault replace was not authorized', code: 'UNAUTHORIZED' };
    }
    if (wantsReplace) {
      const incoming = Array.isArray(decryptedPayload.upserts) ? decryptedPayload.upserts : [];
      if (incoming.length === 0) {
        return { error: 'Vault replace requires cards', code: 'UNAUTHORIZED' };
      }
    }

    let cards: EncryptedDatabase['cards'];
    let tombstones: EncryptedDatabase['tombstones'];
    let overwrites: CardFieldOverwrite[] = [];

    if (wantsReplace) {
      const incoming = Array.isArray(decryptedPayload.upserts) ? decryptedPayload.upserts : [];
      const replaced = replaceVaultCards(localDb.cards || [], incoming, nowIso);
      cards = replaced.cards;
      tombstones = mergeTombstones(
        localDb.tombstones || [],
        mergeTombstones(decryptedPayload.tombstones || [], [
          ...deletionTombstones,
          ...replaced.extraTombstones,
        ])
      );
      this.pendingForkSources.delete(sourceId);
    } else {
      const merged = mergeCards(
        localDb.cards || [],
        decryptedPayload.upserts || [],
        localDb.tombstones || [],
        mergeTombstones(decryptedPayload.tombstones || [], deletionTombstones)
      );
      cards = merged.cards;
      tombstones = merged.tombstones;
      overwrites = merged.overwrites;
    }
    if (overwrites.length) {
      // Capture only the cards touched by the overwrite list so the undo
      // snapshot stays O(overwrites) rather than O(vault). We deep-clone
      // via JSON round-trip — cards are pure JSON with no functions, so
      // this is safe AND avoids sharing references with the merged state.
      const affectedIds = new Set(overwrites.map((o) => o.id));
      const cardsById: Record<string, unknown> = {};
      for (const card of localDb.cards || []) {
        if (affectedIds.has(card.id)) {
          cardsById[card.id] = JSON.parse(JSON.stringify(card));
        }
      }
      const snapshot: SyncPreMergeSnapshot = {
        capturedAt: nowIso,
        cardsById,
      };
      try {
        this.hooks.onFieldOverwrites?.(overwrites, sourceId, snapshot);
      } catch {
        /* ignore UI hook failures */
      }
    }

    const mergedDb: EncryptedDatabase = {
      ...localDb,
      cards,
      tombstones,
      ...(decryptedPayload.settings
        ? {
            settings: mergeVaultSettings(
              localDb.settings,
              stripSatelliteMasterOnlySettings(decryptedPayload.settings)
            ),
          }
        : {}),
    };
    const persist = vaultContentChanged(localDb, mergedDb);
    const storedDb: EncryptedDatabase = persist ? { ...mergedDb, last_update: nowIso } : localDb;
    if (persist) {
      await this.hooks.setDb(storedDb, sourceId);
      this.emit('sync_received', sourceId);
    }

    const delta = computeOutgoingDelta(storedDb, decryptedPayload.index);

    const pullPayload: SyncPullPayload = {
      upserts: delta.upserts,
      deletions: delta.deletions,
      tombstones: storedDb.tombstones || [],
      versionHash: computeDbVersionHash(storedDb),
      protocolVersion: CURRENT_PROTOCOL,
      settings: storedDb.settings,
    };

    if (isEncrypted) {
      const encryptedStr = LocalCipher.encryptSync(JSON.stringify(pullPayload), sessionKey);
      return JSON.parse(encryptedStr);
    }

    return pullPayload;
  }

  /* ------------------------------------------------------------------ *
   * WebSocket session factory (used by WebSocket web server)
   * ------------------------------------------------------------------ */

  /**
   * Creates a stateful handler for one WebSocket connection.
   * The caller feeds incoming JSON messages and sends outgoing ones via
   * the provided `send` callback.
   */
  createWsSession(deliver: WsOutgoing, clientIp = ''): WsSession {
    let _sourceId: string | null = null;
    let _token: string | null = null;
    let _authenticated = false;
    let _clientProtocol = 1;
    let _forceClose = false;
    let _userAgent: string | null = null;
    const _clientIp = clientIp;

    const send: WsOutgoing = (msg) => {
      if (isEncryptedControlType(msg.type) && _authenticated && _token) {
        const sealed = sealOutgoingControl(msg, _token, this.passwordHash);
        if (sealed) deliver(sealed);
        return;
      }
      deliver(msg);
    };

    const openIncomingControl = (msg: WsMessage): Record<string, unknown> | null => {
      if (!_authenticated || !_token) return null;
      const inner = decryptControlWire(msg, this.passwordHash);
      if (!inner || typeof inner.token !== 'string') return null;
      if (!constantTimeEquals(inner.token, _token)) return null;
      return inner;
    };

    const rejectIfBlocked = (sid: string): boolean => {
      if (this.isBlockedSource(sid) || this.isIpBlocked(_clientIp)) {
        this.emit('blocked', sid);
        send({ type: 'error', code: 'RATE_LIMITED', error: 'Connection blocked by master' });
        _forceClose = true;
        _authenticated = false;
        _token = null;
        return true;
      }
      return false;
    };

    const session: WsSession = {
      get sourceId() {
        return _sourceId;
      },
      get authenticated() {
        return _authenticated;
      },
      get token() {
        return _token;
      },
      get forceClose() {
        return _forceClose;
      },
      get userAgent() {
        return _userAgent;
      },

      onMessage: async (msg: WsMessage) => {
        switch (msg.type) {
          case 'challenge_request': {
            const sid = (msg.sourceId as string) || 'web-unknown';
            _sourceId = sid;
            const ua = sanitizeUserAgent(msg.userAgent);
            if (ua) _userAgent = ua;
            if (rejectIfBlocked(sid)) return;
            const clientNonce = typeof msg.clientNonce === 'string' ? msg.clientNonce : '';
            const result = session_handleChallenge(sid, _clientIp, clientNonce);
            if (isError(result)) {
              send({ type: 'error', code: result.code, error: result.error });
            } else {
              send({
                type: 'challenge',
                challenge: result.challenge,
                protocolVersion: result.protocolVersion,
                salt: result.salt,
                authScheme: result.authScheme,
                ...(result.spakeShare
                  ? { spakeShare: result.spakeShare, authMode: result.authMode }
                  : {}),
                ...(result.serverProof
                  ? {
                      serverProof: result.serverProof,
                      ...(result.proofKind ? { proofKind: result.proofKind } : {}),
                    }
                  : {}),
              });
            }
            break;
          }

          case 'auth': {
            const sid = _sourceId || 'web-unknown';
            if (rejectIfBlocked(sid)) return;
            const peerVersion = (msg.protocolVersion as number) || CURRENT_PROTOCOL;
            if (!isProtocolCompatible(peerVersion)) {
              send({
                type: 'auth_error',
                code: 'PROTOCOL_MISMATCH',
                error: 'Incompatible protocol version',
              });
              return;
            }
            const authReq: AuthRequest = {
              sessionFingerprint: (msg.sessionFingerprint as string) || '',
              response: (msg.response as string) || '',
              protocolVersion: peerVersion,
              ...(typeof msg.spakeShare === 'string' && msg.spakeShare
                ? { spakeShare: msg.spakeShare }
                : {}),
            };
            const result = session_handleAuth(sid, authReq, _clientIp);
            if (isError(result)) {
              send({ type: 'auth_error', code: result.code, error: result.error });
            } else {
              _token = result.token;
              _authenticated = true;
              _clientProtocol = peerVersion;
              if (usesEncryptedSyncWire(peerVersion)) {
                send({
                  type: 'auth_ok',
                  encryptedPayload: encryptAuthOk(
                    result.token,
                    result.protocolVersion,
                    this.passwordHash,
                    this.hostProofSecret()
                  ),
                  protocolVersion: result.protocolVersion,
                });
              } else {
                send({
                  type: 'auth_ok',
                  token: result.token,
                  protocolVersion: result.protocolVersion,
                });
              }
            }
            break;
          }

          case 'sync_push':
          case SYNC_PULL_REQUEST_TYPE: {
            if (!_authenticated || !_token) {
              send({ type: 'error', code: 'UNAUTHORIZED', error: 'Not authenticated' });
              return;
            }
            const sid = _sourceId || 'web-unknown';
            if (rejectIfBlocked(sid)) return;
            const peerVersion = (msg.protocolVersion as number) || _clientProtocol;
            if (!isProtocolCompatible(peerVersion)) {
              send({
                type: 'error',
                code: 'PROTOCOL_MISMATCH',
                error: 'Incompatible protocol version',
              });
              return;
            }

            let token = _token;
            let payload: any = msg.payload;
            let bodyRaw = '';

            if (usesEncryptedSyncWire(peerVersion) && msg.encryptedPayload && !msg.token) {
              const wire = decryptSyncPushWire(
                msg.encryptedPayload as {
                  salt: string;
                  iv: string;
                  ciphertext: string;
                  hmac: string;
                },
                this.passwordHash
              );
              if (!wire) {
                send({
                  type: 'error',
                  code: 'UNAUTHORIZED',
                  error: 'Failed to decrypt sync message',
                });
                return;
              }
              token = wire.token;
              const { token: _t, ...syncFields } = wire;
              payload = syncFields;
              bodyRaw = JSON.stringify(syncFields);
            } else if (msg.encryptedPayload) {
              payload = msg.encryptedPayload;
              bodyRaw = JSON.stringify(msg.encryptedPayload);
              if (typeof msg.token === 'string') token = msg.token;
            } else {
              bodyRaw = JSON.stringify(payload);
              if (typeof msg.token === 'string') token = msg.token;
            }

            if (msg.type === SYNC_PULL_REQUEST_TYPE) {
              payload = {
                index: payload?.index,
                upserts: [],
                deletions: [],
                tombstones: [],
              };
              bodyRaw = JSON.stringify(payload);
            }

            const result = await session_handleSync(sid, token, bodyRaw, '', payload);
            if (isError(result)) {
              send({ type: 'error', code: result.code, error: result.error });
            } else if (usesEncryptedSyncWire(peerVersion) && result && typeof result === 'object') {
              send({
                type: 'sync_pull',
                encryptedPayload:
                  peerVersion >= 3
                    ? encryptWireAead(result, this.passwordHash)
                    : encryptPayload(result, this.passwordHash),
              });
            } else if (result && typeof result === 'object' && 'ciphertext' in result) {
              send({ type: 'sync_pull', encryptedPayload: result });
            } else {
              send({ type: 'sync_pull', payload: result });
            }
            break;
          }

          case 'ping': {
            send({ type: 'pong' });
            break;
          }

          case VAULT_FORK_TYPE: {
            if (!_authenticated || !_token) {
              send({ type: 'error', code: 'UNAUTHORIZED', error: 'Not authenticated' });
              return;
            }
            const sid = _sourceId || 'web-unknown';
            if (rejectIfBlocked(sid)) return;
            const inner = openIncomingControl(msg);
            if (!inner) return;
            const parsed = parseVaultForkInner(inner);
            if (!parsed) return;
            this.pendingForkSources.add(sid);
            try {
              this.hooks.onVaultFork?.({
                sourceId: sid,
                pwaCardCount: parsed.pwaCardCount,
                encryptedOnly: parsed.encryptedOnly,
              });
            } catch {
              /* ignore UI hook failures */
            }
            break;
          }

          case ACTION_CONFIRM_REQUEST_TYPE: {
            if (!_authenticated || !_token) {
              send({ type: 'error', code: 'UNAUTHORIZED', error: 'Not authenticated' });
              return;
            }
            const sid = _sourceId || 'web-unknown';
            if (rejectIfBlocked(sid)) return;
            const inner = openIncomingControl(msg);
            if (!inner) return;
            const parsed = parseActionConfirmRequest(inner);
            if (!parsed) {
              const rawId = typeof inner.requestId === 'string' ? inner.requestId.trim() : '';
              if (/^[A-Za-z0-9._-]{8,64}$/.test(rawId)) {
                send({
                  type: ACTION_CONFIRM_RESULT_TYPE,
                  requestId: rawId,
                  ok: false,
                  reason: 'unavailable',
                });
              }
              return;
            }
            if (!this.consumeActionConfirmQuota(sid)) {
              send({
                type: ACTION_CONFIRM_RESULT_TYPE,
                requestId: parsed.requestId,
                action: parsed.action,
                ...(parsed.cardId ? { cardId: parsed.cardId } : {}),
                ok: false,
                reason: 'rate_limited',
              });
              return;
            }
            const pending = this.pendingActionConfirm;
            const forkBusy = this.pendingForkSources.size > 0;
            if (forkBusy || (pending && pending.sourceId !== sid)) {
              send({
                type: ACTION_CONFIRM_RESULT_TYPE,
                requestId: parsed.requestId,
                action: parsed.action,
                ...(parsed.cardId ? { cardId: parsed.cardId } : {}),
                ok: false,
                reason: 'busy',
              });
              return;
            }
            if (pending && pending.sourceId === sid && pending.requestId !== parsed.requestId) {
              const replaced = this.cancelPendingActionConfirm(sid, pending.requestId);
              if (replaced) {
                try {
                  this.hooks.onActionConfirmCancelled?.(replaced);
                } catch {
                  /* ignore */
                }
              }
            }
            this.pendingActionConfirm = {
              sourceId: sid,
              requestId: parsed.requestId,
              action: parsed.action,
              ...(parsed.cardId ? { cardId: parsed.cardId } : {}),
            };
            try {
              this.hooks.onActionConfirm?.({
                sourceId: sid,
                requestId: parsed.requestId,
                action: parsed.action,
                ...(parsed.cardId ? { cardId: parsed.cardId } : {}),
              });
            } catch {
              /* ignore UI hook failures */
            }
            break;
          }

          case ACTION_CONFIRM_CANCEL_TYPE: {
            if (!_authenticated || !_token) {
              send({ type: 'error', code: 'UNAUTHORIZED', error: 'Not authenticated' });
              return;
            }
            const sid = _sourceId || 'web-unknown';
            if (rejectIfBlocked(sid)) return;
            const inner = openIncomingControl(msg);
            if (!inner) return;
            const requestId = parseActionConfirmCancel(inner);
            if (!requestId) return;
            const cancelled = this.cancelPendingActionConfirm(sid, requestId);
            if (cancelled) {
              try {
                this.hooks.onActionConfirmCancelled?.(cancelled);
              } catch {
                /* ignore */
              }
            }
            break;
          }

          case UNLOCK_REQUEST_TYPE: {
            const sid =
              (typeof msg.sourceId === 'string' && msg.sourceId.trim()) ||
              _sourceId ||
              'web-unknown';
            _sourceId = sid;
            const db = this.hooks.getDb();
            const settingOn = db.settings?.webLoginOnPhone === true;
            const parsed = parseUnlockRequest(msg);
            const existing = this.pendingUnlock;
            if (rejectIfBlocked(sid)) return;
            if (!settingOn) return;
            if (!parsed) return;
            if (!this.consumeUnlockQuota(sid)) {
              return;
            }
            if (existing && existing.sourceId !== sid) return;
            if (existing && existing.sourceId === sid) {
              const cancelled = this.cancelPendingUnlock(sid);
              if (cancelled) {
                try {
                  this.hooks.onUnlockCancelled?.(cancelled);
                } catch {
                  /* ignore */
                }
              }
            }
            const kp = generateUnlockKeypair();
            const sas = computeUnlockSas(parsed.clientPub, kp.publicKeyHex, parsed.nonce);
            this.pendingUnlock = {
              sourceId: sid,
              requestId: parsed.requestId,
              clientPub: parsed.clientPub,
              nonce: parsed.nonce,
              serverSecret: kp.secretKey,
              serverPub: kp.publicKeyHex,
              sas,
            };
            send({
              type: UNLOCK_OFFER_TYPE,
              requestId: parsed.requestId,
              serverPub: kp.publicKeyHex,
            });
            try {
              this.hooks.onUnlockRequest?.({
                sourceId: sid,
                requestId: parsed.requestId,
                sas,
              });
            } catch {
              /* ignore UI hook failures */
            }
            break;
          }

          case UNLOCK_CANCEL_TYPE: {
            const sid = _sourceId || 'web-unknown';
            const requestId = parseUnlockCancel(msg);
            if (!requestId) return;
            const cancelled = this.cancelPendingUnlock(sid, requestId);
            if (cancelled) {
              try {
                this.hooks.onUnlockCancelled?.(cancelled);
              } catch {
                /* ignore */
              }
            }
            break;
          }

          default:
            send({
              type: 'error',
              code: 'UNAUTHORIZED',
              error: `Unknown message type: ${msg.type}`,
            });
        }
      },

      onClose: () => {
        const sid = _sourceId;
        _authenticated = false;
        _token = null;
        if (sid && this.pendingForkSources.has(sid)) {
          this.clearVaultFork(sid);
          try {
            this.hooks.onVaultForkCancelled?.(sid);
          } catch {
            /* ignore */
          }
        } else if (sid) {
          this.replaceVaultSources.delete(sid);
        }
        if (sid) {
          const cancelled = this.cancelPendingActionConfirm(sid);
          if (cancelled) {
            try {
              this.hooks.onActionConfirmCancelled?.(cancelled);
            } catch {
              /* ignore */
            }
          }
          const unlockCancelled = this.cancelPendingUnlock(sid);
          if (unlockCancelled) {
            try {
              this.hooks.onUnlockCancelled?.(unlockCancelled);
            } catch {
              /* ignore */
            }
          }
        }
      },
    };

    // Bind core methods with `this` captured via closures.
    const session_handleChallenge = (sid: string, ip?: string, nonce?: string) =>
      this.handleChallenge(sid, ip, nonce);
    const session_handleAuth = (sid: string, req: AuthRequest, ip?: string) =>
      this.handleAuth(sid, req, ip);
    const session_handleSync = (
      sid: string,
      token: string,
      bodyRaw: string,
      sig: string,
      payload: SyncPushPayload
    ) => this.handleSync(sid, token, bodyRaw, sig, payload);

    return session;
  }

  /** Push a change notification to all connected web clients (called after any write). */
  notifyClientsOfChange?: () => void;
}

export { isError as isProtocolError };
// Re-export for backward compatibility
export { computeChallengeResponse };
