/**
 * @fileoverview Solid store and WebSocket sync client for the PKEY PWA.
 *
 * Owns connection state, vault display data, modals, secrets reveal timers,
 * and push/pull sync with the master device on port 7392.
 */
import { createStore } from 'solid-js/store';
import {
  SecretStore,
  sanitizeCardForDisplay,
  mergePullLocally,
  derivePasswordHash,
  deriveVaultAuthSecret,
  buildSyncAuthProof,
  decryptPayload,
  constantTimeEquals,
  clearPbkdf2Cache,
  generateRandomPassword,
  isPasswordGeneratorConfigured,
  detectIcon,
  shouldKeepStoredIcon,
  detectPresetFromLink,
  DEFAULT_CARD_ICON,
  matchLoginCandidates,
  sortCardsForList,
  DEFAULT_VAULT_SETTINGS,
  getSourceId,
  getSecureRandomHex,
  t,
  generateTotp,
  getRemainingSeconds,
  normalizeTags,
  buildSyncIndex,
  SYNC_PROTOCOL_VERSION,
  encryptSyncPushWire,
  decryptAuthOk,
  normalizeHostProofSecret,
  encryptControlWire,
  decryptControlWire,
  wrapControlInner,
  shouldBlockIncrementalSync,
  parseVaultForkDeferRecord,
  parseVaultForkDecisionInner,
  type VaultForkDeferRecord,
  VAULT_FORK_TYPE,
  VAULT_FORK_DECISION_TYPE,
  SERVER_PUSH_TYPE,
  SYNC_PULL_REQUEST_TYPE,
  pickSatelliteSettingsPatch,
  computeDbVersionHash,
  computeSettingsHash,
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  ACTION_CONFIRM_CANCEL_TYPE,
  ACTION_CONFIRM_TIMEOUT_MS,
  type VaultForkAction,
  type PwaActionConfirmKind,
  parseActionConfirmResult,
  actionConfirmBindMatches,
  shouldRequestPhoneConfirm,
  generateUuidV4,
  generateUnlockKeypair,
  computeUnlockSas,
  unwrapUnlockGrant,
  parseUnlockOffer,
  parseUnlockGrant,
  UNLOCK_REQUEST_TYPE,
  UNLOCK_OFFER_TYPE,
  UNLOCK_GRANT_TYPE,
  UNLOCK_CANCEL_TYPE,
  UNLOCK_TIMEOUT_MS,
  normalizeTheme,
  normalizeLanguage,
  mergeVaultSettings,
  languageFromLocaleTag,
  resolveUiLanguage,
  resolveWebThemeMode,
  resolveWebLanguagePref,
  htmlLangAttr,
  computeStatistics,
  clampField,
  preserveUrisOnLinkEdit,
  CARD_TITLE_MAX,
  CARD_USERNAME_MAX,
  CARD_LINK_MAX,
  CARD_PASSWORD_MAX,
  CARD_NOTES_MAX,
  type EncryptedDatabase,
  type PasswordCard,
  type AppSettings,
  type DisplayCard,
  type WebLang,
  type WebI18nKey,
  type CardIcon,
  type VaultStatistics,
  type Tombstone,
  type PasswordHashScheme,
  type WebAutoLogout,
  copySecretToClipboard,
  composeBrowserUserAgent,
  type BrowserNavigatorLike,
  formatVaultSessionRef,
} from '@pkey/core';
import { applyTheme, watchSystemTheme, watchSystemLanguage } from '../theme/tokens';
import {
  emptyOutbox,
  withUpsert,
  withTombstone,
  withSettings,
  outboxCount,
  isOutboxEmpty,
  type OutboxState,
} from './outbox';
import {
  saveOfflineVault,
  loadOfflineVault,
  clearOfflineVault,
  decodeOfflineVault,
} from './offlineVault';
import { verifyMasterProof } from './masterProof';
import {
  type ServerIdentity,
  fetchMeta,
  isIpv4Host,
  loadIdentity,
  saveIdentity,
  shouldApplyMeta,
  touchIdentitySuccess,
} from './serverIdentity';
import { loadVaultForkDefer, saveVaultForkDefer, clearVaultForkDefer } from './vaultForkDefer';
import { type ProbeChallenge, buildCandidates, probeWs, shouldReconnectDirect } from './discovery';
import { LK_SWEEP_FOUND, readSweepFound, tryRunSweep } from './sweep';
import {
  CIRCUIT_OPEN_MS,
  isBrowserOnline,
  isCircuitOpen,
  nextRetryDelayMs,
  shouldOpenCircuit,
} from './reconnectPolicy';

/**
 * WebSocket / session connection phase.
 * `offline` = master unreachable but the vault is unlocked locally (editable);
 * `readonly` = master unreachable and no local credentials (view only).
 */
export type ConnState =
  'disconnected' | 'connecting' | 'authenticated' | 'offline' | 'readonly' | 'relogin';
/** High-level sync activity indicator for the UI. */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'readonly';
/**
 * Progress of the search for a master that changed address. Deliberately NOT a
 * `ConnState`: the vault stays editable offline while discovery runs.
 */
export type DiscoveryState = 'idle' | 'active' | 'found';

const REVEAL_MS = 30_000;
/** Abort `new WebSocket()` if the handshake never reaches OPEN. */
export const WS_CONNECT_TIMEOUT_MS = 15_000;
/** Abort when challenge / auth / sync_push get no protocol reply. */
export const WS_REPLY_TIMEOUT_MS = 15_000;
/** JSON ping interval while the socket is OPEN. */
export const WS_PING_INTERVAL_MS = 25_000;
/** Drop a half-open socket after this much inbound silence (~two missed pongs). */
export const WS_STALE_AFTER_MS = 55_000;
/** Idle / hidden-tab lock durations. Browsers freeze timers; resume uses wall-clock. */
export const WEB_AUTO_LOGOUT_MS: Record<Exclude<WebAutoLogout, 'NEVER'>, number> = {
  '5M': 5 * 60_000,
  '15M': 15 * 60_000,
  '1H': 60 * 60_000,
};
const secrets = new SecretStore();

interface AppState {
  connState: ConnState;
  syncStatus: SyncStatus;
  /** Whether the PWA is currently hunting for the master's new address. */
  discovery: DiscoveryState;
  /** True once the search gave up (or cannot run): show the manual guidance. */
  discoveryExhausted: boolean;
  authenticated: boolean;
  wasAuthenticated: boolean;
  challenge: string | null;
  salt: string | null;
  /** How to derive the sync HMAC key (from master `challenge.authScheme`). */
  authScheme: PasswordHashScheme | null;
  /** True when session key material is held in module-private vars (not in this store). */
  sessionUnlocked: boolean;
  cards: DisplayCard[];
  settings: AppSettings;
  search: string;
  connLabel: string;
  toast: { msg: string; type: '' | 'success' | 'error' } | null;
  revealedIds: Set<string>;
  revealedOtpIds: Set<string>;
  loginError: string;
  verifyError: string;
  reloginError: string;
  /** True while a user-initiated unlock/auth is in progress (login or relogin). */
  authBusy: boolean;
  showVerify: boolean;
  showPhoneConfirm: boolean;
  showUnlockWait: boolean;
  unlockSas: string;
  verifyCallback: (() => void) | null;
  showCardModal: boolean;
  showRelogin: boolean;
  editingId: string | null;
  editSecretsUnlocked: boolean;
  loginPasswordVisible: boolean;
  /** Number of offline operations waiting to sync to the master. */
  pendingOps: number;
  /** True when an encrypted offline vault exists in this browser. */
  offlineVaultAvailable: boolean;
  /** True while waiting for the first post-auth vault pull (or stale hydrate). */
  vaultHydrating: boolean;
  /** True after auth when this browser's vault salt does not match the phone. */
  vaultForkPending: boolean;
  vaultForkPwaCount: number;
  vaultForkEncryptedOnly: boolean;
  /** Short public vault session ref from `/pkey/meta` (e.g. `A1B2-C3D4`). */
  sessionRef: string;
  /** Vault creation date from `/pkey/meta` (ISO-8601). */
  sessionCreatedAt: string;
}

const [state, setState] = createStore<AppState>({
  connState: 'disconnected',
  syncStatus: 'idle',
  discovery: 'idle',
  discoveryExhausted: false,
  authenticated: false,
  wasAuthenticated: false,
  challenge: null,
  salt: null,
  authScheme: null,
  sessionUnlocked: false,
  cards: [],
  settings: { ...DEFAULT_VAULT_SETTINGS },
  search: '',
  connLabel: '',
  toast: null,
  revealedIds: new Set<string>(),
  revealedOtpIds: new Set<string>(),
  loginError: '',
  verifyError: '',
  reloginError: '',
  authBusy: false,
  showVerify: false,
  showPhoneConfirm: false,
  showUnlockWait: false,
  unlockSas: '',
  verifyCallback: null,
  showCardModal: false,
  showRelogin: false,
  editingId: null,
  editSecretsUnlocked: false,
  loginPasswordVisible: false,
  pendingOps: 0,
  offlineVaultAvailable: false,
  vaultHydrating: false,
  vaultForkPending: false,
  vaultForkPwaCount: 0,
  vaultForkEncryptedOnly: false,
  sessionRef: '',
  sessionCreatedAt: '',
});

let ws: WebSocket | null = null;
/** Monotonic id so superseded sockets ignore their onclose/onmessage. */
let wsGeneration = 0;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Consecutive failed discovery cycles; reset on a live auth. */
let discoveryFailCount = 0;
/** Epoch ms until which kickDiscovery is a no-op (circuit open). */
let circuitOpenUntil = 0;
let autoLogoutTimer: ReturnType<typeof setTimeout> | null = null;
/** Epoch ms of the last user activity (or unlock). Hidden-tab lock uses this wall-clock. */
let lastActivityAt = 0;
let wsPingTimer: ReturnType<typeof setInterval> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let replyWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
/** Epoch ms of the last inbound WS JSON frame (including `pong`). */
let lastInboundAt = 0;
/** True while `dropSocketAndRecover` runs, so timers cannot nest a second drop. */
let socketDropInFlight = false;
let pendingAuthHash: string | null = null;
let authInFlight = false;
/**
 * Auth secret for the scheme we already derived. The other scheme is computed
 * only on `auth_error` (from `pendingLoginPassword`) so login does not freeze
 * on 700k PBKDF2 iterations in crypto-es.
 */
let pendingLoginHashes: Partial<Record<PasswordHashScheme, string>> | null = null;
/** Plaintext kept only until auth_ok / terminal auth_error (scheme-fallback retry). */
let pendingLoginPassword: string | null = null;
/** True after the first auth_error — next attempt uses the alternate scheme once. */
let authSchemeRetryUsed = false;
/** Auth secret for the pending scheme-fallback; consumed on the next challenge. */
let pendingRetryHash: string | null = null;
/**
 * Session key material kept outside the Solid store so reactive/devtools
 * inspection cannot read them (audit H1/H2).
 */
let sessionPasswordHash: string | null = null;
let sessionWsToken: string | null = null;
const sourceId = getSourceId();
/**
 * `host[:port]` the socket targets. Equals the page host until discovery
 * rotates it to the master's new address after a DHCP change.
 */
let activeHost = pageHost();
/** Nonce sent with the last `challenge_request`; verifies the master's proof. */
let lastClientNonce = '';
/** `serverProof` of the last `challenge` message (untrusted until verified). */
let lastServerProof: unknown = null;
/** Master's SPAKE2 share from the last challenge (protocol v3). */
let lastSpakeShare: string | null = null;
/** Vault salt of the last successful session — pins this master's identity. */
let pinnedSalt = '';
/** Pairing secret from the last auth_ok, held until identity exists to persist it. */
let pendingHostProofSecret = '';
/**
 * Set after auth_ok when the pinned salt and challenge salt differ and this
 * browser still has local cards. Incremental sync is paused until the phone
 * chooses a session.
 */
let pendingVaultFork: { previousSalt: string } | null = null;
/**
 * Durable pause after "decide later". Survives reload so a persist under the
 * phone salt cannot silently resume LWW merge.
 */
let deferredFork: VaultForkDeferRecord | null = null;
/** True while a replaceVault push is in flight (fork chooser picked the PWA). */
let vaultForkReplaceInFlight = false;
/** Last applied `sync_pull.versionHash` — skip `server_push` when unchanged. */
let lastPullVersionHash = '';
/** Canonical settings hash from the last applied pull. */
let lastPullSettingsHash = '';
let phoneConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let phoneConfirmPending: {
  requestId: string;
  action: PwaActionConfirmKind;
  cardId?: string;
} | null = null;
let phoneUnlockTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPhoneUnlock: {
  requestId: string;
  secretKey: Uint8Array;
  nonce: string;
  clientPub: string;
  serverPub: string;
  isRelogin: boolean;
} | null = null;
/** Master identity (mDNS host, last IP) used to rebuild reconnect candidates. */
let identity: ServerIdentity | null = null;
/** True while a discovery cycle runs, so triggers cannot stack probes. */
let discoveryCycleInFlight = false;
/** Epoch ms of the last direct reconnect, so a dead host cannot loop forever. */
let lastDirectReconnectAt = 0;
/** Grace period before a failing direct reconnect escalates to probing. */
const DIRECT_RECONNECT_GUARD_MS = 10_000;

