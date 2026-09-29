/**
 * @fileoverview Shared domain types for vault cards, settings, and sync.
 */

/** HMAC algorithm used for TOTP/HOTP generation. */
export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** A vault entry: password login, seed/secret phrase, or note-only. */
export interface PasswordCard {
  id: string;
  type: 'PASSWORD' | 'SECRET_PHRASE' | 'NOTE';
  title: string;
  icon: CardIcon;
  username: string;
  /** Password as a single-element list, or seed words for `SECRET_PHRASE`. */
  passwordList: string[];
  link: string;
  /**
   * Extra URIs (Android `android://…`, Bitwarden `androidapp://…`, extra https).
   * Matching uses `link` + `uris`. Omitted on legacy cards.
   */
  uris?: string[];
  notes: string;
  creation_date: string;
  last_update: string;
  /** Base32 TOTP secret (encrypted at vault level). */
  otpSecret?: string;
  otpAlgorithm?: OtpAlgorithm;
  otpDigits?: 6 | 8;
  otpPeriod?: number;
  tags?: string[];
  /**
   * Last Have I Been Pwned check result for this card.
   *
   * Only meaningful while the card's current password matches `pwHash` (the
   * SHA-256 of the exact password that was sent via the k-anonymity range
   * lookup). Editing or replacing the password invalidates it: the badge
   * falls back to "not verified" until the next check produces a fresh result.
   */
  hibp?: HibpCheckResult;
  /**
   * True while the card's current password was authored (created or edited)
   * with the opt-in `settings.enableHibpCheck` enabled.
   *
   * Only authorized passwords are auto-checked on save. Passwords saved while
   * the setting was off are NEVER sent automatically — even if the user enables
   * the option later — because any network egress must stay explicit. Those
   * passwords can only be sent via the explicit per-card action or the bulk
   * "check all" action.
   */
  hibpAuthorized?: boolean;
}

/** Result of a Have I Been Pwned password-breach lookup (k-anonymity range API). */
export type HibpCheckResult =
  | { status: 'clean'; checkedAt: string; pwHash: string }
  | { status: 'breached'; count: number; checkedAt: string; pwHash: string }
  | { status: 'error'; reason: string; checkedAt: string; pwHash: string };

/** Card icon: preset key or remote/local image URI. */
export type CardIcon = { type: 'icon'; value: string } | { type: 'image'; uri: string };

/**
 * Idle lock options for the browser PWA (independent of mobile `autoLogout`).
 * The chosen duration counts while the tab is visible or hidden.
 */
export type WebAutoLogout = '5M' | '15M' | '1H' | 'NEVER';

/** Idle lock while the phone app stays in the foreground (audit M5). */
export type ForegroundIdleLock = '1M' | '5M' | '15M' | 'NEVER';

