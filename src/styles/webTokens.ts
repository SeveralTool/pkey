/**
 * @fileoverview Generates a CSS `:root` variable block from the native color palette,
 * keeping the PWA colors in sync with the React Native app at build time.
 */
import { getTheme } from './colors';

/**
 * Returns a CSS string containing `:root` variable declarations for both dark and light
 * themes, derived from the native `getTheme()` palette.
 *
 * Usage: inline the result directly into a `<style>` tag in the PWA template.
 */
export const getPwaCssVars = (): string => {
  const d = getTheme(true);
  const l = getTheme(false);

  return `
:root {
  --bg: ${d.bg};
  --surface: ${d.cardBg};
  --text: ${d.text};
  --muted: ${d.textMuted};
  --border: ${d.border};
  --accent: ${d.accent};
  --accent-hover: ${d.accentHover};
  --success: ${d.success};
  --warning: ${d.warning};
  --danger: ${d.danger};
  --radius: 12px;
  --font: 'Inter', system-ui, sans-serif;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: ${l.bg};
    --surface: ${l.cardBg};
    --text: ${l.text};
    --muted: ${l.textMuted};
    --border: ${l.border};
  }
}`;
};