/** `host[:port]` the page itself was loaded from (always trusted: user-scanned). */
function pageHost(): string {
  return typeof location === 'undefined' ? '' : location.host;
}

function setSessionPasswordHash(hash: string | null) {
  sessionPasswordHash = hash;
  setState('sessionUnlocked', !!hash);
  if (hash) lastActivityAt = Date.now();
}

function clearSessionWsToken() {
  sessionWsToken = null;
}

function resolvedWebAutoLogout(): WebAutoLogout {
  const v = state.settings.webAutoLogout;
  if (v === '5M' || v === '15M' || v === '1H' || v === 'NEVER') return v;
  return '15M';
}

/** Pending offline operations (holds secrets — kept out of the Solid store). */
let outbox: OutboxState = emptyOutbox();

/** True while a reconnect flush push awaits its sync_pull confirmation. */
let flushInFlight = false;
/** Card ops included in the in-flight flush (for the success toast). */
let flushedOpsCount = 0;
/** Blocks auto challenge-response after a failed attempt (bad/stale hash). */
let autoAuthBlocked = false;
/** User chose "continue offline" after a blocked auto-auth — don't re-nag on reconnect. */
let reloginDismissed = false;
/**
 * After an UNAUTHORIZED sync, allow at most one silent re-auth. Prevents
 * auth↔demote banner flicker loops when sync keeps failing.
 */
let unauthorizedReauthUsed = false;
/** True after auth_ok until the first successful sync_pull (or failure). */
let awaitingPostAuthSync = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * True after the first vault settings blob (sync pull or offline unlock).
 * Until then, PWA defaults must not be pushed to the master.
 */
let settingsHydrated = false;
/** User settings edits made before the first pull; merged on hydrate then pushed. */
let pendingSettingsPatch: Partial<AppSettings> | null = null;
/** Last connection-status i18n key so chrome can retranslate on language change. */
let connLabelKey: WebI18nKey | null = null;
let connLabelVars: Record<string, string | number> | undefined;

function clearAuthAttempt() {
  authInFlight = false;
  pendingAuthHash = null;
  pendingLoginHashes = null;
  pendingLoginPassword = null;
  pendingRetryHash = null;
  authSchemeRetryUsed = false;
  setState('authBusy', false);
}

/**
 * Login screen: keep the form, show the error, toast it. Used for every
 * terminal pre-auth failure so the UI cannot stick on "Authenticating…"
 * with no input.
 */
function failPreAuthLogin(message: string) {
  clearAuthAttempt();
  awaitingPostAuthSync = false;
  clearPostAuthSyncWatchdog();
  setState('loginError', message);
  setState('loginPasswordVisible', true);
  setConnLabel(state.challenge ? 'conn_ready' : 'conn_connecting');
  showToast(message, 'error');
}

/** Relogin overlay: same terminal contract as {@link failPreAuthLogin}. */
function failRelogin(message: string) {
  clearAuthAttempt();
  awaitingPostAuthSync = false;
  clearPostAuthSyncWatchdog();
  if (sessionPasswordHash) {
    setState('authenticated', false);
    clearSessionWsToken();
    setSyncStatus('offline');
  }
  setState('connState', 'relogin');
  setState('reloginError', message);
  setState('showRelogin', true);
  reloginDismissed = false;
  showToast(message, 'error');
}

function failCredentialAttempt(message: string) {
  if (state.connState === 'relogin' || state.wasAuthenticated) {
    failRelogin(message);
  } else {
    failPreAuthLogin(message);
  }
}

/** Yields two animation frames so busy UI can paint before sync crypto work. */
export function yieldForBusyUi(): Promise<void> {
  return new Promise((resolve) => {
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(cb, 0);
    raf(() => {
      raf(() => {
        setTimeout(resolve, 0);
      });
    });
  });
}

function clearConnectTimeout() {
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
}

function clearReplyWatchdog() {
  if (replyWatchdogTimer) {
    clearTimeout(replyWatchdogTimer);
    replyWatchdogTimer = null;
  }
}

function clearPostAuthSyncWatchdog() {
  clearReplyWatchdog();
}

function armConnectTimeout(generation: number) {
  clearConnectTimeout();
  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (generation !== wsGeneration) return;
    if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
    dropSocketAndRecover();
  }, WS_CONNECT_TIMEOUT_MS);
}

function armReplyWatchdog() {
  clearReplyWatchdog();
  replyWatchdogTimer = setTimeout(() => {
    replyWatchdogTimer = null;
    dropSocketAndRecover();
  }, WS_REPLY_TIMEOUT_MS);
}

/**
 * Force-close a hung CONNECTING/OPEN socket, demote to editable offline, and
 * restart retry + discovery. Does not wait for `onclose` (half-open peers
 * often never fire it).
 */
function dropSocketAndRecover() {
  if (socketDropInFlight) return;
  socketDropInFlight = true;
  try {
    clearConnectTimeout();
    clearReplyWatchdog();
    clearWsPingTimer();
    flushInFlight = false;
    flushedOpsCount = 0;
    awaitingPostAuthSync = false;
    clearAuthAttempt();
    const socket = ws;
    ws = null;
    if (socket) {
      try {
        socket.onclose = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onopen = null;
        socket.close();
      } catch {
        /* ignore */
      }
    }
    if (sessionPasswordHash) {
      demoteToOfflineEditable();
      showToast(t('sync_error_watchdog', lang()), 'error');
    } else {
      setState('vaultHydrating', false);
      if (state.syncStatus === 'syncing') setSyncStatus('idle');
      failPreAuthLogin(t('auth_timeout', lang()));
    }
    scheduleRetry();
    kickDiscovery();
  } finally {
    socketDropInFlight = false;
  }
}

function syncPendingOpsState() {
  setState('pendingOps', outboxCount(outbox));
}

function clearWsPingTimer() {
  if (wsPingTimer) {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }
}

function startWsPingTimer() {
  clearWsPingTimer();
  wsPingTimer = setInterval(() => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    if (lastInboundAt > 0 && Date.now() - lastInboundAt >= WS_STALE_AFTER_MS) {
      dropSocketAndRecover();
      return;
    }
    send({ type: 'ping' });
  }, WS_PING_INTERVAL_MS);
}

function lang(): WebLang {
  const tag =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : 'en';
  return resolveUiLanguage(resolveWebLanguagePref(state.settings), tag);
}

function setConnLabel(key: WebI18nKey, vars?: Record<string, string | number>) {
  connLabelKey = key;
  connLabelVars = vars;
  setState('connLabel', t(key, lang(), vars));
}

function applyLanguageFromSettings() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = htmlLangAttr(lang());
}

function refreshLocalizedChrome() {
  if (connLabelKey) {
    setState('connLabel', t(connLabelKey, lang(), connLabelVars));
  }
  applyLanguageFromSettings();
}

function readInjectedBootUi(): Pick<AppSettings, 'language' | 'theme' | 'webLoginOnPhone'> | null {
  if (typeof window === 'undefined') return null;
  const raw = (
    window as Window & {
      __PKEY_BOOT_UI__?: { language?: unknown; theme?: unknown; webLoginOnPhone?: unknown };
    }
  ).__PKEY_BOOT_UI__;
  if (!raw || typeof raw !== 'object') return null;
  return {
    language: normalizeLanguage(raw.language),
    theme: normalizeTheme(raw.theme),
    webLoginOnPhone: raw.webLoginOnPhone === true,
  };
}

function navigatorLangHint(): Pick<AppSettings, 'language'> | null {
  if (typeof navigator === 'undefined' || typeof navigator.language !== 'string') return null;
  const language = languageFromLocaleTag(navigator.language);
  return language === 'ESP' ? { language } : null;
}

/**
 * Applies non-secret language/theme hints (HTML boot script, `/pkey/meta`, or
 * last identity) before the vault is unlocked. Ignored once settings hydrate.
 */
function applyBootUiHints(
  hints: { language?: unknown; theme?: unknown; webLoginOnPhone?: unknown } | null | undefined
) {
  if (settingsHydrated || state.authenticated) return;
  if (!hints) return;
  const patch: Partial<AppSettings> = {};
  if (hints.language !== undefined) patch.language = normalizeLanguage(hints.language);
  if (hints.theme !== undefined) patch.theme = normalizeTheme(hints.theme);
  if (typeof hints.webLoginOnPhone === 'boolean') patch.webLoginOnPhone = hints.webLoginOnPhone;
  if (Object.keys(patch).length === 0) return;
  setState('settings', mergeVaultSettings(state.settings, patch));
  applyThemeFromSettings();
  refreshLocalizedChrome();
}

function persistIdentityUiPrefs() {
  if (!identity) return;
  setIdentity({
    ...identity,
    language: resolveWebLanguagePref(state.settings),
    theme: resolveWebThemeMode(state.settings),
    webLoginOnPhone: state.settings.webLoginOnPhone === true,
  });
}

function wsUrlFor(host: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const [hostname, port] = host.split(':');
  return `${scheme}://${hostname}:${port || location.port || '7392'}/pkey/ws`;
}

function wsUrl(): string {
  return wsUrlFor(activeHost || pageHost());
}

/**
 * Fresh nonce per handshake so the master's proof cannot be replayed by a host
 * that recorded an earlier one.
 */
function sendChallengeRequest(): boolean {
  lastClientNonce = getSecureRandomHex(16);
  lastServerProof = null;
  lastSpakeShare = null;
  return send({
    type: 'challenge_request',
    sourceId,
    clientNonce: lastClientNonce,
    userAgent: composeBrowserUserAgent(
      typeof navigator === 'undefined' ? undefined : (navigator as BrowserNavigatorLike)
    ),
  });
}

/**
 * True when the socket targets a host discovery picked rather than the one the
 * user scanned — such a host must prove it holds the pairing secret first.
 */
function requiresMasterProof(): boolean {
  return !!activeHost && activeHost !== pageHost();
}

/** Stops talking to a host that failed the proof and falls back to the page host. */
function rejectUntrustedMaster() {
  setState('challenge', null);
  setState('salt', null);
  lastServerProof = null;
  lastSpakeShare = null;
  activeHost = pageHost();
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
}

/** Pairing secret used to verify a discovered host (available while locked). */
function currentHostProofSecret(): string {
  return pendingHostProofSecret || identity?.hostProofSecret || '';
}

/**
 * Gate in front of every send of password-derived material. Returns false (and
 * drops the socket) when a rotated host cannot prove it is our master.
 */
function masterProofOk(): boolean {
  if (!requiresMasterProof()) return true;
  const ok = verifyMasterProof({
    clientNonce: lastClientNonce,
    serverProof: lastServerProof,
    salt: state.salt,
    pinnedSalt,
    hostProofSecret: currentHostProofSecret(),
  });
  if (!ok) rejectUntrustedMaster();
  return ok;
}

/** Verifier handed to the probes: only a master with our pairing secret can pass. */
function verifyProbe(challenge: ProbeChallenge, clientNonce: string): boolean {
  return verifyMasterProof({
    clientNonce,
    serverProof: challenge.serverProof,
    salt: challenge.salt,
    pinnedSalt,
    hostProofSecret: currentHostProofSecret(),
  });
}

/** True when a probe result can be judged at all (otherwise discovery is blind). */
function canVerifyProbe(): boolean {
  return !!currentHostProofSecret();
}

function setIdentity(next: ServerIdentity | null) {
  identity = next;
  if (next) saveIdentity(next);
  setState('sessionRef', next?.sessionId ? formatVaultSessionRef(next.sessionId) : '');
  setState('sessionCreatedAt', next?.sessionCreatedAt ?? '');
}

/** Ends a discovery cycle: back to idle and surface the manual guidance. */
function discoveryGaveUp() {
  setState('discovery', 'idle');
  setState('discoveryExhausted', true);
  discoveryFailCount++;
  if (shouldOpenCircuit(discoveryFailCount)) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  }
}

