/**
 * @fileoverview Vault link identities: parse, canonical URL, match, and grouping.
 */

export { BLOCKED_SCHEMES, IGNORED_SCHEMES, classifyScheme, extractScheme } from './schemes';
export {
  PACKAGE_REGEX,
  ANDROID_PACKAGE_META,
  normalizePackage,
  packageToWebHost,
  packageToDisplayLabel,
} from './packageMeta';
export type { LinkKind, LinkIdentity, AppLinkScheme, AppLinkPlatform, AppLinkInfo } from './types';
export { parseLinkIdentity, isAppLink } from './parse';
export {
  collectIdentities,
  uniqueIdentities,
  androidPackagesOf,
  iosAppIdsOf,
  hostsOf,
  explicitHostPortsOf,
  clampUris,
} from './identities';
export {
  pickCanonicalLink,
  displayLabel,
  displayUrl,
  buildCardLinkFields,
  preserveUrisOnLinkEdit,
  type CardLinkFields,
} from './canonical';
export { normalizeStoredLink } from './normalize';
export {
  hostFromLink,
  registrableDomain,
  matchLoginCandidates,
  type LoginMatchCandidate,
} from './match';
export {
  linkGroupKey,
  linkGroupLabel,
  groupCardsByLinkKey,
  type CardLinkListRow,
} from './groupKey';

import { parseLinkIdentity } from './parse';
import { packageToDisplayLabel, packageToWebHost } from './packageMeta';
import type { AppLinkInfo, AppLinkScheme, LinkIdentity } from './types';
import { extractDomain } from '../util/webUtils';

function identityToAppLinkInfo(id: LinkIdentity): AppLinkInfo | null {
  if (id.kind !== 'android_package' || !id.androidPackage) return null;
  const scheme: AppLinkScheme = id.original.toLowerCase().startsWith('market:')
    ? 'market'
    : id.original.toLowerCase().startsWith('intent:')
      ? 'intent'
      : id.original.toLowerCase().startsWith('android-app:') ||
          id.original.toLowerCase().startsWith('androidapp:')
        ? 'android-app'
        : 'android';
  return {
    scheme,
    platform: 'android',
    packageName: id.androidPackage,
    webHost: id.host ?? packageToWebHost(id.androidPackage),
    browserFallbackUrl: id.browserFallbackUrl ?? null,
    displayLabel: packageToDisplayLabel(id.androidPackage),
    original: id.original,
  };
}

/**
 * Parses android://, market://, intent://, android-app:// app links.
 * @deprecated Prefer {@link parseLinkIdentity}
 */
export function parseAppLink(raw: string): AppLinkInfo | null {
  const id = parseLinkIdentity(raw);
  return id ? identityToAppLinkInfo(id) : null;
}

/** Display label for an app link, or null if not an app link. */
export function getAppDisplayLabel(raw: string): string | null {
  const info = parseAppLink(raw);
  return info?.displayLabel ?? null;
}

/**
 * Web fallback URL priority: browserFallbackUrl (https) > https://${webHost} > null.
 */
export function getAppWebFallbackUrl(infoOrRaw: AppLinkInfo | string): string | null {
  const info = typeof infoOrRaw === 'string' ? parseAppLink(infoOrRaw) : infoOrRaw;
  if (!info) return null;
  if (info.browserFallbackUrl) return info.browserFallbackUrl;
  if (info.webHost) return `https://${info.webHost}`;
  return null;
}

/**
 * Derives a web hostname for favicon lookup without modifying the stored link.
 */
export function extractIconHost(link: string): string | null {
  const trimmed = (link || '').trim();
  if (!trimmed) return null;
  const id = parseLinkIdentity(trimmed);
  if (!id || id.kind === 'blocked' || id.kind === 'ignored') return null;
  if (id.host) return id.host;
  if (id.kind === 'android_package' || id.kind === 'ios_app') return null;
  return extractDomain(trimmed);
}
