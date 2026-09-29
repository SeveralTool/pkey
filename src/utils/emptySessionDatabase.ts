/**
 * @fileoverview Empty in-memory vault used after lock (audit H1).
 */
import type { EncryptedDatabase } from '../types';
import { getNewInstallUiDefaults } from './devicePreferences';

/** Display-safe empty database (no cards, no verifier). */
export function createEmptySessionDatabase(): EncryptedDatabase {
  const ui = getNewInstallUiDefaults();
  return {
    version: '1.0.0',
    creation_date: new Date().toISOString(),
    last_update: new Date().toISOString(),
    passwordHash: '',
    cards: [],
    settings: {
      autoLogout: '1M',
      webAutoLogout: '15M',
      language: ui.language,
      autoCollapse: true,
      allowScreenshots: false,
      theme: ui.theme,
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