function noteDiscoverySuccess() {
  discoveryFailCount = 0;
  circuitOpenUntil = 0;
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** Shows a short-lived toast message in the PWA UI. */
export function showToast(msg: string, type: 'success' | 'error' = 'success') {
  setState('toast', { msg, type });
  setTimeout(() => setState('toast', null), 2500);
}

function sessionLockDurationMs(): number | null {
  const mode = resolvedWebAutoLogout();
  if (mode === 'NEVER') return null;
  return WEB_AUTO_LOGOUT_MS[mode];
}

function canIdleLock(): boolean {
  if (sessionLockDurationMs() == null) return false;
  if (!sessionPasswordHash) return false;
  return state.connState === 'authenticated' || state.connState === 'offline';
}

/**
 * Locks when inactivity (visible or hidden) has reached `webAutoLogout`.
 * Resume must use wall-clock: browsers freeze `setTimeout` in background tabs.
 *
 * @returns The `wipeSession` promise when locking, otherwise `null`.
 */
function lockIfIdleExpired(now = Date.now()): Promise<void> | null {
  const ms = sessionLockDurationMs();
  if (ms == null || !canIdleLock()) return null;
  if (now - lastActivityAt < ms) return null;
  showToast(t('session_expired', lang()), 'error');
  return wipeSession();
}

function clearIdleTimer(): void {
  if (autoLogoutTimer) {
    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = null;
  }
}

function rescheduleIdleTimer(): void {
  clearIdleTimer();
  const ms = sessionLockDurationMs();
  if (ms == null || !canIdleLock()) return;
  const remaining = ms - (Date.now() - lastActivityAt);
  autoLogoutTimer = setTimeout(
    () => {
      const expired = lockIfIdleExpired();
      if (!expired) rescheduleIdleTimer();
    },
    Math.max(0, remaining)
  );
}

/** Tab became visible again: honor elapsed wall-clock, then re-arm the idle timer. */
async function onWebVisible(): Promise<void> {
  const expired = lockIfIdleExpired();
  if (expired) {
    await expired;
    return;
  }
  rescheduleIdleTimer();
}

function onWebVisibilityChange() {
  if (typeof document !== 'undefined' && document.hidden) {
    // Leave the idle timer as best-effort; Chrome may freeze it until visible.
    return;
  }
  void onWebVisible();
}

function touchActivity() {
  if (state.connState !== 'authenticated' && state.connState !== 'offline') return;
  lastActivityAt = Date.now();
  rescheduleIdleTimer();
}

function applyThemeFromSettings() {
  const theme = resolveWebThemeMode(state.settings);
  applyTheme(theme);
}

function send(msg: object): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    const type = (msg as { type?: string }).type;
    if (
      type === 'challenge_request' ||
      type === 'auth' ||
      type === 'sync_push' ||
      type === SYNC_PULL_REQUEST_TYPE
    ) {
      armReplyWatchdog();
    }
    return true;
  }
  return false;
}

function sendAuthProof(challenge: string, passwordHash: string): boolean {
  const proof = buildSyncAuthProof(passwordHash, challenge, lastSpakeShare ?? undefined);
  return send({
    type: 'auth',
    sessionFingerprint: '',
    response: proof.response,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    ...(proof.spakeShare ? { spakeShare: proof.spakeShare } : {}),
  });
}

function sendControl(type: string, fields: Record<string, unknown>): boolean {
  if (!sessionPasswordHash || !sessionWsToken) return false;
  return send(
    encryptControlWire(type, wrapControlInner(sessionWsToken, fields), sessionPasswordHash)
  );
}

function openControlInner(msg: Record<string, unknown>): Record<string, unknown> | null {
  if (!sessionPasswordHash || !sessionWsToken) return null;
  const inner = decryptControlWire(msg, sessionPasswordHash);
  if (!inner || typeof inner.token !== 'string') return null;
  if (!constantTimeEquals(inner.token, sessionWsToken)) return null;
  return inner;
}

function currentVaultSyncIndex() {
  const fullLocal = state.cards.map((c) => secrets.cardWithSecrets(c as PasswordCard));
  return buildSyncIndex({ cards: fullLocal, tombstones: [] } as unknown as EncryptedDatabase);
}

function setSyncStatus(status: SyncStatus) {
  setState('syncStatus', status);
}

/** True when live-connected and server-authenticated (pushes go out now). */
function isLiveConnected(): boolean {
  return (
    state.connState === 'authenticated' && state.authenticated && ws?.readyState === WebSocket.OPEN
  );
}

/** Writes are allowed live-connected or in the locally-unlocked offline mode. */
function isWriteAllowed(): boolean {
  return (
    isLiveConnected() ||
    (!!sessionPasswordHash && (state.connState === 'offline' || state.connState === 'relogin'))
  );
}

function setDeferredFork(record: VaultForkDeferRecord | null): void {
  deferredFork = record;
  if (record) saveVaultForkDefer(record);
  else clearVaultForkDefer();
}

/** Outbox flush / pull must wait until the chooser resolves (replaceVault excepted). */
function isVaultForkBlockingSync(): boolean {
  if (vaultForkReplaceInFlight) return false;
  return !!pendingVaultFork || !!deferredFork;
}

/** Never write IndexedDB while generations are mixed — including during replace. */
function isVaultForkBlockingPersist(): boolean {
  return !!pendingVaultFork || !!deferredFork;
}

/**
 * Debounced encrypted persistence of the vault + outbox to IndexedDB.
 * Captures a snapshot at fire time; failures are silent (offline persistence
 * is best-effort and must never break the live session).
 */
function persistOfflineVault() {
  if (!sessionPasswordHash || isVaultForkBlockingPersist()) return;
  if (pinnedSalt && state.salt && pinnedSalt !== state.salt) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistOfflineVaultNow();
  }, 400);
}

/** Immediate (non-debounced) persistence — use before wiping session state. */
function persistOfflineVaultNow(): Promise<boolean> {
  const hash = sessionPasswordHash;
  if (!hash || isVaultForkBlockingPersist()) return Promise.resolve(false);
  if (pinnedSalt && state.salt && pinnedSalt !== state.salt) return Promise.resolve(false);
  const cards = state.cards.map((c) => secrets.cardWithSecrets(c as PasswordCard));
  const snapshot = {
    cards,
    settings: { ...state.settings },
    outbox,
  };
  return saveOfflineVault(snapshot, hash, pinnedSalt || state.salt)
    .then((ok) => {
      if (ok) setState('offlineVaultAvailable', true);
      return ok;
    })
    .catch(() => false);
}

function pinCurrentMaster(): void {
  if (state.salt) pinnedSalt = state.salt;
  const hostOnly = activeHost.split(':')[0] ?? '';
  const proof = currentHostProofSecret();
  const next =
    touchIdentitySuccess(identity, activeHost, pinnedSalt) ??
    (pinnedSalt
      ? {
          deviceId: 'unknown',
          mdnsHost: '',
          ip: isIpv4Host(hostOnly) ? hostOnly : '',
          salt: pinnedSalt,
          generatedAt: Date.now(),
          updatedAt: Date.now(),
          lastSuccessAt: Date.now(),
        }
      : null);
  if (!next) {
    setIdentity(null);
    return;
  }
  setIdentity(proof ? { ...next, hostProofSecret: proof } : next);
}

function clearVaultForkUi(): void {
  pendingVaultFork = null;
  vaultForkReplaceInFlight = false;
  setState('vaultForkPending', false);
  setState('vaultForkPwaCount', 0);
  setState('vaultForkEncryptedOnly', false);
}

function sendSyncPush(
  payload: {
    index: ReturnType<typeof buildSyncIndex>;
    upserts: PasswordCard[];
    deletions: string[];
    tombstones: { id: string; deletedAt: string }[];
    settings?: AppSettings | Partial<AppSettings>;
    replaceVault?: boolean;
  },
  tokenOverride?: string
): boolean {
  const token = tokenOverride ?? sessionWsToken;
  if (!token || !sessionPasswordHash) return false;
  return send({
    type: 'sync_push',
    protocolVersion: SYNC_PROTOCOL_VERSION,
    encryptedPayload: encryptSyncPushWire(token, payload, sessionPasswordHash),
  });
}

function sendSyncPullRequest(tokenOverride?: string): boolean {
  const token = tokenOverride ?? sessionWsToken;
  if (!token || !sessionPasswordHash) return false;
  return send({
    type: SYNC_PULL_REQUEST_TYPE,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    encryptedPayload: encryptSyncPushWire(
      token,
      {
        index: currentVaultSyncIndex(),
        upserts: [],
        deletions: [],
        tombstones: [],
      },
      sessionPasswordHash
    ),
  });
}

/**
 * Pushes any pending offline outbox plus the local index, prompting the
 * server to merge and respond with a `sync_pull`. With an empty outbox this
 * sends `sync_pull_request` (pull does not write).
 *
 * @param tokenOverride - Session token when auth_ok just arrived.
 * @param quiet - When true (server_push), an empty outbox does not flip the chip to `syncing`.
 */
function flushOutboxAndPull(tokenOverride?: string, quiet = false): boolean {
  if (isVaultForkBlockingSync()) return false;
  const token = tokenOverride ?? sessionWsToken;
  const canFlush =
    !!state.authenticated && !!token && !!sessionPasswordHash && ws?.readyState === WebSocket.OPEN;

  if (!canFlush) return false;
  const upserts = Object.values(outbox.upserts);
  const tombstones = Object.values(outbox.tombstones);
  const hasFlush = !isOutboxEmpty(outbox);
  if (hasFlush || !quiet) {
    setSyncStatus('syncing');
  }
  if (!hasFlush) {
    const sent = sendSyncPullRequest(token);
    if (!sent && !quiet) {
      setSyncStatus(state.connState === 'authenticated' ? 'synced' : 'offline');
    }
    return sent;
  }
  flushInFlight = true;
  flushedOpsCount = upserts.length + tombstones.length;
  const settingsPatch = pickSatelliteSettingsPatch(outbox.settings);
  const sent = sendSyncPush(
    {
      index: currentVaultSyncIndex(),
      upserts,
      deletions: [],
      tombstones,
      ...(settingsPatch ? { settings: settingsPatch } : {}),
    },
    token
  );
  if (!sent) {
    flushInFlight = false;
    flushedOpsCount = 0;
    return false;
  }
  return true;
}

function doPullFromServer(quiet = false) {
  if (isVaultForkBlockingSync()) return;
  if (!flushOutboxAndPull(undefined, quiet)) {
    awaitingPostAuthSync = false;
    clearPostAuthSyncWatchdog();
    setSyncStatus('offline');
    showToast(t('not_connected', lang()), 'error');
  }
}

function applyPull(
  pull: {
    upserts?: PasswordCard[];
    deletions?: string[];
    tombstones?: { id: string; deletedAt: string }[];
    settings?: AppSettings;
    versionHash?: string;
  } | null
) {
  if (!pull) return;
  if (isVaultForkBlockingSync()) return;
  const fullLocal = state.cards.map((c) => secrets.cardWithSecrets(c as PasswordCard));

  const { cards: merged, overwrites } = mergePullLocally(fullLocal, pull);
  secrets.syncFromCards(merged);
  let appliedSettings = state.settings;
  if (pull.settings) {
    const pending = pendingSettingsPatch;
    const hadPending = !!pending;
    const mergedSettings = mergeVaultSettings(state.settings, {
      ...pull.settings,
      ...pending,
    });
    pendingSettingsPatch = null;
    settingsHydrated = true;
    appliedSettings = mergedSettings;
    setState('settings', mergedSettings);
    persistIdentityUiPrefs();
    touchActivity();
    if (hadPending && isLiveConnected()) {
      const sat = pickSatelliteSettingsPatch(pending);
      if (sat) {
        sendSyncPush({
          index: currentVaultSyncIndex(),
          upserts: [],
          deletions: [],
          tombstones: [],
          settings: sat,
        });
      }
    }
  }
  lastPullVersionHash =
    typeof pull.versionHash === 'string' && pull.versionHash
      ? pull.versionHash
      : computeDbVersionHash({
          cards: merged,
          tombstones: pull.tombstones ?? [],
          settings: appliedSettings,
        } as EncryptedDatabase);
  lastPullSettingsHash = computeSettingsHash(appliedSettings);
  setState(
    'cards',
    merged.map((c) => sanitizeCardForDisplay(c))
  );
  setState('vaultHydrating', false);
  setSyncStatus('synced');
  applyThemeFromSettings();
  refreshLocalizedChrome();
  persistOfflineVault();
  if (overwrites.length) {
    const n = overwrites.length;
    showToast(t('sync_field_overwrite', lang(), { n }), 'error');
  }
}

