/**
 * @fileoverview Normalization helpers for persisted application settings.
 */
import {
  AppSettings,
  PasswordCard,
  CardIcon,
  EncryptedDatabase,
  SYNC_PROTOCOL_VERSION,
} from '../types';
import { DEFAULT_CARD_ICON, generateUuidV4, canonicalizePublicSessionId } from '@pkey/core';
import { GEN_LENGTH_OPTIONS, normalizeGenLength } from './passwordGenerator';
import { normalizeLanguage, normalizeTheme } from '@pkey/core';
import { LocalCipher } from '../services/crypto';

const migrateCardIcon = (icon: unknown): CardIcon => {
  if (!icon) return DEFAULT_CARD_ICON;
  if (typeof icon === 'string') {
    const value = icon.trim();
    return value ? { type: 'icon', value } : DEFAULT_CARD_ICON;
  }
  if (typeof icon !== 'object') return DEFAULT_CARD_ICON;
  const rec = icon as { type?: unknown; uri?: unknown; value?: unknown };
  if (rec.type === 'image' && typeof rec.uri === 'string' && rec.uri.trim()) {
    return { type: 'image', uri: rec.uri };
  }
  if (rec.type === 'icon' && typeof rec.value === 'string' && rec.value.trim()) {
    return { type: 'icon', value: rec.value };
  }
  return DEFAULT_CARD_ICON;
};

/**
 * Applies defaults and migrations when loading settings from legacy databases.
 */
const WEB_AUTO_LOGOUT_VALUES = new Set(['5M', '15M', '1H', 'NEVER']);
const FOREGROUND_IDLE_VALUES = new Set(['1M', '5M', '15M', 'NEVER']);

export const normalizeAppSettings = (settings: AppSettings, cards: PasswordCard[]): AppSettings => {
  const autoLogout =
    (settings as { autoLogout?: string }).autoLogout === '30S' ? '1M' : settings.autoLogout;
  const rawWeb = (settings as { webAutoLogout?: string }).webAutoLogout;
  const webAutoLogout = (
    rawWeb && WEB_AUTO_LOGOUT_VALUES.has(rawWeb) ? rawWeb : '15M'
  ) as AppSettings['webAutoLogout'];
  const rawIdle = (settings as { foregroundIdleLock?: string }).foregroundIdleLock;
  /** Omitted on legacy vaults → NEVER (do not surprise existing users with a 15 min lock). */
  const foregroundIdleLock = (
    rawIdle && FOREGROUND_IDLE_VALUES.has(rawIdle) ? rawIdle : 'NEVER'
  ) as AppSettings['foregroundIdleLock'];
  const strictOffline = settings.strictOffline === true;
  const bindDeviceSecret = settings.bindDeviceSecret === true;
  const webAccessAutoStart = settings.webAccessAutoStart ?? false;
  const webConfirmOnPhone = settings.webConfirmOnPhone === true;
  const webLoginOnPhone = settings.webLoginOnPhone === true;
  const genLength = normalizeGenLength(settings.genLength);
  const openLinksInAppBrowser = settings.openLinksInAppBrowser ?? false;
  const groupCardsByLink = settings.groupCardsByLink ?? false;
  const revealPasswordOnCopy = settings.revealPasswordOnCopy ?? true;
  const theme = normalizeTheme(settings.theme);
  const language = normalizeLanguage(settings.language);
  const webTheme =
    settings.webTheme !== undefined ? normalizeTheme(settings.webTheme) : settings.webTheme;
  const webLanguage =
    settings.webLanguage !== undefined
      ? normalizeLanguage(settings.webLanguage)
      : settings.webLanguage;

  if (
    autoLogout === settings.autoLogout &&
    webAutoLogout === settings.webAutoLogout &&
    webAccessAutoStart === settings.webAccessAutoStart &&
    webConfirmOnPhone === settings.webConfirmOnPhone &&
    webLoginOnPhone === settings.webLoginOnPhone &&
    genLength === settings.genLength &&
    openLinksInAppBrowser === settings.openLinksInAppBrowser &&
    groupCardsByLink === settings.groupCardsByLink &&
    revealPasswordOnCopy === settings.revealPasswordOnCopy &&
    theme === settings.theme &&
    language === settings.language &&
    webTheme === settings.webTheme &&
    webLanguage === settings.webLanguage &&
    foregroundIdleLock === settings.foregroundIdleLock &&
    strictOffline === settings.strictOffline &&
    bindDeviceSecret === settings.bindDeviceSecret
  ) {
    return settings;
  }

  return {
    ...settings,
    autoLogout,
    webAutoLogout,
    webAccessAutoStart,
    webConfirmOnPhone,
    webLoginOnPhone,
    genLength,
    openLinksInAppBrowser,
    groupCardsByLink,
    revealPasswordOnCopy,
    theme,
    language,
    foregroundIdleLock,
    strictOffline,
    bindDeviceSecret,
    ...(webTheme !== undefined ? { webTheme } : {}),
    ...(webLanguage !== undefined ? { webLanguage } : {}),
  };
};

/** Migrates legacy string icons to `{ type, value }` card icon objects. */
export const normalizeCards = (cards: PasswordCard[]): PasswordCard[] => {
  return cards.map((card) => ({
    ...card,
    icon: migrateCardIcon(card.icon),
  }));
};

/** True when `length` is one of the supported generator length presets. */
export const isSupportedGenLength = (length: number): boolean => {
  return (GEN_LENGTH_OPTIONS as readonly number[]).includes(length);
};

/**
 * Derives a stable session identifier shared across all devices bound to the
 * same master password + database. Legacy helper — new vaults use UUID v4
 * ({@link ensureVaultSessionId}). Does not expose the master password.
 */
export const deriveSessionId = (passwordHash: string, creationDate: string): string => {
  return LocalCipher.sha256(`${passwordHash}|${creationDate}|pkey_session`).substring(0, 32);
};

/**
 * Ensures the vault has a public UUID v4 `sessionId`. Existing 32-hex or UUID
 * values are kept (so sync tokens do not rotate). Missing / junk ids get a new
 * random UUID that must be persisted by the caller.
 */
export const ensureVaultSessionId = (db: EncryptedDatabase): EncryptedDatabase => {
  if (canonicalizePublicSessionId(db.sessionId)) return db;
  return { ...db, sessionId: generateUuidV4() };
};

/**
 * Ensures the sync-related fields exist and are valid when loading a database
 * that may predate the multi-device sync feature. Returns a new object only if
 * something changed, to avoid unnecessary re-renders / writes.
 */
export const normalizeDatabaseSync = (db: EncryptedDatabase): EncryptedDatabase => {
  const tombstones = Array.isArray(db.tombstones) ? db.tombstones : [];
  const withSession = ensureVaultSessionId(db);
  const sessionId = withSession.sessionId;
  const syncProtocolVersion =
    typeof db.syncProtocolVersion === 'number' ? db.syncProtocolVersion : SYNC_PROTOCOL_VERSION;

  const unchanged =
    db.tombstones === tombstones &&
    db.sessionId === sessionId &&
    db.syncProtocolVersion === syncProtocolVersion;

  if (unchanged) return db;

  return { ...withSession, tombstones, sessionId, syncProtocolVersion };
};
