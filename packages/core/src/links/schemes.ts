/**
 * @fileoverview URI scheme classification for vault links.
 */

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

/** Schemes that must never be stored or opened. */
export const BLOCKED_SCHEMES = new Set([
  'javascript',
  'data',
  'file',
  'vbscript',
  'blob',
]);

/** Browser chrome / extension URIs — ignore for match and storage. */
export const IGNORED_SCHEMES = new Set([
  'about',
  'chrome',
  'chrome-extension',
  'moz-extension',
  'edge-extension',
  'safari-extension',
]);

const ANDROID_APP_SCHEMES = new Set(['android', 'android-app', 'androidapp', 'market', 'intent']);
const IOS_APP_SCHEMES = new Set(['iosapp', 'apple-app']);
const WEB_SCHEMES = new Set(['http', 'https']);

export type SchemeClass =
  | 'blocked'
  | 'ignored'
  | 'android_app'
  | 'ios_app'
  | 'web'
  | 'other'
  | 'none';

/** Extracts a lowercase scheme, or empty when the string has no scheme. */
export function extractScheme(raw: string): string {
  const m = raw.trim().match(SCHEME_RE);
  return m?.[1]?.toLowerCase() ?? '';
}

/** Classifies a URI scheme for parse / store / open. */
export function classifyScheme(raw: string): SchemeClass {
  const scheme = extractScheme(raw);
  if (!scheme) return 'none';
  if (BLOCKED_SCHEMES.has(scheme)) return 'blocked';
  if (IGNORED_SCHEMES.has(scheme)) return 'ignored';
  if (ANDROID_APP_SCHEMES.has(scheme)) return 'android_app';
  if (IOS_APP_SCHEMES.has(scheme)) return 'ios_app';
  if (WEB_SCHEMES.has(scheme)) return 'web';
  return 'other';
}

export function isExplicitScheme(raw: string): boolean {
  return SCHEME_RE.test(raw.trim());
}
