/**
 * @fileoverview Defines the visual color palette and theme generation function for PKEY.
 */

/**
 * Interface representing the complete color palette used by the application components.
 */
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
}

/**
 * Generates the appropriate color palette based on the user's theme preference.
 *
 * @param {boolean} isDark - Flag indicating if the dark theme is active.
 * @returns {ThemeColors} The localized color palette for the current theme mode.
 */
export const getTheme = (isDark: boolean): ThemeColors => {
  return {
    bg: isDark ? '#121212' : '#F0F2F5',
    cardBg: isDark ? '#1E1E1E' : '#FFFFFF',
    text: isDark ? '#E0E4E8' : '#2D3A3F',
    textMuted: isDark ? '#A0A0A0' : '#6A6A6A',
    border: isDark ? '#333333' : '#E0E0E0',
    accent: '#87cb28', // PRIMARY_COLOR (Verde más natural)
    accentHover: isDark ? '#6BBF78' : '#6BBF78',
    success: '#87cb28',
    warning: isDark ? '#FFCA28' : '#FFC107',
    danger: '#D75A4D',
  };
};
