/**
 * @fileoverview Language code normalization shared by mobile and the PWA.
 */

import type { AppSettings } from '../types/index';

/** Persisted UI language preference: Spanish, English, or follow the OS. */
export type AppLanguage = AppSettings['language'];

/** Resolved UI language used to pick copy (`AUTO` is never a resolved value). */
export type UiLanguage = 'ESP' | 'ING';

/**
 * Coerce persisted / synced language values to `ESP` | `ING` | `AUTO`.
 *
 * @param value - Unknown language value from settings or sync.
 * @returns Normalized language (defaults to `'ING'`).
 */
export function normalizeLanguage(value: unknown): AppLanguage {
  if (value === 'ESP' || value === 'ING' || value === 'AUTO') return value;
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (upper === 'ESP' || upper === 'ING' || upper === 'AUTO') return upper as AppLanguage;
  }
  return 'ING';
}

/**
 * Maps a BCP-47 / OS locale tag to a resolved UI language.
 * Spanish (`es`, `es-AR`, …) → ESP; everything else → ING.
 *
 * @param tag - Locale tag such as `es-AR` or `en_US`.
 */
export function languageFromLocaleTag(tag: string): UiLanguage {
  const primary = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
  return primary === 'es' ? 'ESP' : 'ING';
}

/**
 * Resolves the language used to render copy from a stored preference.
 *
 * @param language - Stored preference (`ESP` / `ING` / `AUTO`, any shape).
 * @param localeTag - Device or browser locale used when the preference is `AUTO`.
 * @returns `'ESP'` or `'ING'` (never `'AUTO'`).
 */
export function resolveUiLanguage(language: unknown, localeTag: string): UiLanguage {
  const mode = normalizeLanguage(language);
  if (mode === 'ESP' || mode === 'ING') return mode;
  return languageFromLocaleTag(localeTag);
}

/**
 * PWA language preference: explicit `webLanguage`, otherwise shared `language`.
 */
export function resolveWebLanguagePref(
  settings: Pick<AppSettings, 'language'> & { webLanguage?: AppSettings['language'] }
): AppLanguage {
  return normalizeLanguage(settings.webLanguage ?? settings.language);
}

/**
 * HTML `lang` attribute for a vault language code.
 *
 * @param language - Stored or resolved language. `AUTO` maps to `en` (first paint).
 */
export function htmlLangAttr(language: AppLanguage | UiLanguage): 'es' | 'en' {
  return language === 'ESP' ? 'es' : 'en';
}
