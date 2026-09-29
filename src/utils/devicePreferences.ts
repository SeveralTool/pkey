/**
 * @fileoverview Device language/theme defaults for first install (no vault yet).
 */
import type { AppSettings } from '../types';
import { languageFromLocaleTag, resolveUiLanguage, type UiLanguage } from '@pkey/core';

export { languageFromLocaleTag };

/** Best-effort device locale tag (Hermes `Intl`, then RN native fallbacks). */
export function getDeviceLocaleTag(): string {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof tag === 'string' && tag.trim()) return tag;
  } catch {
    // ignore and fall through
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules, Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const ios =
        settings?.AppleLocale ||
        (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : undefined);
      if (typeof ios === 'string' && ios.trim()) return ios;
    }
    const android = NativeModules.I18nManager?.localeIdentifier;
    if (typeof android === 'string' && android.trim()) return android;
  } catch {
    // ignore
  }

  return 'en';
}

/** Language inferred from the current device locale. */
export function getDeviceLanguage(): UiLanguage {
  return languageFromLocaleTag(getDeviceLocaleTag());
}

/**
 * Resolves stored language (`AUTO` included) against the current device locale.
 *
 * @param stored - Vault `settings.language` (or unknown persisted value).
 */
export function resolveAppUiLanguage(stored: unknown): UiLanguage {
  return resolveUiLanguage(stored, getDeviceLocaleTag());
}

/**
 * Theme for a brand-new install: follow the OS (Android/iOS) appearance.
 * Persists as AUTO so later system changes still apply until the user picks LIGHT/DARK.
 */
export function getDefaultThemeForNewInstall(): AppSettings['theme'] {
  return 'AUTO';
}

/**
 * Language for a brand-new install: follow the OS locale.
 * Persists as AUTO so later system language changes still apply until the user picks ES/ENG.
 */
export function getDefaultLanguageForNewInstall(): AppSettings['language'] {
  return 'AUTO';
}

/** Language + theme defaults applied before/when creating the first vault. */
export function getNewInstallUiDefaults(): Pick<AppSettings, 'language' | 'theme'> {
  return {
    language: getDefaultLanguageForNewInstall(),
    theme: getDefaultThemeForNewInstall(),
  };
}
