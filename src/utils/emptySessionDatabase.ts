/**
 * @fileoverview Empty in-memory vault used after lock (audit H1).
 */
import type { EncryptedDatabase } from '../types';
import { getNewInstallUiDefaults } from './devicePreferences';
import { getCachedPublicUiPrefs, type PublicUiPrefs } from './publicUiPrefs';

/**
 * Display-safe empty database (no cards, no verifier).
 *
 * Language, theme, and the screenshot opt-in default to the last public hints
 * so login chrome keeps appearance and capture policy after lock. Pass `ui`
 * to pin a snapshot (logout). Omit it to read the sync cache (boot / reset
 * after `clearPublicUiPrefs`).
 */
export function createEmptySessionDatabase(ui?: PublicUiPrefs): EncryptedDatabase {
  const prefs = ui ?? getCachedPublicUiPrefs();
  const fallback = getNewInstallUiDefaults();
  return {
    version: '1.0.0',
    creation_date: new Date().toISOString(),
    last_update: new Date().toISOString(),
    passwordHash: '',
    cards: [],
    settings: {
      autoLogout: '1M',
      webAutoLogout: '15M',
      language: prefs.language ?? fallback.language,
      autoCollapse: true,
      allowScreenshots: prefs.allowScreenshots === true,
      theme: prefs.theme ?? fallback.theme,
      genSymbols: true,
      genNumbers: true,
      genUppercase: true,
      genLowercase: true,
      genLength: 32,
      openLinksInAppBrowser: false,
      webAccessAutoStart: false,
      webConfirmOnPhone: false,
      webLoginOnPhone: false,
      groupCardsByLink: false,
      foregroundIdleLock: 'NEVER',
      strictOffline: false,
      bindDeviceSecret: false,
    },
  };
}
