/** Mirrors src/styles/colors.ts — keep in sync with index.css theme blocks. */
import type { AppSettings } from '@pkey/core';
import { normalizeTheme, resolveThemeIsDark, systemPrefersDark } from '@pkey/core';

export interface ThemeColors {
  bg: string;
  cardBg: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  danger: string;
  inputBg: string;
  iconBtnBg: string;
  dangerBtnBg: string;
}

export const getTheme = (isDark: boolean): ThemeColors => ({
  bg: isDark ? '#121212' : '#F0F2F5',
  cardBg: isDark ? '#1E1E1E' : '#FFFFFF',
  text: isDark ? '#E0E4E8' : '#2D3A3F',
  textMuted: isDark ? '#A0A0A0' : '#6A6A6A',
  border: isDark ? '#333333' : '#E0E0E0',
  accent: '#87cb28',
  accentHover: '#6BBF78',
  success: '#87cb28',
  warning: isDark ? '#FFCA28' : '#FFC107',
  danger: '#D75A4D',
  inputBg: isDark ? '#1F1F24' : '#F3F4F6',
  iconBtnBg: isDark ? '#2D2D37' : '#E5E7EB',
  dangerBtnBg: isDark ? '#3B1E1E' : '#FED7D7',
});

export function resolveIsDark(theme: AppSettings['theme'] | unknown): boolean {
  return resolveThemeIsDark(theme, systemPrefersDark());
}

function applyThemeVars(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const themeName = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', themeName);
  document.body?.classList.toggle('theme-dark', isDark);
  document.body?.classList.toggle('theme-light', !isDark);
  document.getElementById('pkey-theme-vars')?.remove();

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getTheme(isDark).bg);
}

export function applyTheme(theme: AppSettings['theme'] | unknown): void {
  applyThemeVars(resolveIsDark(normalizeTheme(theme)));
}

export function watchSystemTheme(onChange: () => void): (() => void) | undefined {
  if (typeof window === 'undefined' || !window.matchMedia) return undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange();
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * Watches OS/browser language changes so AUTO UI language can re-resolve.
 *
 * @param onChange - Invoked on `window` `languagechange`.
 * @returns Unsubscribe, or undefined when `window` is unavailable.
 */
export function watchSystemLanguage(onChange: () => void): (() => void) | undefined {
  if (typeof window === 'undefined') return undefined;
  const handler = () => onChange();
  window.addEventListener('languagechange', handler);
  return () => window.removeEventListener('languagechange', handler);
}
