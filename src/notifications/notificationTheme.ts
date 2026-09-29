/**
 * @fileoverview Fallback palette for in-app notification cards when settings theme is missing.
 */
import { getTheme, type ThemeColors } from '../styles/colors';
import { NotificationTheme } from './types';

/** Builds a notification palette from vault colors, or light theme if `c` is incomplete. */
export const notificationThemeFromColors = (
  c: Partial<ThemeColors> | NotificationTheme | null | undefined
): NotificationTheme => {
  const fallback = getTheme(false);
  const colors = c?.cardBg && c.text && c.accent ? { ...fallback, ...c } : fallback;
  return {
    cardBg: colors.cardBg,
    text: colors.text,
    textMuted: colors.textMuted,
    border: colors.border,
    accent: colors.accent,
    danger: colors.danger,
    warning: colors.warning,
    success: colors.success,
    accentSoft: `${colors.accent}1A`,
  };
};
