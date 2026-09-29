/**
 * @fileoverview URL normalization and secure external link opening.
 */
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  collectIdentities,
  displayLabel,
  displayUrl,
  getAppWebFallbackUrl,
  parseAppLink,
  type AppLinkInfo,
} from '@pkey/core';

const BLOCKED_SCHEME_PATTERN = /^(javascript|data|file|vbscript|blob):/i;
const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_SCHEMES = new Set([
  'http',
  'https',
  'mailto',
  'tel',
  'android',
  'android-app',
  'androidapp',
  'market',
  'intent',
  'iosapp',
  'apple-app',
]);
const APP_SCHEMES = new Set([
  'android',
  'android-app',
  'androidapp',
  'market',
  'intent',
  'iosapp',
  'apple-app',
]);

export type OpenLinkFailureReason = 'empty' | 'invalid' | 'blocked' | 'unavailable' | 'failed';

export type OpenLinkResult = { ok: true } | { ok: false; reason: OpenLinkFailureReason };

export interface OpenExternalLinkOptions {
  /** When true, opens inside an in-app browser instead of delegating to the OS. */
  preferInAppBrowser?: boolean;
}

/**
 * Normalizes user-entered link values into a safe, openable URL.
 * Adds https:// when no scheme is present. App URIs are kept as-is when valid.
 */
export const normalizeUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (BLOCKED_SCHEME_PATTERN.test(trimmed)) return null;

  if (EXPLICIT_SCHEME_PATTERN.test(trimmed)) {
    const scheme = trimmed.split(':')[0].toLowerCase();
    if (!ALLOWED_SCHEMES.has(scheme)) return null;
    if (APP_SCHEMES.has(scheme)) {
      return parseAppLink(trimmed) ? trimmed : null;
    }
    return trimmed;
  }

  return `https://${trimmed}`;
};

/** Returns a user-facing label/URL string (app display name when applicable). */
export const getDisplayUrl = (raw: string): string => {
  const ids = collectIdentities(raw);
  const label = displayLabel(ids);
  if (label) return label;
  return displayUrl(ids, normalizeUrl(raw) ?? raw.trim());
};

const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url);

const tryOpenUrl = async (url: string): Promise<boolean> => {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
};

const buildLauncherIntent = (packageName: string): string =>
  `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${packageName};end`;

/**
 * Opens an Android app link via LAUNCHER intent → market:// → Play Store HTTPS → web fallback.
 */
const openAndroidAppLink = async (info: AppLinkInfo): Promise<OpenLinkResult> => {
  const pkg = info.packageName;
  const candidates = [
    buildLauncherIntent(pkg),
    `market://details?id=${pkg}`,
    `https://play.google.com/store/apps/details?id=${pkg}`,
  ];

  const webFallback = getAppWebFallbackUrl(info);
  if (webFallback && !candidates.includes(webFallback)) {
    candidates.push(webFallback);
  }

  for (const candidate of candidates) {
    if (await tryOpenUrl(candidate)) return { ok: true };
  }

  return { ok: false, reason: 'failed' };
};

/**
 * Opens a URL using the OS handler (native app or default browser) or an in-app browser.
 * App links on non-Android platforms return `unavailable` (UX handled by the caller).
 */
export const openExternalLink = async (
  rawUrl: string,
  options: OpenExternalLinkOptions = {}
): Promise<OpenLinkResult> => {
  const trimmed = rawUrl.trim();
  const appInfo = parseAppLink(trimmed);

  if (appInfo) {
    if (Platform.OS !== 'android') {
      const webFallback = getAppWebFallbackUrl(appInfo);
      if (webFallback) {
        try {
          if (options.preferInAppBrowser) {
            await WebBrowser.openBrowserAsync(webFallback, {
              enableBarCollapsing: true,
              showInRecents: false,
            });
            return { ok: true };
          }
          await Linking.openURL(webFallback);
          return { ok: true };
        } catch {
          return { ok: false, reason: 'failed' };
        }
      }
      return { ok: false, reason: 'unavailable' };
    }
    return openAndroidAppLink(appInfo);
  }

  const url = normalizeUrl(rawUrl);

  if (!url) {
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (BLOCKED_SCHEME_PATTERN.test(trimmed)) return { ok: false, reason: 'blocked' };
    return { ok: false, reason: 'invalid' };
  }

  try {
    if (options.preferInAppBrowser && isHttpUrl(url)) {
      await WebBrowser.openBrowserAsync(url, {
        enableBarCollapsing: true,
        showInRecents: false,
      });
      return { ok: true };
    }

    if (!isHttpUrl(url)) {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) return { ok: false, reason: 'unavailable' };
    }

    await Linking.openURL(url);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
};