function handleMessage(msg: Record<string, unknown>) {
  lastInboundAt = Date.now();
  switch (msg.type) {
    case 'pong':
      return;
    case 'challenge': {
      clearReplyWatchdog();
      retryCount = 0;
      setState('challenge', msg.challenge as string);
      setState('salt', (msg.salt as string) || null);
      lastServerProof = msg.serverProof;
      lastSpakeShare = typeof msg.spakeShare === 'string' ? msg.spakeShare : null;
      const scheme =
        msg.authScheme === 'v4-argon2' ||
        msg.authScheme === 'v3-hkdf' ||
        msg.authScheme === 'v2-pbkdf2'
          ? (msg.authScheme as PasswordHashScheme)
          : ('v4-argon2' as PasswordHashScheme);
      setState('authScheme', scheme);
      setState('loginPasswordVisible', true);
      // Scheme-fallback: answer the fresh challenge with the alt hash we
      // already derived. Do not look up by advertised scheme — the master
      // still reports v3 while the vault hash may be v2.
      if (pendingRetryHash && !authInFlight) {
        const hash = pendingRetryHash;
        pendingRetryHash = null;
        if (!masterProofOk()) {
          failCredentialAttempt(t('sync_error_auth', lang()));
          return;
        }
        authInFlight = true;
        pendingAuthHash = hash;
        setConnLabel('conn_authenticating');
        sendAuthProof(msg.challenge as string, hash);
        return;
      }
      // Session already unlocked (live before, or offline unlock): answer the
      // challenge automatically instead of interrupting with the overlay.
      const canAutoAuth =
        !!sessionPasswordHash &&
        !autoAuthBlocked &&
        !authInFlight &&
        (state.wasAuthenticated || state.connState === 'offline' || state.connState === 'relogin');
      if (canAutoAuth) {
        if (!masterProofOk()) return;
        setState('showRelogin', false);
        setConnLabel('conn_authenticating');
        authInFlight = true;
        pendingAuthHash = sessionPasswordHash;
        sendAuthProof(msg.challenge as string, sessionPasswordHash!);
      } else if (
        sessionPasswordHash &&
        autoAuthBlocked &&
        (state.wasAuthenticated || state.connState === 'offline' || state.connState === 'relogin')
      ) {
        // Keep local unlock; only prompt if the user has not dismissed relogin.
        if (reloginDismissed) {
          demoteToOfflineEditable();
        } else if (state.connState === 'relogin' && state.showRelogin) {
          // Already prompting — don't remount/clear the form on a fresh challenge.
          setConnLabel('relogin_prompt');
        } else {
          demoteToOfflineEditable();
          setState('connState', 'relogin');
          setState('showRelogin', true);
          setConnLabel('relogin_prompt');
        }
      } else if (state.wasAuthenticated || state.connState === 'readonly') {
        setState('connState', 'relogin');
        setState('showRelogin', true);
        setConnLabel('relogin_prompt');
      } else {
        setConnLabel('conn_ready');
        setState('loginPasswordVisible', true);
      }
      break;
    }
    case 'auth_ok': {
      clearReplyWatchdog();
      authInFlight = false;
      setState('authBusy', false);
      pendingLoginHashes = null;
      pendingLoginPassword = null;
      authSchemeRetryUsed = false;
      let token = msg.token as string | undefined;
      const hashForDecrypt = pendingAuthHash ?? sessionPasswordHash;
      if (msg.encryptedPayload && hashForDecrypt) {
        const decoded = decryptAuthOk(msg.encryptedPayload as never, hashForDecrypt);
        if (!decoded) {
          pendingAuthHash = null;
          failCredentialAttempt(t('sync_error_auth', lang()));
          return;
        }
        token = decoded.token;
        const secret = normalizeHostProofSecret(decoded.hostProofSecret);
        if (secret) {
          pendingHostProofSecret = secret;
          if (identity) setIdentity({ ...identity, hostProofSecret: secret });
        }
      }
      if (!token) {
        failCredentialAttempt(t('sync_error_auth', lang()));
        return;
      }
      if (pendingAuthHash) {
        setSessionPasswordHash(pendingAuthHash);
        pendingAuthHash = null;
      }
      const incomingSalt = typeof state.salt === 'string' ? state.salt : '';
      if (deferredFork && incomingSalt && incomingSalt === deferredFork.previousSalt) {
        setDeferredFork(null);
      }
      const previousPinnedSalt = pinnedSalt;
      const fork = shouldBlockIncrementalSync({
        previousPinnedSalt,
        challengeSalt: incomingSalt,
        localCardCount: state.cards.length,
        hasOfflineVault: state.offlineVaultAvailable,
        deferred: deferredFork,
      });
      setState('discovery', 'found');
      setState('discoveryExhausted', false);
      lastDirectReconnectAt = 0;
      noteDiscoverySuccess();
      const sessionToken = token;
      sessionWsToken = sessionToken;
      setState('authenticated', true);
      setState('wasAuthenticated', true);
      setState('connState', 'authenticated');
      setState('showRelogin', false);
      setState('reloginError', '');
      autoAuthBlocked = false;
      reloginDismissed = false;
      if (fork) {
        const previousSalt = deferredFork?.previousSalt || previousPinnedSalt;
        pendingVaultFork = { previousSalt };
        vaultForkReplaceInFlight = false;
        const encryptedOnly = state.cards.length === 0 && state.offlineVaultAvailable;
        setState('vaultForkPending', true);
        setState('vaultForkPwaCount', state.cards.length);
        setState('vaultForkEncryptedOnly', encryptedOnly);
        awaitingPostAuthSync = false;
        clearPostAuthSyncWatchdog();
        setState('vaultHydrating', false);
        setSyncStatus('idle');
        const forkSent = sendControl(VAULT_FORK_TYPE, {
          pwaCardCount: state.cards.length,
          encryptedOnly,
        });
        if (!forkSent) {
          showToast(t('not_connected', lang()), 'error');
        }
        touchActivity();
        break;
      }
      pinCurrentMaster();
      awaitingPostAuthSync = true;
      setState('vaultHydrating', true);
      setSyncStatus('syncing');
      if (!flushOutboxAndPull(sessionToken)) {
        awaitingPostAuthSync = false;
        clearPostAuthSyncWatchdog();
        demoteToOfflineEditable();
        showToast(t('not_connected', lang()), 'error');
      }
      touchActivity();
      break;
    }
    case 'auth_error':
      clearReplyWatchdog();
      // One-shot scheme fallback: master may still be on v2-pbkdf2 while the
      // client tried v3-hkdf (or the reverse during mixed fleets). Request a
      // fresh challenge and retry with the other derivation before surfacing
      // "Authentication failed" to the user.
      if (pendingLoginHashes && !authSchemeRetryUsed && ws?.readyState === WebSocket.OPEN) {
        const alt: PasswordHashScheme =
          state.authScheme === 'v4-argon2'
            ? 'v3-hkdf'
            : state.authScheme === 'v3-hkdf'
              ? 'v2-pbkdf2'
              : 'v3-hkdf';
        let altHash = pendingLoginHashes[alt];
        if (!altHash && pendingLoginPassword && state.salt) {
          altHash = deriveVaultAuthSecret(pendingLoginPassword, state.salt, alt);
          pendingLoginHashes = { ...pendingLoginHashes, [alt]: altHash };
        }
        if (altHash) {
          authSchemeRetryUsed = true;
          authInFlight = false;
          setState('authScheme', alt);
          pendingAuthHash = altHash;
          pendingRetryHash = altHash;
          setState('loginPasswordVisible', true);
          const sent = sendChallengeRequest();
          if (!sent) {
            failCredentialAttempt(t('not_connected', lang()));
          }
          return;
        }
      }
      // If the automatic challenge response failed (password changed on the
      // master, stale hash), stop retrying silently and ask the user.
      if (pendingAuthHash && pendingAuthHash === sessionPasswordHash) {
        autoAuthBlocked = true;
      }
      clearAuthAttempt();
      awaitingPostAuthSync = false;
      clearPostAuthSyncWatchdog();
      unauthorizedReauthUsed = false;
      failCredentialAttempt(
        state.connState === 'relogin' || state.wasAuthenticated
          ? t('sync_error_auth', lang())
          : t('incorrect_password', lang())
      );
      break;
    case 'sync_pull': {
      clearReplyWatchdog();
      // Protocol v2+: require encrypted envelope (reject plaintext downgrade).
      let payload: Parameters<typeof applyPull>[0] = null;
      if (msg.encryptedPayload && sessionPasswordHash) {
        payload = decryptPayload(msg.encryptedPayload as never, sessionPasswordHash);
      }
      if (!payload) {
        // Decrypt/parse failed — never drop the offline outbox on a bad pull.
        flushInFlight = false;
        flushedOpsCount = 0;
        awaitingPostAuthSync = false;
        clearPostAuthSyncWatchdog();
        setSyncStatus(state.connState === 'authenticated' ? 'synced' : 'offline');
        showToast(t('sync_error_conflict', lang()), 'error');
        break;
      }
      applyPull(payload);
      if (vaultForkReplaceInFlight) {
        pinCurrentMaster();
        clearVaultForkUi();
        persistOfflineVaultNow().catch(() => false);
      }
      // First successful pull after auth — promote to live (hides offline banner).
      unauthorizedReauthUsed = false;
      awaitingPostAuthSync = false;
      clearPostAuthSyncWatchdog();
      setState('connState', 'authenticated');
      setState('showRelogin', false);
      if (flushInFlight) {
        // The server accepted and merged our offline outbox — safe to drop it.
        flushInFlight = false;
        outbox = emptyOutbox();
        syncPendingOpsState();
        persistOfflineVault();
        if (flushedOpsCount > 0) {
          showToast(t('sync_complete', lang(), { n: flushedOpsCount }), 'success');
        }
        flushedOpsCount = 0;
      }
      break;
    }
    case VAULT_FORK_DECISION_TYPE: {
      const inner = openControlInner(msg);
      if (!inner) break;
      const action = parseVaultForkDecisionInner(inner);
      if (action) applyVaultForkDecision(action);
      break;
    }
    case ACTION_CONFIRM_RESULT_TYPE: {
      const inner = openControlInner(msg);
      const parsed = inner ? parseActionConfirmResult(inner) : null;
      if (
        !parsed ||
        !phoneConfirmPending ||
        !actionConfirmBindMatches(phoneConfirmPending, parsed)
      ) {
        if (phoneConfirmPending) fallbackPhoneConfirmToPassword();
        break;
      }
      clearPhoneConfirmTimer();
      phoneConfirmPending = null;
      setState('showPhoneConfirm', false);
      if (parsed.ok) {
        const cb = state.verifyCallback;
        setState({ verifyCallback: null, verifyError: '' });
        cb?.();
      } else {
        fallbackPhoneConfirmToPassword();
      }
      break;
    }
    case UNLOCK_OFFER_TYPE: {
      const parsed = parseUnlockOffer(msg);
      if (!pendingPhoneUnlock || !parsed || parsed.requestId !== pendingPhoneUnlock.requestId) {
        break;
      }
      pendingPhoneUnlock.serverPub = parsed.serverPub;
      setState(
        'unlockSas',
        computeUnlockSas(pendingPhoneUnlock.clientPub, parsed.serverPub, pendingPhoneUnlock.nonce)
      );
      break;
    }
    case UNLOCK_GRANT_TYPE: {
      if (!pendingPhoneUnlock) break;
      const parsed = parseUnlockGrant(msg);
      if (!parsed || parsed.requestId !== pendingPhoneUnlock.requestId) {
        abortPhoneUnlockQuiet();
        break;
      }
      const inner = unwrapUnlockGrant(
        pendingPhoneUnlock.secretKey,
        parsed.serverPub,
        parsed.encryptedPayload
      );
      const isRelogin = pendingPhoneUnlock.isRelogin;
      abortPhoneUnlockQuiet();
      if (!inner) break;
      void beginAuthWithVaultHash(inner.passwordHash, {
        salt: inner.salt,
        authScheme: inner.authScheme,
        isRelogin,
      });
      break;
    }
    case UNLOCK_CANCEL_TYPE: {
      abortPhoneUnlockQuiet();
      break;
    }
    case SERVER_PUSH_TYPE: {
      const inner = openControlInner(msg);
      if (!inner) break;
      const versionHash = typeof inner.versionHash === 'string' ? inner.versionHash : '';
      const settingsHash = typeof inner.settingsHash === 'string' ? inner.settingsHash : '';
      if (
        versionHash &&
        settingsHash &&
        versionHash === lastPullVersionHash &&
        settingsHash === lastPullSettingsHash
      ) {
        break;
      }
      doPullFromServer(true);
      break;
    }
    case 'error':
      clearReplyWatchdog();
      if (
        sessionWsToken &&
        sessionPasswordHash &&
        (state.authenticated || state.connState === 'authenticated')
      ) {
        const inner = openControlInner(msg);
        if (!inner) break;
        msg = { ...msg, code: inner.code, error: inner.error };
      }
      if (pendingPhoneUnlock && /unknown message type/i.test(String(msg.error ?? ''))) {
        abortPhoneUnlockQuiet();
        break;
      }
      if (msg.code === 'SESSION_MISMATCH') {
        flushInFlight = false;
        flushedOpsCount = 0;
        awaitingPostAuthSync = false;
        clearPostAuthSyncWatchdog();
        setSyncStatus('offline');
        showToast(t('vault_fork_waiting', lang()), 'error');
        break;
      }
      if (
        phoneConfirmPending &&
        msg.code === 'UNAUTHORIZED' &&
        /unknown message type/i.test(String(msg.error ?? ''))
      ) {
        fallbackPhoneConfirmToPassword();
        break;
      }
      // A failed flush keeps the outbox intact for the next attempt.
      flushInFlight = false;
      flushedOpsCount = 0;
      awaitingPostAuthSync = false;
      clearPostAuthSyncWatchdog();
      setSyncStatus('offline');
      if (
        msg.code === 'UNAUTHORIZED' &&
        (state.connState === 'authenticated' || state.authenticated)
      ) {
        const errText = String(msg.error ?? msg.code ?? '');
        // Re-auth cannot fix a decrypt/payload mismatch — don't burn a retry loop.
        const reauthUseful = !/decrypt|malformed|json/i.test(errText);
        if (sessionPasswordHash) {
          const canSilentReauth =
            reauthUseful &&
            !unauthorizedReauthUsed &&
            ws?.readyState === WebSocket.OPEN &&
            !authInFlight;
          demoteToOfflineEditable();
          if (canSilentReauth) {
            unauthorizedReauthUsed = true;
            sendChallengeRequest();
          } else {
            unauthorizedReauthUsed = false;
            showToast(t('sync_error', lang()), 'error');
          }
        } else {
          setState('connState', 'relogin');
          setState('showRelogin', true);
          showToast(t('relogin_prompt', lang()), 'error');
        }
      } else if (!state.authenticated && state.connState !== 'offline') {
        failPreAuthLogin(t('sync_error', lang()));
      } else {
        showToast(t('sync_error', lang()), 'error');
      }
      break;
    default:
      break;
  }
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  const delay = isCircuitOpen(circuitOpenUntil)
    ? Math.max(1000, circuitOpenUntil - Date.now())
    : nextRetryDelayMs(retryCount);
  retryCount++;
  retryTimer = setTimeout(connectWs, delay);
  if (state.connState !== 'authenticated') {
    if (state.wasAuthenticated) {
      setConnLabel('conn_recovering');
    } else {
      setConnLabel('conn_reconnecting', { n: Math.max(1, Math.round(delay / 1000)) });
    }
  }
}

