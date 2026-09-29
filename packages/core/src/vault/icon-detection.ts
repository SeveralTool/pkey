/**
 * @fileoverview Card icon detection: opted-in favicon, then host brand, then fuzzy presets.
 */

import type { CardIcon } from '../types';
import {
  DEFAULT_CARD_ICON_VALUE,
  IONICON_NAME_ALIASES,
  PRESET_ICON_HOSTS,
  PRESET_ICONS,
} from '../constants/preset-icons';
import { extractIconHost } from '../util/importLink';
import { extractDomain } from '../util/webUtils';

export {
  DEFAULT_CARD_ICON_VALUE,
  IONICON_NAME_ALIASES,
  PRESET_ICON_HOSTS,
  PRESET_ICONS,
} from '../constants/preset-icons';

/** Result of {@link detectIcon}, including how the icon was chosen. */
export interface DetectionResult {
  icon: CardIcon;
  /** `host` from a known brand domain, `favicon` from network, `fuzzy` from title, or `default`. */
  source: 'host' | 'favicon' | 'fuzzy' | 'default';
  error?: string;
}

interface CacheEntry {
  icon: CardIcon;
  source: DetectionResult['source'];
  timestamp: number;
}

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 3000;
const FUZZY_MATCH_THRESHOLD = 2;
const cache = new Map<string, CacheEntry>();

const PRESET_KEY_SET = new Set<string>(PRESET_ICONS.map((icon) => icon.key));
const HOST_BRAND_ENTRIES = Object.entries(PRESET_ICON_HOSTS).sort(
  (a, b) => b[0].length - a[0].length
);
const BRAND_PRESETS = PRESET_ICONS.filter((icon) => icon.key.startsWith('logo-')).sort(
  (a, b) => b.label.length - a.label.length
);

/** Glyph shown when detection has nothing better. */
export const DEFAULT_CARD_ICON: CardIcon = { type: 'icon', value: DEFAULT_CARD_ICON_VALUE };

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '');

const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
};

