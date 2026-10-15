/**
 * @fileoverview Non-secret login-chrome hints that must survive lock.
 *
 * Vault settings live in the encrypted blob, so they vanish from memory on
 * lock (audit H1). Language, theme, and the screenshot opt-in are the same
 * class of public bootstrap data the PWA already advertises via `/pkey/meta`.
 * The screenshot flag has to be here too: otherwise the locked login screen
 * always sets FLAG_SECURE and a mirrored dev phone stays black.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeLanguage, normalizeTheme } from '@pkey/core';
import type { AppSettings } from '../types';
import { getNewInstallUiDefaults } from './devicePreferences';

const KEY = 'pkey_public_ui_prefs_v1';

/** Login-shell hints available before the vault is decrypted. */
export type PublicUiPrefs = Pick<AppSettings, 'language' | 'theme' | 'allowScreenshots'>;

let cache: PublicUiPrefs | null = null;

function isThemeMode(value: unknown): value is AppSettings['theme'] {
  return value === 'LIGHT' || value === 'DARK' || value === 'AUTO';
}

function isLanguage(value: unknown): value is AppSettings['language'] {
  return value === 'ESP' || value === 'ING' || value === 'AUTO';
}

function parsePrefs(raw: unknown): PublicUiPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { language?: unknown; theme?: unknown; allowScreenshots?: unknown };
  if (!isLanguage(rec.language) || !isThemeMode(rec.theme)) return null;
  return {
    language: rec.language,
    theme: rec.theme,
    allowScreenshots: rec.allowScreenshots === true,
  };
}

function newInstallPublicUiPrefs(): PublicUiPrefs {
  return { ...getNewInstallUiDefaults(), allowScreenshots: false };
}

/** Last remembered hints, or new-install defaults when nothing was stored. */
export function getCachedPublicUiPrefs(): PublicUiPrefs {
  return cache ?? newInstallPublicUiPrefs();
}

/**
 * Coerces vault settings into public UI hints. Missing fields keep the
 * currently cached (or new-install) value instead of the DARK/ING defaults
 * used by `normalizeTheme` / `normalizeLanguage` for junk input.
 */
export function publicUiPrefsFromSettings(
  settings: Partial<Pick<AppSettings, 'language' | 'theme' | 'allowScreenshots'>> | undefined
): PublicUiPrefs {
  const fallback = getCachedPublicUiPrefs();
  return {
    language:
      settings?.language !== undefined ? normalizeLanguage(settings.language) : fallback.language,
    theme: settings?.theme !== undefined ? normalizeTheme(settings.theme) : fallback.theme,
    allowScreenshots:
      typeof settings?.allowScreenshots === 'boolean'
        ? settings.allowScreenshots
        : fallback.allowScreenshots,
  };
}

/** Reads persisted hints into the sync cache (cold start / splash). */
export async function loadPublicUiPrefs(): Promise<PublicUiPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = parsePrefs(JSON.parse(raw) as unknown);
      if (parsed) {
        cache = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore corrupt / missing storage
  }
  cache = newInstallPublicUiPrefs();
  return cache;
}

/** Updates the sync cache immediately, then writes AsyncStorage. */
export async function persistPublicUiPrefs(prefs: PublicUiPrefs): Promise<void> {
  const next: PublicUiPrefs = {
    language: normalizeLanguage(prefs.language),
    theme: normalizeTheme(prefs.theme),
    allowScreenshots: prefs.allowScreenshots === true,
  };
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[publicUiPrefs] persist failed', e);
  }
}

/** Remembers language/theme from a live vault snapshot. */
export function rememberPublicUiFromSettings(
  settings: Partial<Pick<AppSettings, 'language' | 'theme' | 'allowScreenshots'>> | undefined
): void {
  void persistPublicUiPrefs(publicUiPrefsFromSettings(settings));
}

/** Drops the in-memory cache without touching storage (process-kill / tests). */
export function resetPublicUiPrefsCache(): void {
  cache = null;
}

/** Drops hints when the local vault is destroyed (reset session). */
export async function clearPublicUiPrefs(): Promise<void> {
  cache = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