/**
 * Drop live auth flags and keep an unlocked vault editable offline.
 * Does not leave the optional reconnect prompt open.
 */
function demoteToOfflineEditable() {
  clearAuthAttempt();
  awaitingPostAuthSync = false;
  clearPostAuthSyncWatchdog();
  hideAllRevealedSecrets();
  abortPhoneConfirmQuiet();
  abortPhoneUnlockQuiet();
  clearSessionWsToken();
  setState({
    showVerify: false,
    showPhoneConfirm: false,
    verifyCallback: null,
    verifyError: '',
    showRelogin: false,
    reloginError: '',
    authenticated: false,
    wasAuthenticated: true,
    connState: 'offline',
  });
  setState('vaultHydrating', false);
  setSyncStatus('offline');
  setConnLabel('offline_banner');
  persistOfflineVault();
}

/**
 * Master connection dropped. With local credentials the session stays fully
 * usable in editable offline mode; otherwise it degrades to read-only or login.
 */
function enterOffline() {
  const canDemote =
    state.authenticated || state.connState === 'authenticated' || state.connState === 'relogin';
  if (!canDemote) return;
  clearAuthAttempt();
  awaitingPostAuthSync = false;
  clearConnectTimeout();
  clearPostAuthSyncWatchdog();
  hideAllRevealedSecrets();
  abortPhoneConfirmQuiet();
  abortPhoneUnlockQuiet();
  setState({
    showVerify: false,
    showPhoneConfirm: false,
    verifyCallback: null,
    verifyError: '',
    showRelogin: false,
    reloginError: '',
    vaultHydrating: false,
  });
  setState('authenticated', false);
  clearSessionWsToken();
  if (sessionPasswordHash) {
    setState('wasAuthenticated', true);
    setState('connState', 'offline');
    setSyncStatus('offline');
    setConnLabel('offline_banner');
    persistOfflineVault();
  } else if (state.offlineVaultAvailable) {
    // Session locked in memory but encrypted vault remains — land on unlock.
    setState('wasAuthenticated', false);
    setState('connState', 'disconnected');
    setState('loginPasswordVisible', true);
    setSyncStatus('offline');
    setConnLabel('offline_unlock_hint');
  } else {
    setState('wasAuthenticated', true);
    setState('connState', 'readonly');
    setSyncStatus('offline');
    setConnLabel('conn_lost');
  }
}

/**
 * Opens the sync socket. `hostOverride` rotates the target host permanently
 * (discovery found the master at a new address); without it the current
 * `activeHost` is reused, so the retry cycle keeps following the master.
 */
function connectWs(hostOverride?: string) {
  if (hostOverride) activeHost = hostOverride;
  clearConnectTimeout();
  clearReplyWatchdog();
  clearWsPingTimer();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const generation = ++wsGeneration;
  const prev = ws;
  ws = null;
  if (prev) {
    try {
      // Detach so a replace-close cannot schedule a parallel reconnect loop.
      prev.onclose = null;
      prev.onmessage = null;
      prev.onerror = null;
      prev.onopen = null;
      prev.close();
    } catch {
      /* ignore */
    }
  }
  const socket = new WebSocket(wsUrl());
  ws = socket;
  armConnectTimeout(generation);
  socket.onopen = () => {
    if (generation !== wsGeneration || ws !== socket) return;
    clearConnectTimeout();
    lastInboundAt = Date.now();
    if (authInFlight || state.authBusy || sessionPasswordHash) {
      setConnLabel('conn_authenticating');
    } else {
      setConnLabel('conn_connecting');
    }
    sendChallengeRequest();
    startWsPingTimer();
  };
  socket.onmessage = (e) => {
    if (generation !== wsGeneration || ws !== socket) return;
    try {
      handleMessage(JSON.parse(e.data));
    } catch {
      /* ignore */
    }
  };
  socket.onclose = () => {
    if (generation !== wsGeneration) return;
    clearConnectTimeout();
    clearReplyWatchdog();
    clearWsPingTimer();
    if (ws === socket) ws = null;
    if (pendingPhoneUnlock) {
      abortPhoneUnlockQuiet();
      showToast(t('unlock_sas_connection_lost', lang()), 'error');
    }
    if (
      state.authenticated ||
      state.connState === 'authenticated' ||
      state.connState === 'relogin'
    ) {
      enterOffline();
    }
    if (state.discovery === 'found') setState('discovery', 'idle');
    scheduleRetry();
    kickDiscovery();
  };
  socket.onerror = () => {};
}

/**
 * Looks for the master after the socket dropped: reconnects straight to the
 * current host when it is probably still there (microcut, stable `.local`
 * name), otherwise probes the known alternatives and finally sweeps the /24.
 *
 * Runs alongside the normal retry cycle and never blocks editing: `discovery`
 * is a separate flag, not a `ConnState`.
 */
function kickDiscovery() {
  if (discoveryCycleInFlight) return;
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  if (!isBrowserOnline()) {
    discoveryGaveUp();
    setConnLabel('conn_computer_offline');
    return;
  }
  if (isCircuitOpen(circuitOpenUntil)) {
    scheduleRetry();
    return;
  }
  // Without an identity, or with nothing to validate a candidate with, stay on
  // the current host: the user follows the manual guidance instead of the PWA
  // trusting an unknown peer.
  if (!identity || !canVerifyProbe()) {
    setState('discoveryExhausted', true);
    return;
  }

  const now = Date.now();
  if (shouldReconnectDirect(identity, activeHost, now)) {
    if (now - lastDirectReconnectAt >= DIRECT_RECONNECT_GUARD_MS) {
      lastDirectReconnectAt = now;
      connectWs();
      return;
    }
    // The direct reconnect died right away — the master likely moved: probe on.
  }

  const port = activeHost.split(':')[1] || '7392';
  const candidates = buildCandidates(identity, activeHost, port);
  if (candidates.length === 0) return;

  // Own the reconnect while probing; the cycle resumes it if nothing is found.
  clearRetryTimer();
  discoveryCycleInFlight = true;
  setState('discovery', 'active');
  setState('discoveryExhausted', false);
  setConnLabel(state.wasAuthenticated ? 'conn_recovering' : 'conn_discovering');
  void (async () => {
    try {
      const known = identity;
      if (!known) return;
      for (const cand of candidates) {
        if (cand.kind === 'sweep') continue; // handled after the known hosts
        if (await probeWs(cand.host, cand.timeoutMs, verifyProbe)) {
          connectWs(cand.host);
          return; // stays 'active' until auth_ok ('found') or the next onclose
        }
      }
      const sibling = readSweepFound(known.deviceId);
      if (sibling) {
        connectWs(`${sibling}:${port}`);
        return;
      }
      // The sweep talks to every host in the /24, so it requires a pairing
      // secret that can verify the host proof (available while the vault is locked).
      if (!currentHostProofSecret()) {
        discoveryGaveUp();
        scheduleRetry();
        return;
      }
      const sweep = await tryRunSweep(known, {
        baseIp: known.ip,
        verify: verifyProbe,
        excludeHosts: [activeHost, known.mdnsHost, known.ip].filter(Boolean),
        port,
      });
      if (sweep?.foundHost) {
        connectWs(sweep.foundHost);
        return;
      }
      discoveryGaveUp();
      scheduleRetry();
    } catch {
      discoveryGaveUp();
      scheduleRetry();
    } finally {
      discoveryCycleInFlight = false;
    }
  })();
}

/**
 * Bootstraps theme watching, WebSocket connection, and activity auto-logout.
 */
export function initApp() {
  const stored = loadIdentity();
  setIdentity(stored);
  deferredFork = loadVaultForkDefer();
  if (identity?.salt && !pinnedSalt) pinnedSalt = identity.salt;
  if (deferredFork?.previousSalt) pinnedSalt = deferredFork.previousSalt;
  applyBootUiHints(readInjectedBootUi() ?? stored ?? navigatorLangHint());
  applyThemeFromSettings();
  applyLanguageFromSettings();
  watchSystemTheme(() => {
    if (resolveWebThemeMode(state.settings) === 'AUTO') applyThemeFromSettings();
  });
  watchSystemLanguage(() => {
    if (resolveWebLanguagePref(state.settings) === 'AUTO') refreshLocalizedChrome();
  });
  loadOfflineVault()
    .then((rec) => {
      if (rec) {
        setState('offlineVaultAvailable', true);
        if (!deferredFork) pinnedSalt = rec.vaultSalt ?? '';
      }
    })
    .catch(() => {});
  // Stored identity first (works offline), then refresh it from this origin.
  connectWs();
  void fetchMeta().then((meta) => {
    if (!shouldApplyMeta(identity, meta, isLiveConnected())) return;
    setIdentity(meta);
    applyBootUiHints(meta);
    kickDiscovery();
  });
  if (typeof document !== 'undefined') {
    // Idle timer is independent of mobile `autoLogout`. Hidden-tab lock uses the
    // same inactivity clock; resume compares wall-clock because timers freeze.
    ['click', 'keydown', 'touchstart', 'input', 'scroll'].forEach((evt) => {
      document.addEventListener(evt, touchActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', onWebVisibilityChange);
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', () => {
        void onWebVisible();
      });
    }
    // Clear any legacy install SW/cache from older builds (web vault is browser-only).
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
    }
    if (typeof caches !== 'undefined') {
      void caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith('pkey-')).map((k) => caches.delete(k)))
        );
    }
  }
  if (typeof window !== 'undefined') {
    // A sibling tab swept and found the master: reuse its result, don't sweep.
    window.addEventListener('storage', (e) => {
      if (e.key !== LK_SWEEP_FOUND || !identity) return;
      const found = readSweepFound(identity.deviceId);
      if (found && !isLiveConnected()) {
        connectWs(`${found}:${activeHost.split(':')[1] || '7392'}`);
      }
    });
    // Network switch (Wi-Fi change, VPN, wake from sleep): look again right away.
    const connection = (
      navigator as { connection?: { addEventListener?: typeof addEventListener } }
    ).connection;
    connection?.addEventListener?.('change', () => {
      if (!isLiveConnected()) kickDiscovery();
    });
    window.addEventListener('online', () => {
      if (!isLiveConnected()) kickDiscovery();
    });
  }
}

