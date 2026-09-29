/**
 * @fileoverview Vault settings merge helpers used by master sync and the PWA.
 */

import { sha256 } from '../crypto/index';
import type { AppSettings } from '../types/index';
import { normalizeLanguage } from '../util/language';
import { normalizeTheme } from '../util/theme';

/** Keys a satellite may write. Everything else stays master-owned. */
const SATELLITE_SETTINGS_KEYS = ['webTheme', 'webLanguage', 'webAutoLogout'] as const;

/** Phone UI + security flags a PWA must never overwrite. */
const SATELLITE_FORBIDDEN_KEYS = [
  'webConfirmOnPhone',
  'webLoginOnPhone',
  'theme',
  'language',
  'strictOffline',
  'foregroundIdleLock',
  'bindDeviceSecret',
] as const;

/**
 * Drops master-owned keys from a satellite settings patch so a PWA push
 * cannot change phone UI (`theme` / `language`) or security flags.
 *
 * @param incoming - Settings blob from a satellite sync push.
 * @returns A shallow copy without forbidden keys, or the original empty value.
 */
export function stripSatelliteMasterOnlySettings(
  incoming?: Partial<AppSettings> | null
): Partial<AppSettings> | null | undefined {
  if (!incoming) return incoming;
  const hits = SATELLITE_FORBIDDEN_KEYS.filter((key) => key in incoming);
  if (hits.length === 0) return incoming;
  const next = { ...incoming };
  for (const key of hits) {
    delete next[key];
  }
  return next;
}

/**
 * Picks only satellite-owned fields from a settings object for live/outbox push.
 *
 * @param settings - Full or partial vault settings.
 * @returns A patch with `webTheme` / `webLanguage` / `webAutoLogout` when present.
 */
export function pickSatelliteSettingsPatch(
  settings?: Partial<AppSettings> | null
): Partial<AppSettings> | undefined {
  if (!settings) return undefined;
  const patch: Partial<AppSettings> = {};
  for (const key of SATELLITE_SETTINGS_KEYS) {
    const value = settings[key];
    if (value !== undefined) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const nested = rec[key];
    if (nested === undefined) continue;
    out[key] = sortKeysDeep(nested);
  }
  return out;
}

/**
 * Stable JSON of vault settings (sorted keys, no `undefined`) for equality and hashing.
 *
 * @param settings - Vault settings snapshot.
 * @returns Canonical JSON string; `'null'` when settings are missing.
 */
export function canonicalizeVaultSettings(settings?: AppSettings | null): string {
  if (settings == null) return 'null';
  return JSON.stringify(sortKeysDeep(settings));
}

/**
 * SHA-256 of {@link canonicalizeVaultSettings}. Used on `server_push` hints.
 *
 * @param settings - Vault settings snapshot.
 * @returns Hex digest.
 */
export function computeSettingsHash(settings?: AppSettings | null): string {
  return sha256(canonicalizeVaultSettings(settings));
}

/**
 * Shallow-merges satellite settings onto the local vault settings.
 * Theme and language are normalized so a stale or partial payload cannot
 * persist an invalid value.
 *
 * @param local - Current vault settings (source of truth on the master).
 * @param incoming - Optional partial/full settings from a satellite.
 */
export function mergeVaultSettings(
  local: AppSettings,
  incoming?: Partial<AppSettings> | null
): AppSettings {
  if (!incoming) return local;
  return {
    ...local,
    ...incoming,
    theme: normalizeTheme(incoming.theme ?? local.theme),
    language: normalizeLanguage(incoming.language ?? local.language),
    webTheme: incoming.webTheme !== undefined ? normalizeTheme(incoming.webTheme) : local.webTheme,
    webLanguage:
      incoming.webLanguage !== undefined
        ? normalizeLanguage(incoming.webLanguage)
        : local.webLanguage,
  };
}
