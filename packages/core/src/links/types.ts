/**
 * @fileoverview Parsed vault-link identity (web host, Android package, iOS app).
 */

export type LinkKind = 'web' | 'android_package' | 'ios_app' | 'blocked' | 'ignored';

export type AppLinkScheme = 'android' | 'android-app' | 'market' | 'intent';
export type AppLinkPlatform = 'android' | 'ios' | 'unknown';

/** Structured parse of one URI string. */
export interface LinkIdentity {
  kind: LinkKind;
  original: string;
  /** Hostname without `www.` (and without port). */
  host?: string;
  /** Host + non-default port for grouping (`example.com:8443`). */
  hostPort?: string;
  androidPackage?: string;
  iosAppId?: string;
  /**
   * Canonical form for this identity:
   * `https://host`, `android-app://pkg`, or `iosapp://bundle`.
   */
  canonical: string;
  /**
   * True when `host` was inferred from a package map/heuristic, not present in the URI.
   * Grouping must ignore derived hosts so app-only cards do not merge with web cards.
   */
  derived?: boolean;
  /** `S.browser_fallback_url` when it is http(s). */
  browserFallbackUrl?: string | null;
}

/**
 * Legacy Android app-link view used by open-link helpers.
 * @deprecated Prefer {@link LinkIdentity}
 */
export interface AppLinkInfo {
  scheme: AppLinkScheme;
  platform: AppLinkPlatform;
  packageName: string;
  webHost: string | null;
  browserFallbackUrl: string | null;
  displayLabel: string;
  original: string;
}
