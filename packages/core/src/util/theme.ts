/**
 * @fileoverview Theme mode normalization and dark-mode resolution helpers.
 */

import type { AppSettings } from '../types/index';

/** Persisted theme preference: light, dark, or follow system. */
export type ThemeMode = AppSettings['theme'];

/**
 * Coerce persisted / synced theme values to LIGHT | DARK | AUTO.
 *
 * @param value - Unknown theme value from settings or sync.
 * @returns Normalized theme mode (defaults to `'DARK'`).
 */
export function normalizeTheme(value: unknown): ThemeMode {
  if (value === 'DARK' || value === 'LIGHT' || value === 'AUTO') return value;
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (upper === 'DARK' || upper === 'LIGHT' || upper === 'AUTO') return upper as ThemeMode;
  }
  return 'DARK';
}

/**
 * Resolves whether the UI should render in dark mode.
 *
 * @param theme - Stored theme preference (any shape; coerced via {@link normalizeTheme}).
 * @param prefersDark - For AUTO mode: pass `matchMedia(...).matches` (web) or
 *   `Appearance.getColorScheme()==='dark'` (RN). Defaults to `true`.
 * @returns `true` when the UI should use dark colors.
 */
export function resolveThemeIsDark(theme: unknown, prefersDark: boolean = true): boolean {
  const mode = normalizeTheme(theme);
  if (mode === 'DARK') return true;
  if (mode === 'LIGHT') return false;
  return prefersDark;
}

/**
 * PWA theme preference: explicit `webTheme`, otherwise the shared vault `theme`.
 */
export function resolveWebThemeMode(
  settings: Pick<AppSettings, 'theme'> & { webTheme?: AppSettings['theme'] }
): ThemeMode {
  return normalizeTheme(settings.webTheme ?? settings.theme);
}

/**
 * Reads the system dark-mode preference on web via `matchMedia`.
 *
 * @returns `true` if dark is preferred, or when `window`/`matchMedia` is unavailable.
 */
export function systemPrefersDark(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return true;
}