/** Clears session secrets and returns the UI to a disconnected state. */
export async function wipeSession(opts?: { skipPersist?: boolean }) {
  clearIdleTimer();
  lastActivityAt = 0;
  abortPhoneConfirmQuiet();
  abortPhoneUnlockQuiet();
  // Flush pending state to the encrypted offline vault before secrets vanish,
  // so an auto-logout never loses offline edits.
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const offerOfflineUnlock =
    !opts?.skipPersist && (state.offlineVaultAvailable || !!sessionPasswordHash);
  if (!opts?.skipPersist && sessionPasswordHash) {
    await persistOfflineVaultNow();
  }
  outbox = emptyOutbox();
  flushInFlight = false;
  flushedOpsCount = 0;
  autoAuthBlocked = false;
  reloginDismissed = false;
  unauthorizedReauthUsed = false;
  awaitingPostAuthSync = false;
  settingsHydrated = false;
  pendingSettingsPatch = null;
  lastPullVersionHash = '';
  lastPullSettingsHash = '';
  clearConnectTimeout();
  clearPostAuthSyncWatchdog();
  clearWsPingTimer();
  clearAuthAttempt();
  clearSessionWsToken();
  setSessionPasswordHash(null);
  setState('pendingOps', 0);
  setState({
    authenticated: false,
    wasAuthenticated: false,
    challenge: null,
    authScheme: null,
    cards: [],
    connState: 'disconnected',
    // The master identity is not a credential — it survives so a re-login can
    // still find a master that changed address.
    discovery: 'idle',
    showRelogin: false,
    showCardModal: false,
    showVerify: false,
    showPhoneConfirm: false,
    verifyCallback: null,
    verifyError: '',
    editingId: null,
    editSecretsUnlocked: false,
    loginPasswordVisible: offerOfflineUnlock,
    revealedIds: new Set<string>(),
    loginError: '',
    reloginError: '',
    ...(offerOfflineUnlock ? { offlineVaultAvailable: true } : {}),
  });
  secrets.clear();
  clearVaultForkUi();
  clearPbkdf2Cache();
  discoveryFailCount = 0;
  circuitOpenUntil = 0;
  retryCount = 0;
  setSyncStatus('idle');
  if (offerOfflineUnlock) {
    setConnLabel('offline_unlock_hint');
  }
}

/**
 * Unlocks the encrypted offline vault stored in this browser (no master
 * required). Hydrates cards, settings, and the pending outbox, then leaves the
 * session in editable offline mode; the reconnect loop keeps searching for the
 * master and auto-authenticates when it reappears.
 */
async function offlineUnlock(
  password: string,
  errorKey: 'loginError' | 'reloginError' = 'loginError'
) {
  setState(errorKey, '');
  const rec = await loadOfflineVault();
  if (!rec) {
    setState('offlineVaultAvailable', false);
    setState(errorKey, t('offline_unlock_failed', lang()));
    return;
  }
  const hash = await derivePasswordHash(password, rec.vaultSalt);
  const data = decodeOfflineVault(rec.envelope, hash);
  if (!data) {
    setState(errorKey, t('incorrect_password', lang()));
    return;
  }
  outbox = data.outbox;

  secrets.syncFromCards(data.cards);
  if (data.settings) {
    pendingSettingsPatch = null;
    settingsHydrated = true;
    setState('settings', mergeVaultSettings(state.settings, data.settings));
  }
  setSessionPasswordHash(hash);
  pinnedSalt = deferredFork?.previousSalt || rec.vaultSalt || '';
  setState({
    cards: data.cards.map((c) => sanitizeCardForDisplay(c)),
    salt: deferredFork?.previousSalt || rec.vaultSalt,
    wasAuthenticated: true,
    authenticated: false,
    connState: 'offline',
    loginPasswordVisible: false,
    loginError: '',
    reloginError: '',
    showRelogin: false,
    vaultHydrating: false,
  });
  syncPendingOpsState();
  setSyncStatus('offline');
  setConnLabel('offline_banner');
  applyThemeFromSettings();
  refreshLocalizedChrome();
  autoAuthBlocked = false;
  reloginDismissed = false;
  clearAuthAttempt();
  touchActivity();
}

async function tryHydrateStaleCards(hash: string): Promise<void> {
  if (state.cards.length > 0) return;
  try {
    const rec = await loadOfflineVault();
    if (!rec) return;
    let data = decodeOfflineVault(rec.envelope, hash);
    if (!data?.cards?.length) return;
    if (rec.vaultSalt && !pinnedSalt && !deferredFork) pinnedSalt = rec.vaultSalt;
    secrets.syncFromCards(data.cards);
    setState(
      'cards',
      data.cards.map((c) => sanitizeCardForDisplay(c))
    );
    if (data.settings) {
      setState('settings', mergeVaultSettings(state.settings, data.settings));
    }
    outbox = data.outbox;
    syncPendingOpsState();
  } catch {
    /* ignore — live pull remains the source of truth */
  }
}

/**
 * Derives the password hash and sends a WebSocket `auth` challenge response.
 * Without a server challenge (master unreachable) it falls back to unlocking
 * the local offline vault when one exists.
 *
 * @param password - Master password entered by the user
 * @param isRelogin - When true, errors update the relogin overlay instead of login screen
 */
export async function submitLogin(password: string, isRelogin = false) {
  if (!password || authInFlight || state.authBusy) return;
  const masterReachable = !!state.challenge && ws?.readyState === WebSocket.OPEN;

  setState('authBusy', true);
  // Let the unlock button paint its spinner before sync PBKDF2 blocks the thread.
  await yieldForBusyUi();

  try {
    if (!masterReachable) {
      // Phone is on the socket but has not issued a challenge yet — do not
      // burn 600k PBKDF2 against the *old* IndexedDB vault (wrong password).
      const waitingForPhone =
        !!ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
      if (waitingForPhone) {
        setState(isRelogin ? 'reloginError' : 'loginError', t('login_looking', lang()));
        return;
      }
      if (state.offlineVaultAvailable) {
        await offlineUnlock(password, isRelogin ? 'reloginError' : 'loginError');
      } else if (isRelogin) {
        setState('reloginError', t('not_connected', lang()));
      }
      return;
    }
    setState(isRelogin ? 'reloginError' : 'loginError', '');
    authInFlight = true;
    autoAuthBlocked = false;
    reloginDismissed = false;
    const challenge = state.challenge!;
    const salt = state.salt;
    if (!salt) {
      failCredentialAttempt(t('incorrect_password', lang()));
      return;
    }
    const scheme: PasswordHashScheme = state.authScheme ?? 'v4-argon2';
    pendingLoginPassword = password;
    const hash = deriveVaultAuthSecret(password, salt, scheme);
    pendingLoginHashes = { [scheme]: hash };
    authSchemeRetryUsed = false;
    if (!masterProofOk()) {
      pendingLoginHashes = null;
      failCredentialAttempt(t('sync_error_auth', lang()));
      return;
    }
    pendingAuthHash = hash;
    await tryHydrateStaleCards(hash);
    setConnLabel('conn_authenticating');
    const sent = sendAuthProof(challenge, hash);
    if (!sent) {
      failCredentialAttempt(t('not_connected', lang()));
    }
  } finally {
    // Online path keeps authBusy until auth_ok / auth_error / clearAuthAttempt.
    if (!authInFlight) {
      setState('authBusy', false);
    }
  }
}

/**
 * Dismisses the relogin prompt and keeps working without the master.
 * Unlocked sessions stay editable offline; locked sessions go to offline unlock
 * or read-only if cards remain in memory.
 */
export function continueOffline() {
  reloginDismissed = true;
  clearAuthAttempt();
  setState('showRelogin', false);
  setState('reloginError', '');
  if (sessionPasswordHash) {
    demoteToOfflineEditable();
    return;
  }
  if (state.offlineVaultAvailable) {
    setState('wasAuthenticated', false);
    setState('authenticated', false);
    clearSessionWsToken();
    setState('connState', 'disconnected');
    setState('loginPasswordVisible', true);
    setSyncStatus('offline');
    setConnLabel('offline_unlock_hint');
    return;
  }
  // Preserve any in-memory cards as read-only until the master is back.
  setState('authenticated', false);
  clearSessionWsToken();
  setState('wasAuthenticated', true);
  setState('connState', 'readonly');
  setSyncStatus('offline');
  setConnLabel('conn_lost');
}

function applyVaultForkDecision(action: VaultForkAction): void {
  if (!pendingVaultFork) return;
  if (action === 'defer') {
    const previousSalt = pendingVaultFork.previousSalt;
    const phoneSalt = typeof state.salt === 'string' ? state.salt.trim() : '';
    const record = parseVaultForkDeferRecord({ previousSalt, phoneSalt });
    if (record) setDeferredFork(record);
    pinnedSalt = previousSalt;
    if (previousSalt) setState('salt', previousSalt);
    clearVaultForkUi();
    continueOffline();
    return;
  }
  if (action === 'use_phone') {
    setDeferredFork(null);
    pinCurrentMaster();
    outbox = emptyOutbox();
    syncPendingOpsState();
    secrets.clear();
    setState('cards', []);
    clearVaultForkUi();
    void clearOfflineVault().then(() => {
      setState('offlineVaultAvailable', false);
    });
    awaitingPostAuthSync = true;
    setState('vaultHydrating', true);
    setSyncStatus('syncing');
    if (!flushOutboxAndPull()) {
      awaitingPostAuthSync = false;
      clearPostAuthSyncWatchdog();
      demoteToOfflineEditable();
      showToast(t('not_connected', lang()), 'error');
    }
    return;
  }
  vaultForkReplaceInFlight = true;
  awaitingPostAuthSync = true;
  setState('vaultHydrating', true);
  setSyncStatus('syncing');
  const upserts = state.cards.map((c) => secrets.cardWithSecrets(c as PasswordCard));
  if (upserts.length === 0) {
    vaultForkReplaceInFlight = false;
    awaitingPostAuthSync = false;
    setState('vaultHydrating', false);
    setSyncStatus('idle');
    showToast(t('vault_fork_locked', lang()), 'error');
    return;
  }
  flushInFlight = true;
  flushedOpsCount = upserts.length;
  const sent = sendSyncPush({
    index: currentVaultSyncIndex(),
    upserts,
    deletions: [],
    tombstones: [],
    settings: state.settings,
    replaceVault: true,
  });
  if (!sent) {
    vaultForkReplaceInFlight = false;
    flushInFlight = false;
    flushedOpsCount = 0;
    awaitingPostAuthSync = false;
    clearPostAuthSyncWatchdog();
    setState('vaultHydrating', false);
    showToast(t('not_connected', lang()), 'error');
    return;
  }
  setDeferredFork(null);
}

/**
 * User-initiated search after discovery gave up or the circuit opened.
 * Resets backoff so "Reintentar" is immediate.
 */
export function retryDiscovery() {
  discoveryFailCount = 0;
  circuitOpenUntil = 0;
  setState('discoveryExhausted', false);
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    connectWs();
  }
  kickDiscovery();
}

/** Requests a pull sync from the master device. */
export function requestSync() {
  if (pendingVaultFork || state.vaultForkPending || deferredFork) {
    showToast(t('vault_fork_waiting', lang()), 'error');
    return;
  }
  if (authInFlight || awaitingPostAuthSync || flushInFlight || state.syncStatus === 'syncing') {
    dropSocketAndRecover();
    return;
  }
  if (isLiveConnected()) {
    doPullFromServer();
    return;
  }
  // Authenticated session still has a token but UI was demoted — flush first.
  if (
    sessionPasswordHash &&
    state.authenticated &&
    sessionWsToken &&
    ws?.readyState === WebSocket.OPEN
  ) {
    unauthorizedReauthUsed = false;
    awaitingPostAuthSync = true;
    setSyncStatus('syncing');
    if (!flushOutboxAndPull()) {
      awaitingPostAuthSync = false;
      clearPostAuthSyncWatchdog();
      demoteToOfflineEditable();
      showToast(t('not_connected', lang()), 'error');
    }
    return;
  }
  // Offline / demoted: try to re-auth with the master when the socket is up.
  if (sessionPasswordHash && ws?.readyState === WebSocket.OPEN) {
    if (autoAuthBlocked) {
      reloginDismissed = false;
      setState('connState', 'relogin');
      setState('showRelogin', true);
      setConnLabel('relogin_prompt');
      return;
    }
    if (authInFlight) {
      dropSocketAndRecover();
      return;
    }
    // Explicit user gesture — allow one fresh unauthorized re-auth cycle.
    unauthorizedReauthUsed = false;
    setConnLabel('conn_authenticating');
    setSyncStatus('syncing');
    if (!sendChallengeRequest()) {
      setSyncStatus('offline');
      showToast(t('not_connected', lang()), 'error');
    }
    return;
  }
  // Socket still connecting — wait; don't spam an error toast.
  if (ws?.readyState === WebSocket.CONNECTING) {
    setSyncStatus('syncing');
    return;
  }
  // Live socket, already authenticated path handled above. Pre-auth login:
  // reconnect / ask for a challenge so the user can unlock. If a challenge is
  // already on screen, do not spam.
  if (ws?.readyState === WebSocket.OPEN) {
    if (state.challenge) return;
    setConnLabel('login_looking');
    if (!sendChallengeRequest()) {
      showToast(t('not_connected', lang()), 'error');
    }
    return;
  }
  // Socket down — kick a reconnect; edits stay local when a session exists.
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    if (sessionPasswordHash) {
      showToast(t('not_connected', lang()), 'error');
    }
    connectWs();
    kickDiscovery();
    return;
  }
  showToast(t('not_connected', lang()), 'error');
}