/** Persisted app / vault settings. */
export interface AppSettings {
  autoLogout: 'INSTANT' | '1M' | 'NEVER';
  /**
   * Browser PWA idle lock. Independent of mobile `autoLogout` (which keys off
   * app background). Counts inactivity while the tab is visible or hidden;
   * resume compares wall-clock because browsers freeze timers. Default `15M`
   * when omitted (legacy vaults).
   */
  webAutoLogout?: WebAutoLogout;
  allowScreenshots: boolean;
  theme: 'LIGHT' | 'DARK' | 'AUTO';
  language: 'ESP' | 'ING' | 'AUTO';
  /**
   * Browser PWA theme. Independent of mobile `theme`. When omitted, the PWA
   * follows `theme` (legacy vaults).
   */
  webTheme?: 'LIGHT' | 'DARK' | 'AUTO';
  /**
   * Browser PWA language. Independent of mobile `language`. When omitted, the
   * PWA follows `language` (legacy vaults). `AUTO` uses the browser locale.
   */
  webLanguage?: 'ESP' | 'ING' | 'AUTO';
  autoCollapse: boolean;
  genSymbols: boolean;
  genNumbers: boolean;
  genUppercase: boolean;
  genLowercase: boolean;
  genLength: number;
  openLinksInAppBrowser?: boolean;
  /** When true, web access server auto-starts on login if it was previously enabled. */
  webAccessAutoStart?: boolean;
  /**
   * When true, the LAN PWA asks the phone to confirm sensitive actions
   * (edit / delete / reveal / copy) with biometrics or the master password
   * instead of re-typing the password in the browser. Default `false`.
   * Master-only: a satellite settings push must not change this flag.
   */
  webConfirmOnPhone?: boolean;
  /**
   * When true, the LAN PWA login screen can unlock via phone biometrics
   * (ECDH + SAS) instead of typing the master password. Default `false`.
   * Master-only: a satellite settings push must not change this flag.
   */
  webLoginOnPhone?: boolean;
  /**
   * When true, vault list groups credentials that share the same normalized host
   * (Bitwarden-style host match). Presentation-only; default false.
   */
  groupCardsByLink?: boolean;
  /**
   * When true, the icon detector may fetch favicons from third-party providers
   * (DuckDuckGo, Google) for cards with a URL. Default `false` — sending your
   * saved domains to a third party contradicts the local-first promise, so it
   * must be opted into explicitly. Audit finding M5.
   */
  enableFaviconLookup?: boolean;
  /**
   * When true, pressing the copy button on an expanded password card reveals
   * the password in its input (in addition to copying it). Default `true`.
   */
  revealPasswordOnCopy?: boolean;
  /**
   * Opt-in for the Have I Been Pwned password-breach lookup. When true,
   * passwords created or edited after enabling are automatically checked
   * against HIBP when their card is saved (k-anonymity — only the first 5
   * chars of the password SHA-1 hash leave the device, see
   * `services/hibpCheck.ts`). Passwords saved while this was off are never
   * sent automatically; they are only checked via the explicit per-card or
   * bulk "check all" actions. Default `false` — ANY network egress must be
   * opt-in because it contradicts the local-first default. Audit finding B5.
   */
  enableHibpCheck?: boolean;
  /**
   * Idle lock while PKEY stays in the foreground. Independent of
   * `autoLogout` (background). Omitted on legacy vaults → treated as `NEVER`.
   */
  foregroundIdleLock?: ForegroundIdleLock;
  /**
   * When true, LAN web access, HIBP, and remote favicons are forced off.
   * Default false. Master-only.
   */
  strictOffline?: boolean;
  /**
   * Opt-in device-secret binding (audit H4). When true the vault encryption
   * key is HKDF-mixed with a hardware-held 128-bit secret. A copied `.pkey`
   * file will not open on another device without the recovery kit.
   */
  bindDeviceSecret?: boolean;
}

/** Deletion marker used by sync to propagate removes. */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

/** Bump when {@link fingerprintCard} payload shape changes incompatibly. */
export const SYNC_PROTOCOL_VERSION = 3;

/** Compact sync index exchanged between peers. */
export interface SyncIndex {
  cards: Record<string, CardFingerprint>;
  tombstones: Tombstone[];
  protocolVersion: number;
}

/** Per-card fingerprint used for delta sync. */
export interface CardFingerprint {
  id: string;
  hash: string;
  lastUpdate: string;
}

/** Delta of card upserts and deletions between peers. */
export interface SyncDelta {
  upserts: PasswordCard[];
  deletions: string[];
  tombstones: Tombstone[];
}

/**
 * How {@link EncryptedDatabase.passwordHash} was derived.
 * Sent to PWA satellites in the sync `challenge` so they HMAC the same secret.
 */
export type PasswordHashScheme = 'v4-argon2' | 'v3-hkdf' | 'v2-pbkdf2';

/** On-disk / in-memory encrypted vault database shape (plaintext after unlock). */
export interface EncryptedDatabase {
  /**
   * Historic mobile vaults used `'1.0.0'`; core/PWA exporters use numeric `1`.
   */
  version: number | string;
  passwordHash: string;
  /**
   * Derivation scheme for {@link passwordHash}. Missing on pre-audit vaults
   * (treat as `v2-pbkdf2` until the first successful unlock upgrades to v3).
   */
  passwordHashScheme?: PasswordHashScheme;
  salt?: string;
  cards: PasswordCard[];
  settings: AppSettings;
  creation_date: string;
  last_update: string;
  tombstones?: Tombstone[];
  sessionId?: string;
  syncProtocolVersion?: number;
}

/** Display-oriented card that may omit secrets but flag their presence. */
export type DisplayCard = PasswordCard & { _hasSecret?: boolean; _hasOtp?: boolean };

/** AES-CBC + HMAC sync envelope fields (hex-encoded). */
export interface SyncEnvelope {
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
}
