/**
 * @fileoverview Cryptographically secure password generation from vault settings.
 */

import type { AppSettings } from '../types';
import { pickSecureRandomChar, secureShuffle } from '../util/secureRandom';

/** Uppercase A–Z character pool. */
export const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Lowercase a–z character pool. */
export const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
/** Digit 0–9 character pool. */
export const NUMBER_CHARS = '0123456789';
/** Symbol character pool used by the generator. */
export const SYMBOL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

export const GENERATOR_OPTION_KEYS = [
  'genSymbols',
  'genNumbers',
  'genUppercase',
  'genLowercase',
] as const;

export type GeneratorOptionKey = (typeof GENERATOR_OPTION_KEYS)[number];

/** Recommended password lengths aligned with modern security guidance (minimum 12). */
export const GEN_LENGTH_OPTIONS = [12, 16, 32, 64, 128] as const;
export type GenLengthOption = (typeof GEN_LENGTH_OPTIONS)[number];

const CATEGORY_POOLS: ReadonlyArray<{ key: GeneratorOptionKey; chars: string }> = [
  { key: 'genUppercase', chars: UPPERCASE_CHARS },
  { key: 'genLowercase', chars: LOWERCASE_CHARS },
  { key: 'genNumbers', chars: NUMBER_CHARS },
  { key: 'genSymbols', chars: SYMBOL_CHARS },
];

/** Type guard for password-generator boolean settings keys. */
export function isGeneratorOptionKey(key: keyof AppSettings): key is GeneratorOptionKey {
  return (GENERATOR_OPTION_KEYS as readonly string[]).includes(key);
}

/** Counts how many character-class options are currently enabled. */
export function countActiveGeneratorOptions(settings: Readonly<AppSettings>): number {
  return GENERATOR_OPTION_KEYS.filter((key) => settings[key]).length;
}

/** True when `key` is the only remaining enabled character class. */
export function isLastActiveGeneratorOption(
  settings: Readonly<AppSettings>,
  key: GeneratorOptionKey
): boolean {
  return Boolean(settings[key] && countActiveGeneratorOptions(settings) === 1);
}

/** Whether disabling `key` would leave at least one character class enabled. */
export function canDisableGeneratorOption(
  settings: Readonly<AppSettings>,
  key: GeneratorOptionKey
): boolean {
  if (!settings[key]) return true;
  return countActiveGeneratorOptions(settings) > 1;
}

/**
 * Resolves a stored length to a supported option, migrating legacy values below 12.
 */
export function normalizeGenLength(length: number): GenLengthOption {
  if ((GEN_LENGTH_OPTIONS as readonly number[]).includes(length)) {
    return length as GenLengthOption;
  }
  return 12;
}

/**
 * Builds the combined character pool from generator settings flags.
 *
 * @param settings - App settings including `genUppercase` / `genLowercase` / etc.
 * @returns Concatenated character pool (may be empty if nothing is enabled).
 */
export function buildPasswordCharacterPool(settings: Readonly<AppSettings>): string {
  let pool = '';
  if (settings.genUppercase) pool += UPPERCASE_CHARS;
  if (settings.genLowercase) pool += LOWERCASE_CHARS;
  if (settings.genNumbers) pool += NUMBER_CHARS;
  if (settings.genSymbols) pool += SYMBOL_CHARS;
  return pool;
}

/**
 * Returns whether generator settings can produce a valid password
 * (at least one category enabled and length ≥ active category count).
 *
 * @param settings - App settings.
 * @returns `true` when {@link generateRandomPassword} can succeed.
 */
export function isPasswordGeneratorConfigured(settings: Readonly<AppSettings>): boolean {
  const active = CATEGORY_POOLS.filter(({ key }) => settings[key]).length;
  return active > 0 && settings.genLength >= active;
}

/**
 * Generates a random password guaranteeing at least one character from each
 * enabled category, then filling to `genLength` and shuffling securely.
 *
 * @param settings - App settings controlling pools and length.
 * @returns Generated password, or `null` if settings are incomplete / too short.
 */
export function generateRandomPassword(settings: Readonly<AppSettings>): string | null {
  const pool = buildPasswordCharacterPool(settings);
  if (!pool) return null;

  const activeCategories = CATEGORY_POOLS.filter(({ key }) => settings[key]);
  if (settings.genLength < activeCategories.length) return null;

  const chars = activeCategories.map(({ chars: categoryChars }) =>
    pickSecureRandomChar(categoryChars)
  );

  while (chars.length < settings.genLength) {
    chars.push(pickSecureRandomChar(pool));
  }

  return secureShuffle(chars).join('');
}

/** Default {@link AppSettings} applied to new vaults. */
export const DEFAULT_VAULT_SETTINGS: AppSettings = {
  autoLogout: '1M',
  webAutoLogout: '15M',
  allowScreenshots: false,
  theme: 'DARK',
  language: 'ING',
  autoCollapse: true,
  genSymbols: true,
  genNumbers: true,
  genUppercase: true,
  genLowercase: true,
  genLength: 16,
  openLinksInAppBrowser: false,
  webAccessAutoStart: false,
  webConfirmOnPhone: false,
  webLoginOnPhone: false,
  groupCardsByLink: false,
  revealPasswordOnCopy: true,
  enableFaviconLookup: false,
  enableHibpCheck: false,
  foregroundIdleLock: '15M',
  strictOffline: false,
  bindDeviceSecret: false,
};