/**
 * Wipes the local session, purges the persisted offline vault (explicit
 * logout means "forget this browser"), closes the socket, and reconnects.
 */
export function logout() {
  outbox = emptyOutbox();
  void wipeSession({ skipPersist: true });
  clearOfflineVault().catch(() => {});
  setState('offlineVaultAvailable', false);
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  connectWs();
}

export function verifyAction(
  onSuccess: () => void,
  meta?: { action: PwaActionConfirmKind; cardId?: string }
) {
  hideAllRevealedSecrets();
  if (meta && shouldRequestPhoneConfirm(state.settings, isLiveConnected())) {
    startPhoneConfirm(onSuccess, meta);
    return;
  }
  setState({
    showPhoneConfirm: false,
    showVerify: false,
    verifyCallback: null,
    verifyError: '',
  });
  setState({
    showVerify: true,
    verifyCallback: onSuccess,
    verifyError: '',
  });
}

function clearPhoneConfirmTimer() {
  if (phoneConfirmTimer) {
    clearTimeout(phoneConfirmTimer);
    phoneConfirmTimer = null;
  }
}

function abortPhoneConfirmQuiet() {
  clearPhoneConfirmTimer();
  phoneConfirmPending = null;
  setState('showPhoneConfirm', false);
}

function clearPhoneUnlockTimer() {
  if (phoneUnlockTimer) {
    clearTimeout(phoneUnlockTimer);
    phoneUnlockTimer = null;
  }
}

function abortPhoneUnlockQuiet(sendCancel = false) {
  clearPhoneUnlockTimer();
  const pending = pendingPhoneUnlock;
  if (sendCancel && pending) {
    send({ type: UNLOCK_CANCEL_TYPE, requestId: pending.requestId });
  }
  pending?.secretKey.fill(0);
  pendingPhoneUnlock = null;
  setState({ showUnlockWait: false, unlockSas: '' });
}

/**
 * Completes login after an ECDH grant (or any already-derived vault auth hash).
 * Does not call {@link submitLogin} — the master password never enters the browser.
 */
async function beginAuthWithVaultHash(
  hash: string,
  opts: { salt?: string; authScheme?: PasswordHashScheme; isRelogin?: boolean }
): Promise<void> {
  if (!hash || authInFlight || state.authBusy) return;
  const challenge = state.challenge;
  if (!challenge || ws?.readyState !== WebSocket.OPEN) {
    failCredentialAttempt(t('not_connected', lang()));
    return;
  }
  setState('authBusy', true);
  await yieldForBusyUi();
  try {
    if (opts.salt) setState('salt', opts.salt);
    if (opts.authScheme) setState('authScheme', opts.authScheme);
    if (!masterProofOk()) {
      failCredentialAttempt(t('sync_error_auth', lang()));
      return;
    }
    authInFlight = true;
    autoAuthBlocked = false;
    reloginDismissed = false;
    pendingAuthHash = hash;
    setState(opts.isRelogin ? 'reloginError' : 'loginError', '');
    await tryHydrateStaleCards(hash);
    const sent = sendAuthProof(challenge, hash);
    if (!sent) failCredentialAttempt(t('not_connected', lang()));
  } finally {
    if (!authInFlight) setState('authBusy', false);
  }
}

/** Starts a pre-auth ECDH unlock with the phone. Explicit tap only. */
export function startPhoneUnlock(isRelogin = false) {
  const wsState = ws?.readyState ?? -1;
  let skip: string | null = null;
  if (authInFlight || state.authBusy) skip = 'busy';
  else if (state.settings.webLoginOnPhone !== true) skip = 'setting_off';
  else if (!state.challenge) skip = 'no_challenge';
  else if (wsState !== WebSocket.OPEN) skip = 'ws_not_open';
  if (skip) return;
  abortPhoneUnlockQuiet(true);
  const kp = generateUnlockKeypair();
  const requestId = generateUuidV4();
  const nonce = getSecureRandomHex(16);
  pendingPhoneUnlock = {
    requestId,
    secretKey: kp.secretKey,
    nonce,
    clientPub: kp.publicKeyHex,
    serverPub: '',
    isRelogin,
  };
  setState({ showUnlockWait: true, unlockSas: '' });
  const sent = send({
    type: UNLOCK_REQUEST_TYPE,
    requestId,
    clientPub: kp.publicKeyHex,
    nonce,
    sourceId,
  });
  if (!sent) {
    abortPhoneUnlockQuiet();
    failCredentialAttempt(t('not_connected', lang()));
    return;
  }
  phoneUnlockTimer = setTimeout(() => {
    abortPhoneUnlockQuiet(true);
  }, UNLOCK_TIMEOUT_MS);
}

/** Drops a pending phone unlock and falls back to the password field. */
export function cancelPhoneUnlock() {
  abortPhoneUnlockQuiet(true);
}

function fallbackPhoneConfirmToPassword() {
  clearPhoneConfirmTimer();
  phoneConfirmPending = null;
  setState('showPhoneConfirm', false);
  if (state.verifyCallback) {
    setState({ showVerify: true, verifyError: '' });
  }
}

function startPhoneConfirm(
  onSuccess: () => void,
  meta: { action: PwaActionConfirmKind; cardId?: string }
) {
  if (phoneConfirmPending) {
    sendControl(ACTION_CONFIRM_CANCEL_TYPE, { requestId: phoneConfirmPending.requestId });
    clearPhoneConfirmTimer();
  }
  const requestId = generateUuidV4();
  phoneConfirmPending = {
    requestId,
    action: meta.action,
    ...(meta.cardId ? { cardId: meta.cardId } : {}),
  };
  setState({
    showVerify: false,
    showPhoneConfirm: true,
    verifyCallback: onSuccess,
    verifyError: '',
  });
  const sent = sendControl(ACTION_CONFIRM_REQUEST_TYPE, {
    requestId,
    action: meta.action,
    ...(meta.cardId ? { cardId: meta.cardId } : {}),
  });
  if (!sent) {
    fallbackPhoneConfirmToPassword();
    return;
  }
  phoneConfirmTimer = setTimeout(() => {
    fallbackPhoneConfirmToPassword();
  }, ACTION_CONFIRM_TIMEOUT_MS);
}

/** User chose to type the master password instead of waiting on the phone. */
export function usePasswordInsteadOfPhoneConfirm() {
  if (phoneConfirmPending) {
    sendControl(ACTION_CONFIRM_CANCEL_TYPE, { requestId: phoneConfirmPending.requestId });
  }
  fallbackPhoneConfirmToPassword();
}

export async function confirmVerify(password: string) {
  if (!sessionPasswordHash || !password || !state.salt) {
    setState('verifyError', t('incorrect_password', lang()));
    return;
  }
  const scheme: PasswordHashScheme = state.authScheme ?? 'v4-argon2';
  const hash = deriveVaultAuthSecret(password, state.salt, scheme);
  if (constantTimeEquals(hash, sessionPasswordHash)) {
    const cb = state.verifyCallback;
    setState({ showVerify: false, verifyCallback: null, verifyError: '' });
    cb?.();
  } else {
    setState('verifyError', t('incorrect_password', lang()));
  }
}

export function cancelVerify() {
  if (phoneConfirmPending) {
    sendControl(ACTION_CONFIRM_CANCEL_TYPE, { requestId: phoneConfirmPending.requestId });
  }
  abortPhoneConfirmQuiet();
  setState({ showVerify: false, verifyCallback: null, verifyError: '' });
}

export function setSearch(q: string) {
  setState('search', q);
  touchActivity();
}

export function filteredCards(): DisplayCard[] {
  const q = state.search.toLowerCase().trim();
  let list: DisplayCard[];
  if (!q) {
    list = state.cards;
  } else {
    const looksLikeUrl =
      q.includes('.') || q.startsWith('http') || q.includes('://') || q.startsWith('android-app');
    if (looksLikeUrl) {
      const full = state.cards.map((c) => secrets.cardWithSecrets(c as PasswordCard));
      const matches = matchLoginCandidates(full, { urlOrHost: q, limit: 50 });
      if (matches.length) {
        const ids = new Set(matches.map((m) => m.card.id));
        list = state.cards.filter((c) => ids.has(c.id));
      } else {
        list = state.cards.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.username.toLowerCase().includes(q) ||
            (c.link || '').toLowerCase().includes(q) ||
            (c.tags ?? []).some((tag) => tag.includes(q)) ||
            (c.type === 'NOTE' && (c.notes || '').toLowerCase().includes(q))
        );
      }
    } else {
      list = state.cards.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          (c.link || '').toLowerCase().includes(q) ||
          (c.tags ?? []).some((tag) => tag.includes(q)) ||
          (c.type === 'NOTE' && (c.notes || '').toLowerCase().includes(q))
      );
    }
  }
  return sortCardsForList(list, 'title');
}

export function openAddModal() {
  if (!isWriteAllowed()) {
    showToast(t('write_blocked', lang()), 'error');
    return;
  }
  setState({ showCardModal: true, editingId: null, editSecretsUnlocked: true });
}

export function openEditModal(id: string) {
  if (!isWriteAllowed()) {
    showToast(t('write_blocked', lang()), 'error');
    return;
  }
  setState({ showCardModal: true, editingId: id, editSecretsUnlocked: false });
}

export function closeCardModal() {
  setState({ showCardModal: false, editingId: null, editSecretsUnlocked: false });
}

export function unlockEditSecrets(onDone: () => void) {
  verifyAction(
    () => {
      setState('editSecretsUnlocked', true);
      onDone();
    },
    { action: 'edit', cardId: state.editingId ?? undefined }
  );
}

/**
 * Hydrates display cards with in-memory secrets and includes offline outbox
 * tombstones so vault statistics stay accurate online and offline.
 */
export function getVaultStatistics(): VaultStatistics {
  void state.cards;
  void state.pendingOps;
  const cards = state.cards.map((c) => secrets.cardWithSecrets(c as PasswordCard));
  const tombstones: Tombstone[] = Object.values(outbox.tombstones);
  return computeStatistics(cards, { tombstones });
}

function applySettingsChange(partial: Partial<AppSettings>) {
  const patch = { ...partial };
  if (patch.theme !== undefined) {
    patch.theme = normalizeTheme(patch.theme);
  }
  if (patch.language !== undefined) {
    patch.language = normalizeLanguage(patch.language);
  }
  if (patch.webTheme !== undefined) {
    patch.webTheme = normalizeTheme(patch.webTheme);
  }
  if (patch.webLanguage !== undefined) {
    patch.webLanguage = normalizeLanguage(patch.webLanguage);
  }
  const settings = mergeVaultSettings(state.settings, patch);
  setState('settings', settings);
  applyThemeFromSettings();
  refreshLocalizedChrome();
  persistIdentityUiPrefs();
  if (!settingsHydrated) {
    // Keep PWA-only edits (webTheme/webLanguage) to merge onto the first pull.
    pendingSettingsPatch = { ...pendingSettingsPatch, ...patch };
    persistOfflineVault();
    touchActivity();
    return;
  }
  if (isLiveConnected()) {
    const sat = pickSatelliteSettingsPatch(patch);
    if (sat) {
      setSyncStatus('syncing');
      sendSyncPush({
        index: currentVaultSyncIndex(),
        upserts: [],
        deletions: [],
        tombstones: [],
        settings: sat,
      });
    }
  } else if (state.connState === 'offline' && sessionPasswordHash) {
    outbox = withSettings(outbox, settings);
    syncPendingOpsState();
    setSyncStatus('offline');
  }
  persistOfflineVault();
  touchActivity();
}

export function pushSettings(partial: Partial<AppSettings>) {
  if (!isWriteAllowed()) {
    showToast(t('write_blocked', lang()), 'error');
    return;
  }
  applySettingsChange(partial);
}

export function toggleTheme() {
  const current = resolveWebThemeMode(state.settings);
  applySettingsChange({ webTheme: current === 'DARK' ? 'LIGHT' : 'DARK' });
}

export function toggleLanguage() {
  const next = resolveWebLanguagePref(state.settings) === 'ESP' ? 'ING' : 'ESP';
  applySettingsChange({ webLanguage: next });
}

export function copyOtp(id: string) {
  verifyAction(
    async () => {
      const code = getOtpCode(id);
      if (!code) return;
      try {
        await copySecretToClipboard(code);
        showToast(t('copied', lang()), 'success');
      } catch {
        showToast(t('copy_failed', lang()), 'error');
      }
    },
    { action: 'copy_otp', cardId: id }
  );
}

