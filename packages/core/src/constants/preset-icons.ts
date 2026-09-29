/** Preset Ionicons for cards — shared with mobile `src/constants/icons.ts`. */
export const PRESET_ICONS = [
  { key: 'logo-instagram', label: 'Instagram' },
  { key: 'logo-tiktok', label: 'TikTok' },
  { key: 'logo-facebook', label: 'Facebook' },
  { key: 'logo-linkedin', label: 'LinkedIn' },
  { key: 'logo-github', label: 'GitHub' },
  { key: 'logo-google', label: 'Google' },
  { key: 'mail-outline', label: 'Email' },
  { key: 'bank-outline', label: 'Bank' },
  { key: 'briefcase-outline', label: 'Work' },
  { key: 'heart-outline', label: 'Personal' },
  { key: 'shield-outline', label: 'Secure' },
  { key: 'game-controller-outline', label: 'Gaming' },
  { key: 'finger-print-outline', label: 'Biometrics' },
  { key: 'link-outline', label: 'Link' },
  { key: 'globe-outline', label: 'Website' },
] as const;

export type PresetIconKey = (typeof PRESET_ICONS)[number]['key'];

/** Fallback when detection and stored icons both fail. */
export const DEFAULT_CARD_ICON_VALUE = 'key-outline' as const;

/**
 * Ionicons names that do not exist (or are legacy) mapped to a real glyph.
 * `bank-outline` is not in Ionicons; the PWA already aliases it to cash-outline.
 */
export const IONICON_NAME_ALIASES: Record<string, string> = {
  'bank-outline': 'cash-outline',
  key: 'key-outline',
};

/**
 * Known web hosts → preset brand. Matching is exact host or a subdomain suffix
 * (`m.facebook.com` → Facebook). Used as the fallback when remote favicon lookup
 * is off or the fetch fails. Display still rejects a leftover favicon whose
 * CDN host does not match the card URL (Facebook must not show Mercado Libre).
 */
export const PRESET_ICON_HOSTS: Record<string, PresetIconKey> = {
  'facebook.com': 'logo-facebook',
  'fb.com': 'logo-facebook',
  'fb.me': 'logo-facebook',
  'messenger.com': 'logo-facebook',
  'instagram.com': 'logo-instagram',
  'tiktok.com': 'logo-tiktok',
  'linkedin.com': 'logo-linkedin',
  'github.com': 'logo-github',
  'google.com': 'logo-google',
  'gmail.com': 'mail-outline',
};
