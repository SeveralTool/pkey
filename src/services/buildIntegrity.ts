/**
 * Runtime accessor for the build-integrity metadata surfaced in the
 * Settings → Build Integrity panel (audit findings A7 + B3).
 *
 * Values come from `expo.extra.buildIntegrity` in `app.json`, which is
 * stamped by `scripts/stampBuildIntegrity.ts` during CI. Placeholder values
 * (still present in dev builds that skipped the stamping step) are detected
 * here so the UI can render an "unknown" state rather than misleading data.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface BuildIntegrityInfo {
  /** Semantic version, e.g. `"1.0.18"`. */
  version: string;
  /** Platform-specific build number (Android `versionCode`, iOS `buildNumber`). */
  buildNumber: string | null;
  /** Full 40-char SHA-1 commit hash, or `null` when unavailable. */
  commit: string | null;
  /** 7-char short commit form for display, or `null` when unavailable. */
  commitShort: string | null;
  /** ISO-8601 timestamp of when `stampBuildIntegrity.ts` ran. */
  buildTimestamp: string | null;
  /** `"development"` = local dev/expo-go; `"production"` = signed release. */
  channel: 'development' | 'production';
  /** `"ios"` | `"android"` | `"web"`. */
  platform: string;
}

const PLACEHOLDER_PREFIX = 'PKEY_BUILD_';

const cleanPlaceholder = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX)) return null;
  return trimmed;
};

/**
 * Reads the current build metadata. Cheap — safe to call inside `useMemo`
 * or during render.
 */
export function getBuildIntegrityInfo(): BuildIntegrityInfo {
  const cfg = Constants.expoConfig;
  const extra = cfg?.extra?.buildIntegrity as
    | { commit?: unknown; commitShort?: unknown; buildTimestamp?: unknown }
    | undefined;

  const commit = cleanPlaceholder(extra?.commit);
  const commitShort = cleanPlaceholder(extra?.commitShort);
  const buildTimestamp = cleanPlaceholder(extra?.buildTimestamp);

  // Expo Go and Metro-driven dev builds report their own executionEnvironment.
  // We treat everything that ISN'T a standalone signed binary as "development".
  const isProdBinary =
    Constants.executionEnvironment === 'standalone' ||
    Constants.executionEnvironment === 'bare';

  return {
    version: cfg?.version ?? 'unknown',
    buildNumber:
      Platform.OS === 'ios'
        ? (cfg?.ios?.buildNumber ?? null)
        : Platform.OS === 'android'
          ? cfg?.android?.versionCode != null
            ? String(cfg.android.versionCode)
            : null
          : null,
    commit,
    commitShort,
    buildTimestamp,
    channel: isProdBinary ? 'production' : 'development',
    platform: Platform.OS,
  };
}

/**
 * Formats the integrity info as a plain-text report suitable for pasting
 * into a GitHub issue or a security advisory. Includes everything the
 * user's UI shows, plus the platform, so a maintainer can correlate against
 * the release page.
 */
export function formatIntegrityReport(info: BuildIntegrityInfo): string {
  const lines = [
    `PKey Build Integrity Report`,
    `---------------------------`,
    `Version:   ${info.version}`,
    `Build:     ${info.buildNumber ?? '(n/a)'}`,
    `Platform:  ${info.platform}`,
    `Channel:   ${info.channel}`,
    `Commit:    ${info.commit ?? '(unknown)'}`,
    `Built at:  ${info.buildTimestamp ?? '(unknown)'}`,
  ];
  return lines.join('\n');
}