export function getOtpCode(id: string): string {
  const secret = secrets.getOtpSecret(id);
  if (!secret?.trim()) return '';
  const card = state.cards.find((c) => c.id === id) as PasswordCard | undefined;
  return (
    generateTotp(secret, {
      algorithm: card?.otpAlgorithm,
      digits: card?.otpDigits,
      period: card?.otpPeriod,
    }) ?? ''
  );
}

export function revealOtp(id: string) {
  verifyAction(
    () => {
      setState('revealedOtpIds', (prev) => new Set([...prev, id]));
      secrets.scheduleRevealHide(
        `otp:${id}`,
        () => {
          setState('revealedOtpIds', (prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
        REVEAL_MS
      );
    },
    { action: 'reveal_otp', cardId: id }
  );
}

export function hideOtp(id: string) {
  secrets.clearRevealTimer(`otp:${id}`);
  setState('revealedOtpIds', (prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}

export function isOtpRevealed(id: string): boolean {
  return state.revealedOtpIds.has(id);
}

export function getOtpRemaining(id: string): number {
  const card = state.cards.find((c) => c.id === id);
  return getRemainingSeconds(card?.otpPeriod ?? 30);
}

export async function saveCard(data: {
  id: string;
  type: 'PASSWORD' | 'SECRET_PHRASE' | 'NOTE';
  title: string;
  username: string;
  link: string;
  notes: string;
  passwordList: string[];
  icon?: CardIcon;
  runIconDetection?: boolean;
  otpSecret?: string;
  otpAlgorithm?: PasswordCard['otpAlgorithm'];
  otpDigits?: PasswordCard['otpDigits'];
  otpPeriod?: number;
  tags?: string[];
}) {
  if (!isWriteAllowed()) {
    showToast(t('write_blocked', lang()), 'error');
    return;
  }
  const existing = state.cards.find((c) => c.id === data.id);
  const existingFull = existing ? secrets.cardWithSecrets(existing as PasswordCard) : undefined;

  if (existingFull && data.type !== existingFull.type) {
    showToast(t('card_type_change_blocked', lang()), 'error');
    return;
  }

  const rawTitle = data.title.trim() === '' ? t('default_card_name', lang()) : data.title;
  const title = clampField(rawTitle, CARD_TITLE_MAX).value;
  const username = clampField(data.username, CARD_USERNAME_MAX).value;
  const rawLink = clampField(data.link, CARD_LINK_MAX).value;
  const linkFields = preserveUrisOnLinkEdit(existingFull, rawLink);
  const link = linkFields.link;
  const notes = clampField(data.notes, CARD_NOTES_MAX).value;

  let icon: CardIcon = data.icon ?? existing?.icon ?? DEFAULT_CARD_ICON;
  const allowRemoteFavicon =
    state.settings?.enableFaviconLookup === true && state.settings?.strictOffline !== true;
  if (shouldKeepStoredIcon(data.icon, link) && data.icon && data.icon.type === 'icon') {
    icon = { type: 'icon', value: data.icon.value.trim() };
  } else if (data.runIconDetection) {
    try {
      const detected = await detectIcon(title, link, {
        allowRemoteFavicon,
      });
      icon = detected.icon;
    } catch {
      icon = detectPresetFromLink(link) ?? icon;
    }
  }

  let passwordList = (data.passwordList ?? []).map((w) => clampField(w, CARD_PASSWORD_MAX).value);
  if (data.type === 'NOTE') {
    passwordList = [''];
  } else if (
    existingFull &&
    existingFull.type === data.type &&
    existingFull.type !== 'NOTE' &&
    !(passwordList[0] || '').trim() &&
    (existingFull.passwordList?.[0] || '').trim()
  ) {
    // Never wipe an existing secret because the modal failed to hydrate it.
    passwordList = existingFull.passwordList;
  }

  const existingTs = existingFull?.last_update ? Date.parse(existingFull.last_update) : 0;
  const safeExisting = Number.isNaN(existingTs) ? 0 : existingTs;
  const now = new Date(Math.max(Date.now(), safeExisting + 1)).toISOString();

  const pwChanged =
    (existingFull?.passwordList ?? []).join('\u0000') !== passwordList.join('\u0000');
  const keepHibp = data.type === 'PASSWORD' && existingFull?.type === 'PASSWORD' && !pwChanged;
  const hibp = keepHibp ? existingFull?.hibp : undefined;
  const hibpAuthorized =
    data.type === 'PASSWORD'
      ? keepHibp
        ? existingFull?.hibpAuthorized
        : state.settings.enableHibpCheck === true
      : undefined;

  const otpExplicit = data.otpSecret !== undefined;
  const otpCleared = data.type !== 'PASSWORD' || (otpExplicit && !data.otpSecret.trim());
  const otpFields = otpCleared
    ? {}
    : data.otpSecret?.trim()
      ? {
          otpSecret: data.otpSecret.trim(),
          otpAlgorithm: data.otpAlgorithm ?? existingFull?.otpAlgorithm,
          otpDigits: data.otpDigits ?? existingFull?.otpDigits,
          otpPeriod: data.otpPeriod ?? existingFull?.otpPeriod,
        }
      : existingFull?.otpSecret?.trim() && data.type === 'PASSWORD'
        ? {
            otpSecret: existingFull.otpSecret,
            otpAlgorithm: existingFull.otpAlgorithm,
            otpDigits: existingFull.otpDigits,
            otpPeriod: existingFull.otpPeriod,
          }
        : {};

  const card: PasswordCard = {
    id: data.id,
    type: data.type,
    title,
    icon,
    username,
    passwordList,
    link,
    ...(linkFields.uris ? { uris: linkFields.uris } : {}),
    notes,
    creation_date: existingFull?.creation_date ?? now,
    last_update: now,
    tags: normalizeTags(data.tags ?? existingFull?.tags),
    ...otpFields,
    ...(hibp ? { hibp } : {}),
    ...(hibpAuthorized !== undefined ? { hibpAuthorized } : {}),
  };
  secrets.set(card.id, card.passwordList, card.otpSecret ?? '');
  const display = sanitizeCardForDisplay(card);
  setState('cards', (cards) => {
    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx === -1) return [...cards, display];
    const next = cards.slice();
    next[idx] = display;
    return next;
  });
  closeCardModal();
  outbox = withUpsert(outbox, card);
  syncPendingOpsState();
  persistOfflineVault();

  if (isLiveConnected()) {
    if (!flushOutboxAndPull()) {
      setSyncStatus('offline');
      showToast(t('not_connected', lang()), 'error');
    }
  } else {
    setSyncStatus('offline');
  }
}

export function deleteCard(id: string) {
  verifyAction(
    () => {
      if (!confirm(t('delete_confirm', lang()))) return;
      if (!isWriteAllowed()) {
        showToast(t('write_blocked', lang()), 'error');
        return;
      }
      secrets.remove(id);
      setState('cards', (cards) => cards.filter((c) => c.id !== id));
      outbox = withTombstone(outbox, id, new Date().toISOString());
      syncPendingOpsState();
      persistOfflineVault();
      if (isLiveConnected()) {
        if (!flushOutboxAndPull()) {
          setSyncStatus('offline');
          showToast(t('not_connected', lang()), 'error');
        }
      } else {
        setSyncStatus('offline');
      }
    },
    { action: 'delete', cardId: id }
  );
}

export function revealSecret(id: string, isSeed: boolean) {
  verifyAction(
    () => {
      setState('revealedIds', (prev) => new Set([...prev, id]));
      secrets.scheduleRevealHide(
        id,
        () => {
          setState('revealedIds', (prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
        REVEAL_MS
      );
    },
    { action: 'reveal', cardId: id }
  );
}

export function hideSecret(id: string) {
  secrets.clearRevealTimer(id);
  setState('revealedIds', (prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}

/** Force-hide all revealed secrets (e.g. on verify modal open). */
export function hideAllRevealedSecrets() {
  for (const id of state.revealedIds) {
    secrets.clearRevealTimer(id);
  }
  for (const id of state.revealedOtpIds) {
    secrets.clearRevealTimer(`otp:${id}`);
  }
  setState('revealedIds', new Set<string>());
  setState('revealedOtpIds', new Set<string>());
}

export function isRevealed(id: string): boolean {
  return state.revealedIds.has(id);
}

export function getSecretValue(id: string, isSeed: boolean): string {
  return isSeed ? secrets.getSeed(id) : secrets.getPassword(id);
}

export function copySecret(id: string, isSeed: boolean) {
  verifyAction(
    async () => {
      const val = getSecretValue(id, isSeed);
      if (!val) return;
      try {
        await copySecretToClipboard(val);
        if (state.settings.revealPasswordOnCopy !== false) {
          setState('revealedIds', (prev) => new Set([...prev, id]));
          secrets.scheduleRevealHide(
            id,
            () => {
              setState('revealedIds', (prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            },
            REVEAL_MS
          );
        }
        showToast(t('copied', lang()), 'success');
      } catch {
        showToast(t('copy_failed', lang()), 'error');
      }
    },
    { action: 'copy', cardId: id }
  );
}

export function copyNotes(notes: string) {
  const val = notes.trim();
  if (!val) return;
  void (async () => {
    try {
      await copySecretToClipboard(val);
      showToast(t('copied', lang()), 'success');
    } catch {
      showToast(t('copy_failed', lang()), 'error');
    }
  })();
}

export function copyUsername(id: string) {
  const card = state.cards.find((c) => c.id === id);
  const username = card?.username ?? '';
  verifyAction(
    async () => {
      try {
        await copySecretToClipboard(username);
        showToast(t('copied', lang()), 'success');
      } catch {
        showToast(t('copy_failed', lang()), 'error');
      }
    },
    { action: 'copy_username', cardId: id }
  );
}

export function generatePassword(): string | null {
  if (!isWriteAllowed()) {
    showToast(t('write_blocked', lang()), 'error');
    return null;
  }
  if (!isPasswordGeneratorConfigured(state.settings)) {
    showToast(t('gen_not_configured', lang()), 'error');
    return null;
  }
  return generateRandomPassword(state.settings);
}

/** Returns the in-memory secret store used for revealed passwords/seeds. */
export function getSecretStore() {
  return secrets;
}

/** Reactive app state, write-gate helper, locale helpers. */
export { state, isWriteAllowed, lang, t };

/** @internal Test helper — visibility change without wiring real document events. */
export async function __onWebVisibilityForTests(hidden: boolean): Promise<void> {
  if (hidden) return;
  await onWebVisible();
}

/** @internal Test helper — open the live sync socket without `initApp`. */
export function __connectWsForTests(hostOverride?: string) {
  connectWs(hostOverride);
}

/** @internal Test helper — live socket readyState, or `null` if none. */
export function __wsReadyStateForTests(): number | null {
  return ws ? ws.readyState : null;
}

/** @internal Test helper — vault-fork pause + durable defer record. */
export function __setVaultForkForTests(opts: {
  pinnedSalt?: string;
  salt?: string | null;
  pending?: { previousSalt: string } | null;
  deferred?: VaultForkDeferRecord | null;
}) {
  if ('pinnedSalt' in opts && opts.pinnedSalt !== undefined) pinnedSalt = opts.pinnedSalt;
  if ('salt' in opts) setState('salt', opts.salt ?? null);
  if ('pending' in opts) pendingVaultFork = opts.pending ?? null;
  if ('deferred' in opts) setDeferredFork(opts.deferred ?? null);
}

/** @internal Test helper — true while incremental sync/persist must stay paused. */
export function __isVaultForkBlockingPersistForTests(): boolean {
  return isVaultForkBlockingPersist();
}

/** @internal Test helper — prefer real UI actions in product code. */
export function __setStateForTests(
  patch: Partial<AppState> & { passwordHash?: string | null; wsToken?: string | null }
) {
  const next = { ...patch } as Partial<AppState> & {
    passwordHash?: string | null;
    wsToken?: string | null;
  };
  if ('passwordHash' in next) {
    setSessionPasswordHash(next.passwordHash ?? null);
    delete next.passwordHash;
  }
  if ('wsToken' in next) {
    sessionWsToken = next.wsToken ?? null;
    delete next.wsToken;
  }
  setState(next);
  if (
    sessionPasswordHash &&
    (state.connState === 'authenticated' || state.connState === 'offline')
  ) {
    lastActivityAt = Date.now();
    rescheduleIdleTimer();
  }
}

/** @internal Test helper for offline outbox-driven statistics. */
export function __setOutboxForTests(next: OutboxState) {
  outbox = next;
  setState('pendingOps', outboxCount(outbox));
}

/** @internal Test helper — pending phone-confirm bind. */
export function __setPhoneConfirmForTests(
  pending: { requestId: string; action: PwaActionConfirmKind; cardId?: string } | null
) {
  phoneConfirmPending = pending;
}

/** @internal Test helper — feed a parsed WS JSON object. */
export function __handleMessageForTests(msg: Record<string, unknown>) {
  handleMessage(msg);
}