const normalizeUrl = (urlString: string): string => {
  const trimmed = urlString.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

const isValidUrl = (urlString: string): boolean => {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
};

const faviconUrlForHost = (host: string): string => `https://icons.duckduckgo.com/ip3/${host}.ico`;

const detectFromFaviconHost = async (host: string): Promise<CardIcon | null> => {
  const services = [
    faviconUrlForHost(host),
    `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
  ];

  for (const faviconUrl of services) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      const response = await fetch(faviconUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'PKEY-PasswordManager/1.0' },
      });
      clearTimeout(timeoutId);
      if (response.ok) return { type: 'image', uri: faviconUrl };
    } catch {
      /* try next */
    }
  }
  return null;
};

const detectFromFavicon = async (link: string): Promise<CardIcon | null> => {
  const trimmed = link.trim();
  const iconHost = extractIconHost(trimmed);
  if (iconHost) return detectFromFaviconHost(iconHost);

  if (isNonWebLink(trimmed)) return null;

  if (!trimmed || !isValidUrl(normalizeUrl(trimmed))) return null;
  const domain = extractDomain(trimmed);
  if (!domain) return null;
  return detectFromFaviconHost(domain);
};

const stripWwwHost = (host: string): string => host.replace(/^www\./i, '').toLowerCase();

const hostFromLink = (link: string): string | null => {
  const trimmed = link.trim();
  if (!trimmed) return null;
  const host = extractIconHost(trimmed) ?? extractDomain(normalizeUrl(trimmed));
  return host ? stripWwwHost(host) : null;
};

const sameIconHost = (a: string, b: string): boolean => {
  const left = stripWwwHost(a);
  const right = stripWwwHost(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
};

/**
 * Hostname encoded in a DuckDuckGo / Google favicon URL, or `null` for other images.
 */
const hostFromFaviconUri = (uri: string): string | null => {
  try {
    const parsed = new URL(uri);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'icons.duckduckgo.com') {
      const match = parsed.pathname.match(/^\/ip3\/(.+)\.ico$/i);
      if (!match?.[1]) return null;
      return stripWwwHost(decodeURIComponent(match[1]));
    }
    if (
      (hostname === 'www.google.com' || hostname === 'google.com') &&
      parsed.pathname.startsWith('/s2/favicons')
    ) {
      const domain = parsed.searchParams.get('domain')?.trim();
      if (!domain) return null;
      return stripWwwHost(extractDomain(domain) ?? domain);
    }
    return null;
  } catch {
    return null;
  }
};

const faviconBelongsToCardLink = (uri: string, link: string): boolean => {
  const favHost = hostFromFaviconUri(uri);
  const cardHost = hostFromLink(link);
  if (!favHost || !cardHost) return false;
  return sameIconHost(favHost, cardHost);
};

/**
 * Resolves a known-brand preset from a URL, Android package link, or bare host.
 */
export function detectPresetFromLink(link: string): { type: 'icon'; value: string } | null {
  const host = hostFromLink(link);
  if (!host) return null;
  for (const [suffix, key] of HOST_BRAND_ENTRIES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { type: 'icon', value: key };
    }
  }
  return null;
}

const detectFromTitle = (title: string): CardIcon | null => {
  if (!title.trim()) return null;
  const normalizedTitle = normalize(title);
  const exact = PRESET_ICONS.find((icon) => normalize(icon.label) === normalizedTitle);
  if (exact) return { type: 'icon', value: exact.key };

  for (const icon of BRAND_PRESETS) {
    const label = normalize(icon.label);
    if (!label) continue;
    const word = new RegExp(`(?:^|\\s)${label}(?:\\s|$)`);
    if (word.test(normalizedTitle)) return { type: 'icon', value: icon.key };
  }

  let bestMatch: (typeof PRESET_ICONS)[number] | null = null;
  let bestDistance = FUZZY_MATCH_THRESHOLD;
  for (const icon of PRESET_ICONS) {
    const distance = levenshteinDistance(normalizedTitle, normalize(icon.label));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = icon;
    }
  }
  if (bestMatch) return { type: 'icon', value: bestMatch.key };
  return null;
};

const getCacheKey = (title: string, link: string): string => {
  const host = link ? (extractIconHost(link) ?? extractDomain(link) ?? 'nolink') : 'nolink';
  return `${normalize(title)}|${host}`;
};

const isNonWebLink = (link: string): boolean =>
  /^android:\/\//i.test(link.trim()) || /^chrome-extension:\/\//i.test(link.trim());

/** Maps stored/legacy Ionicon names to a glyph that actually exists. */
export function resolveIoniconName(name: string): string {
  const trimmed = name.trim();
  return IONICON_NAME_ALIASES[trimmed] ?? trimmed;
}

const isDefaultIconValue = (value: string): boolean => {
  const resolved = resolveIoniconName(value);
  return !resolved || resolved === DEFAULT_CARD_ICON_VALUE;
};

/**
 * True when the stored icon is a user (or title) preset that save must not overwrite.
 * Remote favicons (`type: 'image'`), the default key, and host-brand presets that
 * match the current URL stay eligible for re-detection so an opted-in favicon can
 * replace the internal Instagram/Facebook/… glyph.
 *
 * @param icon - Stored card icon.
 * @param link - Optional card URL; when it maps to the same brand preset as `icon`,
 *               the preset is treated as auto-detected rather than a user pick.
 */
export function shouldKeepStoredIcon(icon: CardIcon | undefined, link?: string): boolean {
  if (!icon || icon.type !== 'icon') return false;
  const raw = icon.value?.trim() ?? '';
  if (!raw || isDefaultIconValue(raw)) return false;
  const resolved = resolveIoniconName(raw);
  if (!PRESET_KEY_SET.has(raw) && !PRESET_KEY_SET.has(resolved)) return false;
  const hostIcon = link?.trim() ? detectPresetFromLink(link) : null;
  if (hostIcon && (hostIcon.value === raw || hostIcon.value === resolved)) return false;
  return true;
}

/**
 * Picks what the UI should render: keep a user-picked preset, prefer a verified
 * favicon that belongs to the card host, else a known-host brand (also used to
 * drop a leftover favicon from another site), then the default key.
 */
export function resolveCardIcon(icon: CardIcon | undefined, link?: string): CardIcon {
  if (shouldKeepStoredIcon(icon, link) && icon && icon.type === 'icon') {
    return { type: 'icon', value: icon.value.trim() };
  }
  const hostIcon = link?.trim() ? detectPresetFromLink(link) : null;
  if (icon?.type === 'image' && icon.uri?.trim()) {
    const uri = icon.uri.trim();
    const knownCdnHost = hostFromFaviconUri(uri);
    if (!hostIcon || knownCdnHost === null || faviconBelongsToCardLink(uri, link ?? '')) {
      return icon;
    }
    return hostIcon;
  }
  if (hostIcon) return hostIcon;
  if (icon?.type === 'icon' && icon.value?.trim()) {
    return { type: 'icon', value: resolveIoniconName(icon.value) };
  }
  return DEFAULT_CARD_ICON;
}

/** Quick favicon URL without network (legacy modal behaviour).
 *
 * @param link - Card URL or Android package link.
 * @returns Image {@link CardIcon} pointing at a DuckDuckGo favicon URL, or `null`.
 */
export function faviconIconFromLink(link: string): CardIcon | null {
  const trimmed = link.trim();
  const host = extractIconHost(trimmed);
  if (host) return { type: 'image', uri: faviconUrlForHost(host) };
  if (isNonWebLink(trimmed)) return null;
  const domain = extractDomain(normalizeUrl(trimmed));
  if (!domain) return null;
  return { type: 'image', uri: faviconUrlForHost(domain) };
}

/** Clears the in-memory icon detection cache. */
export function clearIconCache(): void {
  cache.clear();
}

/**
 * Invalidates a single cache entry for a title/link pair.
 *
 * @param title - Card title used as part of the cache key.
 * @param link - Optional card link (default empty).
 */
export function invalidateIconCacheFor(title: string, link?: string): void {
  cache.delete(getCacheKey(title, link || ''));
}

/** Options for {@link detectIcon}. */
export interface DetectIconOptions {
  /**
   * When `false` (default in privacy-first mode), skip both the remote favicon
   * fetch AND the URL-based `faviconIconFromLink` shortcut — those would send
   * the card domain to third-party favicon providers (DuckDuckGo, Google),
   * effectively leaking the list of sites the user stores in PKey.
   *
   * When `true`, the caller has opted in via
   * `db.settings.enableFaviconLookup`.
   */
  allowRemoteFavicon?: boolean;
}

const cacheAndReturn = (
  cacheKey: string,
  result: { icon: CardIcon; source: DetectionResult['source'] }
): DetectionResult => {
  cache.set(cacheKey, { ...result, timestamp: Date.now() });
  return result;
};

/**
 * Detects a card icon. When remote lookup is opted in and the URL is usable,
 * a verified favicon wins; otherwise a known-host brand, then a fuzzy title
 * preset, else the default key. Unverified favicon URLs are never persisted.
 *
 * @param title - Card title (used for fuzzy fallback).
 * @param link - Optional URL used for favicon lookup and host-brand fallback.
 * @param options - See {@link DetectIconOptions}. Remote favicon fetch is
 *                  disabled by default (audit finding M5).
 * @returns Detection result with icon and source metadata.
 */
export async function detectIcon(
  title: string,
  link?: string,
  options: DetectIconOptions = {}
): Promise<DetectionResult> {
  const allowRemoteFavicon = options.allowRemoteFavicon === true;
  const cacheKey = `${getCacheKey(title, link || '')}|remote=${allowRemoteFavicon ? '1' : '0'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
    return { icon: cached.icon, source: cached.source };
  }

  const trimmedLink = link?.trim() ?? '';
  if (!title.trim() && !trimmedLink) {
    return {
      icon: DEFAULT_CARD_ICON,
      source: 'default',
      error: 'Empty title',
    };
  }

  if (trimmedLink && allowRemoteFavicon) {
    const favicon = await detectFromFavicon(trimmedLink);
    if (favicon) {
      return cacheAndReturn(cacheKey, { icon: favicon, source: 'favicon' });
    }
  }

  const hostIcon = trimmedLink ? detectPresetFromLink(trimmedLink) : null;
  if (hostIcon) {
    return cacheAndReturn(cacheKey, { icon: hostIcon, source: 'host' });
  }

  const fuzzy = title.trim() ? detectFromTitle(title) : null;
  if (fuzzy) {
    return cacheAndReturn(cacheKey, { icon: fuzzy, source: 'fuzzy' });
  }

  return cacheAndReturn(cacheKey, { icon: DEFAULT_CARD_ICON, source: 'default' });
}
